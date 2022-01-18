'use strict';

const waitOn = require('../lib/wait-on');
const fs = require('fs');
const http = require('http');
const path = require('path');
const temp = require('temp');
const mkdirp = require('mkdirp');

const { getPort, itConcurrent } = require('./helpers');

temp.track(); // cleanup files on exit

describe('api', function () {
  itConcurrent('should succeed when file resources are available', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar/deeper/deep/yet')]
      };
      fs.writeFileSync(opts.resources[0], 'data1');
      mkdirp.sync(path.dirname(opts.resources[1]));
      fs.writeFileSync(opts.resources[1], 'data2');
      waitOn(opts, function (err) {
        expect(err).toBeUndefined();
        done();
      });
    });
  });

  itConcurrent('should succeed when file resources are become available later', function (done) {
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
        expect(err).toBeUndefined();
        done();
      });
    });
  });

  itConcurrent('should succeed when http resources are become available later', function (done) {
    const port = getPort();
    let httpServer;

    const opts = {
      resources: [`http://localhost:${port}`, `http://localhost:${port}/foo`]
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.listen(port, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).toBeUndefined();
      httpServer.close();
      done();
    });
  });

  itConcurrent('should succeed when custom validateStatus fn is provided http resource returns 401', function (done) {
    const port = getPort();
    let httpServer;

    const opts = {
      resources: [`http://localhost:${port}`],
      validateStatus: function (status) {
        return status === 401 || (status >= 200 && status < 300);
      }
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.statusCode = 401;
        res.end('Not authorized');
      });
      httpServer.listen(port, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).toBeUndefined();
      httpServer.close();
      done();
    });
  });

  itConcurrent('should succeed when http resource become available later via redirect', function (done) {
    const port = getPort();
    let httpServer;

    const opts = {
      // followRedirect: true // default is true
      resources: [`http://localhost:${port}`]
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        const pathname = req.url;
        if (pathname === '/') {
          res.writeHead(302, { Location: `http://localhost:${port}/foo` });
        }
        res.end('data');
      });
      httpServer.listen(port, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).toBeUndefined();
      httpServer.close();
      done();
    });
  });

  itConcurrent('should succeed when http GET resources become available later', function (done) {
    const port = getPort();
    let httpServer;

    const opts = {
      resources: [`http-get://localhost:${port}`, `http-get://localhost:${port}/foo`]
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.listen(port, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).toBeUndefined();
      httpServer.close();
      done();
    });
  });

  itConcurrent('should succeed when http GET resource become available later via redirect', function (done) {
    const port = getPort();
    let httpServer;

    const opts = {
      // followRedirect: true, // default is true
      resources: [`http-get://localhost:${port}`]
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        const pathname = req.url;
        if (pathname === '/') {
          res.writeHead(302, { Location: `http://localhost:${port}/foo` });
        }
        res.end('data');
      });
      httpServer.listen(port, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).toBeUndefined();
      httpServer.close();
      done();
    });
  });

  /*
  itConcurrent('should succeed when an https resource is available', function (done) {
    const opts = {
      resources: [
        'https://www.google.com'
      ]
    };

    waitOn(opts, function (err) {
      expect(err).toBeUndefined();
      done();
    });
  });

  itConcurrent('should succeed when an https GET resource is available', function (done) {
    const opts = {
      resources: [
        'https-get://www.google.com'
      ]
    };

    waitOn(opts, function (err) {
      expect(err).toBeUndefined();
      done();
    });
  });
  */

  itConcurrent('should succeed when a service is listening to tcp port', function (done) {
    const port = getPort();
    let httpServer;

    const opts = {
      resources: [`tcp:localhost:${port}`, `tcp:${port}`]
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.listen(port, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).toBeUndefined();
      httpServer.close();
      done();
    });
  });

  itConcurrent('should succeed when a service is listening to a socket', function (done) {
    let httpServer;
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = path.resolve(dirPath, 'sock');
      const opts = {
        resources: ['socket:' + socketPath]
      };

      setTimeout(function () {
        httpServer = http.createServer();
        httpServer.listen(socketPath);
      }, 300);

      waitOn(opts, function (err) {
        expect(err).toBeUndefined();
        httpServer.close();
        done();
      });
    });
  });

  itConcurrent('should succeed when a http service is listening to a socket', function (done) {
    let httpServer;
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = path.resolve(dirPath, 'sock');
      const opts = {
        resources: ['http://unix:' + socketPath + ':/', 'http://unix:' + socketPath + ':/foo']
      };

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(socketPath);
      }, 300);

      waitOn(opts, function (err) {
        expect(err).toBeUndefined();
        httpServer.close();
        done();
      });
    });
  });

  itConcurrent('should succeed when a http GET service is listening to a socket', function (done) {
    let httpServer;
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = path.resolve(dirPath, 'sock');
      const opts = {
        resources: ['http-get://unix:' + socketPath + ':/', 'http-get://unix:' + socketPath + ':/foo']
      };

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(socketPath);
      }, 300);

      waitOn(opts, function (err) {
        expect(err).toBeUndefined();
        httpServer.close();
        done();
      });
    });
  });

  // Error situations

  itConcurrent('should timeout when all resources are not available and timout option is specified', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo')],
        timeout: 1000
      };
      waitOn(opts, function (err) {
        expect(err).toBeDefined();
        done();
      });
    });
  });

  itConcurrent('should timeout when some resources are not available and timout option is specified', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
        timeout: 1000
      };
      fs.writeFile(opts.resources[0], 'data', function () {});
      waitOn(opts, function (err) {
        expect(err).toBeDefined();
        done();
      });
    });
  });

  itConcurrent('should timeout when an http resource returns 404', function (done) {
    const port = getPort();
    let httpServer;

    const opts = {
      resources: [`http://localhost:${port}`],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.statusCode = 404;
        res.end('data');
      });
      httpServer.listen(port, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).toBeDefined();
      httpServer.close();
      done();
    });
  });

  itConcurrent('should timeout when an http resource is not available', function (done) {
    const port = getPort();
    const opts = {
      resources: [`http://localhost:${port}`],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).toBeDefined();
      done();
    });
  });

  itConcurrent('should timeout when an http resource does not respond before httpTimeout', function (done) {
    const port = getPort();
    const opts = {
      resources: [`http://localhost:${port}`],
      timeout: 1000,
      interval: 100,
      window: 100,
      httpTimeout: 70
    };

    const httpServer = http.createServer().on('request', function (req, res) {
      // make it a slow response, longer than the httpTimeout
      setTimeout(function () {
        res.end('data');
      }, 90);
    });
    httpServer.listen(port, 'localhost');

    waitOn(opts, function (err) {
      expect(err).toBeDefined();
      httpServer.close();
      done();
    });
  });

  itConcurrent('should timeout when followRedirect is false and http resource redirects', function (done) {
    const port = getPort();
    const opts = {
      timeout: 1000,
      interval: 100,
      window: 100,
      followRedirect: false,
      resources: [`http://localhost:${port}`]
    };

    const httpServer = http.createServer().on('request', function (req, res) {
      const pathname = req.url;
      if (pathname === '/') {
        res.writeHead(302, { Location: `http://localhost:${port}/foo` });
      }
      res.end('data');
    });
    httpServer.listen(port, 'localhost');

    waitOn(opts, function (err) {
      expect(err).toBeDefined();
      httpServer.close();
      done();
    });
  });

  itConcurrent('should timeout when an http GET resource is not available', function (done) {
    const port = getPort();
    const opts = {
      resources: [`http-get://localhost:${port}`],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).toBeDefined();
      done();
    });
  });

  itConcurrent('should timeout when an https resource is not available', function (done) {
    const port = getPort();
    const opts = {
      resources: [`https://localhost:${port}/foo/bar`],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).toBeDefined();
      done();
    });
  });

  itConcurrent('should timeout when an https GET resource is not available', function (done) {
    const port = getPort();
    const opts = {
      resources: [`https-get://localhost:${port}/foo/bar`],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).toBeDefined();
      done();
    });
  });

  itConcurrent('should timeout when followRedirect is false and http GET resource redirects', function (done) {
    const port = getPort();
    const opts = {
      timeout: 1000,
      interval: 100,
      window: 100,
      followRedirect: false,
      resources: [`http-get://localhost:${port}`]
    };

    const httpServer = http.createServer().on('request', function (req, res) {
      const pathname = req.url;
      if (pathname === '/') {
        res.writeHead(302, { Location: `http://localhost:${port}/foo` });
      }
      res.end('data');
    });
    httpServer.listen(port, 'localhost');

    waitOn(opts, function (err) {
      expect(err).toBeDefined();
      httpServer.close();
      done();
    });
  });

  itConcurrent('should timeout when a service is not listening to tcp port', function (done) {
    const port = getPort();
    const opts = {
      resources: [`tcp:localhost:${port}`],
      timeout: 1000
    };

    waitOn(opts, function (err) {
      expect(err).toBeDefined();
      done();
    });
  });

  itConcurrent('should timeout when a service is not listening to a socket', function (done) {
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = path.resolve(dirPath, 'sock');
      const opts = {
        resources: ['socket:' + socketPath],
        timeout: 1000,
        interval: 100,
        window: 100
      };

      waitOn(opts, function (err) {
        expect(err).toBeDefined();
        done();
      });
    });
  });

  itConcurrent('should timeout when a service host is unreachable', function (done) {
    const opts = {
      resources: ['tcp:256.0.0.1:1234'],
      timeout: 1000,
      tcpTimeout: 1000
    };

    waitOn(opts, function (err) {
      expect(err).toBeDefined();
      done();
    });
  });

  itConcurrent('should timeout when an http service listening to a socket returns 404', function (done) {
    let httpServer;
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = path.resolve(dirPath, 'sock');
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
        expect(err).toBeDefined();
        httpServer.close();
        done();
      });
    });
  });

  itConcurrent('should timeout when an http service listening to a socket is too slow', function (done) {
    let httpServer;
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = path.resolve(dirPath, 'sock');
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
        expect(err).toBeDefined();
        httpServer.close();
        done();
      });
    });
  });

  itConcurrent('should succeed when a service host is unreachable in reverse mode', function (done) {
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
      expect(err).toBeUndefined();
      done();
    });
  });

  itConcurrent('should succeed when file resources are not available in reverse mode', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
        reverse: true
      };
      waitOn(opts, function (err) {
        expect(err).toBeUndefined();
        done();
      });
    });
  });

  itConcurrent('should succeed when file resources are not available later in reverse mode', function (done) {
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
        expect(err).toBeUndefined();
        done();
      });
    });
  });

  itConcurrent('should timeout when file resources are available in reverse mode', function (done) {
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
        expect(err).toBeDefined();
        done();
      });
    });
  });

  describe('promise support', function () {
    itConcurrent('should succeed when file resources are available', function (done) {
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

    itConcurrent('should succeed when file resources are become available later', function (done) {
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

    itConcurrent('should timeout when all resources are not available and timout option is specified', function (done) {
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
            expect(err).toBeDefined();
            done();
          });
      });
    });

    itConcurrent('should timeout when some resources are not available and timout option is specified', function (done) {
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
            expect(err).toBeDefined();
            done();
          });
      });
    });

    itConcurrent('should succeed when file resources are not available in reverse mode', function (done) {
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

    itConcurrent('should succeed when file resources are not available later in reverse mode', function (done) {
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

    itConcurrent('should timeout when file resources are available in reverse mode', function (done) {
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
            expect(err).toBeDefined();
            done();
          });
      });
    });
  });
});
