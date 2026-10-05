'use strict';

// @api steps: timing and http options, TLS material, proxies and log lines.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Given, Then } = require('@cucumber/cucumber');
const servers = require('./servers');
const stubProxy = require('../../test/helpers/stub-proxy');

// starts an http server and registers `http://127.0.0.1:<port>/` as the next resource
async function serveHttp(world, start) {
  world.server = await world.serve(start);
  world.addResource(`http://127.0.0.1:${world.server.port}/`, { port: world.server.port });
}

Given('a TCP server that starts listening after {int}ms', async function (ms) {
  const { port } = await this.serve(() => servers.delayedTcpServer('127.0.0.1', ms));
  this.addResource(`tcp:127.0.0.1:${port}`, { port });
});

Given('an HTTP server answering {int} after {int}ms', function (status, ms) {
  return serveHttp(this, () => servers.slowHttpServer(status, ms));
});

Given('an HTTP server answering {int} that records requests', function (status) {
  return serveHttp(this, () => servers.recordingHttpServer(status));
});

Given('an HTTP server redirecting to a page answering 200', function () {
  return serveHttp(this, servers.redirectingHttpServer);
});

Given('an HTTP server that never answers', function () {
  return serveHttp(this, servers.silentHttpServer);
});

Then('the server saw the header {string} as {string}', function (name, value) {
  const { requests } = this.server;
  assert.ok(requests.length > 0, 'the server saw no request');
  for (const { headers } of requests) assert.strictEqual(headers[name], value);
});

// proves a direct path: the origin itself answered, not only that the proxy saw nothing
Then('the server saw the check', function () {
  assert.ok(this.server.requests.length > 0, 'the server saw no request');
});

// "at most" also needs one request, or a server that was never reached would pass
Then(/^the server saw at (most|least) (\d+) requests? in flight$/, function (bound, n) {
  const { peak } = this.server.counts;
  const ok = bound === 'most' ? peak >= 1 && peak <= Number(n) : peak >= Number(n);
  assert.ok(ok, `peak ${peak} in flight`);
});

// the committed PEMs (servers.js) become <cert>, <key>, <otherCert>, <encryptedKey> and <passphrase>
async function serveTls(world, opts) {
  const server = (world.server = await world.serve(() => servers.tlsServer(opts)));
  const { cert, key, otherCert, encryptedKey, passphrase } = server.tls;
  world.addResource(`https://127.0.0.1:${server.port}/`, {
    port: server.port,
    cert,
    key,
    otherCert,
    encryptedKey,
    passphrase
  });
}

Given('an HTTPS server with a self-signed certificate', function () {
  return serveTls(this);
});

Given('an HTTPS server that requires a client certificate', function () {
  return serveTls(this, { clientCert: true });
});

Then('the server saw an authorized client certificate', function () {
  assert.ok(this.server.authorized.includes(true), `authorized: ${this.server.authorized}`);
});

// the counting stub proxy the mocha suite uses: proves a check took the proxy path
Given('a proxy that records what it carries', async function () {
  const proxy = await stubProxy.start();
  this.cleanups.push(proxy.close);
  this.proxy = proxy;
  Object.assign(this.vars, { proxy: proxy.url, proxyPort: new URL(proxy.url).port });
});

const records = (proxy) => [...proxy.requests, ...proxy.connects];
const carried = (proxy) => records(proxy).map((r) => r.line);

Then('the proxy carried {string}', function (line) {
  assert.ok(carried(this.proxy).includes(this.fill(line)), `carried: ${carried(this.proxy).join(', ')}`);
});

Then('the proxy carried {string} with the authorization {string}', function (line, auth) {
  const seen = records(this.proxy).filter((r) => r.line === this.fill(line));
  assert.ok(seen.length > 0, `carried: ${carried(this.proxy).join(', ')}`);
  for (const r of seen) assert.strictEqual(r.proxyAuthorization, auth);
});

Then('the proxy carried nothing', function () {
  assert.deepStrictEqual(carried(this.proxy), []);
});

// "never" is 5s, past every scenario's timeout: an attempt started just before the wait
// settles is not killed by anyone, so it must end itself. A script, not `node -e "..."`:
// killing that form left the inner node running on macOS.
Given('a command that never exits', function () {
  const script = path.join(this.dir, 'hang.js');
  fs.writeFileSync(script, 'setTimeout(() => {}, 5000);\n');
  this.addResource(`command:node "${script}"`); // quoted: a temp dir may hold spaces
});

// Log lines carry the runner's pid, which the step cannot know in advance. The API runner's
// lines map resources to <resource N>; CLI output keeps them as typed (steps-cli).
function logLines(world) {
  const lines = world.result ? world.result.lines : world.run.stdout.split(/\r?\n/).filter(Boolean);
  const resources = Boolean(world.result);
  return lines.map((line) => world.normalize(line, { resources }).replace(/^wait-on\(\d+\)/, 'wait-on(<pid>)'));
}

// the CLI's raw stdout, so a stray blank line fails too
Then('stdout is empty', function () {
  if (this.result) assert.deepStrictEqual(this.result.lines, []);
  else assert.strictEqual(this.run.stdout, '');
});

Then('stdout is:', function (text) {
  assert.strictEqual(logLines(this).join('\n'), text);
});

Then('stdout includes the line {string}', function (line) {
  const lines = logLines(this);
  assert.ok(lines.includes(line), lines.join('\n'));
});

// verbose detail is not contract (R2): only that it exists beside the log lines
Then('stdout has lines beyond the log lines', function () {
  const lines = logLines(this);
  const extra = lines.filter((line) => !/^(wait-on|waiting for \d+ resources: )/.test(line));
  assert.ok(extra.length > 0, lines.join('\n'));
});
