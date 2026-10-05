'use strict';

// Steps shared by every layer: resources a scenario declares, calling the installed API
// through the fixture runner, the outcomes, and the module shape and type surface.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Given, When, Then } = require('@cucumber/cucumber');
const { tsc } = require('./world');

Given('an existing file', function () {
  const file = path.join(this.dir, `file-${this.resources.length + 1}`);
  fs.writeFileSync(file, 'data');
  this.vars.tmp = file;
  this.resources.push(`file:${file}`);
});

Given('a missing file', function () {
  const file = path.join(this.dir, `missing-${this.resources.length + 1}`);
  this.vars.tmp = file;
  this.resources.push(`file:${file}`);
});

When('the consumer calls waitOn with:', async function (opts) {
  await this.callWaitOn(JSON.parse(this.fill(opts, { json: true })));
});

When('the consumer calls waitOn with a callback and:', async function (opts) {
  await this.callWaitOn(JSON.parse(this.fill(opts, { json: true })), { callback: true });
});

Then('the wait resolves', function () {
  assert.strictEqual(this.result.outcome, 'resolved', JSON.stringify(this.result));
});

Then('the wait rejects with a(n) {word}:', function (name, message) {
  assert.strictEqual(this.result.outcome, 'rejected', JSON.stringify(this.result));
  assert.strictEqual(this.result.errorName, name);
  assert.strictEqual(this.normalize(this.result.errorMessage), message);
});

Then('the export is a function', function () {
  assert.strictEqual(this.result.exportType, 'function');
});

// --- @consumer: module shape and types (hooks.js compiles the ts fixture once per run)

When('the consumer runs {string}', async function (file) {
  this.run = await this.spawn([path.join(this.project, file)]);
});

Then('it exits {int} with a stderr line containing {string}', function (code, text) {
  assert.strictEqual(this.run.code, code, this.run.stderr);
  assert.ok(
    this.run.stderr.split(/\r?\n/).some((line) => line.includes(text)),
    `no stderr line contains ${text}:\n${this.run.stderr}`
  );
});

Then('the TypeScript consumer type-checks', function () {
  const out = tsc(this.project, ['--noEmit']);
  assert.strictEqual(out.status, 0, out.stdout + out.stderr);
});

// a copy of consumer.ts in a subdirectory, so the shared install stays untouched
When('the TypeScript consumer gains the line {string}', function (line) {
  const dir = path.join(this.project, `bad-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir);
  this.cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = fs.readFileSync(path.join(this.project, 'consumer.ts'), 'utf8');
  fs.writeFileSync(path.join(dir, 'consumer.ts'), `${source}${line}\n`);
  const tsconfig = { extends: '../tsconfig.json', compilerOptions: { noEmit: true }, include: ['*.ts'] };
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig));
  this.tscRun = tsc(dir);
});

Then('the type check passes', function () {
  assert.strictEqual(this.tscRun.status, 0, this.tscRun.stdout + this.tscRun.stderr);
});

Then('the type check fails with {string}', function (code) {
  assert.notStrictEqual(this.tscRun.status, 0, 'tsc passed');
  assert.ok(this.tscRun.stdout.includes(code), this.tscRun.stdout + this.tscRun.stderr);
});
