'use strict';

// @cli steps: the installed bin/wait-on under node (no .cmd shim).

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Given, When, Then } = require('@cucumber/cucumber');

// js or json; placeholders are JSON-escaped, which is also a valid js string literal body
Given('a config file {string} containing:', function (name, text) {
  const file = path.join(this.dir, name);
  fs.writeFileSync(file, this.fill(text, { json: true }));
  this.vars.config = file;
});

When('I run wait-on with {string}', async function (args) {
  await this.cli(this.fill(args).split(' '));
});

When('I run wait-on with no arguments', async function () {
  await this.cli([]);
});

// the child is killed if still running after `ms`; `it was still running` checks that
When('I run wait-on with {string} and stop it after {int}ms', async function (args, ms) {
  await this.cli(this.fill(args).split(' '), { killAfter: ms });
});

Then('it was still running', function () {
  assert.ok(this.run.stopped, `it exited ${this.run.code}:\n${this.run.stderr}`);
});

// one argument per line, so an argument may hold spaces
When('I run wait-on with the arguments:', async function (args) {
  await this.cli(args.split(/\r?\n/).map((arg) => this.fill(arg)));
});

Then('it exits {int}', function (code) {
  assert.strictEqual(this.run.code, code, this.run.stdout + this.run.stderr);
});

// stderr beyond the first line is not compared
Then('it exits {int} with the first stderr line:', function (code, line) {
  assert.strictEqual(this.run.code, code, this.run.stdout + this.run.stderr);
  const first = this.run.stderr.split(/\r?\n/)[0];
  assert.strictEqual(this.normalize(first, { resources: false }), line);
});

Then('stdout starts with {string}', function (text) {
  assert.ok(this.run.stdout.startsWith(text), this.run.stdout);
});
