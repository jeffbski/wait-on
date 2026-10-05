'use strict';

// The @engine vocabulary: runner-neutral Givens that register resources in declaration
// order, one When that states every timing option, and the outcome. These steps turn them
// into resource strings and options for the installed API; any other runner can build its
// own wait from the same words.

const assert = require('assert');
const { Given, When, Then } = require('@cucumber/cucumber');
const servers = require('./servers');

Given('a TCP server on a free port', async function () {
  const { port } = await this.serve(() => servers.tcpServer('127.0.0.1'));
  this.addResource(`tcp:127.0.0.1:${port}`, { port });
});

Given('a TCP server on the IPv6 loopback', async function () {
  const { port } = await this.serve(() => servers.tcpServer('::1'));
  this.addResource(`tcp:[::1]:${port}`, { port });
});

Given('nothing listening on a free port', async function () {
  const port = await servers.freePort();
  this.addResource(`tcp:127.0.0.1:${port}`, { port });
});

Given('a unix socket server', async function () {
  const server = await this.serve(() => servers.unixServer(this.dir));
  this.addResource(`socket:${server.path}`, { sock: server.path });
});

Given('nothing listening on a unix socket', function () {
  const sock = servers.socketPath(this.dir);
  this.addResource(`socket:${sock}`, { sock });
});

Given('an HTTP server answering {int}', async function (status) {
  const { port } = await this.serve(() => servers.httpServer(status));
  this.addResource(`http://127.0.0.1:${port}/`, { port });
});

Given('an HTTP server answering {int} to GET', async function (status) {
  const { port } = await this.serve(() => servers.httpServer(status));
  this.addResource(`http-get://127.0.0.1:${port}/`, { port });
});

// strictSSL either way; `ca` is ca.pem when trusted, the unrelated other-ca.pem when not
Given(/^an HTTPS server answering (\d+), (trusted through its CA|not trusted)$/, async function (status, trust) {
  const server = await this.serve(() => servers.httpsServer(Number(status)));
  const ca = trust === 'not trusted' ? server.tls.otherCert.toString() : server.ca;
  this.extraOpts = { ...this.extraOpts, ca, strictSSL: true };
  this.addResource(`https://127.0.0.1:${server.port}/`, { port: server.port });
});

Given('an HTTP server on a unix socket answering {int}', async function (status) {
  const server = await this.serve(() => servers.httpUnixServer(this.dir, status));
  this.addResource(`http://unix:${server.path}:/`, { sock: server.path });
});

Given('a command that exits {int}', function (code) {
  this.addResource(`command:node -e "process.exit(${code})"`);
});

const TIMINGS =
  'timeout {int}ms, interval {int}ms, window {int}ms, delay {int}ms, tcp timeout {int}ms and command timeout {int}ms';

function waitStep(reverse) {
  return async function (timeout, interval, window, delay, tcpTimeout, commandTimeout) {
    assert.ok(window >= interval, '@engine scenarios keep window >= interval, so no runner relies on a clamp');
    const opts = { resources: this.resources, timeout, interval, window, delay, tcpTimeout, commandTimeout, reverse };
    await this.callWaitOn({ ...opts, ...this.extraOpts });
  };
}

When(`I wait with ${TIMINGS}`, waitStep(false));
When(`I wait in reverse with ${TIMINGS}`, waitStep(true));

Then('the wait succeeds', function () {
  assert.strictEqual(this.result.outcome, 'resolved', JSON.stringify(this.result));
});

function failsWith(world, message) {
  assert.strictEqual(world.result.outcome, 'rejected', JSON.stringify(world.result));
  assert.strictEqual(world.normalize(world.result.errorMessage), message);
}

Then('the wait fails with:', function (message) {
  failsWith(this, message);
});

// Scenario Outlines use this form: cucumber-rs rejects a `<resource 1>` docstring there,
// reading it as an Examples column it cannot resolve.
Then('the wait times out naming resource {int}', function (n) {
  failsWith(this, `Timed out waiting for: <resource ${n}>`);
});
