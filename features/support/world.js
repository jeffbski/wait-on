'use strict';

// The contract World. hooks.js sets `fixture` and `project` (the installed fixture project)
// and the scenario temp dir `dir` before every scenario. Every child it spawns runs with
// the proxy variables scrubbed from the inherited env, plus the scenario's own `env`.

const childProcess = require('child_process');
const path = require('path');
const { World, setWorldConstructor, setDefaultTimeout } = require('@cucumber/cucumber');
const { scrubbed } = require('./project');

// real-clock subprocess runs (AGENTS.md clock exception); scenarios bound their own waits
setDefaultTimeout(30 * 1000);

const RUNNERS = { cjs: 'run.js', esm: 'run.mjs', ts: path.join('dist', 'run.js') };

// the repo's TypeScript run against an installed fixture project
const TSC = path.resolve(__dirname, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc');
const tsc = (project, extra = []) =>
  childProcess.spawnSync(process.execPath, [TSC, '-p', project, ...extra], { encoding: 'utf8' });

class ContractWorld extends World {
  constructor(options) {
    super(options);
    this.vars = {}; // placeholder -> actual value, e.g. tmp -> /tmp/.../file
    this.resources = []; // resource strings in declaration order (`<resource N>`)
    this.cleanups = [];
    this.env = {}; // extra env for every child this scenario spawns
  }

  // starts a server the scenario closes afterwards
  async serve(start) {
    const server = await start();
    this.cleanups.push(server.close);
    return server;
  }

  // the next `<resource N>`, plus the placeholders it brings (e.g. port)
  addResource(resource, vars = {}) {
    Object.assign(this.vars, vars);
    this.resources.push(resource);
  }

  // `<name>` and `<resource N>` placeholders in scenario text -> actual values;
  // `json` escapes them for a JSON string (Windows paths carry backslashes)
  fill(text, { json = false } = {}) {
    const value = (v) => (json ? JSON.stringify(String(v)).slice(1, -1) : v);
    return text
      .replace(/<resource (\d+)>/g, (m, n) => (this.resources[n - 1] === undefined ? m : value(this.resources[n - 1])))
      .replace(/<(\w+)>/g, (m, name) => (name in this.vars ? value(this.vars[name]) : m));
  }

  // actual values in output -> placeholders; resources first, they contain the vars.
  // CLI output keeps resource strings (they are what a user typed), so it maps vars only.
  normalize(text, { resources = true } = {}) {
    let out = text;
    if (resources) {
      this.resources.forEach((r, i) => {
        out = out.split(r).join(`<resource ${i + 1}>`);
      });
    }
    for (const [name, value] of Object.entries(this.vars)) out = out.split(String(value)).join(`<${name}>`);
    return out;
  }

  // killAfter: stop a child still running after that many ms (`stopped` is then true)
  spawn(args, { env = this.env, killAfter } = {}) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const child = childProcess.spawn(process.execPath, args, {
        cwd: this.project,
        env: { ...scrubbed(process.env), ...env }
      });
      let stdout = '';
      let stderr = '';
      let stopped = false;
      const timer = killAfter && setTimeout(() => (stopped = child.kill()), killAfter);
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr, stopped, elapsedMs: Date.now() - start });
      });
    });
  }

  // the last stdout line is the result, everything before it is log output
  async callWaitOn(opts, { callback = false, env } = {}) {
    const args = [path.join(this.project, RUNNERS[this.fixture]), JSON.stringify(opts)];
    if (callback) args.push('--callback');
    const run = await this.spawn(args, { env });
    const lines = run.stdout.trimEnd().split(/\r?\n/);
    const last = lines.pop();
    try {
      this.result = JSON.parse(last);
    } catch {
      throw new Error(`runner printed no result (exit ${run.code}):\n${run.stdout}${run.stderr}`);
    }
    this.result.lines = lines.filter(Boolean);
    this.run = run;
  }

  async cli(args, { env, killAfter } = {}) {
    const bin = path.join(this.project, 'node_modules', 'wait-on', 'bin', 'wait-on');
    this.run = await this.spawn([bin, ...args], { env, killAfter });
  }
}

setWorldConstructor(ContractWorld);

module.exports = { tsc, RUNNERS };
