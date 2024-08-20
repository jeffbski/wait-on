'use strict';

const waitOn = require('../');
const fs = require('fs');
const http = require('http');
const path = require('path');
const temp = require('temp');
const mkdirp = require('mkdirp');

const mocha = require('mocha');
const describe = mocha.describe;
const it = mocha.it;
const afterEach = mocha.afterEach;
const expect = require('expect-legacy');

temp.track(); // cleanup files on exit

describe('api', function () {
  this.timeout(3000);
  let httpServer = null;

  afterEach(function (done) {
    if (httpServer) {
      httpServer.close();
      httpServer = null;
    }
    done();
  });

  it('should succeed when file resources are available', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar/deeper/deep/yet')]
      };
      fs.writeFileSync(opts.resources[0], 'data1');
      mkdirp.sync(path.dirname(opts.resources[1]));
      fs.writeFileSync(opts.resources[1], 'data2');
      waitOn(opts, function (err) {
        expect(err).toNotExist();
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
        expect(err).toNotExist();
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
      expect(err).toNotExist();
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
      expect(err).toNotExist();
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
      expect(err).toNotExist();
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
      expect(err).toNotExist();
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
      expect(err).toNotExist();
      done();
    });
  });

  /*
  it('should succeed when an https resource is available', function (done) {
    const opts = {
      resources: [
        'https://www.google.com'
      ]
    };

    waitOn(opts, function (err) {
      expect(err).toNotExist();
      done();
    });
  });

  it('should succeed when an https GET resource is available', function (done) {
    const opts = {
      resources: [
        'https-get://www.google.com'
      ]
    };

    waitOn(opts, function (err) {
      expect(err).toNotExist();
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
      expect(err).toNotExist();
      done();
    });
  });

  it('should succeed when a service is listening to a socket', function (done) {
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
        expect(err).toNotExist();
        done();
      });
    });
  });

  it('should succeed when a http service is listening to a socket', function (done) {
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = path.resolve(dirPath, 'sock');
      const opts = {
        resources: ['http://unix:' + socketPath + ':http://localhost/', 'http://unix:' + socketPath + ':http://localhost/foo']
      };

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(socketPath);
      }, 300);

      waitOn(opts, function (err) {
        expect(err).toNotExist();
        done();
      });
    });
  });

  it('should succeed when a http GET service is listening to a socket', function (done) {
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = path.resolve(dirPath, 'sock');
      const opts = {
        resources: ['http-get://unix:' + socketPath + ':http://localhost/', 'http-get://unix:' + socketPath + ':http://localhost/foo']
      };

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(socketPath);
      }, 300);

      waitOn(opts, function (err) {
        expect(err).toNotExist();
        done();
      });
    });
  });

  // Error situations

  it('should timeout when all resources are not available and timout option is specified', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo')],
        timeout: 1000
      };
      waitOn(opts, function (err) {
        expect(err).toExist();
        done();
      });
    });
  });

  it('should timeout when some resources are not available and timout option is specified', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
        timeout: 1000
      };
      fs.writeFile(opts.resources[0], 'data', function () {});
      waitOn(opts, function (err) {
        expect(err).toExist();
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
      expect(err).toExist();
      done();
    });
  });

  it('should timeout when an http resource is not available', function (done) {
    const opts = {
      resources: ['http://localhost:3010'],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).toExist();
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
      expect(err).toExist();
      done();
    });
  });

  it('should timeout when followRedirect is false and http resource redirects', function (done) {
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
      expect(err).toExist();
      done();
    });
  });

  it('should timeout when an http GET resource is not available', function (done) {
    const opts = {
      resources: ['http-get://localhost:3010'],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).toExist();
      done();
    });
  });

  it('should timeout when an https resource is not available', function (done) {
    const opts = {
      resources: ['https://localhost:3010/foo/bar'],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).toExist();
      done();
    });
  });

  it('should timeout when an https GET resource is not available', function (done) {
    const opts = {
      resources: ['https-get://localhost:3010/foo/bar'],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).toExist();
      done();
    });
  });

  it('should timeout when followRedirect is false and http GET resource redirects', function (done) {
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
      expect(err).toExist();
      done();
    });
  });

  it('should timeout when a service is not listening to tcp port', function (done) {
    const opts = {
      resources: ['tcp:localhost:3010'],
      timeout: 1000
    };

    waitOn(opts, function (err) {
      expect(err).toExist();
      done();
    });
  });

  it('should timeout when a service is not listening to a socket', function (done) {
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
        expect(err).toExist();
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
      expect(err).toExist();
      done();
    });
  });

  it('should timeout when an http service listening to a socket returns 404', function (done) {
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
        expect(err).toExist();
        done();
      });
    });
  });

  it('should timeout when an http service listening to a socket is too slow', function (done) {
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
        expect(err).toExist();
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
      expect(err).toNotExist();
      done();
    });
  });

  it('should succeed when file resources are not available in reverse mode', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
        reverse: true
      };
      waitOn(opts, function (err) {
        expect(err).toNotExist();
        done();
      });
    });
  });

  it('should succeed when file resources are not available later in reverse mode', function (done) {
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
        expect(err).toNotExist();
        done();
      });
    });
  });

  it('should timeout when file resources are available in reverse mode', function (done) {
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
        expect(err).toExist();
        done();
      });
    });
  });

  describe('promise support', function () {
    it('should succeed when file resources are available', function (done) {
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

    it('should timeout when all resources are not available and timout option is specified', function (done) {
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
            expect(err).toExist();
            done();
          });
      });
    });

    it('should timeout when some resources are not available and timout option is specified', function (done) {
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
            expect(err).toExist();
            done();
          });
      });
    });

    it('should succeed when file resources are not available in reverse mode', function (done) {
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

    it('should timeout when file resources are available in reverse mode', function (done) {
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
            expect(err).toExist();
            done();
          });
      });
    });
  });
});
