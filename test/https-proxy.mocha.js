'use strict';

// Parity coverage for the fetch/undici migration: TLS client options and the
// unix-socket + proxy interaction, which the original suite never exercised.
// Self-contained (generated cert, ephemeral ports, temp socket) so these do not
// share fixed ports with the rest of the suite.

const waitOn = require('../');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

const mocha = require('mocha');
const describe = mocha.describe;
const it = mocha.it;
const before = mocha.before;
const after = mocha.after;
const afterEach = mocha.afterEach;
const chai = require('chai');
const expect = chai.expect;

const FAST = { timeout: 2000, interval: 100, window: 100, tcpTimeout: 500 };

describe('https/tls and proxy parity', function () {
  this.timeout(6000);

  let certDir;
  let key;
  let cert;

  before(function () {
    try {
      execSync('openssl version', { stdio: 'ignore' });
    } catch {
      this.skip(); // openssl not available in this environment
    }
    certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wait-on-tls-'));
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout ${certDir}/key.pem -out ${certDir}/cert.pem -days 1 -nodes -subj "/CN=localhost"`,
      { stdio: 'ignore' }
    );
    key = fs.readFileSync(path.join(certDir, 'key.pem'));
    cert = fs.readFileSync(path.join(certDir, 'cert.pem'));
  });

  after(function () {
    fs.rmSync(certDir, { recursive: true, force: true });
  });

  let servers = [];
  afterEach(function (done) {
    const toClose = servers;
    servers = [];
    let pending = toClose.length;
    if (!pending) return done();
    toClose.forEach((s) => s.close(() => { if (--pending === 0) done(); }));
  });

  function listenHttps(handler, cb) {
    const server = https.createServer({ key, cert }, handler);
    servers.push(server);
    server.listen(0, 'localhost', () => cb(server.address().port));
  }

  // Windows has no Unix domain sockets; Node listens on named pipes instead.
  function socketPathFor(name) {
    return process.platform === 'win32' ? path.join('\\\\?\\pipe', certDir, name) : path.join(certDir, name);
  }

  it('should fail an https self-signed cert when strictSSL is true', function (done) {
    listenHttps((req, res) => { res.end('ok'); }, function (port) {
      waitOn({ resources: [`https://localhost:${port}/`], strictSSL: true, ...FAST }, function (err) {
        expect(err).to.be.ok; // rejected: DEPTH_ZERO_SELF_SIGNED_CERT
        done();
      });
    });
  });

  it('should pass an https self-signed cert when strictSSL is false (default)', function (done) {
    listenHttps((req, res) => { res.end('ok'); }, function (port) {
      waitOn({ resources: [`https://localhost:${port}/`], strictSSL: false, ...FAST }, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  it('should pass a self-signed cert when the matching ca is supplied with strictSSL true', function (done) {
    listenHttps((req, res) => { res.end('ok'); }, function (port) {
      waitOn({ resources: [`https://localhost:${port}/`], strictSSL: true, ca: cert, ...FAST }, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  it('should resolve a unix-socket resource in both the short and absolute URL forms', function (done) {
    const sockPath = socketPathFor('sock1');
    const server = http.createServer((req, res) => { res.statusCode = req.url === '/foo' ? 200 : 404; res.end('x'); });
    servers.push(server);
    server.listen(sockPath, function () {
      const resources = [
        'http://unix:' + sockPath + ':/foo', // short form -> relative path /foo
        'http://unix:' + sockPath + ':http://localhost/foo' // absolute form
      ];
      waitOn({ resources, ...FAST }, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  it('should not route a unix-socket check through HTTP_PROXY when it is set in the env', function (done) {
    // A bogus proxy that would fail the check if the socket request were routed through it.
    const priorHttpProxy = process.env.HTTP_PROXY;
    const priorLower = process.env.http_proxy;
    process.env.HTTP_PROXY = 'http://127.0.0.1:1'; // nothing listening
    process.env.http_proxy = 'http://127.0.0.1:1';
    const restore = () => {
      if (priorHttpProxy === undefined) delete process.env.HTTP_PROXY; else process.env.HTTP_PROXY = priorHttpProxy;
      if (priorLower === undefined) delete process.env.http_proxy; else process.env.http_proxy = priorLower;
    };
    const sockPath = socketPathFor('sock2');
    const server = http.createServer((req, res) => { res.statusCode = 200; res.end('x'); });
    servers.push(server);
    server.listen(sockPath, function () {
      waitOn({ resources: ['http://unix:' + sockPath + ':/'], ...FAST }, function (err) {
        restore();
        expect(err).to.not.be.ok; // socket check bypasses the proxy
        done();
      });
    });
  });

  function listenHttp(handler, cb) {
    const server = http.createServer(handler);
    servers.push(server);
    server.listen(0, 'localhost', () => cb(server.address().port));
  }

  it('should send a Basic Authorization header built from opts.auth', function (done) {
    let seen;
    listenHttp((req, res) => { seen = req.headers.authorization; res.statusCode = 200; res.end('ok'); }, function (port) {
      waitOn({ resources: [`http://localhost:${port}/`], auth: { username: 'user', password: 'p@ss/word' }, ...FAST }, function (err) {
        expect(err).to.not.be.ok;
        const expected = 'Basic ' + Buffer.from('user:p@ss/word').toString('base64');
        expect(seen).to.equal(expected);
        done();
      });
    });
  });

  it('should route through an explicit proxy object (dead proxy fails a reachable target)', function (done) {
    // Target is live; routing the request through a dead proxy must make the check fail,
    // which proves the proxy object is honored rather than connecting directly.
    listenHttp((req, res) => { res.statusCode = 200; res.end('ok'); }, function (port) {
      waitOn({ resources: [`http://localhost:${port}/`], proxy: { host: '127.0.0.1', port: 1 }, timeout: 1000, interval: 100, window: 100 }, function (err) {
        expect(err).to.be.ok; // could not reach the (dead) proxy
        done();
      });
    });
  });

  it('should connect directly when proxy is false even if the target is reachable', function (done) {
    listenHttp((req, res) => { res.statusCode = 200; res.end('ok'); }, function (port) {
      waitOn({ resources: [`http://localhost:${port}/`], proxy: false, ...FAST }, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  it('should surface a malformed proxy object as a callback error, not a synchronous throw', function (done) {
    // proxy:{} is missing host/port; it must fail validation and reach the callback,
    // never crash waitOn synchronously.
    expect(function () {
      waitOn({ resources: ['http://localhost:65001/'], proxy: {}, timeout: 500 }, function (err) {
        expect(err).to.be.ok;
        done();
      });
    }).to.not.throw();
  });
});
