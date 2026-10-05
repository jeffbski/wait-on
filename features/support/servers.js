'use strict';

// Local servers the steps start: ephemeral ports, temp-path unix sockets or Windows
// named pipes. Each returns {port | path, close}.

const http = require('http');
const fs = require('fs');
const https = require('https');
const net = require('net');
const path = require('path');
const { getFreePort, listening } = require('../../test/helpers/cli-conformance');

let pipes = 0;
// Windows has no unix domain sockets; Node listens on a named pipe there instead
// (the \\?\pipe\<dir> form); a counter keeps names unique
function socketPath(dir) {
  pipes += 1;
  const name = `sock-${pipes}`;
  return process.platform === 'win32' ? path.join('\\\\?\\pipe', dir, name) : path.join(dir, name);
}

// close, dropping kept-alive http connections first so close() does not wait on them
const closer = (server) => () => {
  if (server.closeAllConnections) server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
};

async function tcpServer(host, port = 0) {
  const sockets = new Set();
  const server = net.createServer((s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await listening(server, port, host);
  const close = closer(server);
  return {
    port: server.address().port,
    close: () => {
      for (const s of sockets) s.destroy();
      return close();
    }
  };
}

// a port reserved now that starts listening `ms` later (real clock), so the first checks are refused
async function delayedTcpServer(host, ms) {
  const port = await getFreePort();
  let started;
  const timer = setTimeout(() => {
    // a lost port shows as the scenario's own failure
    started = tcpServer(host, port).catch(() => null);
  }, ms);
  return {
    port,
    close: async () => {
      clearTimeout(timer);
      const server = await started;
      if (server) await server.close();
    }
  };
}

const answering = (status) => (req, res) => {
  res.statusCode = status;
  res.end();
};

// listens on a loopback port (ephemeral by default); keepAlive 1ms so close() never waits on a client
async function start(server, extra = {}, port = 0) {
  server.keepAliveTimeout = 1;
  await listening(server, port, '127.0.0.1');
  return { port: server.address().port, close: closer(server), ...extra };
}

const httpServer = (status) => start(http.createServer(answering(status)));

// records each request's method, url and headers (headers, auth)
function recordingHttpServer(status) {
  const requests = [];
  const handler = (req, res) => {
    requests.push({ method: req.method, url: req.url, headers: req.headers });
    answering(status)(req, res);
  };
  return start(http.createServer(handler), { requests });
}

// `/` answers 302 to `/ok`, which answers 200 (followRedirect)
function redirectingHttpServer() {
  const handler = (req, res) => {
    if (req.url === '/ok') return answering(200)(req, res);
    res.writeHead(302, { location: '/ok' });
    res.end();
  };
  return start(http.createServer(handler));
}

// accepts requests and never answers (httpTimeout); close() drops the held connections
const silentHttpServer = () => start(http.createServer(() => {}));

// answers after `ms`, recording the most requests it held at once (simultaneous)
function slowHttpServer(status, ms) {
  const counts = { inFlight: 0, peak: 0 };
  const handler = (req, res) => {
    counts.peak = Math.max(counts.peak, ++counts.inFlight);
    setTimeout(() => {
      counts.inFlight--;
      answering(status)(req, res);
    }, ms);
  };
  return start(http.createServer(handler), { counts });
}

// The committed TLS material (features/fixtures/tls, regeneration recipe in AGENTS.md).
// cert/key are the client identity and encryptedKey its passphrase-protected copy;
// ca signs the server and client certificates, otherCert is an unrelated CA.
const TLS_DIR = path.resolve(__dirname, '..', 'fixtures', 'tls');
const pem = (name) => fs.readFileSync(path.join(TLS_DIR, name));
const TLS = {
  cert: pem('client.pem'),
  key: pem('client-key.pem'),
  encryptedKey: pem('client-key-encrypted.pem'),
  passphrase: 'wait-on-test-passphrase',
  otherCert: pem('other-ca.pem'),
  ca: pem('ca.pem')
};

// An https server (server.pem, signed by ca.pem) recording each request's `authorized`;
// with clientCert it requires a client certificate ca.pem verifies.
function tlsServer({ status = 200, clientCert = false } = {}) {
  const authorized = [];
  const mtls = clientCert ? { requestCert: true, rejectUnauthorized: true, ca: TLS.ca } : {};
  const server = https.createServer({ key: pem('server-key.pem'), cert: pem('server.pem'), ...mtls }, (req, res) => {
    authorized.push(req.socket.authorized);
    answering(status)(req, res);
  });
  return start(server, { tls: TLS, authorized });
}

// the @engine https server: trusted through `ca` (ca.pem as a string)
async function httpsServer(status) {
  const server = await tlsServer({ status });
  return { ...server, ca: server.tls.ca.toString() };
}

async function unixServer(dir) {
  const file = socketPath(dir);
  const server = await listening(
    net.createServer((s) => s.end()),
    file
  );
  return { path: file, close: closer(server) };
}

async function httpUnixServer(dir, status) {
  const file = socketPath(dir);
  const server = await listening(http.createServer(answering(status)), file);
  return { path: file, close: closer(server) };
}

module.exports = {
  socketPath,
  tcpServer,
  delayedTcpServer,
  freePort: getFreePort,
  httpServer,
  recordingHttpServer,
  redirectingHttpServer,
  silentHttpServer,
  slowHttpServer,
  httpsServer,
  tlsServer,
  unixServer,
  httpUnixServer
};
