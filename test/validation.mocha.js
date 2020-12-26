'use strict';

const waitOn = require('../');
const childProcess = require('child_process');

const mocha = require('mocha');
const describe = mocha.describe;
const it = mocha.it;
const expect = require('expect-legacy');

function execCLI(args, options) {
  return childProcess.exec('../bin/wait-on', args, options);
}

describe('validation', function () {
  describe('API', function () {
    it('should callback with error when resources property is omitted', function (done) {
      const opts = {};
      waitOn(opts, function (err) {
        expect(err).toExist();
        done();
      });
    });

    it('should callback with error when no resources are provided', function (done) {
      const opts = { resources: [] };
      waitOn(opts, function (err) {
        expect(err.toString()).toInclude('"resources" does not contain 1 required value(s)');
        done();
      });
    });

    it('should return error when opts is null', function (done) {
      waitOn(null, function (err) {
        expect(err).toExist();
        done();
      });
    });
  });

  describe('CLI', function () {
    it('should exit with non-zero error code when no resources provided', function (done) {
      execCLI([]).on('exit', function (code) {
        expect(code).toNotBe(0);
        done();
      });
    });
  });
});
