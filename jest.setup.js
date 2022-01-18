const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpdir = path.join(os.tmpdir(), 'get-port-jest');
const tmpfile = path.join(tmpdir, '.port');

fs.mkdirSync(tmpdir, { recursive: true });

function getPort() {
  let port;
  if (fs.existsSync(tmpfile)) {
    port = Number(fs.readFileSync(tmpfile, 'utf8'));
    if (Number.isNaN(port)) {
      port = 3001;
    }
  } else {
    port = 3001;
  }

  fs.writeFileSync(tmpfile, `${port + 1}`);
  return port;
}

global.getPort = getPort;

jest.setTimeout(10000);
