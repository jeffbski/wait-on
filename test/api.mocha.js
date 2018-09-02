'use strict';

var waitOn = require('../');
var fs = require('fs');
var http = require('http');
var path = require('path');
var temp = require('temp');

var mocha = require('mocha');
var describe = mocha.describe;
var it = mocha.it;
var afterEach = mocha.afterEach;
var expect = require('expect');

temp.track(); // cleanup files on exit

describe('api', function () {
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
      waitOn(opts, function (err) {
        expect(err).toNotExist();
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

      waitOn(opts, function (err) {
        expect(err).toNotExist();
        done();
      });
    });
  });

  it('should succeed when http resources are become available later', function (done) {
    var opts = {
      resources: [
        'http://localhost:3000',
        'http://localhost:3000/foo'
      ]
    };

    setTimeout(function () {
      httpServer = http.createServer()
          .on('request', function (req, res) {
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
    var opts = {
      resources: [
        'http-get://localhost:3011',
        'http-get://localhost:3011/foo'
      ]
    };

    setTimeout(function () {
      httpServer = http.createServer()
          .on('request', function (req, res) {
            res.end('data');
          });
      httpServer.listen(3011, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).toNotExist();
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

    waitOn(opts, function (err) {
      expect(err).toNotExist();
      done();
    });
  });

  it('should succeed when an https GET resource is available', function (done) {
    var opts = {
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
    var opts = {
      resources: [
        'tcp:localhost:3001',
        'tcp:3001'
      ]
    };

    setTimeout(function () {
      httpServer = http.createServer()
          .on('request', function (req, res) {
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

      waitOn(opts, function (err) {
        expect(err).toNotExist();
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

      waitOn(opts, function (err) {
        expect(err).toNotExist();
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

      waitOn(opts, function (err) {
        expect(err).toNotExist();
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
      waitOn(opts, function (err) {
        expect(err).toExist();
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
      waitOn(opts, function (err) {
        expect(err).toExist();
        done();
      });
    });
  });

  it('should timeout when an http resource returns 404', function (done) {
    var opts = {
      resources: [
        'http://localhost:3002'
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
      httpServer.listen(3002, 'localhost');
    }, 300);

    waitOn(opts, function (err) {
      expect(err).toExist();
      done();
    });
  });

  it('should timeout when an http resource is not available', function (done) {
    var opts = {
      resources: [
        'http://localhost:3010'
      ],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).toExist();
      done();
    });
  });

  it('should timeout when an http GET resource is not available', function (done) {
    var opts = {
      resources: [
        'http-get://localhost:3010'
      ],
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
    var opts = {
      resources: [
        'https://localhost:3010/foo/bar'
      ],
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
    var opts = {
      resources: [
        'https-get://localhost:3010/foo/bar'
      ],
      timeout: 1000,
      interval: 100,
      window: 100
    };

    waitOn(opts, function (err) {
      expect(err).toExist();
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

    waitOn(opts, function (err) {
      expect(err).toExist();
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

      waitOn(opts, function (err) {
        expect(err).toExist();
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

      waitOn(opts, function (err) {
        expect(err).toExist();
        done();
      });
    });
  });

  it('should timeout when an http service listening to a socket is too slow', function (done) {
    var socketPath;
    temp.mkdir({}, function (err, dirPath) {
      socketPath = path.resolve(dirPath, 'sock');
      var opts = {
        resources: [
          'package.json',
          'http://unix:' + socketPath + ':/',
          'http://unix:' + socketPath + ':/foo'
        ],
        timeout: 1000,
        interval: 100,
        window: 100
      };

      httpServer = http.createServer()
        .on('request', function (req, res) {
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

    it('should succeed when file resources are not available in reverse mode', function (done) {
      temp.mkdir({}, function (err, dirPath) {
        var opts = {
          resources: [
            path.resolve(dirPath, 'foo'),
            path.resolve(dirPath, 'bar')
          ],
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
        var opts = {
          resources: [
            path.resolve(dirPath, 'foo'),
            path.resolve(dirPath, 'bar')
          ],
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
        var opts = {
          resources: [
            path.resolve(dirPath, 'foo'),
            path.resolve(dirPath, 'bar')
          ],
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




});
