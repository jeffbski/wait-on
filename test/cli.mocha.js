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
const chai = require('chai');
const expect = chai.expect;

// Windows has no Unix domain sockets, Node listens on named pipes instead
function socketPathIn(dirPath) {
  return process.platform === 'win32' ? path.join('\\\\?\\pipe', dirPath, 'sock') : path.resolve(dirPath, 'sock');
}

const CLI_PATH = path.resolve(__dirname, '../bin/wait-on');
const { parseArgv } = require(CLI_PATH);

temp.track(); // cleanup files on exit

function execCLI(args, options) {
  const fullArgs = [CLI_PATH].concat(args);
  return childProcess.spawn(process.execPath, fullArgs, options);
}


const FAST_OPTS = '-t 1000 -i 100 -w 100'.split(' '); 
const FAST_OPTS_TIMEOUT_UNIT = '-t 1s -i 100 -w 100'.split(' ');


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
        resources: [path.resolve(dirPath, 'foo'), path.resolve(dirPath, 'bar/deeper/deep/yet')]
      };
      fs.writeFileSync(opts.resources[0], 'data1');
      mkdirp.sync(path.dirname(opts.resources[1]));
      fs.writeFileSync(opts.resources[1], 'data2');

      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).to.equal(0);
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
        expect(code).to.equal(0);
        done();
      });
    });
  });

  it('should succeed when http resources become available later', function (done) {
    const opts = {
      resources: ['http://localhost:8123', 'http://localhost:8123/foo']
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.listen(8123, 'localhost');
    }, 300);

    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).to.equal(0);
      done();
    });
  });

  it('should succeed when http resources become available later via redirect', function (done) {
    const opts = {
      resources: ['http://localhost:8123']
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
      expect(code).to.equal(0);
      done();
    });
  });

  it('should succeed when http GET resources become available later', function (done) {
    const opts = {
      resources: ['http-get://localhost:8124', 'http-get://localhost:8124/foo']
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.listen(8124, 'localhost');
    }, 300);

    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).to.equal(0);
      done();
    });
  });

  it('should succeed when http GET resources become available later via redirect', function (done) {
    const opts = {
      resources: ['http-get://localhost:8124']
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
      expect(code).to.equal(0);
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
        expect(code).to.equal(0);
        done();
      });
  });
  */

  it('should succeed when a service is listening to tcp port', function (done) {
    const opts = {
      resources: ['tcp:localhost:3030', 'tcp:3030']
    };

    setTimeout(function () {
      httpServer = http.createServer().on('request', function (req, res) {
        res.end('data');
      });
      httpServer.listen(3030, 'localhost');
    }, 300);

    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).to.equal(0);
      done();
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

      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).to.equal(0);
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
        resources: ['http://unix:' + socketPath + ':http://localhost/', 'http://unix:' + socketPath + ':http://localhost/foo']
      };

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(socketPath);
      }, 300);

      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).to.equal(0);
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
        resources: ['http-get://unix:' + socketPath + ':http://localhost/', 'http-get://unix:' + socketPath + ':http://localhost/foo']
      };

      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(socketPath);
      }, 300);

      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).to.equal(0);
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
        expect(code).to.not.equal(0);
        done();
      });
    });
  });

  it('should timeout when all resources are not available and timout option is specified with unit', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      if (err) return done(err);
      const opts = {
        resources: [path.resolve(dirPath, 'foo')],
        timeout: '1s'
      };
      // timeout is in FAST_OPTS
      execCLI(opts.resources.concat(FAST_OPTS_TIMEOUT_UNIT), {}).on('exit', function (code) {
        expect(code).to.not.equal(0);
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
        expect(code).to.not.equal(0);
        done();
      });
    });
  });

  it('should timeout when an http resource returns 404', function (done) {
    const opts = {
      resources: ['http://localhost:3998'],
      timeout: 1000,
      interval: 100,
      window: 100
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
      expect(code).to.not.equal(0);
      done();
    });
  });

  it('should timeout when an http resource is not available', function (done) {
    const opts = {
      resources: ['http://localhost:3999'],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    // timeout is in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).to.not.equal(0);
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

    const addOpts = '--httpTimeout 70'.split(' ');
    // timeout, interval, and window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS).concat(addOpts), {}).on('exit', function (code) {
      expect(code).to.not.equal(0);
      done();
    });
  });

  it('should timeout when an http resource does not respond before httpTimeout specified with unit', function (done) {
    const opts = {
      resources: ['http://localhost:8125'],
      timeout: 1000,
      interval: 100,
      window: 100,
      httpTimeout: '70ms'
    };

    httpServer = http.createServer().on('request', function (req, res) {
      // make it a slow response, longer than the httpTimeout
      setTimeout(function () {
        res.end('data');
      }, 90);
    });
    httpServer.listen(8125, 'localhost');

    const addOpts = '--httpTimeout 70ms'.split(' ');
    // timeout, interval, and window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS).concat(addOpts), {}).on('exit', function (code) {
      expect(code).to.not.equal(0);
      done();
    });
  });

  it('should timeout when an http GET resource is not available', function (done) {
    const opts = {
      resources: ['http-get://localhost:3999'],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    // timeout, interval, window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).to.not.equal(0);
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

    // timeout, interval, window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).to.not.equal(0);
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

    // timeout, interval, window are in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
      expect(code).to.not.equal(0);
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
      expect(code).to.not.equal(0);
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
      expect(code).to.not.equal(0);
      done();
    });
  });

  it('should timeout when a service host is unreachable, tcpTimeout specified with unit', function (done) {
    const opts = {
      resources: ['tcp:256.0.0.1:1234'],
      timeout: 1000,
      tcpTimeout: '1s'
    };

    const addOpts = '--tcpTimeout 1s'.split(' ');
    // timeout is in FAST_OPTS
    execCLI(opts.resources.concat(FAST_OPTS).concat(addOpts), {}).on('exit', function (code) {
      expect(code).to.not.equal(0);
      done();
    });
  });

  it('should timeout when a service is not listening to a socket', function (done) {
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

      // timeout, interval, window are in FAST_OPTS
      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).to.not.equal(0);
        done();
      });
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

      // timeout, interval, window are in FAST_OPTS
      execCLI(opts.resources.concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).to.not.equal(0);
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
        expect(code).to.equal(0);
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
        expect(code).to.equal(0);
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
        expect(code).to.not.equal(0);
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
      expect(code).to.equal(0);
      done();
    });
  });

  context('resources are specified in config', () => {
    it('should succeed when http resources become available later', function (done) {
      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(8123, 'localhost');
      }, 300);

      execCLI(['--config', path.join(__dirname, 'config-http-resources.js')].concat(FAST_OPTS), {}).on(
        'exit',
        function (code) {
          expect(code).to.equal(0);
          done();
        }
      );
    });

    it('should succeed when http resources from command line become available later (ignores config resources)', function (done) {
      setTimeout(function () {
        httpServer = http.createServer().on('request', function (req, res) {
          res.end('data');
        });
        httpServer.listen(3030, 'localhost');
      }, 300);

      execCLI(
        ['--config', path.join(__dirname, 'config-http-resources.js'), 'http://localhost:3030/'].concat(FAST_OPTS),
        {}
      ).on('exit', function (code) {
        expect(code).to.equal(0);
        done();
      });
    });
  });

  context('resource validation', () => {
    it('should exit non-zero and name the bad resource for a malformed resource (#140)', function (done) {
      let stderr = '';
      const child = execCLI(['tcp://127.0.0.1:3000'].concat(FAST_OPTS), {});
      child.stderr.on('data', function (data) {
        stderr += data.toString();
      });
      child.on('exit', function (code) {
        expect(code).to.not.equal(0);
        expect(stderr).to.have.string('tcp://127.0.0.1:3000');
        done();
      });
    });
  });

  context('argument parsing', () => {
    it('should ignore an unknown flag instead of erroring (non-strict parseArgs)', function (done) {
      temp.mkdir({}, function (err, dirPath) {
        if (err) return done(err);
        const resource = path.resolve(dirPath, 'foo');
        fs.writeFileSync(resource, 'data');
        // unknown flag placed last so it does not consume the resource as its value
        execCLI([resource].concat(FAST_OPTS).concat(['--bogus']), {}).on('exit', function (code) {
          expect(code).to.equal(0);
          done();
        });
      });
    });
  });

  context('http headers (-H/--header)', () => {
    it('sends a single -H header to the server', function (done) {
      let received = null;
      httpServer = http.createServer().on('request', function (req, res) {
        received = req.headers;
        res.end('data');
      });
      httpServer.listen(8130, 'localhost', function () {
        execCLI(['http://localhost:8130', '-H', 'X-Test: 1'].concat(FAST_OPTS), {}).on('exit', function (code) {
          expect(code).to.equal(0);
          expect(received).to.have.property('x-test', '1');
          done();
        });
      });
    });

    it('sends two -H headers to the server', function (done) {
      let received = null;
      httpServer = http.createServer().on('request', function (req, res) {
        received = req.headers;
        res.end('data');
      });
      httpServer.listen(8131, 'localhost', function () {
        execCLI(['http://localhost:8131', '-H', 'X-One: a', '-H', 'X-Two: b'].concat(FAST_OPTS), {}).on(
          'exit',
          function (code) {
            expect(code).to.equal(0);
            expect(received).to.have.property('x-one', 'a');
            expect(received).to.have.property('x-two', 'b');
            done();
          }
        );
      });
    });

    it('splits a header value only at the first colon', function (done) {
      let received = null;
      httpServer = http.createServer().on('request', function (req, res) {
        received = req.headers;
        res.end('data');
      });
      httpServer.listen(8132, 'localhost', function () {
        execCLI(['http://localhost:8132', '-H', 'X-Time: 12:34:56'].concat(FAST_OPTS), {}).on('exit', function (code) {
          expect(code).to.equal(0);
          expect(received).to.have.property('x-time', '12:34:56');
          done();
        });
      });
    });

    it('exits non-zero with a message for a malformed header (no colon)', function (done) {
      let stderr = '';
      // no server needed: the malformed header is rejected before any request
      const child = execCLI(['http://localhost:8133', '-H', 'BadHeader'].concat(FAST_OPTS), {});
      child.stderr.on('data', function (data) {
        stderr += data.toString();
      });
      child.on('exit', function (code) {
        expect(code).to.not.equal(0);
        expect(stderr).to.have.string('BadHeader');
        done();
      });
    });

    it('merges CLI headers with config-file headers, CLI winning on a conflict', function (done) {
      let received = null;
      httpServer = http.createServer().on('request', function (req, res) {
        received = req.headers;
        res.end('data');
      });
      httpServer.listen(8134, 'localhost', function () {
        execCLI(
          ['--config', path.join(__dirname, 'config-headers.js'), 'http://localhost:8134', '-H', 'x-both: from-cli'].concat(
            FAST_OPTS
          ),
          {}
        ).on('exit', function (code) {
          expect(code).to.equal(0);
          expect(received).to.have.property('x-config', 'config-only');
          expect(received).to.have.property('x-both', 'from-cli');
          done();
        });
      });
    });
  });

  describe('command (#87, #15, #71)', function () {
    // node is used instead of a shell builtin so these run identically on every OS in CI
    const PASS = 'command:node -e "process.exit(0)"';
    const FAIL = 'command:node -e "process.exit(1)"';

    it('exits 0 when the command exits 0', function (done) {
      execCLI([PASS].concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).to.equal(0);
        done();
      });
    });

    it('exits 0 when a command starts passing later', function (done) {
      temp.mkdir({}, function (err, dirPath) {
        if (err) return done(err);
        const marker = path.resolve(dirPath, 'ready');
        setTimeout(function () {
          fs.writeFileSync(marker, 'ok');
        }, 300);
        // exits non-zero until the marker file appears, then 0
        const cmd = `command:node -e "process.exit(require('fs').existsSync(process.argv[1]) ? 0 : 1)" ${marker}`;
        execCLI([cmd].concat(FAST_OPTS), {}).on('exit', function (code) {
          expect(code).to.equal(0);
          done();
        });
      });
    });

    it('exits non-zero (times out) when the command never passes', function (done) {
      execCLI([FAIL].concat(FAST_OPTS), {}).on('exit', function (code) {
        expect(code).to.not.equal(0);
        done();
      });
    });

    describe('reverse mode', function () {
      const REV_OPTS = FAST_OPTS.concat(['-r']);

      it('exits 0 when the command exits non-zero', function (done) {
        execCLI([FAIL].concat(REV_OPTS), {}).on('exit', function (code) {
          expect(code).to.equal(0);
          done();
        });
      });

      it('exits non-zero (times out) when the command keeps passing', function (done) {
        execCLI([PASS].concat(REV_OPTS), {}).on('exit', function (code) {
          expect(code).to.not.equal(0);
          done();
        });
      });
    });
  });
});

describe('cli parseArgv', function () {
  const RES = 'tcp:3000';

  // Every documented flag in bin/usage.txt maps to the same option minimist produced.
  const table = [
    { args: ['-c', 'cfg.js'], key: 'config', value: 'cfg.js' },
    { args: ['--config', 'cfg.js'], key: 'config', value: 'cfg.js' },
    { args: ['-d', '10'], key: 'delay', value: '10' },
    { args: ['--delay', '10'], key: 'delay', value: '10' },
    { args: ['-i', '100'], key: 'interval', value: '100' },
    { args: ['--interval', '100'], key: 'interval', value: '100' },
    { args: ['-s', '1'], key: 'simultaneous', value: '1' },
    { args: ['--simultaneous', '1'], key: 'simultaneous', value: '1' },
    { args: ['-t', '5000'], key: 'timeout', value: '5000' },
    { args: ['--timeout', '5000'], key: 'timeout', value: '5000' },
    { args: ['-w', '750'], key: 'window', value: '750' },
    { args: ['--window', '750'], key: 'window', value: '750' },
    { args: ['--httpTimeout', '70ms'], key: 'httpTimeout', value: '70ms' },
    { args: ['--tcpTimeout', '300'], key: 'tcpTimeout', value: '300' },
    { args: ['-l'], key: 'log', value: true },
    { args: ['--log'], key: 'log', value: true },
    { args: ['-r'], key: 'reverse', value: true },
    { args: ['--reverse'], key: 'reverse', value: true },
    { args: ['-v'], key: 'verbose', value: true },
    { args: ['--verbose'], key: 'verbose', value: true },
    { args: ['-h'], key: 'help', value: true },
    { args: ['--help'], key: 'help', value: true }
  ];

  table.forEach(function (row) {
    it('parses `' + row.args.join(' ') + '` to ' + row.key + '=' + row.value, function () {
      const parsed = parseArgv(row.args.concat([RES]));
      expect(parsed.argv[row.key]).to.equal(row.value);
      expect(parsed.resources).to.deep.equal([RES]);
    });
  });

  it('ignores an unknown flag rather than throwing', function () {
    expect(function () {
      parseArgv([RES, '--totally-unknown']);
    }).to.not.throw();
    expect(parseArgv([RES, '--totally-unknown']).resources).to.deep.equal([RES]);
  });

  it('treats the argument after an unknown --flag as its value, not a resource', function () {
    const parsed = parseArgv(['--unknown', 'val', RES]);
    expect(parsed.argv.unknown).to.equal('val');
    expect(parsed.resources).to.deep.equal([RES]);
  });

  it('maps --no-<x> boolean forms to <x>: false', function () {
    const parsed = parseArgv(['--no-verbose', RES]);
    expect(parsed.argv.verbose).to.equal(false);
    expect(parsed.argv).to.not.have.property('no-verbose');
    expect(parsed.resources).to.deep.equal([RES]);
  });

  it('collects multiple positionals as resources', function () {
    const parsed = parseArgv(['file:a', 'file:b', '-l']);
    expect(parsed.resources).to.deep.equal(['file:a', 'file:b']);
  });
});

describe('cli parseHeaders', function () {
  const { parseHeaders } = require(CLI_PATH);

  it('parses "Name: value" into an object with a trimmed name and value', function () {
    expect(parseHeaders(['X-Test: 1'])).to.deep.equal({ 'X-Test': '1' });
  });

  it('collects multiple headers', function () {
    expect(parseHeaders(['X-One: a', 'X-Two: b'])).to.deep.equal({ 'X-One': 'a', 'X-Two': 'b' });
  });

  it('splits only at the first colon so values may contain colons', function () {
    expect(parseHeaders(['X-Time: 12:34:56'])).to.deep.equal({ 'X-Time': '12:34:56' });
  });

  it('throws, naming the entry, for a header with no colon', function () {
    expect(function () {
      parseHeaders(['BadHeader']);
    }).to.throw(/BadHeader/);
  });

  it('throws for a header with an empty name', function () {
    expect(function () {
      parseHeaders([': value']);
    }).to.throw();
  });
});
