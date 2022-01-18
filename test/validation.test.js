'use strict';

const waitOn = require('../lib/wait-on');
const childProcess = require('child_process');

const { itConcurrent } = require('./helpers');

function execCLI(args, options) {
  return childProcess.exec('../bin/wait-on', args, options);
}

describe('validation', function () {
  describe('API', function () {
    itConcurrent('should callback with error when resources property is omitted', function (done) {
      const opts = {};
      waitOn(opts, function (err) {
        expect(err).toBeDefined();
        done();
      });
    });

    itConcurrent('should callback with error when no resources are provided', function (done) {
      const opts = { resources: [] };
      waitOn(opts, function (err) {
        expect(err.toString()).toEqual(expect.stringContaining('"resources" does not contain 1 required value(s)'));
        done();
      });
    });

    itConcurrent('should return error when opts is null', function (done) {
      waitOn(null, function (err) {
        expect(err).toBeDefined();
        done();
      });
    });
  });

  describe('CLI', function () {
    itConcurrent('should exit with non-zero error code when no resources provided', function (done) {
      execCLI([]).on('exit', function (code) {
        expect(code).not.toBe(0);
        done();
      });
    });
  });
});
