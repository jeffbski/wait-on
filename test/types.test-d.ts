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

// command: resource with per-attempt commandTimeout (U11)
waitOn({ resources: ['command:pg_isready'], commandTimeout: 2000 });

// --- #250 regression: @types/wait-on callback compatibility ---
// The old @types typed cb as (err: any) => void, and at runtime the success
// path invokes cb with `undefined` (never null). These explicitly annotated
// forms must all type-check. Unannotated `(err) =>` above only echoes our own
// declaration back and cannot catch a compatibility break.
waitOn({ resources: ['tcp:3000'] }, (err?: Error) => {
  if (err) throw err;
});
waitOn({ resources: ['tcp:3000'] }, (err: any) => {
  void err;
});
waitOn({ resources: ['tcp:3000'] }, (err: unknown) => {
  void err;
});
// Sentinel: this handler is assignable only because err is `Error | undefined`,
// never `Error | null`. Reverting cb to `(err: Error | null)` breaks this line.
waitOn({ resources: ['tcp:3000'] }, (err: Error | undefined) => {
  if (err) throw err;
});

// #250 regression: null handling is NOT forced — after ruling out undefined,
// err narrows to Error, so it can never be null.
waitOn({ resources: ['tcp:3000'] }, (err?: Error) => {
  if (err !== undefined) {
    // @ts-expect-error err is Error here, never null
    const nope: null = err;
    void nope;
  }
});

// #250 regression: deprecated aliases kept for @types/wait-on compatibility
const proxyAlias: waitOn.AxiosProxyConfig = { host: 'localhost', port: 8080 };
void proxyAlias;
const httpSig: waitOn.HttpSignature = { keyId: 'id', key: 'secret' };
void httpSig;

// #250 regression: TLS options beyond ca/cert/key/passphrase must type-check
waitOn({ resources: ['https://localhost:3000'], ciphers: 'HIGH:!aNULL' });

// #250 regression: non-string header values must type-check, matching
// @types/wait-on (Record<string, any>) and the runtime (headers: Joi.object()).
waitOn({
  resources: ['http://localhost:3000'],
  headers: { Authorization: 'Bearer token', 'X-Count': 42, 'X-Enabled': true },
});

// --- invalid usages: each must fail compilation ---

// @ts-expect-error unknown option is rejected
waitOn({ resources: ['tcp:3000'], bogus: true });

// @ts-expect-error timeout must be a number
waitOn({ resources: ['tcp:3000'], timeout: 'soon' });

// @ts-expect-error resources must be strings
waitOn({ resources: [3000] });

// @ts-expect-error opts is required
waitOn();
