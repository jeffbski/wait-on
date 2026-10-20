'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const mocha = require('mocha');
const describe = mocha.describe;
const it = mocha.it;
const chai = require('chai');
const expect = chai.expect;

const dependents = require('../../scripts/dependents');

const MANIFEST_PATH = path.join(__dirname, 'dependents.json');
const manifestText = () => fs.readFileSync(MANIFEST_PATH, 'utf8');

const VALID = {
  name: 'x',
  repo: 'https://example.com/x.git',
  tag: 'v1',
  swap: 'install',
  scripts: false,
  build: [],
  run: ['npm run demo'],
  os: [],
  optional: false
};
const manifestWith = (patch) => JSON.stringify([Object.assign({}, VALID, patch)]);
const names = (entries) => entries.map((e) => e.name);

describe('dependents: manifest', function () {
  it('should parse the committed manifest into the anchor and the optional unix entry', function () {
    const entries = dependents.parseManifest(manifestText());
    expect(names(entries)).to.eql(['start-server-and-test', 'jest-dev-server']);
    const [sst, jds] = entries;
    expect(sst).to.include({ tag: 'v3.0.12', swap: 'install', scripts: false, optional: false });
    expect(sst.os).to.eql([]);
    expect(sst.build).to.eql([]);
    expect(jds).to.include({ tag: 'v11.0.0', swap: 'overrides', scripts: false, optional: true });
    expect(jds.os).to.eql(['linux', 'darwin']);
    // install scripts off, and Chrome comes from a newer puppeteer CLI: the pinned puppeteer 23
    // unzips Chrome only partly on Node 24+ and still exits 0
    expect(jds.build).to.eql([
      'npm exec --yes --ignore-scripts --package=puppeteer@25.15.0 -- puppeteer browsers install chrome@131.0.6778.204',
      'npm run build'
    ]);
  });

  // jest-dev-server's own package has no tests; its consumers' suites call waitOn
  it('should run the jest-puppeteer suites that start a server through jest-dev-server', function () {
    const jds = dependents.parseManifest(manifestText())[1];
    expect(jds.run).to.eql(['npm test -- packages/jest-environment-puppeteer packages/expect-puppeteer']);
  });

  it('should run the anchor spec and demo scripts, never its npm test', function () {
    const [sst] = dependents.parseManifest(manifestText());
    expect(sst.run[0]).to.equal('node node_modules/mocha/bin/mocha.js test/helper src/*-spec.js');
    expect(sst.run).to.include('npm run demo-multiple');
    ['npm test', 'npm run test', 'npm run demo4', 'npm run demo8', 'npm run demo10'].forEach((cmd) =>
      expect(sst.run).to.not.include(cmd)
    );
  });

  it('should reject text that is not JSON', function () {
    expect(() => dependents.parseManifest('{nope')).to.throw(/dependents\.json/);
  });

  it('should reject a manifest that is not an array', function () {
    expect(() => dependents.parseManifest('{}')).to.throw(/expected an array/);
  });

  it('should name the entry and the missing field', function () {
    expect(() => dependents.parseManifest('[{"name":"x"}]')).to.throw(/x.*repo/);
  });

  it('should reject an os that is not an array', function () {
    expect(() => dependents.parseManifest(manifestWith({ os: 'linux' }))).to.throw(/x.*os/);
  });

  it('should reject an unknown swap mode', function () {
    expect(() => dependents.parseManifest(manifestWith({ swap: 'link' }))).to.throw(/swap.*install, overrides/);
  });

  it('should reject an empty run list', function () {
    expect(() => dependents.parseManifest(manifestWith({ run: [] }))).to.throw(/x.*run/);
  });

  it('should reject a command that does not start with npm or node', function () {
    expect(() => dependents.parseManifest(manifestWith({ run: ['curl http://x'] }))).to.throw(
      /curl http:\/\/x.*npm or node/
    );
  });
});

describe('dependents: select', function () {
  const entries = () => dependents.parseManifest(manifestText());

  it('should pick only required entries by default', function () {
    expect(names(dependents.select(entries(), {}, 'linux'))).to.eql(['start-server-and-test']);
  });

  it('should add optional entries on their own OS only', function () {
    const opts = { includeOptional: true };
    expect(names(dependents.select(entries(), opts, 'linux'))).to.eql(['start-server-and-test', 'jest-dev-server']);
    expect(names(dependents.select(entries(), opts, 'darwin'))).to.eql(['start-server-and-test', 'jest-dev-server']);
    expect(names(dependents.select(entries(), opts, 'win32'))).to.eql(['start-server-and-test']);
  });

  it('should run an --only entry even when it is optional', function () {
    expect(names(dependents.select(entries(), { only: 'jest-dev-server' }, 'linux'))).to.eql(['jest-dev-server']);
  });

  it('should refuse an --only entry on an OS it does not support', function () {
    expect(() => dependents.select(entries(), { only: 'jest-dev-server' }, 'win32')).to.throw(
      /jest-dev-server.*linux, darwin.*win32/
    );
  });

  it('should list the known names for an unknown --only', function () {
    expect(() => dependents.select(entries(), { only: 'nope' }, 'linux')).to.throw(
      /nope.*start-server-and-test, jest-dev-server/
    );
  });
});

describe('dependents: list', function () {
  it('should print each entry with its tag, OS, optional flag and indented commands', function () {
    const text = dependents.listText(dependents.parseManifest(manifestText()));
    ['start-server-and-test', 'v3.0.12', 'jest-dev-server', 'v11.0.0', 'optional=yes'].forEach((s) =>
      expect(text).to.include(s)
    );
    const lines = text.split('\n');
    expect(lines).to.include('  node node_modules/mocha/bin/mocha.js test/helper src/*-spec.js');
    expect(lines).to.include('  npm run demo-multiple');
    const header = (name) => lines.find((l) => l.startsWith(name));
    expect(header('start-server-and-test')).to.match(/\ball\b/);
    expect(header('jest-dev-server')).to.match(/\blinux,darwin\b/);
  });
});

describe('dependents: args', function () {
  it('should parse every flag', function () {
    const argv = ['--only', 'jest-dev-server', '--include-optional', '--control', '--tgz', 'x.tgz', '--keep', '--list'];
    expect(dependents.parseArgs(argv)).to.eql({
      list: true,
      only: 'jest-dev-server',
      includeOptional: true,
      control: true,
      tgz: 'x.tgz',
      keep: true
    });
  });

  it('should default every flag off', function () {
    expect(dependents.parseArgs([])).to.eql({
      list: false,
      only: undefined,
      includeOptional: false,
      control: false,
      tgz: undefined,
      keep: false
    });
  });

  it('should reject an unknown argument with the usage line', function () {
    expect(() => dependents.parseArgs(['--frob'])).to.throw(/--frob[\s\S]*usage: npm run dependents/);
  });

  it('should reject a value flag without its value', function () {
    expect(() => dependents.parseArgs(['--tgz'])).to.throw(/--tgz needs a value/);
    expect(() => dependents.parseArgs(['--only'])).to.throw(/--only needs a value/);
  });
});

describe('dependents: commands', function () {
  const [sst, jds] = dependents.parseManifest(manifestText());
  const TGZ = '/p/wait-on-10.0.0-rc.1.tgz';
  const tarball = { tgz: TGZ };
  const control = { version: '9.5.1' };
  const scripted = (entry, scripts) => Object.assign({}, entry, { scripts });

  it('should shallow clone the entry at its tag', function () {
    expect(dependents.cloneArgs(sst, '/t/sst')).to.eql([
      '-c',
      'core.longpaths=true',
      'clone',
      '--depth',
      '1',
      '--branch',
      'v3.0.12',
      'https://github.com/bahmutov/start-server-and-test.git',
      '/t/sst'
    ]);
  });

  it('should install from the lockfile, ignoring scripts unless the entry allows them', function () {
    expect(dependents.installArgs(sst)).to.eql(['ci', '--ignore-scripts']);
    expect(dependents.installArgs(Object.assign({}, jds, { scripts: true }))).to.eql(['ci']);
  });

  describe('swap matrix', function () {
    const cells = [
      [sst, false, tarball, [['install', '--no-save', '--ignore-scripts', TGZ]]],
      [sst, true, tarball, [['install', '--no-save', TGZ]]],
      [sst, false, control, [['install', '--no-save', '--ignore-scripts', 'wait-on@9.5.1']]],
      [sst, true, control, [['install', '--no-save', 'wait-on@9.5.1']]],
      [jds, true, tarball, [['pkg', 'set', `overrides.wait-on=file:${TGZ}`], ['install']]],
      [jds, false, tarball, [['pkg', 'set', `overrides.wait-on=file:${TGZ}`], ['install', '--ignore-scripts']]],
      [jds, true, control, [['pkg', 'set', 'overrides.wait-on=9.5.1'], ['install']]],
      [jds, false, control, [['pkg', 'set', 'overrides.wait-on=9.5.1'], ['install', '--ignore-scripts']]]
    ];
    cells.forEach(([entry, scripts, target, expected]) => {
      const label = `${entry.swap}, ${target.tgz ? 'tarball' : 'control'}, scripts ${scripts}`;
      it(`should build the swap for ${label}`, function () {
        expect(dependents.swapArgs(scripted(entry, scripts), target)).to.eql(expected);
      });
    });
  });

  it('should run npm commands through npm-cli and node commands directly', function () {
    expect(dependents.nodeArgs('npm run demo2', '/n/npm-cli.js')).to.eql(['/n/npm-cli.js', 'run', 'demo2']);
    expect(dependents.nodeArgs('node node_modules/mocha/bin/mocha.js src/*-spec.js', '/n/npm-cli.js')).to.eql([
      'node_modules/mocha/bin/mocha.js',
      'src/*-spec.js'
    ]);
  });

  it('should read the expected version from the npm pack file name', function () {
    expect(dependents.tgzVersion('wait-on-10.0.0-rc.1.tgz')).to.equal('10.0.0-rc.1');
    expect(dependents.tgzVersion(path.join('abs', 'dir', 'wait-on-9.5.1.tgz'))).to.equal('9.5.1');
    expect(() => dependents.tgzVersion('wait-on.tgz')).to.throw(/npm pack/);
  });
});

describe('dependents: env', function () {
  // ALL_PROXY and npm_config_*proxy: the baseline's axios-era wait-on (proxy-from-env) honors
  // them, the tarball's undici does not; curl honors ALL_PROXY
  const PROXIES = [
    'HTTP_PROXY',
    'http_proxy',
    'HTTPS_PROXY',
    'https_proxy',
    'NO_PROXY',
    'no_proxy',
    'ALL_PROXY',
    'all_proxy',
    'npm_config_proxy',
    'npm_config_http_proxy',
    'npm_config_https_proxy',
    'npm_config_no_proxy'
  ];
  const parent = () => {
    const env = { PATH: '/bin' };
    PROXIES.forEach((k) => (env[k] = 'http://127.0.0.1:9'));
    return env;
  };

  it('should drop every proxy variable and ignore lifecycle scripts', function () {
    const env = dependents.runEnv(parent());
    PROXIES.forEach((k) => expect(env).to.not.have.property(k));
    expect(env.PATH).to.equal('/bin');
    expect(env.npm_config_ignore_scripts).to.equal('true');
  });

  it('should not mutate the parent environment', function () {
    const p = parent();
    dependents.runEnv(p);
    expect(p).to.eql(parent());
  });
});

describe('dependents: npm ls', function () {
  const V = '10.0.0-rc.1';
  const tree = (nested) =>
    JSON.stringify({
      name: 'start-server-and-test',
      problems: [`invalid: wait-on@${V}`],
      error: { code: 'ELSPROBLEMS' },
      dependencies: {
        'wait-on': { version: V, invalid: '"9.1.0" from the root project' },
        other: { version: '1.0.0', dependencies: { 'wait-on': { version: nested } } }
      }
    });

  it('should accept an ELSPROBLEMS tree whose every copy is at the tarball version', function () {
    expect(() => dependents.lsVerdict(tree(V), V)).to.not.throw();
  });

  it('should name a nested copy left at another version', function () {
    expect(() => dependents.lsVerdict(tree('9.1.0'), V))
      .to.throw(/other > wait-on@9\.1\.0/)
      .and.to.match(/10\.0\.0-rc\.1/);
  });

  it('should name a workspace copy left at another version', function () {
    const ws = JSON.stringify({
      dependencies: { 'jest-dev-server': { version: '11.0.0', dependencies: { 'wait-on': { version: '8.0.1' } } } }
    });
    expect(() => dependents.lsVerdict(ws, V)).to.throw(/jest-dev-server > wait-on@8\.0\.1/);
  });

  it('should fail when no wait-on is installed', function () {
    expect(() => dependents.lsVerdict('{"name":"x"}', V)).to.throw(/no wait-on/);
  });

  it('should fail on output that is not JSON', function () {
    expect(() => dependents.lsVerdict('npm ERR!', V)).to.throw(/npm ls/);
  });
});

describe('dependents: verdict', function () {
  const row = (baseline, tarball, control) => ({ command: 'npm run demo', baseline, tarball, control });

  it('should call a command passing on the tarball ok', function () {
    const { text, code } = dependents.verdict('sst v1', [row(true, true)]);
    expect(code).to.equal(0);
    ['npm run demo', 'pass', 'ok'].forEach((s) => expect(text).to.include(s));
  });

  it('should call a tarball failure that passed on baseline a regression', function () {
    const { text, code } = dependents.verdict('sst v1', [row(true, false)]);
    expect(code).to.equal(1);
    expect(text).to.include('regression');
  });

  it('should call a failure on both runs pre-existing', function () {
    const { text, code } = dependents.verdict('sst v1', [row(false, false)]);
    expect(code).to.equal(0);
    expect(text).to.include('pre-existing');
  });

  it('should call a tarball pass after a baseline failure ok', function () {
    const { text, code } = dependents.verdict('sst v1', [row(false, true)]);
    expect(code).to.equal(0);
    expect(text).to.include('ok');
  });

  it('should exit 1 when any row regressed', function () {
    expect(dependents.verdict('sst v1', [row(true, true), row(true, false)]).code).to.equal(1);
  });

  it('should show the 9.5.1 column only when the control ran', function () {
    expect(dependents.verdict('sst v1', [row(true, true)]).text).to.not.include('9.5.1');
    const { text, code } = dependents.verdict('sst v1', [row(true, true, false)]);
    expect(text).to.include('9.5.1');
    expect(code).to.equal(0);
    const line = text.split('\n').find((l) => l.includes('npm run demo'));
    expect(line).to.match(/pass\s+pass\s+FAIL\s+ok/);
  });
});

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'dependents.js');
const spawn = (args, env) =>
  childProcess.spawnSync(process.execPath, args, { cwd: ROOT, env: env || process.env, encoding: 'utf8' });
const npmRun = (args, env) => spawn([process.env.npm_execpath].concat(args), env);
function needsNpm() {
  if (!process.env.npm_execpath) this.skip(); // mocha not launched through npm
}

describe('dependents: front door', function () {
  this.timeout(30000);

  it('should list the manifest through npm run dependents -- --list', function () {
    needsNpm.call(this);
    const r = npmRun(['run', 'dependents', '--', '--list']);
    expect(r.status, r.stderr).to.equal(0);
    ['start-server-and-test', 'v3.0.12', 'jest-dev-server', 'v11.0.0', 'npm run demo-multiple'].forEach((s) =>
      expect(r.stdout).to.include(s)
    );
  });

  it('should exit 1 with the usage line on an unknown argument', function () {
    const r = spawn([SCRIPT, '--frob']);
    expect(r.status).to.equal(1);
    expect(r.stderr).to.include('--frob').and.to.include('usage: npm run dependents');
  });

  it('should exit 1 when a value flag has no value', function () {
    const r = spawn([SCRIPT, '--tgz']);
    expect(r.status).to.equal(1);
    expect(r.stderr).to.include('--tgz needs a value');
  });

  it('should exit 1 naming the known entries for an unknown --only', function () {
    const r = spawn([SCRIPT, '--only', 'nope']);
    expect(r.status).to.equal(1);
    expect(r.stderr).to.include('nope').and.to.include('start-server-and-test');
  });

  it('should exit 1 asking for npm run when npm_execpath is missing', function () {
    const env = Object.assign({}, process.env);
    delete env.npm_execpath;
    const r = spawn([SCRIPT, '--only', 'start-server-and-test'], env);
    expect(r.status).to.equal(1);
    expect(r.stderr).to.include('npm run dependents');
  });
});

describe('dependents: package', function () {
  this.timeout(30000);

  it('should keep the dependents tooling out of the published package', function () {
    needsNpm.call(this);
    const r = npmRun(['pack', '--dry-run', '--json', '--ignore-scripts']);
    expect(r.status, r.stderr).to.equal(0);
    const paths = JSON.parse(r.stdout)[0].files.map((f) => f.path);
    expect(paths.filter((p) => p.startsWith('scripts/') || p.startsWith('test/'))).to.eql([]);
  });
});

describe('dependents: cleanup', function () {
  const temp = require('temp');
  temp.track();

  it('should remove a directory with nested files', function () {
    const dir = temp.mkdirSync('dependents-cleanup');
    fs.mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'a', 'b', 'f.txt'), 'x');
    dependents.removeDir(dir);
    expect(fs.existsSync(dir)).to.equal(false);
  });

  it('should return quietly for a path that does not exist', function () {
    expect(() => dependents.removeDir(path.join(temp.dir, 'dependents-missing-dir'))).to.not.throw();
  });
});
