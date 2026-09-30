'use strict';

const waitOn = require('../');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const temp = require('temp');
const mkdirp = require('mkdirp');
const { itFrozen } = require('./frozen-clock');

const mocha = require('mocha');
const describe = mocha.describe;
const it = mocha.it;
const afterEach = mocha.afterEach;
const chai = require('chai');
const expect = chai.expect;

// Windows has no Unix domain sockets, Node listens on named pipes instead
function socketPathIn(dirPath) {
  return process.platform === 'win32' ? path.join('\\\\?\\pipe', dirPath, 'sock') : path.resolve(dirPath, 'sock');
}

temp.track(); // cleanup files on exit

describe('api', function () {
  this.timeout(3000);
  let httpServer = null;

  afterEach(function (done) {
    if (httpServer) {
      const server = httpServer;
      httpServer = null;
      // Force keep-alive client connections closed and wait for the port to actually be
      // released before the next test binds it. Frozen tests finish in milliseconds, so the
      // old fire-and-forget close() could leave the port bound when the next same-port test
      // ran; the real timeouts used to mask this by giving the socket time to drain.
      server.closeAllConnections();
      server.close(function () {
        done();
      });
    } else {
      done();
    }
  });

  itFrozen('should succeed when file resources are available', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar/deeper/deep/yet')]
      };
      fs.writeFileSync(opts.resources[0], 'data1');
      mkdirp.sync(path.dirname(opts.resources[1]));
      fs.writeFileSync(opts.resources[1], 'data2');
      waitOn(opts, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  it('should succeed when file resources are become available later', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar/deeper/deep/yet')]
      };

      setTimeout(function () {
        fs.writeFile(opts.resources[0], 'data1', function () {});
        mkdirp.sync(path.dirname(opts.resources[1]));
        fs.writeFile(opts.resources[1], 'data2', function () {});
      }, 300);

      waitOn(opts, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  it('should succeed when http resources are become available later', function (done) {
    const opts = {
      resources: ['http://localhost:3000', 'http://localhost:3000/foo']
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.listen(3000, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).to.not.be.ok;
      done();
    });
  });

  it('should succeed when custom validateStatus fn is provided http resource returns 401', function (done) {
    const opts = {
      resources: ['http://localhost:3000'],
      validateStatus: function (status) {
        return status === 401 || (status >= 200 && status < 300);
      }
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.statusCode = 401;
        res.end('Not authorized');
      });
      httpServer.listen(3000, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).to.not.be.ok;
      done();
    });
  });

  it('should succeed when http resource become available later via redirect', function (done) {
    const opts = {
      // followRedirect: true // default is true
      resources: ['http://localhost:3000']
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        const pathname = req.url;
        if (pathname === '/') {
          res.writeHead(302, { Location: 'http://localhost:3000/foo' });
        }
        res.end('data');
      });
      httpServer.listen(3000, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).to.not.be.ok;
      done();
    });
  });

  it('should succeed when http GET resources become available later', function (done) {
    const opts = {
      resources: ['http-get://localhost:3011', 'http-get://localhost:3011/foo']
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.listen(3011, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).to.not.be.ok;
      done();
    });
  });

  it('should succeed when http GET resource become available later via redirect', function (done) {
    const opts = {
      // followRedirect: true, // default is true
      resources: ['http-get://localhost:3000']
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        const pathname = req.url;
        if (pathname === '/') {
          res.writeHead(302, { Location: 'http://localhost:3000/foo' });
        }
        res.end('data');
      });
      httpServer.listen(3000, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).to.not.be.ok;
      done();
    });
  });

  /*
  itFrozen('should succeed when an https resource is available', function (done) {
    const opts = {
      resources: [
        'https://www.google.com'
      ]
    };

    waitOn(opts, function (err) {
      expect(err).to.not.be.ok;
      done();
    });
  });

  itFrozen('should succeed when an https GET resource is available', function (done) {
    const opts = {
      resources: [
        'https-get://www.google.com'
      ]
    };

    waitOn(opts, function (err) {
      expect(err).to.not.be.ok;
      done();
    });
  });
  */

  it('should succeed when a service is listening to tcp port', function (done) {
    const opts = {
      resources: ['tcp:localhost:3001', 'tcp:3001']
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.listen(3001, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).to.not.be.ok;
      done();
    });
  });

  // #61: waitOn accepts a string or string array as the opts.resources shorthand.
  describe('string/array opts shorthand (#61)', function () {
    it('accepts a string, resolving like { resources: [string] } (callback form)', function (done) {
      setTimeout(function () {
        httpServer = http.createServer();
        httpServer.listen(3041, 'localhost');
      }, 300);

      waitOn('tcp:localhost:3041', function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });

    it('accepts a string via the promise form', function () {
      setTimeout(function () {
        httpServer = http.createServer();
        httpServer.listen(3042, 'localhost');
      }, 300);

      return waitOn('tcp:localhost:3042');
    });

    it('accepts a string array, resolving like { resources: arr }', function (done) {
      setTimeout(function () {
        httpServer = http.createServer();
        httpServer.listen(3043, 'localhost');
      }, 300);

      waitOn(['tcp:localhost:3043', 'tcp:3043'], function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });

    it('still accepts an object opts unchanged', function (done) {
      setTimeout(function () {
        httpServer = http.createServer();
        httpServer.listen(3044, 'localhost');
      }, 300);

      waitOn({ resources: ['tcp:localhost:3044'] }, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  it('should succeed when a service is listening to a socket', function (done) {
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = socketPathIn(dirPath);
      const opts = {
        resources: ['socket:' + socketPath]
      };

      setTimeout(function () {
        httpServer = http.createServer();
        httpServer.listen(socketPath);
      }, 300);

      waitOn(opts, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  // #82: the tcp/socket checks must destroy() their connections, not leak them.
  it('should close the tcp connection after a successful check (#82)', function (done) {
    const server = net.createServer();
    let sawConnection = false;
    let serverConnClosed = false;
    server.on('connection', function (socket) {
      sawConnection = true;
      socket.on('close', function () {
        serverConnClosed = true;
      });
    });
    server.listen(3002, 'localhost', function () {
      waitOn({ resources: ['tcp:localhost:3002'], timeout: 2000 }, function (err) {
        if (err) {
          server.close();
          return done(err);
        }
        // The client destroys its socket on success, so the server's
        // connection count returns to 0.
        const check = function () {
          server.getConnections(function (gcErr, count) {
            if (gcErr) {
              server.close();
              return done(gcErr);
            }
            if (count === 0 && serverConnClosed) {
              server.close();
              expect(sawConnection).to.equal(true);
              return done();
            }
            setTimeout(check, 20);
          });
        };
        check();
      });
    });
  });

  it('should not leak a socket handle after a timed-out tcp check (#82)', function (done) {
    // 10.255.255.1 is unrouted, so the connect never completes and the
    // per-attempt tcpTimeout fires. mocha --exit would mask a leaked handle,
    // so assert directly that no TCPSocketWrap survives the destroy().
    function tcpHandleCount() {
      return process.getActiveResourcesInfo().filter(function (n) {
        return n === 'TCPSocketWrap';
      }).length;
    }
    const baseline = tcpHandleCount();
    waitOn(
      { resources: ['tcp:10.255.255.1:80'], tcpTimeout: 250, timeout: 600, interval: 5000 },
      function (err) {
        expect(err).to.be.ok; // it timed out
        setTimeout(function () {
          expect(tcpHandleCount()).to.equal(baseline);
          done();
        }, 100);
      }
    );
  });

  it('should close the unix socket connection after a successful check (#82)', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const socketPath = socketPathIn(dirPath);
      const server = net.createServer();
      let sawConnection = false;
      let serverConnClosed = false;
      server.on('connection', function (socket) {
        sawConnection = true;
        socket.on('close', function () {
          serverConnClosed = true;
        });
      });
      server.listen(socketPath, function () {
        waitOn({ resources: ['socket:' + socketPath], timeout: 2000 }, function (waitErr) {
          if (waitErr) {
            server.close();
            return done(waitErr);
          }
          const check = function () {
            server.getConnections(function (gcErr, count) {
              if (gcErr) {
                server.close();
                return done(gcErr);
              }
              if (count === 0 && serverConnClosed) {
                server.close();
                expect(sawConnection).to.equal(true);
                return done();
              }
              setTimeout(check, 20);
            });
          };
          check();
        });
      });
    });
  });

  it('should succeed when a http service is listening to a socket whose path contains a colon', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      let socketPath;
      if (process.platform === 'win32') {
        socketPath = socketPathIn(dirPath); // named pipe paths contain the drive letter, e.g. \\?\pipe\C:\...
      } else {
        const colonDirPath = path.resolve(dirPath, 'a:b');
        fs.mkdirSync(colonDirPath);
        socketPath = path.resolve(colonDirPath, 'sock');
      }
      const opts = {
        resources: ['http://unix:' + socketPath + ':http://localhost/', 'http://unix:' + socketPath + ':/foo']
      };

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(socketPath);
      }, 300);

      waitOn(opts, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  it('should succeed when a http service is listening to a socket', function (done) {
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = socketPathIn(dirPath);
      const opts = {
        resources: [
          'http://unix:' + socketPath + ':http://localhost/',
          'http://unix:' + socketPath + ':http://localhost/foo'
        ]
      };

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(socketPath);
      }, 300);

      waitOn(opts, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  it('should succeed when a http GET service is listening to a socket', function (done) {
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = socketPathIn(dirPath);
      const opts = {
        resources: [
          'http-get://unix:' + socketPath + ':http://localhost/',
          'http-get://unix:' + socketPath + ':http://localhost/foo'
        ]
      };

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(socketPath);
      }, 300);

      waitOn(opts, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  // Error situations

  itFrozen('should timeout when all resources are not available and timout option is specified', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo')],
        timeout: 1000
      };
      waitOn(opts, function (err) {
        expect(err).to.be.ok;
        done();
      });
    });
  });

  itFrozen('should timeout when some resources are not available and timout option is specified', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
        timeout: 1000
      };
      fs.writeFile(opts.resources[0], 'data', function () {});
      waitOn(opts, function (err) {
        expect(err).to.be.ok;
        done();
      });
    });
  });

  it('should timeout when an http resource returns 404', function (done) {
    const opts = {
      resources: ['http://localhost:3002'],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.statusCode = 404;
        res.end('data');
      });
      httpServer.listen(3002, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).to.be.ok;
      done();
    });
  });

  itFrozen('should timeout when an http resource is not available', function (done) {
    const opts = {
      resources: ['http://localhost:3010'],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).to.be.ok;
      done();
    });
  });

  it('should timeout when an http resource does not respond before httpTimeout', function (done) {
    const opts = {
      resources: ['http://localhost:8125'],
      timeout: 1000,
      interval: 100,
      window: 100,
      httpTimeout: 70
    };

    httpServer = http.createServer().on('request', function (req, res) {
      // make it a slow response, longer than the httpTimeout
      setTimeout(function () {
        res.end('data');
      }, 90);
    });
    httpServer.listen(8125, 'localhost');

    waitOn(opts, function (err) {
      expect(err).to.be.ok;
      done();
    });
  });

  itFrozen('should timeout when followRedirect is false and http resource redirects', function (done) {
    const opts = {
      timeout: 1000,
      interval: 100,
      window: 100,
      followRedirect: false,
      resources: ['http://localhost:3000']
    };

    httpServer = http.createServer().on('request', function (req, res) {
      const pathname = req.url;
      if (pathname === '/') {
        res.writeHead(302, { Location: 'http://localhost:3000/foo' });
      }
      res.end('data');
    });
    httpServer.listen(3000, 'localhost');

    waitOn(opts, function (err) {
      expect(err).to.be.ok;
      done();
    });
  });

  itFrozen('should timeout when an http GET resource is not available', function (done) {
    const opts = {
      resources: ['http-get://localhost:3010'],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).to.be.ok;
      done();
    });
  });

  itFrozen('should timeout when an https resource is not available', function (done) {
    const opts = {
      resources: ['https://localhost:3010/foo/bar'],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).to.be.ok;
      done();
    });
  });

  itFrozen('should timeout when an https GET resource is not available', function (done) {
    const opts = {
      resources: ['https-get://localhost:3010/foo/bar'],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).to.be.ok;
      done();
    });
  });

  itFrozen('should timeout when followRedirect is false and http GET resource redirects', function (done) {
    const opts = {
      timeout: 1000,
      interval: 100,
      window: 100,
      followRedirect: false,
      resources: ['http-get://localhost:3000']
    };

    httpServer = http.createServer().on('request', function (req, res) {
      const pathname = req.url;
      if (pathname === '/') {
        res.writeHead(302, { Location: 'http://localhost:3000/foo' });
      }
      res.end('data');
    });
    httpServer.listen(3000, 'localhost');

    waitOn(opts, function (err) {
      expect(err).to.be.ok;
      done();
    });
  });

  itFrozen('should timeout when a service is not listening to tcp port', function (done) {
    const opts = {
      resources: ['tcp:localhost:3010'],
      timeout: 1000
    };

    waitOn(opts, function (err) {
      expect(err).to.be.ok;
      done();
    });
  });

  itFrozen('should timeout when a service is not listening to a socket', function (done) {
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = socketPathIn(dirPath);
      const opts = {
        resources: ['socket:' + socketPath],
        timeout: 1000,
        interval: 100,
        window: 100
      };

      waitOn(opts, function (err) {
        expect(err).to.be.ok;
        done();
      });
    });
  });

  it('should timeout when a service host is unreachable', function (done) {
    const opts = {
      resources: ['tcp:256.0.0.1:1234'],
      timeout: 1000,
      tcpTimeout: 1000
    };

    waitOn(opts, function (err) {
      expect(err).to.be.ok;
      done();
    });
  });

  it('should trigger TCP timeout handler', function (done) {
    const opts = {
      resources: ['tcp:10.255.255.1:1234'], // Non-routable IP to force timeout
      timeout: 2000,
      tcpTimeout: 200
    };

    waitOn(opts, function (err) {
      expect(err).to.be.ok;
      done();
    });
  });

  itFrozen('should log timeout error when log is enabled', function (done) {
    const opts = {
      resources: ['file:/non/existent/file/path'],
      timeout: 500,
      log: true
    };

    waitOn(opts, function (err) {
      expect(err).to.be.ok;
      expect(err.message).to.contain('Timed out waiting for');
      done();
    });
  });

  it('should timeout when an http service listening to a socket returns 404', function (done) {
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = socketPathIn(dirPath);
      const opts = {
        resources: ['http://unix:' + socketPath + ':/', 'http://unix:' + socketPath + ':/foo'],
        timeout: 1000,
        interval: 100,
        window: 100
      };

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.statusCode = 404;
          res.end('data');
        });
        httpServer.listen(socketPath);
      }, 300);

      waitOn(opts, function (err) {
        expect(err).to.be.ok;
        done();
      });
    });
  });

  itFrozen('should timeout when an http service listening to a socket is too slow', function (done) {
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = socketPathIn(dirPath);
      const opts = {
        resources: ['package.json', 'http://unix:' + socketPath + ':/', 'http://unix:' + socketPath + ':/foo'],
        timeout: 1000,
        interval: 100,
        window: 100
      };

      httpServer = http.createServer().on('request', function (req, res) {
        setTimeout(function () {
          // res.statusCode = 404;
          res.end('data');
        }, 1100);
      });
      httpServer.listen(socketPath);

      waitOn(opts, function (err) {
        expect(err).to.be.ok;
        done();
      });
    });
  });

  it('should succeed when a service host is unreachable in reverse mode', function (done) {
    const opts = {
      resources: ['tcp:256.0.0.1:1234'],
      interval: 100,
      timeout: 1000,
      tcpTimeout: 1000,
      reverse: true,
      window: 100
    };

    waitOn(opts, function (err) {
      if (err) return done(err);
      expect(err).to.not.be.ok;
      done();
    });
  });

  itFrozen('should succeed when file resources are not available in reverse mode', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
        reverse: true
      };
      waitOn(opts, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  it('should succeed when file resources are not available later in reverse mode', function (done) {
    // Windows can leave an unlinked file in a "delete pending" state (AV/Search indexer
    // holds a handle without FILE_SHARE_DELETE, so Node falls back to delete-on-close).
    // While pending, fs.stat keeps succeeding and returns the real size, so reverse mode
    // rightly keeps polling until the OS finishes the delete. Give real headroom, and retry
    // with fresh temp files so a transient linger doesn't flake CI. (jeffbski/wait-on#238)
    this.timeout(15000);
    this.retries(2);
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
        reverse: true
      };
      fs.writeFileSync(opts.resources[0], 'data1');
      fs.writeFileSync(opts.resources[1], 'data2');
      setTimeout(function () {
        fs.unlinkSync(opts.resources[0]);
        fs.unlinkSync(opts.resources[1]);
      }, 300);
      waitOn(opts, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });
  });

  // #250: the success callback must receive `err === undefined` (strictly, never
  // null), which pins the `(err?: Error) => void` type in index.d.ts to real behavior.
  it('should invoke the callback with err === undefined (not null) on success (#250)', function (done) {
    temp.mkdir({}, function (mkErr, dirPath) {
      if (mkErr) return done(mkErr);
      const opts = { resources: [path.resolve(dirPath, 'foo')] };
      fs.writeFileSync(opts.resources[0], 'data1');
      waitOn(opts, function (err) {
        expect(err).to.equal(undefined);
        expect(err).to.not.equal(null);
        done();
      });
    });
  });

  it('should invoke the callback with err === undefined (not null) on reverse-mode success (#250)', function (done) {
    temp.mkdir({}, function (mkErr, dirPath) {
      if (mkErr) return done(mkErr);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
        reverse: true
      };
      waitOn(opts, function (err) {
        expect(err).to.equal(undefined);
        expect(err).to.not.equal(null);
        done();
      });
    });
  });

  itFrozen('should timeout when file resources are available in reverse mode', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
        reverse: true,
        timeout: 1000
      };
      fs.writeFileSync(opts.resources[0], 'data1');
      fs.writeFileSync(opts.resources[1], 'data2');
      waitOn(opts, function (err) {
        expect(err).to.be.ok;
        done();
      });
    });
  });

  describe('promise support', function () {
    itFrozen('should succeed when file resources are available', function (done) {
      temp.mkdir({}, function (err, dirPath) {
        if (err) return done(err);
        const opts = {
          resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')]
        };
        fs.writeFileSync(opts.resources[0], 'data1');
        fs.writeFileSync(opts.resources[1], 'data2');
        waitOn(opts)
          .then(function () {
            done();
          })
          .catch(function (err) {
            done(err);
          });
      });
    });

    it('should succeed when file resources are become available later', function (done) {
      temp.mkdir({}, function (err, dirPath) {
        if (err) return done(err);
        const opts = {
          resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')]
        };

        setTimeout(function () {
          fs.writeFile(opts.resources[0], 'data1', function () {});
          fs.writeFile(opts.resources[1], 'data2', function () {});
        }, 300);

        waitOn(opts)
          .then(function () {
            done();
          })
          .catch(function (err) {
            done(err);
          });
      });
    });

    itFrozen('should timeout when all resources are not available and timout option is specified', function (done) {
      temp.mkdir({}, function (err, dirPath) {
        if (err) return done(err);
        const opts = {
          resources: [path.resolve(dirPath, 'foo')],
          timeout: 1000
        };
        waitOn(opts)
          .then(function () {
            done(new Error('Should not be resolved'));
          })
          .catch(function (err) {
            expect(err).to.be.ok;
            done();
          });
      });
    });

    itFrozen('should timeout when some resources are not available and timout option is specified', function (done) {
      temp.mkdir({}, function (err, dirPath) {
        if (err) return done(err);
        const opts = {
          resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
          timeout: 1000
        };
        fs.writeFile(opts.resources[0], 'data', function () {});
        waitOn(opts)
          .then(function () {
            done(new Error('Should not be resolved'));
          })
          .catch(function (err) {
            expect(err).to.be.ok;
            done();
          });
      });
    });

    itFrozen('should succeed when file resources are not available in reverse mode', function (done) {
      temp.mkdir({}, function (err, dirPath) {
        if (err) return done(err);
        const opts = {
          resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
          reverse: true
        };
        waitOn(opts)
          .then(function () {
            done();
          })
          .catch(function (err) {
            done(err);
          });
      });
    });

    it('should succeed when file resources are not available later in reverse mode', function (done) {
      // See the callback-form twin above: Windows delete-pending keeps fs.stat succeeding
      // after unlink, so reverse mode rightly keeps polling. Headroom + retry. (#238)
      this.timeout(15000);
      this.retries(2);
      temp.mkdir({}, function (err, dirPath) {
        if (err) return done(err);
        const opts = {
          resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
          reverse: true
        };
        fs.writeFileSync(opts.resources[0], 'data1');
        fs.writeFileSync(opts.resources[1], 'data2');
        setTimeout(function () {
          fs.unlinkSync(opts.resources[0]);
          fs.unlinkSync(opts.resources[1]);
        }, 300);
        waitOn(opts)
          .then(function () {
            done();
          })
          .catch(function (err) {
            done(err);
          });
      });
    });

    itFrozen('should timeout when file resources are available in reverse mode', function (done) {
      temp.mkdir({}, function (err, dirPath) {
        if (err) return done(err);
        const opts = {
          resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
          reverse: true,
          timeout: 1000
        };
        fs.writeFileSync(opts.resources[0], 'data1');
        fs.writeFileSync(opts.resources[1], 'data2');
        waitOn(opts)
          .then(function () {
            done(new Error('Should not be resolved'));
          })
          .catch(function (err) {
            expect(err).to.be.ok;
            done();
          });
      });
    });
  });

  describe('resource validation (#217, #140, #141)', function () {
    it('should reject a malformed http-get resource promptly, not poll to timeout (#217)', function (done) {
      // http-get:localhost:3000/x -> http:localhost:3000/x (no //): would poll forever before
      const start = Date.now();
      // no timeout option: if this polled instead of failing fast, mocha would time out
      waitOn({ resources: ['http-get:localhost:3000/x'] }, function (err) {
        expect(err).to.be.ok;
        expect(err.message).to.have.string('http-get:localhost:3000/x');
        expect(Date.now() - start).to.be.below(1000);
        done();
      });
    });

    it('should reject tcp:// with a tcp:host:port hint, not poll to timeout (#140)', function (done) {
      waitOn({ resources: ['tcp://127.0.0.1:3000'] }, function (err) {
        expect(err).to.be.ok;
        expect(err.message).to.have.string('tcp://127.0.0.1:3000');
        expect(err.message).to.have.string('tcp:host:port');
        done();
      });
    });

    it('should succeed against a tcp IPv6 listener (#141)', function (done) {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.once('error', done); // surfaces a missing IPv6 loopback rather than hanging
      httpServer.listen(3020, '::1', function () {
        waitOn({ resources: ['tcp:[::1]:3020'], timeout: 2000, tcpTimeout: 500 }, function (err) {
          expect(err).to.not.be.ok;
          done();
        });
      });
    });

    itFrozen('should time out (no TypeError) for a tcp IPv6 with no listener (#141)', function (done) {
      waitOn({ resources: ['tcp:[::1]:3029'], timeout: 800, interval: 100, tcpTimeout: 200, window: 100 }, function (err) {
        expect(err).to.be.ok;
        expect(err.message).to.have.string('Timed out');
        done();
      });
    });
  });

  // command: resource (#87, #15, #71). These are real-timer polling tests using short
  // interval/timeout and node child processes, as the rest of the suite does; none depend
  // on the wall-clock date, so no clock freezing is needed.
  describe('command (#87, #15, #71)', function () {
    this.timeout(10000);

    it('succeeds when the command exits 0', function (done) {
      waitOn({ resources: ['command:node -e "process.exit(0)"'], timeout: 2000, interval: 100 }, function (err) {
        expect(err).to.not.be.ok;
        done();
      });
    });

    it('keeps polling to the global timeout when the command keeps exiting non-zero', function (done) {
      waitOn({ resources: ['command:node -e "process.exit(1)"'], timeout: 600, interval: 100, window: 100 }, function (err) {
        expect(err).to.be.ok;
        expect(err.message).to.have.string('Timed out');
        done();
      });
    });

    it('succeeds once a failing command starts passing after several polls', function (done) {
      temp.mkdir({}, function (err, dirPath) {
        if (err) return done(err);
        const marker = path.resolve(dirPath, 'ready');
        const runner = path.resolve(dirPath, 'check.js');
        // exits non-zero until the marker file appears, then 0
        fs.writeFileSync(
          runner,
          "const fs = require('fs');\nprocess.exit(fs.existsSync(process.argv[2]) ? 0 : 1);\n"
        );
        setTimeout(function () {
          fs.writeFileSync(marker, 'ok');
        }, 350);
        waitOn({ resources: [`command:node ${runner} ${marker}`], timeout: 4000, interval: 100 }, function (err) {
          expect(err).to.not.be.ok;
          done();
        });
      });
    });

    it('never runs a slow command concurrently with itself', function (done) {
      temp.mkdir({}, function (err, dirPath) {
        if (err) return done(err);
        const marker = path.resolve(dirPath, 'ready');
        const counter = path.resolve(dirPath, 'concurrent.json');
        const runner = path.resolve(dirPath, 'slow.js');
        // Each run bumps a shared counter, stays alive past the poll interval, then
        // decrements and exits (non-zero until the marker appears). If two runs ever
        // overlapped, `max` would exceed 1.
        fs.writeFileSync(
          runner,
          [
            "const fs = require('fs');",
            "const [counter, marker] = process.argv.slice(2);",
            "const s = fs.existsSync(counter) ? JSON.parse(fs.readFileSync(counter, 'utf8')) : { cur: 0, max: 0 };",
            "s.cur += 1;",
            "s.max = Math.max(s.max, s.cur);",
            "fs.writeFileSync(counter, JSON.stringify(s));",
            "setTimeout(function () {",
            "  const t = JSON.parse(fs.readFileSync(counter, 'utf8'));",
            "  t.cur -= 1;",
            "  fs.writeFileSync(counter, JSON.stringify(t));",
            "  process.exit(fs.existsSync(marker) ? 0 : 1);",
            "}, 250);",
            ""
          ].join('\n')
        );
        setTimeout(function () {
          fs.writeFileSync(marker, 'ok');
        }, 700);
        waitOn(
          { resources: [`command:node ${runner} ${counter} ${marker}`], timeout: 5000, interval: 100 },
          function (err) {
            expect(err).to.not.be.ok;
            const state = JSON.parse(fs.readFileSync(counter, 'utf8'));
            expect(state.max).to.equal(1);
            done();
          }
        );
      });
    });

    it('kills a command that exceeds commandTimeout and keeps polling', function (done) {
      temp.mkdir({}, function (err, dirPath) {
        if (err) return done(err);
        const marker = path.resolve(dirPath, 'ready');
        const runner = path.resolve(dirPath, 'hang.js');
        // Hangs forever unless the marker exists, in which case it exits 0 immediately.
        // Without a working per-attempt kill the first run would block the poll loop until
        // the global timeout, so reaching success proves the hung run was killed.
        fs.writeFileSync(
          runner,
          [
            "const fs = require('fs');",
            "if (fs.existsSync(process.argv[2])) process.exit(0);",
            "setInterval(function () {}, 1000);",
            ""
          ].join('\n')
        );
        setTimeout(function () {
          fs.writeFileSync(marker, 'ok');
        }, 600);
        waitOn(
          { resources: [`command:node ${runner} ${marker}`], commandTimeout: 200, timeout: 4000, interval: 100 },
          function (err) {
            expect(err).to.not.be.ok;
            done();
          }
        );
      });
    });

    it('in reverse mode, waits until the command starts failing', function (done) {
      temp.mkdir({}, function (err, dirPath) {
        if (err) return done(err);
        const marker = path.resolve(dirPath, 'present');
        const runner = path.resolve(dirPath, 'check.js');
        // passes (exit 0) while the marker exists; reverse mode resolves once it fails
        fs.writeFileSync(
          runner,
          "const fs = require('fs');\nprocess.exit(fs.existsSync(process.argv[2]) ? 0 : 1);\n"
        );
        fs.writeFileSync(marker, 'ok');
        setTimeout(function () {
          fs.unlinkSync(marker);
        }, 350);
        waitOn(
          { resources: [`command:node ${runner} ${marker}`], reverse: true, timeout: 4000, interval: 100 },
          function (err) {
            expect(err).to.not.be.ok;
            done();
          }
        );
      });
    });
  });
});
