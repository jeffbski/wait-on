'use strict';

// LT4a - black-box CLI conformance: file, tcp, socket, argument/validation, and
// config-file precedence vectors (issue #40, post-parseArgs behavior). Portable
// across runners: describe/it/before/after + chai expect, no mocha-only APIs,
// per-test time budget comes from the wait-on CLI options, not a runner timeout.
// See test/helpers/cli-conformance.js for the language-agnostic spawn harness.

const fs = require('fs');
const net = require('net');
const path = require('path');
const { expect } = require('chai');
const { runCli, getFreePort, socketPathIn, tempDir, listening, T, APPEAR, FAST_OPTS } = require('./helpers/cli-conformance');

describe('cli conformance: file / tcp / socket / cli (LT4a)', function () {
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

  describe('file', function () {
    it('succeeds promptly when file resources already exist', async function () {
      const dir = mkTmp();
      const a = path.join(dir, 'foo');
      const b = path.join(dir, 'bar/deep/yet');
      fs.writeFileSync(a, 'data');
      fs.mkdirSync(path.dirname(b), { recursive: true });
      fs.writeFileSync(b, 'data');
      const r = await runCli([a, b].concat(FAST_OPTS));
      expect(r.code, r.stderr).to.equal(0);
    });

    it('succeeds when a file appears later, and not before it exists', async function () {
      const dir = mkTmp();
      const a = path.join(dir, 'foo');
      later(() => fs.writeFileSync(a, 'data'));
      const r = await runCli([a].concat(FAST_OPTS));
      expect(r.code, r.stderr).to.equal(0);
      expect(r.elapsedMs).to.be.at.least(APPEAR - 150);
    });

    it('times out non-zero when a file never appears', async function () {
      const dir = mkTmp();
      const r = await runCli([path.join(dir, 'nope')].concat(FAST_OPTS));
      expect(r.code).to.not.equal(0);
      expect(r.elapsedMs).to.be.at.least(T * 0.5);
    });

    it('reverse mode succeeds when files are absent', async function () {
      const dir = mkTmp();
      const r = await runCli([path.join(dir, 'nope')].concat(FAST_OPTS).concat(['-r']));
      expect(r.code, r.stderr).to.equal(0);
    });

    it('reverse mode times out when files are present', async function () {
      const dir = mkTmp();
      const a = path.join(dir, 'foo');
      fs.writeFileSync(a, 'data');
      const r = await runCli([a].concat(FAST_OPTS).concat(['-r']));
      expect(r.code).to.not.equal(0);
    });
  });

  describe('tcp', function () {
    it('succeeds when a tcp port is listening', async function () {
      const port = await getFreePort();
      await listening(track(net.createServer()), port, '127.0.0.1');
      const r = await runCli(['tcp:127.0.0.1:' + port].concat(FAST_OPTS));
      expect(r.code, r.stderr).to.equal(0);
    });

    it('times out when no tcp service is listening', async function () {
      const port = await getFreePort();
      const r = await runCli(['tcp:127.0.0.1:' + port].concat(FAST_OPTS));
      expect(r.code).to.not.equal(0);
      expect(r.elapsedMs).to.be.at.least(T * 0.5);
    });

    it('reverse mode succeeds when a tcp host is unreachable', async function () {
      const r = await runCli(['tcp:256.0.0.1:1234'].concat(FAST_OPTS).concat(['-r', '--tcpTimeout', '300']));
      expect(r.code, r.stderr).to.equal(0);
    });
  });

  describe('socket', function () {
    it('succeeds when a service is listening on a socket', async function () {
      const dir = mkTmp();
      const sock = socketPathIn(dir);
      await listening(track(net.createServer()), sock);
      const r = await runCli(['socket:' + sock].concat(FAST_OPTS));
      expect(r.code, r.stderr).to.equal(0);
    });

    it('times out when nothing listens on a socket', async function () {
      const dir = mkTmp();
      const sock = socketPathIn(dir);
      const r = await runCli(['socket:' + sock].concat(FAST_OPTS));
      expect(r.code).to.not.equal(0);
      expect(r.elapsedMs).to.be.at.least(T * 0.5);
    });
  });

  describe('argument & validation contract', function () {
    it('prints usage to stdout when no resources are given', async function () {
      // The exit code of the help/no-resource path is intentionally not pinned:
      // bin/wait-on only exits non-zero from that path when stdout is a TTY (the
      // usage stream's 'close' handler), so it is 0 under a captured pipe. The
      // stable, environment-independent contract is that usage is printed.
      const r = await runCli(FAST_OPTS);
      expect(r.stdout).to.match(/usage/i);
    });

    it('exits non-zero naming the bad resource for a malformed resource', async function () {
      const r = await runCli(['tcp://127.0.0.1:3000'].concat(FAST_OPTS));
      expect(r.code).to.not.equal(0);
      expect(r.stderr).to.have.string('tcp://127.0.0.1:3000');
    });

    it('ignores an unknown flag rather than erroring (non-strict parseArgs)', async function () {
      const dir = mkTmp();
      const a = path.join(dir, 'foo');
      fs.writeFileSync(a, 'data');
      const r = await runCli([a].concat(FAST_OPTS).concat(['--bogus']));
      expect(r.code, r.stderr).to.equal(0);
    });
  });

  describe('config-file precedence', function () {
    it('honors resources from a --config file', async function () {
      const dir = mkTmp();
      const target = path.join(dir, 'ready');
      fs.writeFileSync(target, 'data');
      const cfg = path.join(dir, 'config.json');
      fs.writeFileSync(cfg, JSON.stringify({ resources: [target] }));
      const r = await runCli(['--config', cfg].concat(FAST_OPTS));
      expect(r.code, r.stderr).to.equal(0);
    });

    it('lets a CLI resource override config resources', async function () {
      const dir = mkTmp();
      const present = path.join(dir, 'present');
      const missing = path.join(dir, 'missing');
      fs.writeFileSync(present, 'data');
      const cfg = path.join(dir, 'config.json');
      // config points at a file that never exists; the CLI names a file that does.
      // Prompt success proves the CLI resource replaced the config resources.
      fs.writeFileSync(cfg, JSON.stringify({ resources: [missing] }));
      const r = await runCli(['--config', cfg, present].concat(FAST_OPTS));
      expect(r.code, r.stderr).to.equal(0);
    });
  });
});
