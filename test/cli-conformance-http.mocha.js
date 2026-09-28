'use strict';

// LT4b - black-box CLI conformance: http(s), http(s)-get, and http-over-unix
// vectors (issue #40, post-fetch/undici behavior). Same portable style and
// language-agnostic spawn harness as LT4a; kept in its own file so the a/b
// baseline split stays independently reviewable. Both run today because the
// base branch already ships fetch/undici.

const fs = require('fs');
const http = require('http');
const { expect } = require('chai');
const { runCli, getFreePort, socketPathIn, tempDir, listening, T, APPEAR, FAST_OPTS } = require('./helpers/cli-conformance');

describe('cli conformance: http(s) vectors (LT4b)', function () {
  const servers = [];
  const tmpDirs = [];
  const timers = [];

  function track(server) {
    servers.push(server);
    return server;
  }
  function mkTmp() {
    const dir = tempDir();
    tmpDirs.push(dir);
    return dir;
  }
  function later(fn) {
    timers.push(setTimeout(fn, APPEAR));
  }

  afterEach(async function () {
    timers.splice(0).forEach(clearTimeout);
    await Promise.all(servers.splice(0).map((s) => new Promise((res) => s.close(() => res()))));
  });

  after(function () {
    tmpDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  });

  const okHandler = (req, res) => res.end('data');

  describe('http', function () {
    it('succeeds when an http resource becomes available later', async function () {
      const port = await getFreePort();
      later(() => track(http.createServer(okHandler)).listen(port, '127.0.0.1'));
      const r = await runCli(['http://127.0.0.1:' + port + '/', 'http://127.0.0.1:' + port + '/foo'].concat(FAST_OPTS));
      expect(r.code, r.stderr).to.equal(0);
      expect(r.elapsedMs).to.be.at.least(APPEAR - 150);
    });

    it('follows a redirect to a ready resource', async function () {
      const port = await getFreePort();
      const srv = track(
        http.createServer((req, res) => {
          if (req.url === '/') {
            res.writeHead(302, { Location: 'http://127.0.0.1:' + port + '/foo' });
          }
          res.end('data');
        })
      );
      await listening(srv, port, '127.0.0.1');
      const r = await runCli(['http://127.0.0.1:' + port + '/'].concat(FAST_OPTS));
      expect(r.code, r.stderr).to.equal(0);
    });

    it('times out when an http resource returns 404', async function () {
      const port = await getFreePort();
      const srv = track(
        http.createServer((req, res) => {
          res.statusCode = 404;
          res.end('nope');
        })
      );
      await listening(srv, port, '127.0.0.1');
      const r = await runCli(['http://127.0.0.1:' + port + '/'].concat(FAST_OPTS));
      expect(r.code).to.not.equal(0);
      expect(r.elapsedMs).to.be.at.least(T * 0.5);
    });

    it('times out when an http resource is never available', async function () {
      const port = await getFreePort();
      const r = await runCli(['http://127.0.0.1:' + port + '/'].concat(FAST_OPTS));
      expect(r.code).to.not.equal(0);
      expect(r.elapsedMs).to.be.at.least(T * 0.5);
    });

    it('times out when the server responds slower than --httpTimeout', async function () {
      const port = await getFreePort();
      const srv = track(http.createServer((req, res) => setTimeout(() => res.end('data'), 200)));
      await listening(srv, port, '127.0.0.1');
      const r = await runCli(['http://127.0.0.1:' + port + '/'].concat(FAST_OPTS).concat(['--httpTimeout', '50']));
      expect(r.code).to.not.equal(0);
    });
  });

  describe('http-get', function () {
    it('succeeds when an http-get resource becomes available later', async function () {
      const port = await getFreePort();
      later(() => track(http.createServer(okHandler)).listen(port, '127.0.0.1'));
      const r = await runCli(['http-get://127.0.0.1:' + port + '/'].concat(FAST_OPTS));
      expect(r.code, r.stderr).to.equal(0);
    });

    it('times out when an http-get resource is never available', async function () {
      const port = await getFreePort();
      const r = await runCli(['http-get://127.0.0.1:' + port + '/'].concat(FAST_OPTS));
      expect(r.code).to.not.equal(0);
      expect(r.elapsedMs).to.be.at.least(T * 0.5);
    });
  });

  describe('http-over-unix', function () {
    it('succeeds over a unix socket', async function () {
      const dir = mkTmp();
      const sock = socketPathIn(dir);
      await listening(track(http.createServer(okHandler)), sock);
      const r = await runCli(['http://unix:' + sock + ':http://localhost/'].concat(FAST_OPTS));
      expect(r.code, r.stderr).to.equal(0);
    });

    it('times out over a unix socket that returns 404', async function () {
      const dir = mkTmp();
      const sock = socketPathIn(dir);
      const srv = track(
        http.createServer((req, res) => {
          res.statusCode = 404;
          res.end('nope');
        })
      );
      await listening(srv, sock);
      const r = await runCli(['http://unix:' + sock + ':/'].concat(FAST_OPTS));
      expect(r.code).to.not.equal(0);
    });
  });
});
