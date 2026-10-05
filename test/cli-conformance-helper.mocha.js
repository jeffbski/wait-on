'use strict';

// Self-check for the black-box CLI conformance harness (#246). The whole
// conformance suite trusts this helper to spawn the CLI and report exit code +
// real elapsed time, and to hand out free ports / temp paths, so pin those
// behaviors directly rather than only through the vectors that use them.

const mocha = require('mocha');
const describe = mocha.describe;
const it = mocha.it;
const chai = require('chai');
const expect = chai.expect;
const net = require('net');

const h = require('./helpers/cli-conformance');

describe('cli-conformance harness helper (#246)', function () {
  describe('resolveCli', function () {
    it('defaults to this repo bin/wait-on under the current node', function () {
      const prev = process.env.WAIT_ON_BIN;
      delete process.env.WAIT_ON_BIN;
      try {
        const { command, prefixArgs } = h.resolveCli();
        expect(command).to.equal(process.execPath);
        expect(prefixArgs).to.have.length(1);
        expect(prefixArgs[0]).to.match(/bin[\\/]wait-on$/);
      } finally {
        if (prev !== undefined) process.env.WAIT_ON_BIN = prev;
      }
    });

    it('honors a WAIT_ON_BIN override with no prefix args', function () {
      const prev = process.env.WAIT_ON_BIN;
      process.env.WAIT_ON_BIN = '/opt/custom/wait-on';
      try {
        const { command, prefixArgs } = h.resolveCli();
        expect(command).to.equal('/opt/custom/wait-on');
        expect(prefixArgs).to.deep.equal([]);
      } finally {
        if (prev === undefined) delete process.env.WAIT_ON_BIN;
        else process.env.WAIT_ON_BIN = prev;
      }
    });
  });

  describe('getFreePort', function () {
    it('returns a bindable ephemeral port', async function () {
      const port = await h.getFreePort();
      expect(port).to.be.a('number').within(1, 65535);
      // Prove it is actually free by binding then releasing it.
      const srv = await h.listening(net.createServer(), port, '127.0.0.1');
      await new Promise((resolve) => srv.close(resolve));
    });
  });

  describe('socketPathIn / tempDir', function () {
    it('builds a platform-appropriate socket path under a real temp dir', function () {
      const dir = h.tempDir();
      const sock = h.socketPathIn(dir);
      expect(sock).to.include('sock');
      if (process.platform === 'win32') expect(sock).to.include('pipe');
      else expect(sock).to.equal(require('path').resolve(dir, 'sock'));
    });
  });

  describe('TOLERANCE_MS', function () {
    it('allows 100ms early and 1000ms late for subprocess timing', function () {
      expect(h.TOLERANCE_MS).to.deep.equal({ early: 100, late: 1000 });
    });
  });

  describe('runCli', function () {
    it('spawns the CLI and reports a non-zero exit + elapsed time on timeout', async function () {
      const res = await h.runCli(h.FAST_OPTS.concat(['tcp:127.0.0.1:1'])); // nothing listening -> timeout
      expect(res.code).to.not.equal(0);
      expect(res.elapsedMs).to.be.a('number').greaterThan(0);
    });

    it('spawns the CLI and exits 0 when the resource is already available', async function () {
      const res = await h.runCli(h.FAST_OPTS.concat([__filename])); // this file exists -> resolves
      expect(res.code).to.equal(0);
    });
  });
});
