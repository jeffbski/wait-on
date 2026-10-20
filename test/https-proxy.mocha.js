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
const net = require('net');
const https = require('https');
const { execSync } = require('child_process');
const { listenBadPort } = require('./helpers/bad-port');

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

  it('should keep other custom headers while opts.auth sets Authorization', function (done) {
    let seen;
    listenHttp((req, res) => { seen = req.headers; res.statusCode = 200; res.end('ok'); }, function (port) {
      waitOn(
        { resources: [`http://localhost:${port}/`], headers: { 'X-Custom': 'keep', Authorization: 'Bearer OLD' }, auth: { username: 'u', password: 'p' }, ...FAST },
        function (err) {
          expect(err).to.not.be.ok;
          expect(seen['x-custom']).to.equal('keep'); // non-authorization header survives the strip loop
          expect(seen.authorization).to.equal('Basic ' + Buffer.from('u:p').toString('base64')); // auth still wins
          done();
        }
      );
    });
  });

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
  // #260: undici fetch refuses WHATWG Fetch "bad ports" (6000, 5060, 6665-6669, 10080, ...)
  // before connecting; axios (9.x) did not. These pin that an http probe reaches them.
  describe('Fetch bad-list ports (#260)', function () {
    // Listen on the first free bad-list port and register the server for teardown.
    async function listenBad(server, host) {
      const port = await listenBadPort(server, host);
      servers.push(server);
      return port;
    }

    function counting(handler) {
      const server = http.createServer((req, res) => { server.hits++; handler(req, res); });
      server.hits = 0;
      return server;
    }

    // Stub forward proxy that counts every request it carries: CONNECT tunnels and
    // absolute-form plain-http requests both bump `hits`.
    async function listenCountingProxy() {
      const sockets = new Set();
      const proxy = http.createServer((req, res) => {
        proxy.hits++;
        const target = new URL(req.url);
        const upstream = http.request(
          { host: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method, headers: req.headers },
          (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); }
        );
        upstream.on('error', () => { res.statusCode = 502; res.end(); });
        req.pipe(upstream);
      });
      proxy.hits = 0;
      proxy.on('connect', (req, clientSocket, head) => {
        proxy.hits++;
        const idx = req.url.lastIndexOf(':');
        const upstream = net.connect(Number(req.url.slice(idx + 1)), req.url.slice(0, idx), () => {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          upstream.write(head);
          upstream.pipe(clientSocket);
          clientSocket.pipe(upstream);
        });
        sockets.add(clientSocket).add(upstream);
        upstream.on('error', () => clientSocket.destroy());
        clientSocket.on('error', () => upstream.destroy());
      });
      const close = proxy.close.bind(proxy);
      proxy.close = (cb) => { sockets.forEach((s) => s.destroy()); return close(cb); };
      servers.push(proxy);
      await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
      return proxy;
    }

    it('should succeed when an http HEAD resource listens on a bad-list port', async function () {
      const target = counting((req, res) => res.end('ok'));
      const badPort = await listenBad(target);
      await waitOn({ resources: [`http://127.0.0.1:${badPort}/`], ...FAST });
      expect(target.hits).to.be.above(0);
    });

    it('should succeed when an http-get resource listens on a bad-list port', async function () {
      const target = counting((req, res) => res.end('ok'));
      const badPort = await listenBad(target);
      await waitOn({ resources: [`http-get://127.0.0.1:${badPort}/`], ...FAST });
      expect(target.hits).to.be.above(0);
    });

    it('should succeed when an https resource with ca and strictSSL listens on a bad-list port', async function () {
      const target = https.createServer({ key, cert }, (req, res) => res.end('ok'));
      const badPort = await listenBad(target, 'localhost');
      await waitOn({ resources: [`https://localhost:${badPort}/`], strictSSL: true, ca: cert, ...FAST });
    });

    it('should follow a redirect onto a bad-list port when followRedirect is true', async function () {
      const target = counting((req, res) => res.end('ok'));
      const badPort = await listenBad(target);
      const port = await new Promise((resolve) => listenHttp((req, res) => {
        res.writeHead(302, { Location: `http://127.0.0.1:${badPort}/` });
        res.end();
      }, resolve));
      await waitOn({ resources: [`http://localhost:${port}/`], ...FAST });
      expect(target.hits).to.be.above(0);
    });

    it('should hand a 3xx from a bad-list port to validateStatus when followRedirect is false', async function () {
      const target = counting((req, res) => { res.writeHead(302, { Location: '/elsewhere' }); res.end(); });
      const badPort = await listenBad(target);
      await waitOn({
        resources: [`http://127.0.0.1:${badPort}/`],
        followRedirect: false,
        validateStatus: (status) => status === 302,
        ...FAST
      });
      expect(target.hits).to.be.above(0);
    });

    // fetch rejects a url with userinfo before sending; dispatcher.request would drop the
    // credentials and send anyway. Keep 10.x behavior: such a url never succeeds.
    it('should keep failing an http url with userinfo after leaving fetch', function (done) {
      listenHttp((req, res) => res.end('ok'), function (port) {
        waitOn({ resources: [`http://user:pass@localhost:${port}/`], timeout: 600, interval: 100, window: 100 }, function (err) {
          expect(err).to.be.ok;
          expect(err.message).to.match(/Timed out/);
          done();
        });
      });
    });

    // fetch sent accept, accept-language and user-agent by default (axios sent accept and
    // user-agent too); some servers and WAFs reject requests without them, so leaving fetch
    // must not drop them.
    it('should send default accept, accept-language and user-agent headers, letting caller headers win', async function () {
      const seen = [];
      const port = await new Promise((resolve) => listenHttp((req, res) => { seen.push(req.headers); res.end('ok'); }, resolve));
      await waitOn({ resources: [`http://localhost:${port}/`], ...FAST });
      expect(seen[0]).to.include({ accept: '*/*', 'accept-language': '*', 'user-agent': 'undici' });
      seen.length = 0;
      await waitOn({
        resources: [`http://localhost:${port}/a`],
        headers: { 'User-Agent': 'probe', Accept: 'text/plain', 'Accept-Language': 'en' },
        ...FAST
      });
      expect(seen[0]).to.include({ accept: 'text/plain', 'accept-language': 'en', 'user-agent': 'probe' });
    });

    // fetch sent the url's path and query as written, keeping an explicitly empty `?`
    // and dropping any #fragment.
    for (const [suffix, expected] of [['/health?', '/health?'], ['/health?a=1', '/health?a=1'], ['/health#frag', '/health']]) {
      it(`should request ${expected} for a ${suffix} url`, async function () {
        const seen = [];
        const port = await new Promise((resolve) => listenHttp((req, res) => { seen.push(req.url); res.end('ok'); }, resolve));
        await waitOn({ resources: [`http://localhost:${port}${suffix}`], ...FAST });
        expect(seen[0]).to.equal(expected);
      });
    }

    // fetch failed after 20 redirects; a 3xx at the cap must not reach validateStatus.
    it('should fail an endless redirect chain even when validateStatus accepts 3xx', function (done) {
      listenHttp((req, res) => { res.writeHead(302, { Location: `/r${Math.random()}` }); res.end(); }, function (port) {
        waitOn({ resources: [`http://localhost:${port}/`], validateStatus: (s) => s < 400, timeout: 800, interval: 100, window: 100 }, function (err) {
          expect(err).to.be.ok;
          expect(err.message).to.match(/Timed out/);
          done();
        });
      });
    });

    // fetch dropped Authorization on a cross-origin redirect; the redirect interceptor must too.
    it('should not send opts.auth to a different origin after a redirect', async function () {
      const seen = {};
      const other = await new Promise((resolve) => listenHttp((req, res) => {
        seen.other = req.headers.authorization;
        res.end('ok');
      }, resolve));
      const port = await new Promise((resolve) => listenHttp((req, res) => {
        seen.first = req.headers.authorization;
        res.writeHead(302, { Location: `http://localhost:${other}/` });
        res.end();
      }, resolve));
      await waitOn({ resources: [`http://localhost:${port}/`], auth: { username: 'u', password: 'p' }, ...FAST });
      expect(seen.first).to.equal('Basic ' + Buffer.from('u:p').toString('base64'));
      expect(seen).to.have.property('other', undefined);
    });

    // fetch followed 20 redirects and only failed on a 21st.
    it('should succeed when the final 2xx comes after exactly 20 redirects', async function () {
      const port = await new Promise((resolve) => listenHttp((req, res) => {
        const hop = Number(req.url.slice(1)) || 0;
        if (hop === 20) return res.end('ok');
        res.writeHead(302, { Location: `/${hop + 1}` });
        res.end();
      }, resolve));
      await waitOn({ resources: [`http://localhost:${port}/`], ...FAST });
    });

    it('should fail when the final 2xx comes after 21 redirects', function (done) {
      listenHttp((req, res) => {
        const hop = Number(req.url.slice(1)) || 0;
        if (hop === 21) return res.end('ok');
        res.writeHead(302, { Location: `/${hop + 1}` });
        res.end();
      }, function (port) {
        waitOn({ resources: [`http://localhost:${port}/`], timeout: 800, interval: 100, window: 100 }, function (err) {
          expect(err).to.be.ok;
          expect(err.message).to.match(/Timed out/);
          done();
        });
      });
    });

    // fetch cancelled a rejected body at once; waiting for a non-2xx body that never ends
    // would hold the only poll slot (simultaneous: 1, no httpTimeout) until the timeout.
    it('should succeed when an earlier non-2xx GET response never ends its body', async function () {
      const healthyAt = Date.now() + 500;
      let stalled = 0;
      const port = await new Promise((resolve) => listenHttp((req, res) => {
        if (Date.now() >= healthyAt) return res.end('ok');
        res.writeHead(503);
        res.write('x'); // never ended
        stalled++;
      }, resolve));
      try {
        await waitOn({ resources: [`http-get://localhost:${port}/`], simultaneous: 1, ...FAST });
      } finally {
        servers.forEach((s) => s.closeAllConnections());
      }
      expect(stalled).to.be.above(0);
    });

    it('should route a bad-list port target through an explicit proxy object', async function () {
      const target = counting((req, res) => res.end('ok'));
      const badPort = await listenBad(target);
      const proxy = await listenCountingProxy();
      await waitOn({
        resources: [`http://127.0.0.1:${badPort}/`],
        proxy: { host: '127.0.0.1', port: proxy.address().port, protocol: 'http' },
        ...FAST
      });
      expect(proxy.hits).to.be.above(0);
      expect(target.hits).to.be.above(0);
    });

    it('should route a bad-list port target through HTTP_PROXY from the env', async function () {
      const target = counting((req, res) => res.end('ok'));
      const badPort = await listenBad(target);
      const proxy = await listenCountingProxy();
      const names = ['HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy'];
      const prior = Object.fromEntries(names.map((n) => [n, process.env[n]]));
      names.forEach((n) => delete process.env[n]);
      process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.address().port}`;
      try {
        await waitOn({ resources: [`http://127.0.0.1:${badPort}/`], ...FAST });
      } finally {
        names.forEach((n) => { if (prior[n] === undefined) delete process.env[n]; else process.env[n] = prior[n]; });
      }
      expect(proxy.hits).to.be.above(0);
      expect(target.hits).to.be.above(0);
    });

    it('should tunnel an https bad-list port target through an explicit proxy object', async function () {
      const target = https.createServer({ key, cert }, (req, res) => res.end('ok'));
      const badPort = await listenBad(target, 'localhost');
      const proxy = await listenCountingProxy();
      await waitOn({
        resources: [`https://localhost:${badPort}/`],
        proxy: { host: '127.0.0.1', port: proxy.address().port, protocol: 'http' },
        strictSSL: true,
        ca: cert,
        ...FAST
      });
      expect(proxy.hits).to.be.above(0);
    });

    it('should succeed in reverse mode once a bad-list port server closes', async function () {
      const target = counting((req, res) => res.end('ok'));
      const badPort = await listenBadPort(target);
      let closedAt;
      setTimeout(() => {
        closedAt = Date.now();
        target.close();
        target.closeAllConnections();
      }, 500);
      await waitOn({ resources: [`http://127.0.0.1:${badPort}/`], reverse: true, ...FAST });
      expect(target.hits).to.be.above(0);
      expect(closedAt).to.be.a('number');
    });
  });
});
