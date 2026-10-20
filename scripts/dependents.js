'use strict';

// npm run dependents: run published dependents' own commands against a packed wait-on
// tarball. Manifest: test/dependents/dependents.json. Plan:
// docs/plans/2026-10-05-1020-feat-dependents-check-plan.md.

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const USAGE =
  'usage: npm run dependents -- [--list] [--only <name>] [--include-optional] [--control] [--tgz <path>] [--keep]';

const FIELDS = {
  name: 'string',
  repo: 'string',
  tag: 'string',
  swap: 'string',
  scripts: 'boolean',
  build: 'strings',
  run: 'strings',
  os: 'strings',
  optional: 'boolean'
};
const SWAPS = ['install', 'overrides'];

function isStrings(v) {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

function checkEntry(e) {
  const name = e && typeof e.name === 'string' ? e.name : '?';
  const fail = (msg) => {
    throw new Error(`dependents.json: entry ${name} ${msg}`);
  };
  Object.entries(FIELDS).forEach(([field, type]) => {
    const v = e[field];
    if (type === 'strings' ? !isStrings(v) : typeof v !== type) {
      fail(`needs ${field} (${type === 'strings' ? 'array of strings' : type})`);
    }
  });
  if (!SWAPS.includes(e.swap)) fail(`has swap ${e.swap}, expected one of ${SWAPS.join(', ')}`);
  if (e.run.length === 0) fail('needs at least one run command');
  e.build.concat(e.run).forEach((cmd) => {
    const first = cmd.split(/\s+/)[0];
    if (first !== 'npm' && first !== 'node') fail(`command ${cmd}: commands start with npm or node`);
  });
  return e;
}

function parseManifest(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`dependents.json: ${err.message}`);
  }
  if (!Array.isArray(json)) throw new Error('dependents.json: expected an array');
  return json.map(checkEntry);
}

function select(entries, opts, platform) {
  const runsHere = (e) => e.os.length === 0 || e.os.includes(platform);
  if (opts.only) {
    const entry = entries.find((e) => e.name === opts.only);
    if (!entry) {
      throw new Error(`--only ${opts.only}: expected one of ${entries.map((e) => e.name).join(', ')}`);
    }
    if (!runsHere(entry)) {
      throw new Error(`--only ${opts.only}: runs only on ${entry.os.join(', ')}, this host is ${platform}`);
    }
    return [entry];
  }
  return entries.filter((e) => (!e.optional || opts.includeOptional) && runsHere(e));
}

function listText(entries) {
  return entries
    .map((e) => {
      const hosts = e.os.length ? e.os.join(',') : 'all';
      const head = `${e.name}  ${e.tag}  swap=${e.swap}  os=${hosts}  optional=${e.optional ? 'yes' : 'no'}`;
      return [head].concat(e.run.map((cmd) => `  ${cmd}`)).join('\n');
    })
    .join('\n\n');
}

function parseArgs(argv) {
  const opts = { list: false, only: undefined, includeOptional: false, control: false, tgz: undefined, keep: false };
  const flags = { '--list': 'list', '--include-optional': 'includeOptional', '--control': 'control', '--keep': 'keep' };
  const values = { '--only': 'only', '--tgz': 'tgz' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (flags[arg]) {
      opts[flags[arg]] = true;
    } else if (values[arg]) {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value\n${USAGE}`);
      opts[values[arg]] = argv[++i];
    } else {
      throw new Error(`unknown argument ${arg}\n${USAGE}`);
    }
  }
  return opts;
}

function cloneArgs(entry, dest) {
  return ['-c', 'core.longpaths=true', 'clone', '--depth', '1', '--branch', entry.tag, entry.repo, dest];
}

function installArgs(entry) {
  return entry.scripts ? ['ci'] : ['ci', '--ignore-scripts'];
}

// target: { tgz: <absolute path> } for the tarball, { version } for the 9.5.1 control
function swapArgs(entry, target) {
  const ignore = entry.scripts ? [] : ['--ignore-scripts'];
  if (entry.swap === 'install') {
    const spec = target.tgz || `wait-on@${target.version}`;
    return [['install', '--no-save', ...ignore, spec]];
  }
  const override = target.tgz ? `file:${target.tgz}` : target.version;
  return [['pkg', 'set', `overrides.wait-on=${override}`], ['install', ...ignore]];
}

// no shell: `npm ...` runs npm-cli.js under node, `node ...` runs as is
function nodeArgs(command, npm) {
  const [first, ...rest] = command.split(/\s+/);
  return first === 'npm' ? [npm, ...rest] : rest;
}

function tgzVersion(file) {
  const m = /^wait-on-(.+)\.tgz$/.exec(path.basename(file));
  if (!m) throw new Error(`${file}: expected the npm pack output, wait-on-<version>.tgz`);
  return m[1];
}

// Every proxy source either side honors: the baseline's axios-era wait-on (proxy-from-env)
// also reads ALL_PROXY and npm_config_*proxy, which the tarball's undici ignores; curl reads ALL_PROXY.
const PROXIES = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY'].flatMap((k) => [k, k.toLowerCase()]).concat(
  ['proxy', 'http_proxy', 'https_proxy', 'no_proxy'].map((k) => `npm_config_${k}`)
);

// The env a dependent's commands run in: no proxies (they probe localhost), and no
// pre/post lifecycle scripts (start-server-and-test's pretest runs prettier --write).
function runEnv(parent) {
  const env = Object.assign({}, parent);
  PROXIES.forEach((k) => delete env[k]);
  env.npm_config_ignore_scripts = 'true';
  return env;
}

// npm ls exits 1 after a --no-save swap breaks the dependent's exact pin, so only the
// parsed versions are judged: every wait-on at any depth must be the expected one.
function lsVerdict(stdout, version) {
  let tree;
  try {
    tree = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`npm ls output is not JSON: ${err.message}`);
  }
  const found = [];
  const walk = (node, trail) => {
    Object.entries(node.dependencies || {}).forEach(([name, dep]) => {
      const here = trail ? `${trail} > ${name}` : name;
      if (name === 'wait-on') found.push(`${here}@${dep.version}`);
      walk(dep, here);
    });
  };
  walk(tree, '');
  if (found.length === 0) throw new Error('npm ls found no wait-on to swap');
  const stale = found.filter((f) => !f.endsWith(`@${version}`));
  if (stale.length) throw new Error(`swap incomplete, expected ${version}: ${stale.join(', ')}`);
}

// rows: { command, baseline, tarball, control } with control undefined when not run
function verdict(label, rows) {
  const withControl = rows.some((r) => r.control !== undefined);
  const mark = (ok) => (ok ? 'pass' : 'FAIL');
  const width = Math.max(7, ...rows.map((r) => r.command.length));
  const line = (cells) => '  ' + cells.map((c, i) => (i === 0 ? c.padEnd(width) : c.padEnd(9))).join(' ').trimEnd();
  const header = ['command', 'baseline', 'tarball'].concat(withControl ? ['9.5.1'] : [], ['verdict']);
  const call = (r) => {
    if (r.tarball) return 'ok';
    return r.baseline ? 'regression' : 'pre-existing';
  };
  const code = rows.some((r) => call(r) === 'regression') ? 1 : 0;
  const body = rows.map((r) => {
    const cells = [r.command, mark(r.baseline), mark(r.tarball)];
    if (withControl) cells.push(r.control === undefined ? '-' : mark(r.control));
    return line(cells.concat(call(r)));
  });
  return { text: [label, line(header)].concat(body).join('\n') + '\n', code };
}

// Windows holds node_modules files briefly after their processes exit (EBUSY); cleanup
// retries and never fails the run.
function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
  } catch {
    console.error(`could not remove ${dir}; remove it by hand`);
  }
}

const CONTROL_VERSION = '9.5.1';
const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'test', 'dependents', 'dependents.json');

function exec(file, args, cwd, env, capture) {
  const r = childProcess.spawnSync(file, args, {
    cwd,
    env,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  if (r.error) throw r.error;
  return r;
}

function packTarball(npm, dir) {
  const r = exec(process.execPath, [npm, 'pack', '--json', '--pack-destination', dir], ROOT, process.env, true);
  if (r.status !== 0) throw new Error('npm pack failed');
  return path.join(dir, JSON.parse(r.stdout)[0].filename);
}

function runEntry(entry, ctx) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dependents-${entry.name}-`));
  const clone = path.join(dir, 'repo');
  const must = (file, args, cwd, what) => {
    if (exec(file, args, cwd, process.env).status !== 0) {
      throw new Error(`${entry.name}: ${what} failed (kept ${dir})`);
    }
  };
  const npm = (args, what) => must(process.execPath, [ctx.npm, ...args], clone, what);
  const runAll = (label) => {
    const env = runEnv(process.env);
    return entry.run.map((cmd) => {
      console.log(`> ${entry.name} [${label}] ${cmd}`);
      return exec(process.execPath, nodeArgs(cmd, ctx.npm), clone, env).status === 0;
    });
  };
  const swapAndProve = (target, version) => {
    swapArgs(entry, target).forEach((args) => npm(args, `npm ${args.join(' ')}`));
    const ls = exec(process.execPath, [ctx.npm, 'ls', 'wait-on', '--all', '--json'], clone, process.env, true);
    try {
      lsVerdict(ls.stdout, version);
    } catch (err) {
      throw new Error(`${entry.name}: ${err.message} (kept ${dir})`);
    }
  };

  console.log(`> ${entry.name}: clone ${entry.repo} ${entry.tag} into ${clone}`);
  must('git', cloneArgs(entry, clone), dir, 'git clone');
  npm(installArgs(entry), 'npm ci');
  entry.build.forEach((cmd) => must(process.execPath, nodeArgs(cmd, ctx.npm), clone, cmd));

  const baseline = runAll('baseline');
  swapAndProve({ tgz: ctx.tgz }, ctx.version);
  const tarball = runAll('tarball');
  let control = [];
  if (ctx.control) {
    swapAndProve({ version: CONTROL_VERSION }, CONTROL_VERSION);
    control = runAll(`control ${CONTROL_VERSION}`);
  }

  const rows = entry.run.map((command, i) => ({ command, baseline: baseline[i], tarball: tarball[i], control: control[i] }));
  const { text, code } = verdict(`\n${entry.name} ${entry.tag}`, rows);
  console.log(text);
  if (ctx.keep || code !== 0) console.log(`  kept ${dir}`);
  else removeDir(dir);
  return code;
}

function main(argv) {
  const opts = parseArgs(argv);
  const entries = parseManifest(fs.readFileSync(MANIFEST, 'utf8'));
  if (opts.list) {
    console.log(listText(entries));
    return 0;
  }
  const picked = select(entries, opts, process.platform);
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('npm_execpath is not set: run this through npm run dependents');
  const packDir = opts.tgz ? undefined : fs.mkdtempSync(path.join(os.tmpdir(), 'dependents-pack-'));
  try {
    const tgz = packDir ? packTarball(npm, packDir) : path.resolve(opts.tgz);
    const ctx = { npm, tgz, version: tgzVersion(tgz), control: opts.control, keep: opts.keep };
    console.log(`> dependents: ${picked.map((e) => e.name).join(', ')} against ${tgz}`);
    // one entry at a time: the dependents bind fixed ports
    return picked.reduce((code, entry) => Math.max(code, runEntry(entry, ctx)), 0);
  } finally {
    if (packDir) removeDir(packDir);
  }
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

module.exports = {
  parseManifest,
  select,
  listText,
  parseArgs,
  cloneArgs,
  installArgs,
  swapArgs,
  nodeArgs,
  tgzVersion,
  runEnv,
  lsVerdict,
  verdict,
  removeDir
};
