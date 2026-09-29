'use strict';

const fs = require('fs');
const { promisify } = require('util');
const Joi = require('joi');
const net = require('net');
const util = require('util');
// Import fetch from undici (not the global): Node's built-in fetch is backed by
// Node's *bundled* undici, whose Dispatcher interface differs across Node majors
// (Node 22 ships undici 6, Node 26 ships 8), so a dispatcher from this dependency
// would be rejected by the global fetch. Using undici's own fetch keeps fetch and
// the dispatcher on the same version across every supported Node.
const { fetch, Agent, ProxyAgent, EnvHttpProxyAgent } = require('undici');
const { isBoolean, isEmpty, negate, noop, once, partial, pick, zip } = require('lodash/fp');
const { NEVER, combineLatest, from, merge, throwError, timer } = require('rxjs');
const { distinctUntilChanged, exhaustMap, finalize, map, mergeMap, scan, startWith, take, takeWhile } = require('rxjs/operators');
const childProcess = require('child_process');

const isNotABoolean = negate(isBoolean);
const isNotEmpty = negate(isEmpty);
const fstat = promisify(fs.stat);
const exec = promisify(childProcess.exec);
const PREFIX_RE = /^((https?-get|https?|tcp|socket|file|command):)(.+)$/;
// host:port, bare port (host defaults to localhost), or bracketed IPv6 [::1]:port
const HOST_PORT_RE = /^(?:\[([^\]]+)\]:|([^:]*):)?(\d+)$/;
const HTTP_GET_RE = /^https?-get:/;
const HTTP_PREFIX_RE = /^https?:\/\//;
// the socket path may contain colons (e.g. Windows named pipes like \\?\pipe\C:\app\sock),
// so split at the colon which is followed by the url or url path
const HTTP_UNIX_RE = /^http:\/\/unix:(.+?):((?:https?:\/\/|\/).*)$/;
const HTTP_UNIX_LEGACY_RE = /^http:\/\/unix:([^:]+):(.+)$/;
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
  commandTimeout: Joi.number().integer().min(0).default(0), // per-attempt kill for command: resources, 0 = no limit

  // http/https options
  ca: [Joi.string(), Joi.binary()],
  cert: [Joi.string(), Joi.binary()],
  key: [Joi.string(), Joi.binary(), Joi.object()],
  passphrase: Joi.string(),
  proxy: [
    Joi.boolean(),
    Joi.object({
      host: Joi.string().required(),
      port: Joi.number().required(),
      protocol: Joi.string(),
      auth: Joi.object({ username: Joi.string(), password: Joi.string() })
    })
  ],
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
   - command:<shell command> succeeds when the command exits 0. ex: command:pg_isready

   @param opts object configuring waitOn, or a string / string array used as opts.resources shorthand
   @param opts.resources array of string resources to wait for. prefix determines the type of resource with the default type of `file:`
   @param opts.delay integer - optional initial delay in ms, default 0
   @param opts.httpTimeout integer - optional http HEAD/GET timeout to wait for request, default 0
   @param opts.interval integer - optional poll resource interval in ms, default 250ms
   @param opts.log boolean - optional flag to turn on logging to stdout
   @param opts.reverse boolean - optional flag which reverses the mode, succeeds when resources are not available
   @param opts.simultaneous integer - optional limit of concurrent connections to a resource, default Infinity
   @param opts.tcpTimeout - Maximum time in ms for tcp connect, default 300ms
   @param opts.commandTimeout integer - optional per-attempt timeout in ms for command: resources, default 0 (no limit). A command still running at this bound is killed and the next poll retries
   @param opts.timeout integer - optional timeout in ms, default Infinity. Aborts with error.
   @param opts.verbose boolean - optional flag to turn on debug log
   @param opts.window integer - optional stabilization time in ms, default 750ms. Waits this amount of time for file sizes to stabilize or other resource availability to remain unchanged. If less than interval then will be reset to interval
   @param [cb] optional callback function with signature cb(err) - if err is provided then, resource checks did not succeed
   if not specified, wait-on will return a promise that will be rejected if resource checks did not succeed or resolved otherwise
 */
function waitOn(opts, cb) {
  // Shorthand: a string or string array is treated as opts.resources
  if (typeof opts === 'string' || Array.isArray(opts)) opts = { resources: [].concat(opts) };
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

  // fail fast on malformed resources instead of polling until timeout
  const resourceError = validateResources(resources);
  if (resourceError) {
    return cbOnce(resourceError);
  }

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
    case 'command:':
      return createCommand$(deps, resource);
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

// Returns an Error for the first syntactically malformed resource, else null.
// These fail immediately rather than polling until the global timeout.
function validateResources(resources) {
  for (const resource of resources) {
    const err = validateResource(resource);
    if (err) {
      return err;
    }
  }
  return null;
}

function validateResource(resource) {
  switch (extractPrefix(resource)) {
    case 'https-get:':
    case 'http-get:':
    case 'https:':
    case 'http:': {
      const url = resource.replace('-get:', ':');
      // http over a unix socket/named pipe: http://unix:SOCK_PATH:URL_PATH
      if (HTTP_UNIX_RE.test(url) || HTTP_UNIX_LEGACY_RE.test(url)) {
        return null;
      }
      // require `//` right after the scheme; `new URL('http:localhost:3000')`
      // parses successfully, so parsing alone would not catch this (#217)
      if (!HTTP_PREFIX_RE.test(url)) {
        return new Error(`Invalid resource "${resource}": http(s) resources must include "//", e.g. http://host:port/path`);
      }
      try {
        new URL(url);
      } catch {
        return new Error(`Invalid resource "${resource}": not a valid URL`);
      }
      return null;
    }
    case 'tcp:': {
      // tcp uses a bare host:port, not a URL authority (#140)
      if (/^tcp:\/\//.test(resource)) {
        return new Error(`Invalid resource "${resource}": use tcp:host:port (no "//"), e.g. tcp:127.0.0.1:3000`);
      }
      if (!HOST_PORT_RE.test(extractPath(resource))) {
        return new Error(`Invalid resource "${resource}": expected tcp:host:port or tcp:[ipv6]:port`);
      }
      return null;
    }
    default:
      return null;
  }
}

async function getFileSize(filePath) {
  try {
    const { size } = await fstat(filePath);
    return size;
  } catch {
    return -1;
  }
}

// Build the undici dispatcher for a single request. TLS client options and the
// unix socketPath ride on the connect options; proxy selection wraps them.
function buildDispatcher({ ca, cert, key, passphrase, rejectUnauthorized, socketPath, proxy }) {
  const connect = { rejectUnauthorized };
  if (ca !== undefined) connect.ca = ca;
  if (cert !== undefined) connect.cert = cert;
  if (key !== undefined) connect.key = key;
  if (passphrase !== undefined) connect.passphrase = passphrase;
  // A socketPath connection always uses a plain Agent, never a proxy dispatcher:
  // axios never proxies socketPath, and undici's proxy dispatchers would route the
  // synthesized http://localhost request through HTTP_PROXY and fail.
  if (socketPath !== undefined) {
    return new Agent({ connect: { ...connect, socketPath } });
  }
  if (proxy && typeof proxy === 'object') {
    // axios-shaped proxy object: { host, port, auth: { username, password }, protocol }
    // Normalize like axios did so the proxy URL always parses: accept a protocol with
    // or without a trailing ':' ('http' or 'http:'), and bracket a bare IPv6 host
    // ('::1' -> '[::1]'). Without this a valid axios proxy threw `Invalid URL`.
    const protocol = String(proxy.protocol || 'http').replace(/:$/, '');
    const host = /:/.test(proxy.host) && !/^\[.*\]$/.test(proxy.host) ? `[${proxy.host}]` : proxy.host;
    // Percent-encode credentials so undici's URL parse round-trips names/passwords
    // containing reserved characters (`/`, `#`, `@`, `:`).
    const credentials = proxy.auth
      ? `${encodeURIComponent(proxy.auth.username)}:${encodeURIComponent(proxy.auth.password ?? '')}@`
      : '';
    const uri = `${protocol}://${credentials}${host}:${proxy.port}`;
    return new ProxyAgent({ uri, requestTls: connect });
  }
  if (proxy === false) {
    return new Agent({ connect });
  }
  // proxy unset: honor HTTP(S)_PROXY / NO_PROXY environment variables like axios.
  return new EnvHttpProxyAgent({ connect });
}

function createHTTP$({ validatedOpts, output }, resource) {
  const {
    auth,
    delay,
    followRedirect,
    headers,
    httpTimeout,
    interval,
    proxy,
    reverse,
    simultaneous,
    strictSSL: rejectUnauthorized,
    validateStatus
  } = validatedOpts;
  const method = HTTP_GET_RE.test(resource) ? 'GET' : 'HEAD';
  const rawUrl = resource.replace('-get:', ':');
  // the socket path may contain colons (Windows named pipes); HTTP_UNIX_RE splits at
  // the colon before the url/url-path, with HTTP_UNIX_LEGACY_RE as the simple fallback.
  const matchHttpUnixSocket = HTTP_UNIX_RE.exec(rawUrl) || HTTP_UNIX_LEGACY_RE.exec(rawUrl); // http://unix:/sock:/url
  const socketPath = matchHttpUnixSocket ? matchHttpUnixSocket[1] : undefined;
  // For unix sockets HTTP_UNIX_RE yields either a relative ('/foo') or absolute
  // ('http://localhost/foo') path; new URL(..., base) normalizes both to a URL
  // fetch accepts, while socketPath carries the actual connection.
  const url = socketPath ? new URL(matchHttpUnixSocket[2], 'http://localhost').href : rawUrl;
  const socketPathDesc = socketPath ? `socketPath:${socketPath}` : '';

  let dispatcher;
  try {
    dispatcher = buildDispatcher({
      ...pick(['ca', 'cert', 'key', 'passphrase'], validatedOpts),
      rejectUnauthorized,
      socketPath,
      proxy
    });
  } catch (err) {
    // Dispatcher/proxy construction runs synchronously here (before subscribe); route
    // any error through the stream so it reaches the callback/promise instead of
    // throwing synchronously out of waitOn() (contract: all errors via cb).
    return throwError(() => err);
  }
  // Aborted when polling for this resource stops so no in-flight request lingers to
  // hold the checked socket open past the caller's teardown (parity with axios's
  // non-keep-alive http adapter, which released each socket right after the response).
  const teardown = new AbortController();

  const requestHeaders = { ...headers };
  if (auth) {
    // axios parity: opts.auth overrides any Authorization already in headers (regardless
    // of case), and builds a Basic header even for partial creds (each side defaults to
    // '' -> `Basic base64(user:pass)`). Undici would otherwise comma-merge a caller's
    // capital-case `Authorization` with the lowercase one set here.
    for (const key of Object.keys(requestHeaders)) {
      if (key.toLowerCase() === 'authorization') delete requestHeaders[key];
    }
    const token = Buffer.from(`${auth.username ?? ''}:${auth.password ?? ''}`).toString('base64');
    requestHeaders.authorization = `Basic ${token}`;
  }

  const fetchOptions = {
    method,
    headers: requestHeaders,
    // followRedirect true (default) follows 3xx to a final 2xx; false leaves the
    // 3xx as the response, which then fails the default 2xx status check.
    redirect: followRedirect ? 'follow' : 'manual',
    dispatcher
  };

  const checkFn = reverse ? negateAsync(httpCallSucceeds) : httpCallSucceeds;
  return timer(delay, interval).pipe(
    mergeMap(() => {
      output(`making HTTP(S) ${method} request to ${socketPathDesc} url:${url} ...`);
      return from(checkFn(output, url, fetchOptions, validateStatus, httpTimeout, teardown.signal));
    }, simultaneous),
    startWith(false),
    distinctUntilChanged(),
    take(2),
    finalize(() => {
      teardown.abort();
      dispatcher.close().catch(() => dispatcher.destroy().catch(() => {}));
    })
  );
}

async function httpCallSucceeds(output, url, fetchOptions, validateStatus, httpTimeout, teardownSignal) {
  try {
    // Combine teardown with a fresh per-request timeout signal; the timeout also
    // bounds the body read below so a slow response body still counts against httpTimeout.
    const signal = httpTimeout
      ? AbortSignal.any([teardownSignal, AbortSignal.timeout(httpTimeout)])
      : teardownSignal;
    const res = await fetch(url, { ...fetchOptions, signal });
    try {
      const ok = validateStatus ? validateStatus(res.status) : res.status >= 200 && res.status < 300;
      // Consume the body under the same signal so a slow GET body still honors httpTimeout.
      if (ok) await res.arrayBuffer();
      output(`  HTTP(S) result for ${url}: ${util.inspect({ status: res.status, statusText: res.statusText, ok })}`);
      return ok;
    } finally {
      // Drain/cancel the body on every remaining exit path — a false status check or a
      // validateStatus that throws — so no undici connection leaks back into the pool.
      if (res.body && !res.bodyUsed) await res.body.cancel().catch(() => {});
    }
  } catch (err) {
    output(`  HTTP(S) error for ${url} ${err.toString()}`);
    return false;
  }
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
  const [, /* full */ ipv6, hostMatched, port] = HOST_PORT_RE.exec(tcpPath);
  const host = ipv6 || hostMatched || 'localhost';
  return new Promise((resolve) => {
    const conn = net
      .connect(port, host)
      .on('error', (err) => {
        output(`  error connecting to TCP host:${host} port:${port} ${err.toString()}`);
        resolve(false);
      })
      .on('timeout', () => {
        output(`  timed out connecting to TCP host:${host} port:${port} tcpTimeout:${tcpTimeout}ms`);
        conn.destroy();
        resolve(false);
      })
      .on('connect', () => {
        output(`  TCP connection successful to host:${host} port:${port}`);
        conn.destroy();
        resolve(true);
      });
    conn.setTimeout(tcpTimeout);
  });
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
        conn.destroy();
        resolve(true);
      });
  });
}

function createCommand$({ validatedOpts: { delay, interval, reverse, commandTimeout }, output }, resource) {
  const command = extractPath(resource);
  const checkFn = reverse ? negateAsync(commandPasses) : commandPasses;
  // exhaustMap (not mergeMap/simultaneous): one exec in flight per resource. While a
  // command runs, later timer ticks are dropped, so a command that outlasts `interval`
  // is never spawned concurrently with itself.
  return timer(delay, interval).pipe(
    exhaustMap(() => {
      output(`executing command "${command}" ...`);
      return from(checkFn(output, command, commandTimeout));
    }),
    startWith(false),
    distinctUntilChanged(),
    take(2)
  );
}

async function commandPasses(output, command, commandTimeout) {
  try {
    // commandTimeout > 0 kills a hung command at the per-attempt bound (SIGKILL, since a
    // hung process may ignore SIGTERM); the rejection is caught below and polling continues.
    // ponytail: kills the shell; a detached grandchild can outlive it. commandTimeout is
    // the per-attempt bound, not a hard process-group kill.
    const { stdout } = await exec(command, { ...(commandTimeout ? { timeout: commandTimeout, killSignal: 'SIGKILL' } : {}) });
    output(`  Command "${command}" success. stdout: "${stdout}"`);
    return true;
  } catch (e) {
    output(`  Command error: "${e.message}"`);
    return false;
  }
}

function negateAsync(asyncFn) {
  return async function (...args) {
    return !(await asyncFn(...args));
  };
}

module.exports = waitOn;
