/**
 * Type-level tests for index.d.ts. Compiled with `tsc` (see test:types script).
 * Valid usages must type-check; invalid ones are guarded with @ts-expect-error,
 * so the compile fails if a bad usage stops being rejected.
 */
import waitOn = require('../index');

// object opts, promise form
const p: Promise<void> = waitOn({ resources: ['tcp:3000'] });
void p;

// object opts, callback form
waitOn({ resources: ['http://localhost:3000'] }, (err) => {
  if (err) throw err;
});

// string shorthand (U9), promise form
const ps: Promise<void> = waitOn('tcp:3000');
void ps;

// string[] shorthand, promise form
const pa: Promise<void> = waitOn(['tcp:3000', 'http://localhost:3000']);
void pa;

// string shorthand, callback form
waitOn('tcp:3000', (err) => {
  if (err) throw err;
});

// full option surface incl. validateStatus, auth, proxy
waitOn({
  resources: ['http://localhost:3000/health'],
  delay: 100,
  interval: 250,
  timeout: 5000,
  reverse: true,
  validateStatus: (status: number) => status >= 200 && status < 500,
  headers: { Authorization: 'Bearer token' },
  auth: { username: 'user', password: 'pass' },
  proxy: { host: 'localhost', port: 8080, protocol: 'http' },
});

// proxy disabled
waitOn({ resources: ['http://localhost:3000'], proxy: false });

// --- invalid usages: each must fail compilation ---

// @ts-expect-error unknown option is rejected
waitOn({ resources: ['tcp:3000'], bogus: true });

// @ts-expect-error timeout must be a number
waitOn({ resources: ['tcp:3000'], timeout: 'soon' });

// @ts-expect-error resources must be strings
waitOn({ resources: [3000] });

// @ts-expect-error opts is required
waitOn();
