'use strict';

// undici fetch refuses WHATWG "bad ports" (6000 is on that list) before any
// bytes are sent. wait-on 9.x reached those ports. These tests pin that a
// listening server on 6000 is ready, including through redirects and a proxy.

const waitOn = require('../');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const mocha = require('mocha');
const describe = mocha.describe;
const it = mocha.it;
const before = mocha.before;
const after = mocha.after;
const chai = require('chai');
const expect = chai.expect;

const CLI_PATH = path.resolve(__dirname, '../bin/wait-on');
const BAD_PORT = 6000;
const FAST = { timeout: 2000, interval: 100, window: 100 };

function closeAll(servers, done) {
  let pending = servers.length;
  if (!pending) return done();
  servers.forEach((server) => {
    server.closeAllConnections();
    server.close(() => { if (--pending === 0) done(); });
  });
}

// Bind `port`. Skip the test when the machine already holds it.
function listen(server, port, host, onReady, onSkip) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' || err.code === 'EACCES') onSkip();
    else onReady(err);
  });
  server.listen(port, host, () => onReady(null));
}

describe('fetch bad ports', function () {
  this.timeout(8000);

  let certDir;
  let key;
  let cert;

  before(function () {
    this.timeout(30000);
    try {
      execSync('openssl version', { stdio: 'ignore' });
    } catch {
      return; // https case skips itself
    }
    certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wait-on-bad-port-'));
    execSync(
      `openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -keyout ${certDir}/key.pem -out ${certDir}/cert.pem -days 1 -nodes -subj "/CN=localhost"`,
      { stdio: 'ignore' }
    );
    key = fs.readFileSync(path.join(certDir, 'key.pem'));
    cert = fs.readFileSync(path.join(certDir, 'cert.pem'));
  });

  after(function () {
    if (certDir) fs.rmSync(certDir, { recursive: true, force: true });
  });

  it('should succeed when an http resource listens on port 6000', function (done) {
    const seen = [];
    const server = http.createServer((req, res) => {
      seen.push(req.method);
      res.end('ok');
    });
    listen(server, BAD_PORT, '127.0.0.1', (err) => {
      if (err) return done(err);
      waitOn({ resources: [`http://127.0.0.1:${BAD_PORT}/`], ...FAST }, function (waitErr) {
        closeAll([server], () => {
          expect(waitErr).to.not.be.ok;
          expect(seen).to.include('HEAD');
          done();
        });
      });
    }, () => this.skip());
  });

  it('should GET an http-get resource on port 6000', function (done) {
    const seen = [];
    const server = http.createServer((req, res) => {
      seen.push(req.method);
      res.end('ok');
    });
    listen(server, BAD_PORT, '127.0.0.1', (err) => {
      if (err) return done(err);
      waitOn({ resources: [`http-get://127.0.0.1:${BAD_PORT}/`], ...FAST }, function (waitErr) {
        closeAll([server], () => {
          expect(waitErr).to.not.be.ok;
          expect(seen).to.include('GET');
          done();
        });
      });
    }, () => this.skip());
  });

  it('should succeed for https on port 6000 when ca is supplied and strictSSL is true', function (done) {
    if (!cert) this.skip();
    const server = https.createServer({ key, cert }, (req, res) => { res.end('ok'); });
    listen(server, BAD_PORT, 'localhost', (err) => {
      if (err) return done(err);
      waitOn({
        resources: [`https://localhost:${BAD_PORT}/`],
        strictSSL: true,
        ca: cert,
        ...FAST
      }, function (waitErr) {
        closeAll([server], () => {
          expect(waitErr).to.not.be.ok;
          done();
        });
      });
    }, () => this.skip());
  });

  it('should follow a redirect onto port 6000', function (done) {
    let landed = 0;
    const dest = http.createServer((req, res) => {
      landed += 1;
      res.end('ok');
    });
    listen(dest, BAD_PORT, '127.0.0.1', (err) => {
      if (err) return done(err);
      const start = http.createServer((req, res) => {
        res.writeHead(302, { Location: `http://127.0.0.1:${BAD_PORT}/landed` });
        res.end();
      });
      start.listen(0, '127.0.0.1', () => {
        const port = start.address().port;
        waitOn({ resources: [`http://127.0.0.1:${port}/`], ...FAST }, function (waitErr) {
          closeAll([start, dest], () => {
            expect(waitErr).to.not.be.ok;
            expect(landed).to.be.at.least(1);
            done();
          });
        });
      });
    }, () => this.skip());
  });

  it('should hand a 302 to validateStatus when followRedirect is false', function (done) {
    let landed = 0;
    const dest = http.createServer((req, res) => {
      landed += 1;
      res.end('should not be fetched');
    });
    dest.listen(0, '127.0.0.1', () => {
      const destPort = dest.address().port;
      const start = http.createServer((req, res) => {
        res.writeHead(302, { Location: `http://127.0.0.1:${destPort}/secret` });
        res.end();
      });
      start.listen(0, '127.0.0.1', () => {
        const port = start.address().port;
        waitOn({
          resources: [`http://127.0.0.1:${port}/`],
          followRedirect: false,
          validateStatus: (status) => status === 302,
          ...FAST
        }, function (waitErr) {
          closeAll([start, dest], () => {
            expect(waitErr).to.not.be.ok;
            expect(landed).to.equal(0);
            done();
          });
        });
      });
    });
  });

  function forwardingProxy() {
    let count = 0;
    const proxy = http.createServer((req, res) => {
      count += 1;
      let target;
      try {
        target = new URL(req.url);
      } catch {
        res.statusCode = 400;
        res.end();
        return;
      }
      const forwarded = http.request({
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: req.method,
        headers: req.headers
      }, (upstream) => {
        res.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(res);
      });
      forwarded.on('error', () => {
        res.statusCode = 502;
        res.end();
      });
      req.pipe(forwarded);
    });
    return { proxy, seen: () => count };
  }

  it('should reach port 6000 through an explicit proxy', function (done) {
    const target = http.createServer((req, res) => { res.end('ok'); });
    listen(target, BAD_PORT, '127.0.0.1', (err) => {
      if (err) return done(err);
      const { proxy, seen } = forwardingProxy();
      proxy.listen(0, '127.0.0.1', () => {
        const proxyPort = proxy.address().port;
        waitOn({
          resources: [`http://127.0.0.1:${BAD_PORT}/`],
          proxy: { host: '127.0.0.1', port: proxyPort },
          ...FAST
        }, function (waitErr) {
          closeAll([proxy, target], () => {
            expect(waitErr).to.not.be.ok;
            expect(seen()).to.be.at.least(1);
            done();
          });
        });
      });
    }, () => this.skip());
  });

  it('should reach port 6000 through HTTP_PROXY', function (done) {
    const target = http.createServer((req, res) => { res.end('ok'); });
    const prior = {
      HTTP_PROXY: process.env.HTTP_PROXY,
      http_proxy: process.env.http_proxy,
      NO_PROXY: process.env.NO_PROXY,
      no_proxy: process.env.no_proxy
    };
    const restore = () => {
      for (const name of Object.keys(prior)) {
        if (prior[name] === undefined) delete process.env[name];
        else process.env[name] = prior[name];
      }
    };
    listen(target, BAD_PORT, '127.0.0.1', (err) => {
      if (err) return done(err);
      const { proxy, seen } = forwardingProxy();
      proxy.listen(0, '127.0.0.1', () => {
        const proxyPort = proxy.address().port;
        process.env.HTTP_PROXY = `http://127.0.0.1:${proxyPort}`;
        process.env.http_proxy = process.env.HTTP_PROXY;
        delete process.env.NO_PROXY;
        delete process.env.no_proxy;
        waitOn({ resources: [`http://127.0.0.1:${BAD_PORT}/`], ...FAST }, function (waitErr) {
          restore();
          closeAll([proxy, target], () => {
            expect(waitErr).to.not.be.ok;
            expect(seen()).to.be.at.least(1);
            done();
          });
        });
      });
    }, () => this.skip());
  });

  it('should exit 0 from the CLI when http listens on port 6000', function (done) {
    const server = http.createServer((req, res) => { res.end('ok'); });
    listen(server, BAD_PORT, '127.0.0.1', (err) => {
      if (err) return done(err);
      const child = childProcess.spawn(process.execPath, [
        CLI_PATH,
        `http://127.0.0.1:${BAD_PORT}/`,
        '-t', '2000',
        '-i', '100',
        '-w', '100'
      ]);
      child.on('exit', (code) => {
        closeAll([server], () => {
          expect(code).to.equal(0);
          done();
        });
      });
    }, () => this.skip());
  });
});
