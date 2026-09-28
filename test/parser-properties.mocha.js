'use strict';

// Property/differential tests for wait-on's four pure parsers (rust-port R18):
// the resource-prefix regex, host:port, the ms/s/m/h interval parser, and the
// http://unix: split. They assert structural invariants over many generated
// inputs rather than a handful of examples, and are shaped as the Node oracle a
// future Rust implementation must match in differential mode.
//
// No new dependency: property inputs come from a self-contained seeded PRNG
// (mulberry32). The seed is fixed (override with WAITON_TEST_SEED) and printed
// on failure so any counterexample reproduces. Assertions use node:assert and
// describe/it from mocha, so the file is portable across test runners.

const assert = require('node:assert/strict');
const mocha = require('mocha');
const describe = mocha.describe;
const it = mocha.it;

const { parseInterval } = require('../bin/wait-on');

// --- seeded PRNG + property runner (dependency-free) ------------------------

const BASE_SEED = (() => {
  const n = Number.parseInt(process.env.WAITON_TEST_SEED, 10);
  return Number.isFinite(n) ? n >>> 0 : 0x1a2b3c4d;
})();
const RUNS = Number.parseInt(process.env.WAITON_TEST_RUNS, 10) || 300;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Run `prop` over `runs` generated inputs. On failure, rethrow with the seed,
// run index, and generated input so the exact case can be reproduced.
function forAll(gen, prop, opts) {
  const runs = (opts && opts.runs) || RUNS;
  const seed = (opts && opts.seed) || BASE_SEED;
  const rand = mulberry32(seed);
  for (let i = 0; i < runs; i++) {
    const input = gen(rand);
    try {
      prop(input);
    } catch (err) {
      err.message =
        `property failed on input ${JSON.stringify(input)} ` +
        `(seed=${seed}, run=${i}/${runs}; set WAITON_TEST_SEED=${seed} to reproduce)\n` +
        err.message;
      throw err;
    }
  }
}

function randInt(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}
function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}
function randStr(rand, alphabet, min, max) {
  const len = randInt(rand, min, max);
  let s = '';
  for (let i = 0; i < len; i++) s += pick(rand, alphabet);
  return s;
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
const HOSTCH = 'abcdefghijklmnopqrstuvwxyz0123456789-.'.split('');
const HEXCOLON = 'abcdef0123456789:'.split('');
const PATHCH = 'abcdefghijklmnopqrstuvwxyz0123456789/._'.split('');
const ANYCH = 'abcHTTP0123:/.[]-_ '.split('');

// --- Node reference parsers -------------------------------------------------
// Regexes copied verbatim from the live code and cited by line. The golden
// vectors below lock these to the live behavior; if a live regex changes, the
// golden tests break and flag the drift.

const PREFIX_RE = /^((https?-get|https?|tcp|socket|file|command):)(.+)$/; // lib/wait-on.js:35
const HOST_PORT_RE = /^(?:\[([^\]]+)\]:|([^:]*):)?(\d+)$/; // lib/wait-on.js:37
const HTTP_UNIX_RE = /^http:\/\/unix:(.+?):((?:https?:\/\/|\/).*)$/; // lib/wait-on.js:42
const HTTP_UNIX_LEGACY_RE = /^http:\/\/unix:([^:]+):(.+)$/; // lib/wait-on.js:43

// prefix -> resource type, mirroring createResource$ (lib/wait-on.js:221-238);
// anything else (incl. an explicit file: prefix or no prefix) is a file.
const PREFIX_TYPE = {
  'https-get:': 'http',
  'http-get:': 'http',
  'https:': 'http',
  'http:': 'http',
  'tcp:': 'tcp',
  'command:': 'command',
  'socket:': 'socket'
};

const nodeParsers = {
  // extractPrefix / extractPath + type routing (lib/wait-on.js:283-297, 221-238)
  prefix(resource) {
    const m = PREFIX_RE.exec(resource);
    const prefix = m ? m[1] : '';
    const rest = m ? m[3] : resource;
    return { prefix, rest, type: PREFIX_TYPE[prefix] || 'file' };
  },
  // tcpExists host/port split (lib/wait-on.js:502-503); port kept as a string.
  hostPort(str) {
    const m = HOST_PORT_RE.exec(str);
    if (!m) return null;
    return { host: m[1] || m[2] || 'localhost', port: m[3] };
  },
  // the real ms/s/m/h interval parser (bin/wait-on parseInterval)
  interval: parseInterval,
  // createHTTP$ unix-socket split (lib/wait-on.js:405-409): normalize http-get:
  // then split socketPath (group 1) from the url/url-path (group 2).
  httpUnix(resource) {
    const rawUrl = resource.replace('-get:', ':');
    const m = HTTP_UNIX_RE.exec(rawUrl) || HTTP_UNIX_LEGACY_RE.exec(rawUrl);
    if (!m) return null;
    return { socketPath: m[1], requestPath: m[2] };
  }
};

// interval unit -> multiplier, using the exact arithmetic parseInterval uses so
// the expected value is float-identical to the parser's (bin/wait-on:175-181).
function expectedInterval(value, unit) {
  switch (unit) {
    case '':
    case 'ms':
      return Math.floor(value);
    case 's':
      return Math.floor(value * 1000);
    case 'm':
      return Math.floor(value * 1000 * 60);
    case 'h':
      return Math.floor(value * 1000 * 60 * 60);
    default:
      return undefined;
  }
}

describe('parser properties (rust-port R18 differential oracle)', function () {
  describe('resource-prefix parser (PREFIX_RE)', function () {
    const golden = [
      ['tcp:my.server.com:3000', { prefix: 'tcp:', rest: 'my.server.com:3000', type: 'tcp' }],
      ['http://foo.com:8000/bar', { prefix: 'http:', rest: '//foo.com:8000/bar', type: 'http' }],
      ['https-get:https://my/bar', { prefix: 'https-get:', rest: 'https://my/bar', type: 'http' }],
      ['http-get:http://m.com:90/foo', { prefix: 'http-get:', rest: 'http://m.com:90/foo', type: 'http' }],
      ['socket:/path/sock', { prefix: 'socket:', rest: '/path/sock', type: 'socket' }],
      ['command:pg_isready', { prefix: 'command:', rest: 'pg_isready', type: 'command' }],
      ['file:/tmp/x', { prefix: 'file:', rest: '/tmp/x', type: 'file' }],
      ['/tmp/plain', { prefix: '', rest: '/tmp/plain', type: 'file' }],
      ['tcp:', { prefix: '', rest: 'tcp:', type: 'file' }] // no body after scheme -> not classified
    ];

    it('classifies documented resource examples', function () {
      for (const [resource, expected] of golden) {
        assert.deepEqual(nodeParsers.prefix(resource), expected);
      }
    });

    it('recomposes prefix + rest === input and maps each scheme to its type', function () {
      const schemes = ['https-get', 'http-get', 'https', 'http', 'tcp', 'socket', 'file', 'command'];
      forAll(
        (rand) => {
          const scheme = pick(rand, schemes);
          const rest = randStr(rand, 'abcdefghijklmnopqrstuvwxyz0123456789/._-:'.split(''), 1, 20);
          return { scheme, rest };
        },
        ({ scheme, rest }) => {
          const resource = scheme + ':' + rest;
          const parsed = nodeParsers.prefix(resource);
          assert.equal(parsed.prefix, scheme + ':');
          assert.equal(parsed.rest, rest);
          assert.equal(parsed.prefix + parsed.rest, resource);
          assert.equal(parsed.type, PREFIX_TYPE[scheme + ':'] || 'file');
        }
      );
    });

    it('classifies an unrecognized or absent prefix as file', function () {
      forAll(
        (rand) => pick(rand, ['/', './', '', 'ftp:', 'ws:', 'tcpx:', 'notreal:']) + randStr(rand, LOWER, 1, 15),
        (resource) => {
          const parsed = nodeParsers.prefix(resource);
          assert.equal(parsed.type, 'file');
        }
      );
    });

    it('classification is total (always one of the five resource types)', function () {
      const types = ['http', 'tcp', 'command', 'socket', 'file'];
      forAll(
        (rand) => randStr(rand, ANYCH, 0, 24),
        (resource) => {
          assert.ok(types.includes(nodeParsers.prefix(resource).type));
        }
      );
    });
  });

  describe('host:port parser (HOST_PORT_RE)', function () {
    const golden = [
      ['3000', { host: 'localhost', port: '3000' }],
      ['host.example:8080', { host: 'host.example', port: '8080' }],
      ['[::1]:8080', { host: '::1', port: '8080' }],
      ['[2001:db8::1]:443', { host: '2001:db8::1', port: '443' }],
      [':3000', { host: 'localhost', port: '3000' }]
    ];
    const rejects = ['', 'abc', '3000x', 'host:', 'host:port', 'a:b:80', ':', '[::1]', '80:'];

    it('parses documented host:port forms', function () {
      for (const [input, expected] of golden) {
        assert.deepEqual(nodeParsers.hostPort(input), expected);
      }
    });

    it('rejects malformed host:port', function () {
      for (const input of rejects) {
        assert.equal(nodeParsers.hostPort(input), null);
      }
    });

    it('round-trips host and port for simple hosts', function () {
      forAll(
        (rand) => ({ host: randStr(rand, HOSTCH, 1, 12), port: randStr(rand, '0123456789'.split(''), 1, 5) }),
        ({ host, port }) => {
          assert.deepEqual(nodeParsers.hostPort(host + ':' + port), { host, port });
        }
      );
    });

    it('defaults host to localhost for a bare port', function () {
      forAll(
        (rand) => randStr(rand, '0123456789'.split(''), 1, 5),
        (port) => {
          assert.deepEqual(nodeParsers.hostPort(port), { host: 'localhost', port });
        }
      );
    });

    it('extracts the inner address from bracketed IPv6', function () {
      forAll(
        (rand) => ({ inner: randStr(rand, HEXCOLON, 1, 20), port: randStr(rand, '0123456789'.split(''), 1, 5) }),
        ({ inner, port }) => {
          assert.deepEqual(nodeParsers.hostPort('[' + inner + ']:' + port), { host: inner, port });
        }
      );
    });
  });

  describe('ms/s/m/h interval parser (parseInterval)', function () {
    const golden = [
      ['250', 250],
      ['250ms', 250],
      ['2s', 2000],
      ['1m', 60000],
      ['1h', 3600000],
      ['2.5s', 2500],
      ['.5s', 500],
      ['0', 0]
    ];

    it('scales documented intervals', function () {
      for (const [input, expected] of golden) {
        assert.equal(nodeParsers.interval(input), expected);
      }
    });

    it('scales value by unit and floors the result', function () {
      const units = ['', 'ms', 's', 'm', 'h'];
      forAll(
        (rand) => {
          const intPart = String(randInt(rand, 0, 100000));
          const num = rand() < 0.5 ? intPart : intPart + '.' + String(randInt(rand, 0, 999));
          return { num, unit: pick(rand, units) };
        },
        ({ num, unit }) => {
          const value = parseFloat(num);
          assert.equal(nodeParsers.interval(num + unit), expectedInterval(value, unit));
        }
      );
    });

    it('returns unparseable input unchanged (pass-through)', function () {
      forAll(
        (rand) => {
          if (rand() < 0.5) return randStr(rand, LOWER, 1, 8);
          return String(randInt(rand, 0, 9999)) + pick(rand, ['x', 'sec', 'q', 'min', 'hr', 'zz']);
        },
        (arg) => {
          assert.equal(nodeParsers.interval(arg), arg);
        }
      );
    });

    it('characterization: uppercase units return undefined (case-sensitive switch, bin/wait-on:175-181)', function () {
      // The regex is case-insensitive but the switch is not, so an uppercase
      // unit matches the regex yet falls through to undefined. Documented here
      // as current Node behavior for the future differential oracle, not endorsed.
      for (const arg of ['2S', '2M', '2H', '5MS']) {
        assert.equal(nodeParsers.interval(arg), undefined);
      }
    });
  });

  describe('http://unix: split (HTTP_UNIX_RE / legacy)', function () {
    const golden = [
      ['http://unix:/path/to/sock:/foo/bar', { socketPath: '/path/to/sock', requestPath: '/foo/bar' }],
      ['http-get://unix:/path/to/sock:/foo/bar', { socketPath: '/path/to/sock', requestPath: '/foo/bar' }],
      [
        'http://unix:/var/run/app.sock:http://localhost/health',
        { socketPath: '/var/run/app.sock', requestPath: 'http://localhost/health' }
      ],
      // socket path with an embedded colon (Windows named pipe drive letter)
      ['http://unix:\\\\?\\pipe\\C:\\app\\sock:/status', { socketPath: '\\\\?\\pipe\\C:\\app\\sock', requestPath: '/status' }],
      // legacy fallback: request path is neither / nor http(s):// prefixed
      ['http://unix:/sock:foo', { socketPath: '/sock', requestPath: 'foo' }]
    ];
    const rejects = ['https://unix:/s:/p', 'http://foo.com/bar', 'tcp:host:3000', 'file:/x'];

    it('splits documented http-unix forms', function () {
      for (const [input, expected] of golden) {
        assert.deepEqual(nodeParsers.httpUnix(input), expected);
      }
    });

    it('returns null for non http-unix resources', function () {
      for (const input of rejects) {
        assert.equal(nodeParsers.httpUnix(input), null);
      }
    });

    it('recovers socketPath and requestPath, including colon-bearing socket paths', function () {
      forAll(genUnixCase, ({ sock, req, resource }) => {
        assert.deepEqual(nodeParsers.httpUnix(resource), { socketPath: sock, requestPath: req });
      });
    });

    it('normalizes http-get:// the same as http://', function () {
      forAll(genUnixCase, ({ sock, req, resource }) => {
        const getForm = resource.replace(/^http:/, 'http-get:');
        assert.deepEqual(nodeParsers.httpUnix(getForm), { socketPath: sock, requestPath: req });
      });
    });
  });
});

// A socket path whose only ':' followed by '/' is the delimiter before the
// request path: colons inside the socket path are always followed by a letter
// (drive) or backslash, so the non-greedy HTTP_UNIX_RE splits at the delimiter.
function genUnixCase(rand) {
  const req = '/' + randStr(rand, PATHCH, 0, 12) + pick(rand, ['', '/' + randStr(rand, LOWER, 1, 5)]);
  let sock;
  if (rand() < 0.5) {
    const segs = [];
    const count = randInt(rand, 1, 3);
    for (let i = 0; i < count; i++) segs.push(randStr(rand, LOWER, 1, 6));
    sock = '/' + segs.join('/') + pick(rand, ['', '.sock']);
  } else {
    const drive = pick(rand, ['C', 'D', 'E']);
    sock = '\\\\?\\pipe\\' + drive + ':\\' + randStr(rand, LOWER, 1, 6) + '\\sock';
  }
  return { sock, req, resource: 'http://unix:' + sock + ':' + req };
}
