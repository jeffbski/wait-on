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
    // Cert generation shells out to openssl; on slow Windows CI runners this can
    // exceed the suite's tight per-test timeout, so give the one-time setup its
    // own generous budget (the EC keygen below is near-instant — belt-and-suspenders).
    this.timeout(30000);
    try {
      execSync('openssl version', { stdio: 'ignore' });
    } catch {
      this.skip(); // openssl not available in this environment
    }
    certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wait-on-tls-'));
    // EC P-256 (prime256v1): constant-time keygen, no RSA prime search — that
    // search made this hook intermittently exceed 6000ms on Windows. Node TLS
    // accepts EC self-signed certs, so every assertion below is unchanged.
    execSync(
      `openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -keyout ${certDir}/key.pem -out ${certDir}/cert.pem -days 1 -nodes -subj "/CN=localhost"`,
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

  // ---- B1: proxy URL normalization + construction never throws synchronously ----
  // A proxy object axios normalized (bare/expanded/bracketed IPv6 host, or a protocol
  // with or without a trailing colon) must build a valid undici URL. Proof it worked:
  // against a DEAD proxy the check reaches the overall-timeout error ('Timed out ...'),
  // which is only possible if the URL parsed and the request was actually attempted.
  // A construction error ('Invalid URL') would instead surface immediately (guard test).
  const DEAD_PROXY = { timeout: 600, interval: 100, window: 100 };
  [
    { label: 'a bare IPv6 host', proxy: { host: '::1', port: 1 } },
    { label: 'an already-bracketed IPv6 host (no double-bracket)', proxy: { host: '[::1]', port: 1 } },
    { label: 'an expanded IPv6 host', proxy: { host: '2001:db8::1', port: 1 } },
    { label: "protocol 'http:' (trailing colon stripped)", proxy: { host: '127.0.0.1', port: 1, protocol: 'http:' } },
    { label: "protocol 'https:' (trailing colon stripped)", proxy: { host: '127.0.0.1', port: 1, protocol: 'https:' } },
    { label: "protocol 'http' (no colon)", proxy: { host: '127.0.0.1', port: 1, protocol: 'http' } },
    { label: 'an IPv6 host with proxy credentials', proxy: { host: '::1', port: 1, auth: { username: 'u', password: 'p@:/' } } }
  ].forEach(function ({ label, proxy }) {
    it(`should build a valid proxy URL for ${label} and reach the timeout via callback`, function (done) {
      let threw = false;
      try {
        waitOn({ resources: ['http://localhost:65002/'], proxy, ...DEAD_PROXY }, function (err) {
          expect(err).to.be.ok;
          expect(err.message).to.match(/Timed out/); // parsed OK -> dead proxy contacted -> timeout (not 'Invalid URL')
          done();
        });
      } catch (e) {
        threw = true;
        done(e);
      }
      expect(threw).to.equal(false); // never a synchronous throw out of waitOn()
    });
  });

  it('should route a dispatcher construction error to the callback, not throw synchronously', function (done) {
    // A host that still cannot form a URL after normalization (space is not a valid
    // authority char) makes new ProxyAgent() throw; the guard must deliver it via cb.
    let threw = false;
    try {
      waitOn({ resources: ['http://localhost:65003/'], proxy: { host: 'bad host', port: 8080 }, timeout: 600 }, function (err) {
        expect(err).to.be.ok; // construction error delivered, not swallowed
        done();
      });
    } catch (e) {
      threw = true;
      done(e);
    }
    expect(threw).to.equal(false);
  });

  // ---- B2: opts.auth -> Basic header, axios parity ----
  // capture the Authorization header the server actually receives.
  function seenAuthFor(opts, assertSeen) {
    return function (done) {
      let seen = 'MISSING';
      listenHttp((req, res) => { seen = req.headers.authorization; res.statusCode = 200; res.end('ok'); }, function (port) {
        waitOn({ resources: [`http://localhost:${port}/`], ...opts, ...FAST }, function (err) {
          expect(err).to.not.be.ok;
          assertSeen(seen);
          done();
        });
      });
    };
  }
  const basic = (u, p) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');

  // auth overrides an existing Authorization header (any case) instead of comma-merging.
  ['Authorization', 'authorization', 'AUTHORIZATION', 'AuThOrIzAtIon'].forEach(function (headerName) {
    it(`should let opts.auth override a custom ${headerName} header (no comma-merge)`,
      seenAuthFor(
        { headers: { [headerName]: 'Bearer CUSTOM' }, auth: { username: 'user', password: 'p' } },
        (seen) => expect(seen).to.equal(basic('user', 'p'))
      ));
  });

  // partial / empty auth builds a Basic header exactly as axios did (each side -> '').
  [
    { label: 'username + password', auth: { username: 'user', password: 'p@ss/word' }, expected: basic('user', 'p@ss/word') },
    { label: 'password only', auth: { password: 'p' }, expected: basic('', 'p') },
    { label: 'username only', auth: { username: 'u' }, expected: basic('u', '') },
    { label: 'empty object', auth: {}, expected: basic('', '') }
  ].forEach(function ({ label, auth, expected }) {
    it(`should build a Basic header for auth with ${label}`,
      seenAuthFor({ auth }, (seen) => expect(seen).to.equal(expected)));
  });

  it('should pass a custom Authorization header through untouched when no auth is set',
    seenAuthFor({ headers: { Authorization: 'Bearer KEEPME' } }, (seen) => expect(seen).to.equal('Bearer KEEPME')));

  it('should send no Authorization header when neither auth nor a header is set',
    seenAuthFor({}, (seen) => expect(seen).to.equal(undefined)));

  // ---- validateStatus over real HTTP (fetch decides success after the response) ----
  // fetch never rejects on status, so success is decided by validateStatus (default 2xx).
  // These exercise that decision end-to-end over HTTP for HEAD and GET.
  function statusServer(code) {
    return function (cb) {
      listenHttp((req, res) => { res.statusCode = code; res.end('x'); }, cb);
    };
  }

  it('should succeed on a non-2xx when validateStatus accepts it (HEAD)', function (done) {
    statusServer(404)(function (port) {
      waitOn({ resources: [`http://localhost:${port}/`], validateStatus: (s) => s === 404, ...FAST }, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  it('should succeed on a non-2xx when validateStatus accepts it (GET)', function (done) {
    statusServer(404)(function (port) {
      waitOn({ resources: [`http-get://localhost:${port}/`], validateStatus: (s) => s === 404, ...FAST }, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  it('should fail a 2xx when validateStatus rejects it', function (done) {
    statusServer(200)(function (port) {
      waitOn({ resources: [`http://localhost:${port}/`], validateStatus: (s) => s === 500, timeout: 600, interval: 100, window: 100 }, function (err) {
        expect(err).to.be.ok; // 200 not accepted -> never ready -> timeout
        done();
      });
    });
  });

  it('should fail a non-2xx by default (no validateStatus)', function (done) {
    statusServer(404)(function (port) {
      waitOn({ resources: [`http://localhost:${port}/`], timeout: 600, interval: 100, window: 100 }, function (err) {
        expect(err).to.be.ok; // default 2xx check rejects 404
        done();
      });
    });
  });

  it('should succeed on 204 by default (2xx boundary)', function (done) {
    statusServer(204)(function (port) {
      waitOn({ resources: [`http://localhost:${port}/`], ...FAST }, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });
});
