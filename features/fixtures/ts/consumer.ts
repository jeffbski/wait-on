// Compiled, never run: the type surface a TypeScript consumer of the installed package uses.
import waitOnRequire = require('wait-on');
import waitOn from 'wait-on';
import type { WaitOnOptions } from 'wait-on';

const opts: WaitOnOptions = { resources: ['file:/tmp/wait-on-consumer'], timeout: 1000 };
export const promised: Promise<void> = waitOn(opts);
export const called: void = waitOnRequire(opts, (err?: Error) => {
  if (err) throw err;
});
export const shorthand: Promise<void> = waitOn(['tcp:3000', 'file:/tmp/wait-on-consumer']);
