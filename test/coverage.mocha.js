'use strict';

// Coverage-targeted tests (kevinold/wait-on#38, LT2). These exercise the reachable
// branches the main suite left uncovered — validation errors, TLS/proxy/auth dispatcher
// options, reverse mode, verbose logging (lib/wait-on.js) and the CLI help/parseInterval
// paths (bin/wait-on). Time-dependent cases reuse the LT1 frozen clock (itFrozen); the
// CLI cases spawn `node bin/wait-on` so nyc instruments the subprocess.
//
// Deliberately NOT covered (documented in the LT2 plan): lib/wait-on.js:180 (the
// non-timeout error log) is unreachable via the public API — every inner resource
// observable catches its own errors, so the only error the merged stream emits is the
// timeout, whose message always starts with TIMEOUT_ERR_MSG (line 178). Covering it would
// need a lib change, which is out of scope for this test-only lane.

const childProcess = require('child_process');
const path = require('path');

const waitOn = require('../');
const { itFrozen } = require('./frozen-clock');

const mocha = require('mocha');
const describe = mocha.describe;
const it = mocha.it;
const chai = require('chai');
const expect = chai.expect;

// A TCP port with nothing listening: connections are refused immediately, so each poll
// settles fast and the (virtual) timeout is what ends the run.
const DEAD = 'http://127.0.0.1:1';
// An existing file resolves the file resource immediately (used by the CLI cases so the
// process exits before any real timeout elapses).
const EXISTING_FILE = __filename;

// Assert that a promise-returning waitOn call rejects (used for the never-available
// HTTP cases bounded by a short virtual timeout).
function expectReject(promise) {
  return promise.then(
    () => {
      throw new Error('expected waitOn to reject');
    },
    (err) => {
      expect(err).to.be.an('error');
    }
  );
}

describe('coverage: lib/wait-on.js branches', function () {
  this.timeout(3000);

  it('fails fast with a validation error for an unparseable http url', function () {
    // http:// passes the "//" guard but `new URL('http://[')` throws → "not a valid URL"
    return waitOn({ resources: ['http://['] }).then(
      () => {
        throw new Error('expected rejection');
      },
      (err) => {
        expect(err.message).to.have.string('not a valid URL');
      }
    );
  });

  it('fails fast with a validation error for a malformed tcp host:port', function () {
    return waitOn({ resources: ['tcp:nope'] }).then(
      () => {
        throw new Error('expected rejection');
      },
      (err) => {
        expect(err.message).to.have.string('tcp:host:port');
      }
    );
  });

  itFrozen('runs with verbose logging enabled', function () {
    const origLog = console.log;
    console.log = function () {}; // silence verbose output during the test
    return waitOn({ resources: [EXISTING_FILE], verbose: true, interval: 10, window: 10 }).then(
      () => {
        console.log = origLog;
      },
      (err) => {
        console.log = origLog;
        throw err;
      }
    );
  });

  itFrozen('builds a dispatcher with cert/key/passphrase TLS options', function () {
    return expectReject(
      waitOn({
        resources: [DEAD],
        cert: 'dummy-cert',
        key: 'dummy-key',
        passphrase: 'secret',
        timeout: 50,
        interval: 100,
        window: 100
      })
    );
  });

  itFrozen('routes through a proxy object with auth credentials (username + password)', function () {
    return expectReject(
      waitOn({
        resources: [DEAD],
        proxy: { host: '127.0.0.1', port: 1, auth: { username: 'user', password: 'pass' } },
        timeout: 50,
        interval: 100,
        window: 100
      })
    );
  });

  itFrozen('routes through a proxy object with auth username but no password', function () {
    return expectReject(
      waitOn({
        resources: [DEAD],
        proxy: { host: '127.0.0.1', port: 1, auth: { username: 'user' } },
        timeout: 50,
        interval: 100,
        window: 100
      })
    );
  });

  itFrozen('builds a Basic auth header when auth has a username but no password', function () {
    return expectReject(
      waitOn({
        resources: [DEAD],
        auth: { username: 'user' },
        timeout: 50,
        interval: 100,
        window: 100
      })
    );
  });

  itFrozen('succeeds for an unavailable http resource in reverse mode', function () {
    return waitOn({ resources: [DEAD], reverse: true, interval: 100, window: 100 });
  });

  itFrozen('succeeds for an unavailable socket resource in reverse mode', function () {
    return waitOn({ resources: ['socket:/nonexistent/wait-on-lt2.sock'], reverse: true, interval: 100, window: 100 });
  });
});

describe('coverage: bin/wait-on CLI', function () {
  this.timeout(5000);

  const CLI_PATH = path.resolve(__dirname, '../bin/wait-on');

  // Spawn `node bin/wait-on ...` so nyc's spawn-wrap instruments the child. No custom env,
  // so the child inherits the coverage environment from the mocha process.
  function runCLI(args) {
    return new Promise((resolve) => {
      const child = childProcess.spawn(process.execPath, [CLI_PATH].concat(args));
      let stdout = '';
      child.stdout.on('data', (d) => {
        stdout += d;
      });
      child.on('exit', (code) => resolve({ code, stdout }));
    });
  }

  it('prints usage on the help path', function () {
    // The usage/help path streams usage.txt to stdout; with stdout captured as a pipe it
    // exits 0 (process.exit(1) only fires from the stream close on a TTY — see the CLI
    // usage exit quirk), so assert on the usage text, not the exit code.
    return runCLI(['--help']).then(({ stdout }) => {
      expect(stdout).to.have.string('Usage: wait-on');
    });
  });

  it('parses m and h interval units for an available resource', function () {
    // -t 2m → parseInterval minutes; --httpTimeout 1h → parseInterval hours. The file
    // resource resolves immediately, so the large timeout never elapses.
    return runCLI([EXISTING_FILE, '-t', '2m', '--httpTimeout', '1h', '-i', '10', '-w', '10']).then(({ code }) => {
      expect(code).to.equal(0);
    });
  });

  it('passes a non-duration interval string through unchanged, then fails validation', function () {
    // -t abc does not match the duration regex, so parseInterval returns it unchanged; the
    // non-numeric timeout then fails schema validation and the CLI exits non-zero.
    return runCLI([EXISTING_FILE, '-t', 'abc', '-i', '10', '-w', '10']).then(({ code }) => {
      expect(code).to.not.equal(0);
    });
  });
});
