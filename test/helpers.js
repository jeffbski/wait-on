'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDirs = [];

process.on('exit', () => {
  for (const tempDir of tmpDirs) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function makeTempDir(cb) {
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wait-on-'));
    tmpDirs.push(dir);
    cb(null, dir);
  } catch (e) {
    cb(e);
  }
}

module.exports = { makeTempDir };
