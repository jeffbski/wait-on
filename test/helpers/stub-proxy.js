'use strict';

// Counting stub proxy (KTD8): forwards absolute-form requests and tunnels CONNECT,
// recording each so tests can prove a request took the proxy path.

const http = require('http');
const net = require('net');

function start() {
  const requests = [];
  const connects = [];
  const server = http.createServer((req, res) => {
    requests.push({ line: `${req.method} ${req.url}`, proxyAuthorization: req.headers['proxy-authorization'] });
    const upstream = http.request(req.url, { method: req.method, headers: req.headers }, (up) => {
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    });
    upstream.on('error', () => res.destroy());
    req.pipe(upstream);
  });
  // Tunneled CONNECT sockets leave http's tracking, so close() destroys every socket itself.
  const sockets = new Set();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  server.on('connect', (req, client, head) => {
    connects.push({ line: `CONNECT ${req.url}`, proxyAuthorization: req.headers['proxy-authorization'] });
    const [host, port] = splitHostPort(req.url);
    const target = net.connect(port, host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      target.write(head);
      target.pipe(client);
      client.pipe(target);
    });
    target.on('error', () => client.destroy());
    client.on('error', () => target.destroy());
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        requests,
        connects,
        close: () =>
          new Promise((r) => {
            server.close(r);
            sockets.forEach((s) => s.destroy());
          })
      })
    )
  );
}

// "host:port" or "[v6]:port" -> [host, port]
function splitHostPort(authority) {
  const i = authority.lastIndexOf(':');
  return [authority.slice(0, i).replace(/^\[|\]$/g, ''), Number(authority.slice(i + 1))];
}

module.exports = { start };
