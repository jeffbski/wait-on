'use strict';

// Self-check for the frozen-clock test helper (#243). If the virtual clock is
// wrong, every itFrozen-wrapped test gives false results, so pin the mechanism
// directly: Date is frozen at FROZEN_NOW, explicit Date args still work, a large
// virtual timeout burns almost no real wall time, and the real Date is restored
// afterwards.

const mocha = require('mocha');
const describe = mocha.describe;
const it = mocha.it;
const chai = require('chai');
const expect = chai.expect;
const path = require('path');
const os = require('os');

const waitOn = require('../');
const { FROZEN_NOW, itFrozen } = require('./frozen-clock');

describe('frozen-clock helper (#243)', function () {
  itFrozen('freezes Date at FROZEN_NOW inside a frozen test', function () {
    expect(Date.now()).to.equal(FROZEN_NOW.getTime());
    expect(new Date().toISOString()).to.equal(FROZEN_NOW.toISOString());
    expect(new Date().getTime()).to.equal(FROZEN_NOW.getTime());
  });

  itFrozen('still honors explicit Date arguments while frozen', function () {
    expect(new Date(0).getTime()).to.equal(0);
    expect(new Date('2020-05-05T00:00:00.000Z').getUTCFullYear()).to.equal(2020);
    expect(Date.now()).to.equal(FROZEN_NOW.getTime()); // static now() still frozen
  });

  itFrozen('compresses a large virtual timeout into negligible real time', function (done) {
    // A file that never appears: getFileSize stays -1 so the run only ends when the
    // 5s virtual timeout fires. Under real time that's 5s; virtualized it's a few
    // event-loop turns. Measure REAL elapsed via hrtime (not faked by the clock).
    const missing = path.join(os.tmpdir(), 'frozen-clock-never-exists-a1b2c3');
    const startReal = process.hrtime.bigint();
    waitOn({ resources: [missing], timeout: 5000, interval: 250, window: 500 }, function (err) {
      const realMs = Number(process.hrtime.bigint() - startReal) / 1e6;
      expect(err).to.be.ok; // timed out (virtually)
      expect(err.message).to.match(/Timed out/);
      expect(realMs).to.be.lessThan(2000); // nowhere near the 5000ms of virtual time
      done();
    });
  });

  it('restores the real Date after a frozen test', function () {
    // Real "now" is not the frozen instant, and it advances.
    expect(Date.now()).to.not.equal(FROZEN_NOW.getTime());
    const a = Date.now();
    for (let i = 0; i < 1e6; i++) {
      /* burn a little real time */
    }
    expect(Date.now()).to.be.at.least(a);
  });
});
