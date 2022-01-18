const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpdir = path.join(os.tmpdir(), 'get-port-jest');
const tmpfile = path.join(tmpdir, '.port');

module.exports = () => {
  if (fs.existsSync(tmpfile)) {
    fs.unlinkSync(tmpfile);
  }
  fs.rmdirSync(tmpdir);
};
