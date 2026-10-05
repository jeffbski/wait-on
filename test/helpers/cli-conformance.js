'use strict';

// Black-box conformance harness for the wait-on CLI (issue #40, rust-port plan
// R17-R19 / PO13). It spawns the CLI as a subprocess and reports its exit code,
// stdout, stderr, and own elapsed wall time, so the SAME vectors can validate
// today's Node CLI and, later, a Rust build.
//
// Language-agnostic seam: by default the harness runs this repo's Node
// `bin/wait-on` under the current node. Set WAIT_ON_BIN to any executable that
// speaks the same CLI (e.g. a future Rust standalone binary) and the identical
// vectors run against it, unchanged.
//
// Timing note: the elapsed measurement IS the timing contract. A spawned
// subprocess has its own OS clock the parent cannot freeze, which is the
// frozen-clock rule's explicit "verifying real-time behavior" exception; the
// in-process unit suite's global frozen clock is owned by a separate lane.

const childProcess = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Resolve the CLI under test. WAIT_ON_BIN overrides the default Node CLI.
function resolveCli() {
  const override = process.env.WAIT_ON_BIN;
  if (override) {
    return { command: override, prefixArgs: [] };
  }
  const binPath = path.resolve(__dirname, '..', '..', 'bin', 'wait-on');
  return { command: process.execPath, prefixArgs: [binPath] };
}

// Spawn the CLI with args; resolve on exit with captured output and the child's
// monotonic elapsed time (process.hrtime.bigint, immune to wall-clock changes).
// Never sleeps: it awaits the child 'exit' event.
function runCli(args, options = {}) {
  const { command, prefixArgs } = resolveCli();
  const fullArgs = prefixArgs.concat(args);
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const child = childProcess.spawn(command, fullArgs, {
      cwd: options.cwd,
      env: options.env || process.env
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({ code, signal, stdout, stderr, elapsedMs });
    });
  });
}

// Allocate an ephemeral free TCP port so vectors never collide with the seed
// suite that shares the mocha process. Small reuse race is acceptable in test.
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Windows has no Unix domain sockets; Node listens on a named pipe instead.
function socketPathIn(dirPath) {
  return process.platform === 'win32' ? path.join('\\\\?\\pipe', dirPath, 'sock') : path.resolve(dirPath, 'sock');
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wait-on-conf-'));
}

// Resolve once the server is listening (or reject on error).
function listening(server, ...listenArgs) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(...listenArgs, () => resolve(server));
  });
}

// wait-on CLI timing options shared by every vector, sized so a vector's worst
// case (spawn + timeout wait) stays well under mocha's 2000ms default - so no
// runner-level per-test timeout override is needed and the tests stay portable.
const T = 800; // -t timeout (ms)
const I = 100; // -i poll interval (ms)
const W = 100; // -w stability window (ms)
const APPEAR = 250; // delay before a "later" resource is made available (ms)
const FAST_OPTS = ['-t', String(T), '-i', String(I), '-w', String(W)];
// subprocess elapsed bounds [expected - early, expected + late]: early covers timer
// clamping, late covers node startup and module load on the slowest CI row
const TOLERANCE_MS = Object.freeze({ early: 100, late: 1000 });

module.exports = {
  resolveCli,
  runCli,
  getFreePort,
  socketPathIn,
  tempDir,
  listening,
  T,
  I,
  W,
  APPEAR,
  FAST_OPTS,
  TOLERANCE_MS
};
