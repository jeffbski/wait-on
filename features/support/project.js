'use strict';

// Pure helpers for the contract hooks (no cucumber import, so mocha tests them:
// test/contract-project.mocha.js).

const path = require('path');

// the `package` world parameter: unset packs the working tree, `*.tgz` is a tarball, else an npm spec
function packageSource(param, cwd) {
  if (!param) return { pack: true };
  if (param.endsWith('.tgz')) return { tgz: path.resolve(cwd, param) };
  return { spec: param };
}

// a scenario's fixture project from its tag names; behavior scenarios default to cjs
function fixtureOf(tags) {
  const fixtures = tags.filter((t) => t.startsWith('@fixture:')).map((t) => t.slice('@fixture:'.length));
  if (fixtures.length > 1) throw new Error(`a scenario names two fixtures: ${fixtures.join(', ')}`);
  return fixtures[0] || 'cjs';
}

// npm argv (after the npm cli path) installing the package into one fixture project
function installArgs(fixture, source, typesNodeVersion) {
  const args = ['install', '--ignore-scripts', '--no-audit', '--no-fund', source.tgz || source.spec];
  if (fixture === 'ts') args.push(`@types/node@${typesNodeVersion}`);
  return args;
}

const PROXY_VARS = /^(http_proxy|https_proxy|all_proxy|no_proxy|npm_config_(proxy|http_proxy|https_proxy|no_proxy))$/i;

// the env for scenario children: no proxy settings leak in from the developer's shell or npm
function scrubbed(env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !PROXY_VARS.test(k)));
}

module.exports = { packageSource, fixtureOf, installArgs, scrubbed };
