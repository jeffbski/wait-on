'use strict';

// Unit tests for the native replacements introduced when lodash/fp was dropped
// (#239). These are pure helpers used inside lib/wait-on.js; exposed via
// `_internal` solely so their behavior is pinned directly, not just exercised
// incidentally by the integration suite.

const mocha = require('mocha');
const describe = mocha.describe;
const it = mocha.it;
const chai = require('chai');
const expect = chai.expect;

const { _internal } = require('../lib/wait-on');
const { once, noop, isNotABoolean, isNotEmpty, determineRemainingResources } = _internal;

describe('native lodash replacements (#239)', function () {
  describe('noop', function () {
    it('returns undefined and ignores any arguments', function () {
      expect(noop()).to.equal(undefined);
      expect(noop(1, 2, 3)).to.equal(undefined);
    });
  });

  describe('once', function () {
    it('invokes the wrapped fn exactly once', function () {
      let calls = 0;
      const f = once(() => ++calls);
      f();
      f();
      f();
      expect(calls).to.equal(1);
    });

    it('returns the first result on every subsequent call', function () {
      let n = 0;
      const f = once(() => ++n); // would return 1,2,3… if called each time
      expect(f()).to.equal(1);
      expect(f()).to.equal(1);
      expect(f()).to.equal(1);
    });

    it('passes the first call arguments through to the wrapped fn', function () {
      let seen;
      const f = once((...args) => (seen = args));
      f('a', 'b');
      f('c'); // ignored
      expect(seen).to.deep.equal(['a', 'b']);
    });

    it('preserves `this` on the first call', function () {
      const obj = {
        val: 42,
        m: once(function () {
          return this.val;
        })
      };
      expect(obj.m()).to.equal(42);
    });

    it('caches a falsy/undefined result and still short-circuits', function () {
      let calls = 0;
      const f = once(() => {
        calls++;
        return undefined;
      });
      expect(f()).to.equal(undefined);
      expect(f()).to.equal(undefined);
      expect(calls).to.equal(1);
    });
  });

  describe('isNotABoolean', function () {
    it('is false for true and false', function () {
      expect(isNotABoolean(true)).to.equal(false);
      expect(isNotABoolean(false)).to.equal(false);
    });

    it('is true for every non-boolean value', function () {
      [undefined, null, 0, 1, '', 'x', {}, [], NaN, () => {}].forEach((v) => {
        expect(isNotABoolean(v)).to.equal(true);
      });
    });
  });

  describe('isNotEmpty', function () {
    it('is true for a non-empty array', function () {
      expect(isNotEmpty([1])).to.equal(true);
      expect(isNotEmpty(['a', 'b'])).to.equal(true);
    });

    it('is false for an empty array', function () {
      expect(isNotEmpty([])).to.equal(false);
    });
  });

  describe('determineRemainingResources (native zip replacement)', function () {
    it('returns resources whose state is falsy, preserving order', function () {
      const resources = ['a', 'b', 'c', 'd'];
      const states = [true, false, true, false];
      expect(determineRemainingResources(resources, states)).to.deep.equal(['b', 'd']);
    });

    it('returns an empty array when every resource is ready', function () {
      expect(determineRemainingResources(['a', 'b'], [true, true])).to.deep.equal([]);
    });

    it('returns all resources when none are ready (states undefined)', function () {
      expect(determineRemainingResources(['a', 'b'], [])).to.deep.equal(['a', 'b']);
    });
  });
});
