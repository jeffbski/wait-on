'use strict';

// #260: the unprivileged ports on the WHATWG Fetch bad-port list. undici fetch refuses
// them before connecting, so tests listen on the first free one (6000 is often XQuartz).
const FETCH_BAD_PORTS = [6000, 6665, 6666, 6667, 6668, 6669, 6697, 10080, 5060, 5061, 6566, 4190, 4045, 3659];

// Listen `server` on the first free bad-list port and resolve that port. Fails (never
// skips) only when every one is taken.
async function listenBadPort(server, host = '127.0.0.1') {
  for (const port of FETCH_BAD_PORTS) {
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve();
        });
      });
      return port;
    } catch (err) {
      if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') throw err;
    }
  }
  throw new Error(`every Fetch bad-list port is taken: ${FETCH_BAD_PORTS.join(', ')}`);
}

module.exports = { listenBadPort };
