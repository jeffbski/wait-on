'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const temp = require('temp');
const mkdirp = require('mkdirp');

const { getPort } = require('./helpers');

const CLI_PATH = path.resolve(__dirname, '../bin/wait-on');

temp.track(); // cleanup files on exit

function execCLI(args, options) {
  const fullArgs = [CLI_PATH].concat(args);
  return childProcess.spawn(process.execPath, fullArgs, options);
}

const FAST_OPTS = '-t 1000 -i 100 -w 100'.split(' ');

describe('cli', function () {
  it('should succeed when file resources are available', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar/deeper/deep/yet')]
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
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar/deeper/deep/yet')]
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

    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toBe(0);
      httpServer.close();
      done();
    });
  });

  it('should succeed when http resources become available later via redirect', function (done) {
    const port = getPort();
    let httpServer;

    const opts = {
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

    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toBe(0);
      httpServer.close();
      done();
    });
  });

  it('should succeed when http GET resources become available later', function (done) {
    const port = getPort();
    let httpServer;

    const opts = {
      resources: [`http-get://localhost:${port}`, `http-get://localhost:${port}/foo`],
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.listen(port, 'localhost');
    }, 300);

    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toBe(0);
      httpServer.close();
      done();
    });
  });

  it('should succeed when http GET resources become available later via redirect', function (done) {
    const port = getPort();
    let httpServer;

    const opts = {
      resources: [`http-get://localhost:${port}`],
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

    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toBe(0);
      httpServer.close();
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

    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).toBe(0);
      httpServer.close();
      done();
    });
  });

  it('should succeed when a service is listening to a socket', function (done) {
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

      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).toBe(0);
        httpServer.close();
        done();
      });
    });
  });

  it('should succeed when a http service is listening to a socket', function (done) {
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

      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).toBe(0);
        httpServer.close();
        done();
      });
    });
  });

  it('should succeed when a http GET service is listening to a socket', function (done) {
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

      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).toBe(0);
        httpServer.close();
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
      // timeout is in FAST_OPTS
      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).not.toBe(0);
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
      // timeout is in FAST_OPTS
      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).not.toBe(0);
        done();
      });
    });
  });

  it('should timeout when an http resource returns 404', function (done) {
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
    // timeout, interval, window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).not.toBe(0);
      httpServer.close();
      done();
    });
  });

  it('should timeout when an http resource is not available', function (done) {
    const port = getPort();
    const opts = {
      resources: [`http://localhost:${port}`],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    // timeout is in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).not.toBe(0);
      done();
    });
  });

  it('should timeout when an http resource does not respond before httpTimeout', function (done) {
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

    const addOpts = '--httpTimeout 70'.split(' ');
    // timeout, interval, and window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS).concat(addOpts), {}).on('exit', function (code) {
      expect(code).not.toBe(0);
      httpServer.close();
      done();
    });
  });

  it('should timeout when an http GET resource is not available', function (done) {
    const port = getPort();
    const opts = {
      resources: [`http-get://localhost:${port}`],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    // timeout, interval, window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).not.toBe(0);
      done();
    });
  });

  it('should timeout when an https resource is not available', function (done) {
    const port = getPort();
    const opts = {
      resources: [`https://localhost:${port}/foo/bar`],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    // timeout, interval, window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).not.toBe(0);
      done();
    });
  });

  it('should timeout when an https GET resource is not available', function (done) {
    const port = getPort();
    const opts = {
      resources: [`https-get://localhost:${port}/foo/bar`],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    // timeout, interval, window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).not.toBe(0);
      done();
    });
  });

  it('should timeout when a service is not listening to tcp port', function (done) {
    const opts = {
      resources: ['tcp:localhost:3010'],
      timeout: 1000
    };

    // timeout is in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).not.toBe(0);
      done();
    });
  });

  it('should timeout when a service host is unreachable', function (done) {
    const opts = {
      resources: ['tcp:256.0.0.1:1234'],
      timeout: 1000,
      tcpTimeout: 1000
    };

    const addOpts = '--tcpTimeout 1000'.split(' ');
    // timeout is in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS).concat(addOpts), {}).on('exit', function (code) {
      expect(code).not.toBe(0);
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

      // timeout, interval, window are in FAST_OPTS
      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).not.toBe(0);
        done();
      });
    });
  });

  it('should timeout when an http service listening to a socket returns 404', function (done) {
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

      // timeout, interval, window are in FAST_OPTS
      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).not.toBe(0);
        httpServer.close();
        done();
      });
    });
  });

  it('should succeed when file resources are not available in reverse mode', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')]
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
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')]
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
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar')]
      };
      fs.writeFileSync(opts.resources[0], 'data1');
      fs.writeFileSync(opts.resources[1], 'data2');
      const OPTS = FAST_OPTS.concat(['-r']);
      execCLI(opts.resources.concat(OPTS), {}).on('exit', function (code) {
        expect(code).not.toBe(0);
        done();
      });
    });
  });

  it('should succeed when a service host is unreachable in reverse mode', function (done) {
    const opts = {
      resources: ['tcp:256.0.0.1:1234'],
      timeout: 1000,
      tcpTimeout: 1000
    };
    // timeout is in FAST_OPTS
    const OPTS = FAST_OPTS.concat(['-r', '--tcpTimeout', '1000']);
    execCLI(opts.resources.concat(OPTS), {}).on('exit', function (code) {
      expect(code).toBe(0);
      done();
    });
  });

  describe('resources are specified in config', () => {
    it('should succeed when http resources become available later', function (done) {
      let httpServer;

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(8123, 'localhost');
      }, 300);

      execCLI(['--config', path.join(__dirname, 'config-http-resources.js')].concat(FAST_OPTS), {}).on(
        'exit',
        function (code) {
          expect(code).toBe(0);
          httpServer.close();
          done();
        }
      );
    });

    it('should succeed when http resources from command line become available later (ignores config resources)', function (done) {
      const port = getPort();
      let httpServer;

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(port, 'localhost');
      }, 300);

      execCLI(
        ['--config', path.join(__dirname, 'config-http-resources.js'), `http://localhost:${port}/`].concat(FAST_OPTS),
        {}
      ).on('exit', function (code) {
        expect(code).toBe(0);
        httpServer.close();
        done();
      });
    });
  });
});
