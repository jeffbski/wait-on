'use strict';

var fs = require('fs');
var Joi = require('joi');
var net = require('net');
var Request = require('request');
var Rx = require('rx');
require('core-js/modules/es6.string.starts-with');

var fstat = Rx.Observable.fromNodeCallback(fs.stat);
var head = Rx.Observable.fromNodeCallback(Request.head);
var get = Rx.Observable.fromNodeCallback(Request.get);

var WAIT_ON_SCHEMA = Joi.object().keys({
  resources: Joi.array().items(Joi.string().required()),
  delay: Joi.number().integer().min(0).default(0),
  interval: Joi.number().integer().min(0).default(250),
  log: Joi.boolean().default(false),
  reverse: Joi.boolean().default(false),
  timeout: Joi.number().integer().min(0).default(Infinity),
  verbose: Joi.boolean().default(false),
  window: Joi.number().integer().min(0).default(750),

  // http options
  ca: [Joi.string(), Joi.binary()],
  cert: [Joi.string(), Joi.binary()],
  key: [Joi.string(), Joi.binary()],
  passphrase: Joi.string(),
  auth: Joi.object().keys({
    user: Joi.string(),
    username: Joi.string(),
    password: Joi.string(),
    pass: Joi.string()
  }),
  httpSignature: Joi.object().keys({
    keyId: Joi.string().required(),
    key: Joi.string().required()
  }),
  strictSSL: Joi.boolean(),
  followAllRedirects: Joi.boolean(),
  followRedirect: Joi.boolean(),
  headers: Joi.object()
});

/**
   Waits for resources to become available before calling callback

   Polls file, http(s), tcp ports, sockets for availability.

   Resource types are distinquished by their prefix with default being `file:`
     - file:/path/to/file - waits for file to be available and size to stabilize
     - http://foo.com:8000/bar verifies HTTP HEAD request returns 2XX
     - https://my.bar.com/cat verifies HTTPS HEAD request returns 2XX
     - http-get:  - HTTP GET returns 2XX response. ex: http://m.com:90/foo
     - https-get: - HTTPS GET returns 2XX response. ex: https://my/bar
     - tcp:my.server.com:3000 verifies a service is listening on port
     - socket:/path/sock verifies a service is listening on (UDS) socket

   @param opts object configuring waitOn
   @param opts.resources array of string resources to wait for. prefix determines the type of resource with the default type of `file:`
   @param opts.delay integer - optional initial delay in ms, default 0
   @param opts.interval integer - optional poll resource interval in ms, default 250ms
   @param opts.log boolean - optional flag to turn on logging to stdout
   @param opts.timeout integer - optional timeout in ms, default Infinity. Aborts with error.
   @param opts.verbose boolean - optional flag to turn on debug output
   @param opts.window integer - optional stabilization time in ms, default 750ms. Waits this amount of time for file sizes to stabilize or other resource availability to remain unchanged. If less than interval then will be reset to interval
   @param cb callback function with signature cb(err) - if err is provided then, resource checks did not succeed
 */
function waitOn(opts, cb) {
  var validResult = Joi.validate(opts, WAIT_ON_SCHEMA);
  if (validResult.error) { return cb(validResult.error); }
  opts = validResult.value; // use defaults

  if (opts.window < opts.interval) {
    opts.window = opts.interval; // it needs to be at least interval
  }

  var output = (opts.verbose) ?
      console.log.bind() :
      function () { };

  var log = (opts.log) ?
      console.log.bind() :
      function () { };

  var lastWaitForOutput; // the resources last known to be waiting for

  var timeoutTimer = null;
  if (opts.timeout !== Infinity) {
    timeoutTimer = setTimeout(function () {
      log('wait-on(%s) timed out waiting for: %s; exiting with error', process.pid, lastWaitForOutput);
      cb(new Error('Timeout'))
    }, opts.timeout);
  }

  function cleanup(err) {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    if (cb) {
      cb(err);
      cb = null; // only call once
    }
  }

  /* Stability checking occurs by using an Rx window,
     It waits until all of the vals from the resources are >=0,
     then it waits for a window which has no changes
     (duplicate outputs are filtered by distinctUntilChanged)
  */

  var lastValues = null;
  var src = Rx.Observable.timer(opts.delay, opts.interval)
      .concatMap(
        function (counter) {
          return Rx.Observable.from(opts.resources)
            .concatMap(
              function (resource, i) {
                return create$(resource, opts);
              },
              function (resource, obj) {
                return { resource: resource, val: obj.val, data: obj.data };
              }
            ).reduce(function (acc, x) {
              acc[x.resource] = x.val;
              return acc;
            }, {});
        }
      )
      .map(function (values) {
        lastValues = values; // save lastValues for later ref
        return values;
      })
      .distinctUntilChanged()
      .windowWithTime(opts.window);

  function lastValuesAllAvailable() {
    if (!lastValues) { return false; }
    var notReady = opts.resources
        .filter(function (k) {
          var lastValue = lastValues[k];
          var result = (typeof lastValue !== 'number' || lastValue < 0);
          return opts.reverse ? !result : result;
        });

    // only output when changes
    var notReadyString = notReady.join(', ');
    if (notReadyString && notReadyString !== lastWaitForOutput) {
      log('wait-on(%s) waiting for: %s', process.pid, notReadyString);
      lastWaitForOutput = notReadyString;
    }

    return !(notReady.length);
  }

  var subsc = src.subscribe(
    function (child) {
      var childSub = child.toArray().subscribe(
        function (x) {
          output('child next', x);
          if (lastValuesAllAvailable() && !x.length) {
            output('stabilized');
            log('wait-on(%s) exiting successfully found all: %s', process.pid, opts.resources.join(', '));
            childSub.dispose();
            subsc.dispose();
            cleanup();
          }
        },
        function (err) {
          output('child err', err);
        },
        function () {
          output('child complete');
        }
      );
    },
    function (err) {
      output('err: ', err);
      log('wait-on(%s) exiting with error', process.pid, err);
      cleanup(err);
    },
    function () {
      output('complete');
      cleanup();
    }
  );

}

function parseHttpOptions(options) {
  if (options === undefined) return {}
  var valid = [
    // https://github.com/request/request/tree/c289759d10ebd76ff4138e81b39c81badde6e274#requestoptions-callback
    'auth', 'httpSignature', 'followRedirect', 'followAllRedirects', 'strictSSL', 'headers',
    // https://github.com/request/request/tree/c289759d10ebd76ff4138e81b39c81badde6e274#tlsssl-protocol
    'cert', 'key', 'passphrase', 'ca'
  ];

  var parsed = {};
  valid.forEach(function (validOpt) {
    if (options[validOpt] !== undefined) {
      parsed[validOpt] = options[validOpt];
    }
  });
  return parsed;
}


function create$(resource, options) {
  if (resource.startsWith('http:')) {
    return createHttp$(resource, options);
  } else if (resource.startsWith('http-get:')) {
    return createHttpGet$('http:' + resource.slice('http-get:'.length), options);
  } else if (resource.startsWith('https:')) {
    return createHttp$(resource, options);
  } else if (resource.startsWith('https-get:')) {
    return createHttpGet$('https:' + resource.slice('https-get:'.length), options);
  } else if (resource.startsWith('tcp:')) {
    return createTcp$(resource.slice('tcp:'.length));
  } else if (resource.startsWith('socket:')) {
    return createSocket$(resource.slice('socket:'.length));
  } else if (resource.startsWith('file:')) {
    return createFile$(resource.slice('file:'.length));
  } else { // default to file
    return createFile$(resource);
  }
}

function createFile$(file) {
  return Rx.Observable.catch(
    fstat(file),
    Rx.Observable.just({ size: -1 }) // fake stat when doesn't exist
  )
  .map(function (stat) {
    return {
      val: stat.size, // key comparator used
      data: stat // additional data for debugging
    };
  });
}

function createHttp$(url, options) {
  return Rx.Observable.catch(
    head(url, parseHttpOptions(options)),
    Rx.Observable.just([{statusCode: 999}])
  )
  .map(function (response) {
    // Why is response in array here?
    var statusCode = response[0].statusCode;
    return {
      // request will handle redirects before returning
      // anything but 2XX is a failure
      val: (statusCode >= 200 && statusCode <= 299) ?
        statusCode :
        -1 * statusCode,
      data: response[0]
    };
  });
}

function createHttpGet$(url, options) {
  return Rx.Observable.catch(
    get(url, parseHttpOptions(options)),
    Rx.Observable.just([{statusCode: 999}])
  )
  .map(function (response) {
    // Why is response in array here?
    var statusCode = response[0].statusCode;
    return {
      // request will handle redirects before returning
      // anything but 2XX is a failure
      val: (statusCode >= 200 && statusCode <= 299) ?
        statusCode :
        -1 * statusCode,
      data: response[0]
    };
  });
}

function createTcp$(hostAndPort) {
  var arrParts = hostAndPort.split(':');
  var port = arrParts[arrParts.length - 1];
  var host = arrParts[arrParts.length - 2] || 'localhost';
  return Rx.Observable.create(function (observer) {
    var conn = net.connect(port, host)
        .on('error', function (err) {
          observer.onNext({ val: -1, err: err });
          observer.onCompleted();
        })
        .on('connect', function () {
          observer.onNext({ val: 1 });
          observer.onCompleted();
          conn.end();
        });
  });
}

function createSocket$(socketPath) {
  return Rx.Observable.create(function (observer) {
    var conn = net.connect(socketPath)
        .on('error', function (err) {
          observer.onNext({ val: -1, err: err });
          observer.onCompleted();
        })
        .on('connect', function () {
          observer.onNext({ val: 1 });
          observer.onCompleted();
          conn.end();
        });
  });
}

// TODO create other observables like file, return val int >= 0 for available and data for debugging

module.exports = waitOn;
