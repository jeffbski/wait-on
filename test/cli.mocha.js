'use strict';

const childProcess = require('child_process');
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

const CLI_PATH = path.resolve(__dirname, '../bin/wait-on');

temp.track(); // cleanup files on exit

function execCLI(args, options) {
  const fullArgs = [CLI_PATH].concat(args);
  return childProcess.spawn(process.execPath, fullArgs, options);
}

const FAST_OPTS = '-t 1000 -i 100 -w 100'.split(' ');

describe('cli', function () {
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
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar/deeper/deep/yet')],
      };
      fs.writeFileSync(opts.resources[0], 'data1');
      mkdirp.sync(path.dirname(opts.resources[1]));
      fs.writeFileSync(opts.resources[1], 'data2');

      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).toBe(0);
        done();
      });
    });
  });

  it('should succeed when file resources are become available later', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar/deeper/deep/yet')],
      };

      setTimeout(function () {
        fs.writeFile(opts.resources[0], 'data1', function () {});
        mkdirp.sync(path.dirname(opts.resources[1]));
        fs.writeFile(opts.resources[1], 'data2', function () {});
      }, 300);

      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).toBe(0);
        done();
      });
    });
  });

  it('should succeed when http resources become available later', function (done) {
    const opts = {
      resources: ['http://localhost:8123', 'http://localhost:8123/foo'],
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.listen(8123, 'localhost');
    }, 300);

    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toBe(0);
      done();
    });
  });

  it('should succeed when http resources become available later via redirect', function (done) {
    const opts = {
      resources: ['http://localhost:8123'],
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        const pathname = req.url;
        if (pathname === '/') {
          res.writeHead(302, { Location: 'http://localhost:8123/foo' });
        }
        res.end('data');
      });
      httpServer.listen(8123, 'localhost');
    }, 300);

    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toBe(0);
      done();
    });
  });

  it('should succeed when http GET resources become available later', function (done) {
    const opts = {
      resources: ['http-get://localhost:8124', 'http-get://localhost:8124/foo'],
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.listen(8124, 'localhost');
    }, 300);

    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toBe(0);
      done();
    });
  });

  it('should succeed when http GET resources become available later via redirect', function (done) {
    const opts = {
      resources: ['http-get://localhost:8124'],
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        const pathname = req.url;
        if (pathname === '/') {
          res.writeHead(302, { Location: 'http://localhost:8124/foo' });
        }
        res.end('data');
      });
      httpServer.listen(8124, 'localhost');
    }, 300);

    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toBe(0);
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

    execCLI(opts.resources.concat(FAST_OPTS), {})
      .on('exit', function (code) {
        expect(code).toBe(0);
        done();
      });
  });
  */

  it('should succeed when a service is listening to tcp port', function (done) {
    const opts = {
      resources: ['tcp:localhost:3030', 'tcp:3030'],
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.listen(3030, 'localhost');
    }, 300);

    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toBe(0);
      done();
    });
  });

  it('should succeed when a service is listening to a socket', function (done) {
    let socketPath;
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      socketPath = path.resolve(dirPath, 'sock');
      const opts = {
        resources: ['socket:' + socketPath],
      };

      setTimeout(function () {
        httpServer = http.createServer();
        httpServer.listen(socketPath);
      }, 300);

      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).toBe(0);
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
        resources: ['http://unix:' + socketPath + ':/', 'http://unix:' + socketPath + ':/foo'],
      };

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(socketPath);
      }, 300);

      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).toBe(0);
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
        resources: ['http-get://unix:' + socketPath + ':/', 'http-get://unix:' + socketPath + ':/foo'],
      };

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(socketPath);
      }, 300);

      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).toBe(0);
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
        timeout: 1000,
      };
      // timeout is in FAST_OPTS
      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).toNotBe(0);
        done();
      });
    });
  });

  it('should timeout when some resources are not available and timout option is specified', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
        timeout: 1000,
      };
      fs.writeFile(opts.resources[0], 'data', function () {});
      // timeout is in FAST_OPTS
      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).toNotBe(0);
        done();
      });
    });
  });

  it('should timeout when an http resource returns 404', function (done) {
    const opts = {
      resources: ['http://localhost:3998'],
      timeout: 1000,
      interval: 100,
      window: 100,
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.statusCode = 404;
        res.end('data');
      });
      httpServer.listen(3998, 'localhost');
    }, 300);
    // timeout, interval, window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toNotBe(0);
      done();
    });
  });

  it('should timeout when an http resource is not available', function (done) {
    const opts = {
      resources: ['http://localhost:3999'],
      timeout: 1000,
      interval: 100,
      window: 100,
    };

    // timeout is in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toNotBe(0);
      done();
    });
  });

  it('should timeout when an http resource does not respond before httpTimeout', function (done) {
    const opts = {
      resources: ['http://localhost:8125'],
      timeout: 1000,
      interval: 100,
      window: 100,
      httpTimeout: 70,
    };

    httpServer = http.createServer().on('request', function (req, res) {
      // make it a slow response, longer than the httpTimeout
      setTimeout(function () {
        res.end('data');
      }, 90);
    });
    httpServer.listen(8125, 'localhost');

    const addOpts = '--httpTimeout 70'.split(' ');
    // timeout, interval, and window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS).concat(addOpts), {}).on('exit', function (code) {
      expect(code).toNotBe(0);
      done();
    });
  });

  it('should timeout when an http GET resource is not available', function (done) {
    const opts = {
      resources: ['http-get://localhost:3999'],
      timeout: 1000,
      interval: 100,
      window: 100,
    };

    // timeout, interval, window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toNotBe(0);
      done();
    });
  });

  it('should timeout when an https resource is not available', function (done) {
    const opts = {
      resources: ['https://localhost:3010/foo/bar'],
      timeout: 1000,
      interval: 100,
      window: 100,
    };

    // timeout, interval, window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toNotBe(0);
      done();
    });
  });

  it('should timeout when an https GET resource is not available', function (done) {
    const opts = {
      resources: ['https-get://localhost:3010/foo/bar'],
      timeout: 1000,
      interval: 100,
      window: 100,
    };

    // timeout, interval, window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toNotBe(0);
      done();
    });
  });

  it('should timeout when a service is not listening to tcp port', function (done) {
    const opts = {
      resources: ['tcp:localhost:3010'],
      timeout: 1000,
    };

    // timeout is in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toNotBe(0);
      done();
    });
  });

  it('should timeout when a service host is unreachable', function (done) {
    const opts = {
      resources: ['tcp:256.0.0.1:1234'],
      timeout: 1000,
      tcpTimeout: 1000,
    };

    const addOpts = '--tcpTimeout 1000'.split(' ');
    // timeout is in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS).concat(addOpts), {}).on('exit', function (code) {
      expect(code).toNotBe(0);
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
        window: 100,
      };

      // timeout, interval, window are in FAST_OPTS
      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).toNotBe(0);
        done();
      });
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
        window: 100,
      };

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.statusCode = 404;
          res.end('data');
        });
        httpServer.listen(socketPath);
      }, 300);

      // timeout, interval, window are in FAST_OPTS
      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).toNotBe(0);
        done();
      });
    });
  });

  it('should succeed when file resources are not available in reverse mode', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
      };
      const OPTS = FAST_OPTS.concat(['-r']);
      execCLI(opts.resources.concat(OPTS), {}).on('exit', function (code) {
        expect(code).toBe(0);
        done();
      });
    });
  });

  it('should succeed when file resources are not available later in reverse mode', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
      };
      fs.writeFileSync(opts.resources[0], 'data1');
      fs.writeFileSync(opts.resources[1], 'data2');
      setTimeout(function () {
        fs.unlinkSync(opts.resources[0]);
        fs.unlinkSync(opts.resources[1]);
      }, 300);
      const OPTS = FAST_OPTS.concat(['-r']);
      execCLI(opts.resources.concat(OPTS), {}).on('exit', function (code) {
        expect(code).toBe(0);
        done();
      });
    });
  });

  it('should timeout when file resources are available in reverse mode', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')],
      };
      fs.writeFileSync(opts.resources[0], 'data1');
      fs.writeFileSync(opts.resources[1], 'data2');
      const OPTS = FAST_OPTS.concat(['-r']);
      execCLI(opts.resources.concat(OPTS), {}).on('exit', function (code) {
        expect(code).toNotBe(0);
        done();
      });
    });
  });

  it('should succeed when a service host is unreachable in reverse mode', function (done) {
    const opts = {
      resources: ['tcp:256.0.0.1:1234'],
      timeout: 1000,
      tcpTimeout: 1000,
    };
    // timeout is in FAST_OPTS
    const OPTS = FAST_OPTS.concat(['-r', '--tcpTimeout', '1000']);
    execCLI(opts.resources.concat(OPTS), {}).on('exit', function (code) {
      expect(code).toBe(0);
      done();
    });
  });

  describe('command', function () {
    describe('normal mode', function () {
      it('should succeed when command passes', function (done) {
        temp.mkdir({}, function (err, dirPath) {
          if (err) return done(err);
          const fileExists1 = path.resolve(dirPath, 'exists1')
          const fileExists2 = path.resolve(dirPath, 'exists2')
          const opts = {
            resources: [
              `command:ls ${fileExists1}`,
              `command:ls ${fileExists2}`
            ],
          };
          fs.writeFileSync(fileExists1, 'data1');
          fs.writeFileSync(fileExists2, 'data2');

          execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
            expect(code).toBe(0);
            done();
          });
        });
      });

      it('should succeed when a command passes later', function (done) {
        temp.mkdir({}, function (err, dirPath) {
          if (err) return done(err);
          const fileWillExist1 = path.resolve(dirPath, 'willexist1')
          const fileWillExist2 = path.resolve(dirPath, 'willexist2')
          const opts = {
            resources: [
              `command:ls ${fileWillExist1}`,
              `command:ls ${fileWillExist2}`
            ],
          };
          setTimeout(function () {
            fs.writeFileSync(fileWillExist1, 'data1');
            fs.writeFileSync(fileWillExist2, 'data2');
          }, 300);

          execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
            expect(code).toBe(0);
            done();
          });
        });
      });

      it('should timeout when command fails', function (done) {
        temp.mkdir({}, function (err, dirPath) {
          if (err) return done(err);
          const notExists = path.resolve(dirPath, 'NOTexists')
          const opts = {
            resources: [
              `command:ls ${notExists}`
            ],
          };

          execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
            expect(code).toNotBe(0);
            done();
          });
        });
      });
    });

    describe('reverse mode', function () {
      const REV_OPTS = FAST_OPTS.concat(['-r']);

      it('should succeed when command fails in reverse mode', function (done) {
        temp.mkdir({}, function (err, dirPath) {
          if (err) return done(err);
          const notExists = path.resolve(dirPath, 'NOTexists')
          const opts = {
            resources: [
              `command:ls ${notExists}`,
            ],
          };

          execCLI(opts.resources.concat(REV_OPTS), {}).on('exit', function (code) {
            expect(code).toBe(0);
            done();
          });
        });
      });

      it('should succeed when command fails later in reverse mode', function (done) {
        temp.mkdir({}, function (err, dirPath) {
          if (err) return done(err);
          const willBeDeleted1 = path.resolve(dirPath, 'deleteme1')
          const willBeDeleted2 = path.resolve(dirPath, 'deleteme2')
          const opts = {
            resources: [
              `command:ls ${willBeDeleted1}`,
              `command:ls ${willBeDeleted2}`
            ],
          };
          fs.writeFileSync(willBeDeleted1, 'data1');
          fs.writeFileSync(willBeDeleted2, 'data2');
          setTimeout(function () {
            fs.unlinkSync(willBeDeleted1);
            fs.unlinkSync(willBeDeleted2);
          }, 300);

          execCLI(opts.resources.concat(REV_OPTS), {}).on('exit', function (code) {
            expect(code).toBe(0);
            done();
          });
        });
      });

      it('should timeout when command passes in reverse mode', function (done) {
        temp.mkdir({}, function (err, dirPath) {
          if (err) return done(err);
          const exists = path.resolve(dirPath, 'exists1')
          const opts = {
            resources: [
              `command:ls ${exists}`
            ],
          };
          fs.writeFileSync(exists, 'data1');
          execCLI(opts.resources.concat(REV_OPTS), {}).on('exit', function (code) {
            expect(code).toNotBe(0);
            done();
          });
        });
      });
    });
  });
});
