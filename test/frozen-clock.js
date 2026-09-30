'use strict';

// Opt-in frozen/virtual clock for the mocha suite — zero dependencies.
//
// wait-on polls resources on rxjs `timer(delay, interval)` and bounds each run with
// `timer(timeout)`; both are scheduled on rxjs's asyncScheduler, and the file stability
// window reads Date.now(). The negative "should timeout when ..." tests used to burn ~1s
// of real wall time each (~56s total) waiting for those timers, and the file
// stability-window tests waited a real 750ms. Wrapping such a test with `itFrozen`
// virtualizes rxjs's clock for the duration of that test and runs an async "pump" that
// advances virtual time as fast as the real I/O underneath (refused connects, fs.stat,
// localhost responses) can settle — turning the real seconds into a handful of
// event-loop turns without changing what the test asserts.
//
// What is faked, and why this seam:
//   - rxjs scheduling, via `intervalProvider.delegate` — rxjs's own supported indirection
//     for setInterval/clearInterval. This captures every `timer`/poll/timeout the lib
//     schedules WITHOUT touching the global setInterval/setTimeout. undici (fetch) and
//     net keep the REAL timers, so their connection and socket teardown runs in real time
//     exactly as before — no leaked handles or bound ports bleeding into the next test.
//   - global Date — frozen at FROZEN_NOW and advanced by the pump, so the lib's
//     Date.now() stability window and rxjs's scheduler clock both see virtual time.
// No new dependency is added (package.json / package-lock.json stay fixed), and this
// avoids node:test mock.timers, which is experimental and throws "executing a cancelled
// action" driving rxjs on Node 22.19 (the engines floor and a green-bar target).
//
// This is opt-in, not a global root hook, because much of the suite depends on *real* time:
// command: resources run a real child_process.exec, tcpTimeout rides net.Socket#setTimeout
// and httpTimeout rides AbortSignal.timeout, the #82 tests observe real socket teardown, and
// the CLI tests spawn bin/wait-on as a subprocess and measure its real duration. Those stay
// on the real clock (plain `it`). See the LT1 plan KTD.

const { intervalProvider } = require('rxjs/internal/scheduler/intervalProvider');
const mocha = require('mocha');

// One shared frozen instant for every time-dependent test. Mid-month weekday, midday UTC,
// no nearby DST boundary. Import this instead of calling `new Date()` in fixtures.
const FROZEN_NOW = new Date('2026-06-17T12:00:00.000Z');

const RealDate = Date;
const realSetImmediate = global.setImmediate;
const yieldToRealIO = () => new Promise((resolve) => realSetImmediate(resolve));

function createClock() {
  let now = FROZEN_NOW.getTime();
  let seq = 0;
  const timers = new Map(); // id -> { time, cb, args, delay }
  let installed = false;
  let priorDelegate;

  // rxjs stores this return value and hands it back to clearInterval; a numeric id is all it
  // needs (AsyncAction never ref/unrefs the handle).
  const fakeInterval = {
    setInterval(cb, delay, ...args) {
      const id = ++seq;
      const d = Math.max(0, Number(delay) || 0);
      timers.set(id, { time: now + d, cb, args, delay: d });
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    }
  };

  // Date frozen at `now`; construction with explicit args and all statics still work.
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(now);
      else super(...args);
    }
    static now() {
      return now;
    }
  }

  function earliest() {
    let best = null;
    for (const [id, t] of timers) {
      if (best === null || t.time < best.t.time || (t.time === best.t.time && id < best.id)) {
        best = { id, t };
      }
    }
    return best;
  }

  return {
    install() {
      if (installed) return;
      installed = true;
      priorDelegate = intervalProvider.delegate;
      intervalProvider.delegate = fakeInterval;
      global.Date = FakeDate;
    },
    uninstall() {
      if (!installed) return;
      installed = false;
      intervalProvider.delegate = priorDelegate;
      global.Date = RealDate;
      timers.clear();
    },
    countTimers() {
      return timers.size;
    },
    // Advance virtual time to the next scheduled rxjs timer, run its callback (a poll or the
    // timeout), then yield a real macrotask so any I/O that callback started (a fetch, a
    // socket connect, an fs.stat) can resolve before the next jump. A callback throw
    // propagates to the caller.
    async nextAsync() {
      const e = earliest();
      if (!e) {
        await yieldToRealIO();
        return;
      }
      now = e.t.time;
      e.t.time = now + Math.max(1, e.t.delay); // rxjs intervals repeat; guard 0ms from stalling
      e.t.cb(...e.t.args);
      await yieldToRealIO();
    }
  };
}

let activeClock = null;

// Drain fake timers cooperatively until the test settles. onError receives a throw from a
// timer callback (a failing assertion inside a waitOn callback rxjs invoked off a virtual
// timer) so it surfaces to the test instead of escaping this detached loop.
function startPump(clock, onError) {
  let stopped = false;
  const finished = (async () => {
    while (!stopped) {
      try {
        await clock.nextAsync();
      } catch (err) {
        onError(err);
        break;
      }
    }
  })();
  return async () => {
    stopped = true;
    await finished;
  };
}

// it() variant that runs the test body under the virtual clock. Supports both the
// done-callback and promise/sync mocha test signatures.
function itFrozen(title, fn) {
  return mocha.it(title, function () {
    activeClock = createClock();
    activeClock.install();
    return new Promise((resolve, reject) => {
      let settled = false;
      let stopPump = null;
      const settle = (err) => {
        if (settled) return;
        settled = true;
        const done = async () => {
          if (activeClock) {
            activeClock.uninstall();
            activeClock = null;
            // A couple of real turns so any real teardown the test started (undici draining,
            // a socket close) settles before the next test runs.
            await yieldToRealIO();
            await yieldToRealIO();
          }
          if (err) reject(err);
          else resolve();
        };
        const finishUp = () => done().then(undefined, reject);
        if (stopPump) stopPump().then(finishUp, finishUp);
        else finishUp();
      };
      stopPump = startPump(activeClock, settle);
      try {
        if (fn.length >= 1) {
          fn.call(this, (err) => settle(err)); // done-style body
        } else {
          Promise.resolve()
            .then(() => fn.call(this)) // promise/sync body
            .then(() => settle(), settle);
        }
      } catch (err) {
        settle(err);
      }
    });
  });
}

// Defensive net: if a test somehow leaves the virtual clock installed, restore it before the
// next test runs.
const mochaHooks = {
  afterEach() {
    if (activeClock) {
      activeClock.uninstall();
      activeClock = null;
    }
  }
};

module.exports = { FROZEN_NOW, itFrozen, mochaHooks };
