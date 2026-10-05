'use strict';

// Once per run: install the package under test into a fresh temp project per fixture.
// Per scenario: pick the fixture from its @fixture tag, give it a temp dir, clean up after.

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BeforeAll, Before, After, AfterAll } = require('@cucumber/cucumber');
const { packageSource, fixtureOf, installArgs } = require('./project');
const { tsc, RUNNERS } = require('./world');

const REPO = path.resolve(__dirname, '..', '..');
const FIXTURES = Object.keys(RUNNERS);
let root; // every temp project of this run
const projects = {}; // fixture -> installed project dir

// npm through its own cli script, so Windows needs no .cmd shim (outside npm run it is unset)
function npm(args, cwd) {
  const out = childProcess.spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd,
    encoding: 'utf8'
  });
  if (out.status !== 0) throw new Error(`npm ${args.join(' ')} failed in ${cwd}:\n${out.stdout}${out.stderr}`);
  return out.stdout;
}

BeforeAll({ timeout: 300 * 1000 }, function () {
  if (!process.env.npm_execpath) throw new Error('npm_execpath is unset: run the contract through `npm run contract`');
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wait-on-contract-')));
  const source = packageSource(this.parameters.package, REPO);
  if (source.pack) {
    const [{ filename }] = JSON.parse(npm(['pack', '--json', '--pack-destination', root], REPO));
    source.tgz = path.join(root, filename);
  }
  const typesNode = require('@types/node/package.json').version;
  // a name@x.y.z spec must install exactly that version
  const [, name, version] = (source.spec || '').match(/^(@?[^@]+)@(\d+\.\d+\.\d+\S*)$/) || [];
  for (const fixture of FIXTURES) {
    const project = path.join(root, fixture);
    fs.cpSync(path.join(REPO, 'features', 'fixtures', fixture), project, { recursive: true });
    npm(installArgs(fixture, source, typesNode), project);
    const installed = require(path.join(project, 'node_modules', 'wait-on', 'package.json')).version;
    if (version && installed !== version) {
      throw new Error(`${name}@${version} was requested but ${installed} was installed in ${project}`);
    }
    projects[fixture] = project;
  }
  // the ts fixture runs its emitted dist/run.js
  const out = tsc(projects.ts);
  if (out.status !== 0) throw new Error(`tsc failed on the ts fixture:\n${out.stdout}${out.stderr}`);
});

Before(function ({ pickle }) {
  this.fixture = fixtureOf(pickle.tags.map((t) => t.name));
  this.project = projects[this.fixture];
  this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wait-on-scenario-'));
});

After(async function () {
  try {
    for (const cleanup of this.cleanups.reverse()) await cleanup();
  } finally {
    fs.rmSync(this.dir, { recursive: true, force: true });
  }
});

AfterAll(function () {
  try {
    if (root) fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  } catch (err) {
    console.warn(`could not remove ${root}: ${err.message}`);
  }
});
