'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var http = require('http');
var path = require('path');
var temp = require('temp');

var mocha = require('mocha');
var describe = mocha.describe;
var it = mocha.it;
var afterEach = mocha.afterEach;
var expect = require('expect');

var CLI_PATH = path.resolve(__dirname, '../bin/wait-on');

temp.track(); // cleanup files on exit

function execCLI(args, options) {
  var fullArgs = [CLI_PATH].concat(args);
  return childProcess.spawn(process.execPath, fullArgs, options);
}

var FAST_OPTS = '-t 1000 -i 100 -w 100'.split(' ');

describe('cli', function () {
  this.timeout(3000);
  var httpServer = null;

  afterEach(function (done) {
    if (httpServer) {
      httpServer.close();
      httpServer = null;
    }
    done();
  });

  it('should succeed when file resources are available', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      var opts = {
        resources: [
          path.resolve(dirPath, 'foo'),
          path.resolve(dirPath, 'bar')
        ]
      };
      fs.writeFileSync(opts.resources[0], 'data1');
      fs.writeFileSync(opts.resources[1], 'data2');

      execCLI(opts.resources.concat(FAST_OPTS), {})
        .on('exit', function (code) {
          expect(code).toBe(0);
          done();
        });
    });
  });

  it('should succeed when file resources are become available later', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      var opts = {
        resources: [
          path.resolve(dirPath, 'foo'),
          path.resolve(dirPath, 'bar')
        ]
      };

      setTimeout(function () {
        fs.writeFile(opts.resources[0], 'data1', function () {});
        fs.writeFile(opts.resources[1], 'data2', function () {});
      }, 300);

      execCLI(opts.resources.concat(FAST_OPTS), {})
        .on('exit', function (code) {
          expect(code).toBe(0);
          done();
        });
    });
  });

  it('should succeed when http resources become available later', function (done) {
    var opts = {
      resources: [
        'http://localhost:8123',
        'http://localhost:8123/foo'
      ]
    };

    setTimeout(function () {
      httpServer = http.createServer()
          .on('request', function (req, res) {
            res.end('data');
          });
      httpServer.listen(8123, 'localhost');
    }, 300);

    execCLI(opts.resources.concat(FAST_OPTS), {})
      .on('exit', function (code) {
        expect(code).toBe(0);
        done();
      });
  });

  it('should succeed when http GET resources become available later', function (done) {
    var opts = {
      resources: [
        'http-get://localhost:8124',
        'http-get://localhost:8124/foo'
      ]
    };

    setTimeout(function () {
      httpServer = http.createServer()
          .on('request', function (req, res) {
            res.end('data');
          });
      httpServer.listen(8124, 'localhost');
    }, 300);

    execCLI(opts.resources.concat(FAST_OPTS), {})
      .on('exit', function (code) {
        expect(code).toBe(0);
        done();
      });
  });

  /*
  it('should succeed when an https resource is available', function (done) {
    var opts = {
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
    var opts = {
      resources: [
        'tcp:localhost:3030',
        'tcp:3030'
      ]
    };

    setTimeout(function () {
      httpServer = http.createServer()
          .on('request', function (req, res) {
            res.end('data');
          });
      httpServer.listen(3030, 'localhost');
    }, 300);

    execCLI(opts.resources.concat(FAST_OPTS), {})
      .on('exit', function (code) {
        expect(code).toBe(0);
        done();
      });
  });

  it('should succeed when a service is listening to a socket', function (done) {
    var socketPath;
    temp.mkdir({}, function (err, dirPath) {
      socketPath = path.resolve(dirPath, 'sock');
      var opts = {
        resources: [
          'socket:'+socketPath
        ]
      };

      setTimeout(function () {
        httpServer = http.createServer();
        httpServer.listen(socketPath);
      }, 300);

      execCLI(opts.resources.concat(FAST_OPTS), {})
        .on('exit', function (code) {
          expect(code).toBe(0);
          done();
        });
    });
  });

  it('should succeed when a http service is listening to a socket', function (done) {
    var socketPath;
    temp.mkdir({}, function (err, dirPath) {
      socketPath = path.resolve(dirPath, 'sock');
      var opts = {
        resources: [
          'http://unix:' + socketPath + ':/',
          'http://unix:' + socketPath + ':/foo'
        ]
      };

      setTimeout(function () {
        httpServer = http.createServer()
          .on('request', function (req, res) {
            res.end('data');
          });
        httpServer.listen(socketPath);
      }, 300);

      execCLI(opts.resources.concat(FAST_OPTS), {})
        .on('exit', function (code) {
          expect(code).toBe(0);
          done();
        });
    });
  });

  it('should succeed when a http GET service is listening to a socket', function (done) {
    var socketPath;
    temp.mkdir({}, function (err, dirPath) {
      socketPath = path.resolve(dirPath, 'sock');
      var opts = {
        resources: [
          'http-get://unix:' + socketPath + ':/',
          'http-get://unix:' + socketPath + ':/foo'
        ]
      };

      setTimeout(function () {
        httpServer = http.createServer()
          .on('request', function (req, res) {
            res.end('data');
          });
        httpServer.listen(socketPath);
      }, 300);

      execCLI(opts.resources.concat(FAST_OPTS), {})
        .on('exit', function (code) {
          expect(code).toBe(0);
          done();
        });
    });
  });

  // Error situations

  it('should timeout when all resources are not available and timout option is specified', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      var opts = {
        resources: [ path.resolve(dirPath, 'foo') ],
        timeout: 1000
      };
      execCLI(opts.resources.concat(FAST_OPTS), {})
        .on('exit', function (code) {
          expect(code).toNotBe(0);
          done();
        });
    });
  });

  it('should timeout when some resources are not available and timout option is specified', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      var opts = {
        resources: [
          path.resolve(dirPath, 'foo'),
          path.resolve(dirPath, 'bar')
        ],
        timeout: 1000
      };
      fs.writeFile(opts.resources[0], 'data', function () {});
      execCLI(opts.resources.concat(FAST_OPTS), {})
        .on('exit', function (code) {
          expect(code).toNotBe(0);
          done();
        });
    });
  });

  it('should timeout when an http resource returns 404', function (done) {
    var opts = {
      resources: [
        'http://localhost:3998'
      ],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    setTimeout(function () {
      httpServer = http.createServer()
        .on('request', function (req, res) {
          res.statusCode = 404;
          res.end('data');
        });
      httpServer.listen(3998, 'localhost');
    }, 300);
    execCLI(opts.resources.concat(FAST_OPTS), {})
      .on('exit', function (code) {
        expect(code).toNotBe(0);
        done();
      });
  });

  it('should timeout when an http resource is not available', function (done) {
    var opts = {
      resources: [
        'http://localhost:3999'
      ],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    execCLI(opts.resources.concat(FAST_OPTS), {})
      .on('exit', function (code) {
        expect(code).toNotBe(0);
        done();
      });
  });

  it('should timeout when an http GET resource is not available', function (done) {
    var opts = {
      resources: [
        'http-get://localhost:3999'
      ],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    execCLI(opts.resources.concat(FAST_OPTS), {})
      .on('exit', function (code) {
        expect(code).toNotBe(0);
        done();
      });
  });

  it('should timeout when an https resource is not available', function (done) {
    var opts = {
      resources: [
        'https://localhost:3010/foo/bar'
      ],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    execCLI(opts.resources.concat(FAST_OPTS), {})
      .on('exit', function (code) {
        expect(code).toNotBe(0);
        done();
      });
  });

  it('should timeout when an https GET resource is not available', function (done) {
    var opts = {
      resources: [
        'https-get://localhost:3010/foo/bar'
      ],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    execCLI(opts.resources.concat(FAST_OPTS), {})
      .on('exit', function (code) {
        expect(code).toNotBe(0);
        done();
      });
  });

  it('should timeout when a service is not listening to tcp port', function (done) {
    var opts = {
      resources: [
        'tcp:localhost:3010'
      ],
      timeout: 1000
    };

    execCLI(opts.resources.concat(FAST_OPTS), {})
      .on('exit', function (code) {
        expect(code).toNotBe(0);
        done();
      });
  });

  it('should timeout when a service is not listening to a socket', function (done) {
    var socketPath;
    temp.mkdir({}, function (err, dirPath) {
      socketPath = path.resolve(dirPath, 'sock');
      var opts = {
        resources: [
          'socket:'+socketPath
        ],
        timeout: 1000,
        interval: 100,
        window: 100
      };

      execCLI(opts.resources.concat(FAST_OPTS), {})
        .on('exit', function (code) {
          expect(code).toNotBe(0);
          done();
        });
    });
  });

  it('should timeout when an http service listening to a socket returns 404', function (done) {
    var socketPath;
    temp.mkdir({}, function (err, dirPath) {
      socketPath = path.resolve(dirPath, 'sock');
      var opts = {
        resources: [
          'http://unix:' + socketPath + ':/',
          'http://unix:' + socketPath + ':/foo'
        ],
        timeout: 1000,
        interval: 100,
        window: 100
      };

      setTimeout(function () {
        httpServer = http.createServer()
          .on('request', function (req, res) {
            res.statusCode = 404;
            res.end('data');
          });
        httpServer.listen(socketPath);
      }, 300);

      execCLI(opts.resources.concat(FAST_OPTS), {})
        .on('exit', function (code) {
          expect(code).toNotBe(0);
          done();
        });
    });
  });


  it('should succeed when file resources are not available in reverse mode', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      var opts = {
        resources: [
          path.resolve(dirPath, 'foo'),
          path.resolve(dirPath, 'bar')
        ],
      };
      var OPTS = FAST_OPTS.concat(['-r']);
      execCLI(opts.resources.concat(OPTS), {})
        .on('exit', function (code) {
          expect(code).toBe(0);
          done();
        });
    });
  });

  it('should succeed when file resources are not available later in reverse mode', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      var opts = {
        resources: [
          path.resolve(dirPath, 'foo'),
          path.resolve(dirPath, 'bar')
        ],
      };
      fs.writeFileSync(opts.resources[0], 'data1');
      fs.writeFileSync(opts.resources[1], 'data2');
      setTimeout(function () {
        fs.unlinkSync(opts.resources[0]);
        fs.unlinkSync(opts.resources[1]);
      }, 300);
      var OPTS = FAST_OPTS.concat(['-r']);
      execCLI(opts.resources.concat(OPTS), {})
        .on('exit', function (code) {
          expect(code).toBe(0);
          done();
        });
    });
  });

  it('should timeout when file resources are available in reverse mode', function (done) {
    temp.mkdir({}, function (err, dirPath) {
      var opts = {
        resources: [
          path.resolve(dirPath, 'foo'),
          path.resolve(dirPath, 'bar')
        ],
      };
      fs.writeFileSync(opts.resources[0], 'data1');
      fs.writeFileSync(opts.resources[1], 'data2');
      var OPTS = FAST_OPTS.concat(['-r']);
      execCLI(opts.resources.concat(OPTS), {})
        .on('exit', function (code) {
          expect(code).toNotBe(0);
          done();
        });
    });
  });

});
