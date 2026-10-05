'use strict';

// @api steps: the call forms and the environment a call runs with.

const assert = require('assert');
const { Given, Then } = require('@cucumber/cucumber');
const servers = require('./servers');
const { TOLERANCE_MS } = require('../../test/helpers/cli-conformance');

Given('a TCP server on localhost', async function () {
  const server = await servers.tcpServer('localhost');
  this.cleanups.push(server.close);
  this.vars.port = server.port;
});

Given('the environment variable {word} is {string}', function (name, value) {
  this.env[name] = this.fill(value);
});

Then(/^the callback was called once, (later|synchronously), with (undefined|an Error)$/, function (timing, arg) {
  assert.strictEqual(this.result.cbCalls, 1, JSON.stringify(this.result));
  assert.strictEqual(this.result.cbSync, timing === 'synchronously', `callback timing ${timing}`);
  assert.strictEqual(this.result.cbArg, arg === 'an Error' ? 'Error' : arg);
});

Then('waitOn returned a Promise', function () {
  assert.strictEqual(this.result.returned, 'Promise');
});

Then('waitOn returned undefined', function () {
  assert.strictEqual(this.result.returned, 'undefined');
});

// the runner's callback returns 'callback-return'
Then('waitOn returned what the callback returned', function () {
  assert.strictEqual(this.result.returned, 'callback-return');
});

Then('it took less than {int}ms', function (ms) {
  assert.ok(this.result.elapsedMs < ms, `took ${this.result.elapsedMs}ms`);
});

// [expected - early, expected + late], the subprocess tolerance the CLI conformance suite uses
Then('it took about {int}ms', function (ms) {
  const { elapsedMs } = this.result || this.run;
  const [min, max] = [ms - TOLERANCE_MS.early, ms + TOLERANCE_MS.late];
  assert.ok(elapsedMs >= min && elapsedMs <= max, `took ${elapsedMs}ms, expected [${min}, ${max}]`);
});
