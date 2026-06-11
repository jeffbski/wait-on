'use strict';

const fs = require('fs');
const { promisify } = require('util');
const http = require('http');
const Joi = require('joi');
const https = require('https');
const net = require('net');
const util = require('util');
const { isBoolean, isEmpty, negate, noop, once, partial, pick, zip } = require('lodash/fp');
const { NEVER, combineLatest, from, merge, throwError, timer } = require('rxjs');
const { distinctUntilChanged, map, mergeMap, scan, startWith, take, takeWhile } = require('rxjs/operators');

const isNotABoolean = negate(isBoolean);
const isNotEmpty = negate(isEmpty);
const fstat = promisify(fs.stat);
const PREFIX_RE = /^((https?-get|https?|tcp|socket|file):)(.+)$/;
const HOST_PORT_RE = /^(([^:]*):)?(\d+)$/;
const IPV4_LITERAL_RE = /^\d+\.\d+\.\d+\.\d+$/;
const HTTP_GET_RE = /^https?-get:/;
const HTTP_UNIX_RE = /^http:\/\/unix:([^:]+):(.+)$/;
const HTTP_REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 21;
const TIMEOUT_ERR_MSG = 'Timed out waiting for';

const WAIT_ON_SCHEMA = Joi.object({
  resources: Joi.array().items(Joi.string().required()).required(),
  delay: Joi.number().integer().min(0).default(0),
  httpTimeout: Joi.number().integer().min(0),
  interval: Joi.number().integer().min(0).default(250),
  log: Joi.boolean().default(false),
  reverse: Joi.boolean().default(false),
  simultaneous: Joi.number().integer().min(1).default(Infinity),
  timeout: Joi.number().integer().min(0).default(Infinity),
  validateStatus: Joi.function(),
  verbose: Joi.boolean().default(false),
  window: Joi.number().integer().min(0).default(750),
  tcpTimeout: Joi.number().integer().min(0).default(300),

  // http/https options
  ca: [Joi.string(), Joi.binary()],
  cert: [Joi.string(), Joi.binary()],
  key: [Joi.string(), Joi.binary(), Joi.object()],
  passphrase: Joi.string(),
  // Deprecated: retained only so existing config files continue to validate.
  proxy: [Joi.boolean(), Joi.object()],
  auth: Joi.object({
    username: Joi.string(),
    password: Joi.string()
  }),
  strictSSL: Joi.boolean().default(false),
  followRedirect: Joi.boolean().default(true), // HTTP 3XX responses
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
     For http over socket, use http://unix:SOCK_PATH:URL_PATH
                    like http://unix:/path/to/sock:/foo/bar or
                         http-get://unix:/path/to/sock:/foo/bar

   @param opts object configuring waitOn
   @param opts.resources array of string resources to wait for. prefix determines the type of resource with the default type of `file:`
   @param opts.delay integer - optional initial delay in ms, default 0
   @param opts.httpTimeout integer - optional http HEAD/GET timeout to wait for request, default 0
   @param opts.interval integer - optional poll resource interval in ms, default 250ms
   @param opts.log boolean - optional flag to turn on logging to stdout
   @param opts.reverse boolean - optional flag which reverses the mode, succeeds when resources are not available
   @param opts.simultaneous integer - optional limit of concurrent connections to a resource, default Infinity
   @param opts.tcpTimeout - Maximum time in ms for tcp connect, default 300ms
   @param opts.timeout integer - optional timeout in ms, default Infinity. Aborts with error.
   @param opts.verbose boolean - optional flag to turn on debug log
   @param opts.window integer - optional stabilization time in ms, default 750ms. Waits this amount of time for file sizes to stabilize or other resource availability to remain unchanged. If less than interval then will be reset to interval
   @param [cb] optional callback function with signature cb(err) - if err is provided then, resource checks did not succeed
   if not specified, wait-on will return a promise that will be rejected if resource checks did not succeed or resolved otherwise
 */
function waitOn(opts, cb) {
  if (cb !== undefined) {
    return waitOnImpl(opts, cb);
  } else {
    // promise API
    return new Promise(function (resolve, reject) {
      waitOnImpl(opts, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

function waitOnImpl(opts, cbFunc) {
  const cbOnce = once(cbFunc);
  const validResult = WAIT_ON_SCHEMA.validate(opts);
  if (validResult.error) {
    return cbOnce(validResult.error);
  }
  const validatedOpts = {
    ...validResult.value, // use defaults
    // window needs to be at least interval
    ...(validResult.value.window < validResult.value.interval ? { window: validResult.value.interval } : {}),
    ...(validResult.value.verbose ? { log: true } : {}) // if debug logging then normal log is also enabled
  };

  const { resources, log: shouldLog, timeout, verbose, reverse } = validatedOpts;

  const output = verbose ? console.log.bind() : noop;
  const log = shouldLog ? console.log.bind() : noop;
  const logWaitingForWDeps = partial(logWaitingFor, [{ log, resources }]);
  const createResourceWithDeps$ = partial(createResource$, [{ validatedOpts, output, log }]);

  let lastResourcesState = resources; // the last state we had recorded

  const timeoutError$ =
    timeout !== Infinity
      ? timer(timeout).pipe(
          mergeMap(() => {
            const resourcesWaitingFor = determineRemainingResources(resources, lastResourcesState).join(', ');
            return throwError(Error(`${TIMEOUT_ERR_MSG}: ${resourcesWaitingFor}`));
          })
        )
      : NEVER;

  function cleanup(err) {
    if (err) {
      if (err.message.startsWith(TIMEOUT_ERR_MSG)) {
        log('wait-on(%s) %s; exiting with error', process.pid, err.message);
      } else {
        log('wait-on(%s) exiting with error', process.pid, err);
      }
    } else {
      // no error, we are complete
      log('wait-on(%s) complete', process.pid);
    }
    cbOnce(err);
  }

  if (reverse) {
    log('wait-on reverse mode - waiting for resources to be unavailable');
  }
  logWaitingForWDeps(resources);

  const resourcesCompleted$ = combineLatest(resources.map(createResourceWithDeps$));

  merge(timeoutError$, resourcesCompleted$)
    .pipe(takeWhile((resourceStates) => resourceStates.some((x) => !x)))
    .subscribe({
      next: (resourceStates) => {
        lastResourcesState = resourceStates;
        logWaitingForWDeps(resourceStates);
      },
      error: cleanup,
      complete: cleanup
    });
}

function logWaitingFor({ log, resources }, resourceStates) {
  const remainingResources = determineRemainingResources(resources, resourceStates);
  if (isNotEmpty(remainingResources)) {
    log(`waiting for ${remainingResources.length} resources: ${remainingResources.join(', ')}`);
  }
}

function determineRemainingResources(resources, resourceStates) {
  // resourcesState is array of completed booleans
  const resourceAndStateTuples = zip(resources, resourceStates);
  return resourceAndStateTuples.filter(([, /* r */ s]) => !s).map(([r /*, s */]) => r);
}

function createResource$(deps, resource) {
  const prefix = extractPrefix(resource);
  switch (prefix) {
    case 'https-get:':
    case 'http-get:':
    case 'https:':
    case 'http:':
      return createHTTP$(deps, resource);
    case 'tcp:':
      return createTCP$(deps, resource);
    case 'socket:':
      return createSocket$(deps, resource);
    default:
      return createFileResource$(deps, resource);
  }
}

function createFileResource$(
  { validatedOpts: { delay, interval, reverse, simultaneous, window: stabilityWindow }, output },
  resource
) {
  const filePath = extractPath(resource);
  const checkOperator = reverse
    ? map((size) => size === -1) // check that file does not exist
    : scan(
        // check that file exists and the size is stable
        (acc, x) => {
          if (x > -1) {
            const { size, t } = acc;
            const now = Date.now();
            if (size !== -1 && x === size) {
              if (now >= t + stabilityWindow) {
                // file size has stabilized
                output(`  file stabilized at size:${size} file:${filePath}`);
                return true;
              }
              output(`  file exists, checking for size change during stability window, size:${size} file:${filePath}`);
              return acc; // return acc unchanged, just waiting to pass stability window
            }
            output(`  file exists, checking for size changes, size:${x} file:${filePath}`);
            return { size: x, t: now }; // update acc with new value and timestamp
          }
          return acc;
        },
        { size: -1, t: Date.now() }
      );

  return timer(delay, interval).pipe(
    mergeMap(() => {
      output(`checking file stat for file:${filePath} ...`);
      return from(getFileSize(filePath));
    }, simultaneous),
    checkOperator,
    map((x) => (isNotABoolean(x) ? false : x)),
    startWith(false),
    distinctUntilChanged(),
    take(2)
  );
}

function extractPath(resource) {
  const m = PREFIX_RE.exec(resource);
  if (m) {
    return m[3];
  }
  return resource;
}

function extractPrefix(resource) {
  const m = PREFIX_RE.exec(resource);
  if (m) {
    return m[1];
  }
  return '';
}

async function getFileSize(filePath) {
  try {
    const { size } = await fstat(filePath);
    return size;
  } catch {
    return -1;
  }
}

function createHTTP$({ validatedOpts, output }, resource) {
  const {
    delay,
    followRedirect,
    httpTimeout: timeout,
    interval,
    reverse,
    simultaneous,
    strictSSL: rejectUnauthorized
  } = validatedOpts;
  const method = HTTP_GET_RE.test(resource) ? 'get' : 'head';
  const url = resource.replace('-get:', ':');
  const matchHttpUnixSocket = HTTP_UNIX_RE.exec(url); // http://unix:/sock:/url
  const urlSocketOptions = matchHttpUnixSocket
    ? { socketPath: matchHttpUnixSocket[1], url: matchHttpUnixSocket[2] }
    : { url };
  const socketPathDesc = urlSocketOptions.socketPath ? `socketPath:${urlSocketOptions.socketPath}` : '';
  const httpOptions = {
    ...pick(['auth', 'ca', 'cert', 'headers', 'key', 'passphrase', 'validateStatus'], validatedOpts),
    followRedirect,
    rejectUnauthorized,
    ...(timeout && { timeout }),
    ...urlSocketOptions,
    method
  };
  const checkFn = reverse ? negateAsync(httpCallSucceeds) : httpCallSucceeds;
  return timer(delay, interval).pipe(
    mergeMap(() => {
      output(`making HTTP(S) ${method} request to ${socketPathDesc} url:${urlSocketOptions.url} ...`);
      return from(checkFn(output, httpOptions));
    }, simultaneous),
    startWith(false),
    distinctUntilChanged(),
    take(2)
  );
}

async function httpCallSucceeds(output, httpOptions) {
  try {
    const response = shouldUseNodeRequest(httpOptions)
      ? await requestWithNode(httpOptions, httpOptions.url, MAX_REDIRECTS)
      : await requestWithFetch(httpOptions, httpOptions.url, MAX_REDIRECTS);
    const requestUrl = httpOptions.socketPath ? `${httpOptions.socketPath}${httpOptions.url}` : httpOptions.url;

    output(
      `  HTTP(S) result for ${requestUrl}: ${util.inspect({
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data
      })}`
    );

    return isStatusValid(response.status, httpOptions.validateStatus);
  } catch (err) {
    output(`  HTTP(S) error for ${httpOptions.url} ${err.toString()}`);
    return false;
  }
}

function shouldUseNodeRequest({ ca, cert, key, passphrase, rejectUnauthorized, socketPath, url }) {
  if (socketPath) {
    return true;
  }

  let protocol;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return false;
  }

  return protocol === 'https:' && (rejectUnauthorized === false || ca || cert || key || passphrase);
}

async function requestWithFetch(httpOptions, url, redirectsRemaining) {
  const { method, headers, auth, timeout, followRedirect } = httpOptions;
  const controller = new AbortController();
  let timeoutId;

  try {
    const fetchOptions = {
      method: method.toUpperCase(),
      headers: buildHeaders(headers, auth),
      redirect: 'manual'
    };

    if (timeout) {
      timeoutId = setTimeout(() => controller.abort(), timeout);
      fetchOptions.signal = controller.signal;
    }

    const response = await fetch(url, fetchOptions);
    const headersObject = Object.fromEntries(response.headers.entries());
    const location = headersObject.location;

    if (shouldFollowRedirect(response.status, location, followRedirect, redirectsRemaining)) {
      return requestWithFetch(httpOptions, resolveRedirectUrl(location, url), redirectsRemaining - 1);
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: headersObject,
      data: await readResponseData(response, method)
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function requestWithNode(httpOptions, url, redirectsRemaining) {
  const response = await requestWithNodeOnce(httpOptions, url);
  const location = getHeader(response.headers, 'location');

  if (shouldFollowRedirect(response.status, location, httpOptions.followRedirect, redirectsRemaining)) {
    return requestWithNode(httpOptions, resolveRedirectUrl(location, url, httpOptions.socketPath), redirectsRemaining - 1);
  }

  return response;
}

function requestWithNodeOnce(httpOptions, url) {
  const { method, headers, auth, timeout, socketPath, rejectUnauthorized } = httpOptions;
  const requestHeaders = buildHeaders(headers, auth);

  return new Promise((resolve, reject) => {
    const requestUrl = socketPath ? undefined : new URL(url);
    const transport = requestUrl && requestUrl.protocol === 'https:' ? https : http;
    const requestOptions = socketPath
      ? {
          socketPath,
          path: normalizeSocketRequestPath(url),
          method: method.toUpperCase(),
          headers: requestHeaders
        }
      : {
          method: method.toUpperCase(),
          headers: requestHeaders,
          rejectUnauthorized,
          ...pick(['ca', 'cert', 'key', 'passphrase'], httpOptions)
        };

    const req = socketPath
      ? http.request(requestOptions, onResponse)
      : transport.request(requestUrl, requestOptions, onResponse);

    if (timeout) {
      req.setTimeout(timeout, () => {
        req.destroy(Error(`timeout of ${timeout}ms exceeded`));
      });
    }

    req.on('error', reject);
    req.end();

    function onResponse(res) {
      let data = '';

      res.on('data', (chunk) => {
        if (method.toLowerCase() === 'get') {
          data += chunk;
        }
      });

      res.on('end', () => {
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          data: method.toLowerCase() === 'get' ? data : undefined
        });
      });
    }
  });
}

function buildHeaders(headers, auth) {
  const requestHeaders = { ...headers };
  const username = auth && (auth.username !== undefined ? auth.username : auth.user);
  const password = auth && (auth.password !== undefined ? auth.password : auth.pass);

  if (username !== undefined && password !== undefined) {
    for (const headerName of Object.keys(requestHeaders)) {
      if (headerName.toLowerCase() === 'authorization') {
        delete requestHeaders[headerName];
      }
    }

    requestHeaders.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  return requestHeaders;
}

async function readResponseData(response, method) {
  if (method.toLowerCase() !== 'get') {
    return undefined;
  }

  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

function isStatusValid(status, validateStatus) {
  return validateStatus ? validateStatus(status) : status >= 200 && status < 300;
}

function shouldFollowRedirect(status, location, followRedirect, redirectsRemaining) {
  return Boolean(followRedirect && redirectsRemaining > 0 && location && HTTP_REDIRECT_STATUS_CODES.has(status));
}

function resolveRedirectUrl(location, url, socketPath) {
  const baseUrl = socketPath ? socketRedirectBaseUrl(url) : url;
  const redirectUrl = new URL(location, baseUrl);

  return socketPath ? `${redirectUrl.pathname}${redirectUrl.search}` : redirectUrl.toString();
}

function socketRedirectBaseUrl(url) {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `http://localhost${url.startsWith('/') ? url : `/${url}`}`;
}

function normalizeSocketRequestPath(url) {
  if (/^https?:\/\//i.test(url)) {
    const requestUrl = new URL(url);
    return `${requestUrl.pathname}${requestUrl.search}`;
  }

  return url;
}

function getHeader(headers, name) {
  const value = headers[name.toLowerCase()] || headers[name];

  return Array.isArray(value) ? value[0] : value;
}

function createTCP$({ validatedOpts: { delay, interval, tcpTimeout, reverse, simultaneous }, output }, resource) {
  const tcpPath = extractPath(resource);
  const checkFn = reverse ? negateAsync(tcpExists) : tcpExists;
  return timer(delay, interval).pipe(
    mergeMap(() => {
      output(`making TCP connection to ${tcpPath} ...`);
      return from(checkFn(output, tcpPath, tcpTimeout));
    }, simultaneous),
    startWith(false),
    distinctUntilChanged(),
    take(2)
  );
}

async function tcpExists(output, tcpPath, tcpTimeout) {
  const [, , /* full, hostWithColon */ hostMatched, port] = HOST_PORT_RE.exec(tcpPath);
  const host = hostMatched || 'localhost';

  if (isInvalidIpAddress(host)) {
    output(`  invalid TCP host:${host} port:${port}`);
    return false;
  }

  return new Promise((resolve) => {
    let settled = false;
    let conn;
    const timeoutId = tcpTimeout
      ? setTimeout(() => {
          output(`  timed out connecting to TCP host:${host} port:${port} tcpTimeout:${tcpTimeout}ms`);
          finish(false);
        }, tcpTimeout)
      : undefined;

    function finish(result) {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (conn) {
        if (result) {
          conn.end();
        } else {
          conn.destroy();
        }
      }

      resolve(result);
    }

    conn = net
      .connect(port, host)
      .on('error', (err) => {
        output(`  error connecting to TCP host:${host} port:${port} ${err.toString()}`);
        finish(false);
      })
      .on('timeout', () => {
        output(`  timed out connecting to TCP host:${host} port:${port} tcpTimeout:${tcpTimeout}ms`);
        finish(false);
      })
      .on('connect', () => {
        output(`  TCP connection successful to host:${host} port:${port}`);
        finish(true);
      });
    conn.setTimeout(tcpTimeout);
  });
}

function isInvalidIpAddress(host) {
  return IPV4_LITERAL_RE.test(host) && net.isIP(host) === 0;
}

function createSocket$({ validatedOpts: { delay, interval, reverse, simultaneous }, output }, resource) {
  const socketPath = extractPath(resource);
  const checkFn = reverse ? negateAsync(socketExists) : socketExists;
  return timer(delay, interval).pipe(
    mergeMap(() => {
      output(`making socket connection to ${socketPath} ...`);
      return from(checkFn(output, socketPath));
    }, simultaneous),
    startWith(false),
    distinctUntilChanged(),
    take(2)
  );
}

async function socketExists(output, socketPath) {
  return new Promise((resolve) => {
    const conn = net
      .connect(socketPath)
      .on('error', (err) => {
        output(`  error connecting to socket socket:${socketPath} ${err.toString()}`);
        resolve(false);
      })
      .on('connect', () => {
        output(`  connected to socket:${socketPath}`);
        conn.end();
        resolve(true);
      });
  });
}

function negateAsync(asyncFn) {
  return async function (...args) {
    return !(await asyncFn(...args));
  };
}

module.exports = waitOn;
