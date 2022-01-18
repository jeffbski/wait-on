'use strict';

const waitOn = require('../lib/wait-on');
const childProcess = require('child_process');

function execCLI(args, options) {
  return childProcess.exec('../bin/wait-on', args, options);
}

describe('validation', function () {
  describe('API', function () {
    it('should callback with error when resources property is omitted', function (done) {
      const opts = {};
      waitOn(opts, function (err) {
        expect(err).toBeDefined();
        done();
      });
    });

    it('should callback with error when no resources are provided', function (done) {
      const opts = { resources: [] };
      waitOn(opts, function (err) {
        expect(err.toString()).toEqual(expect.stringContaining('"resources" does not contain 1 required value(s)'));
        done();
      });
    });

    it('should return error when opts is null', function (done) {
      waitOn(null, function (err) {
        expect(err).toBeDefined();
        done();
      });
    });
  });

  describe('CLI', function () {
    it('should exit with non-zero error code when no resources provided', function (done) {
      execCLI([]).on('exit', function (code) {
        expect(code).not.toBe(0);
        done();
      });
    });
  });
});
