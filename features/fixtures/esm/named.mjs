// wait-on is CommonJS with `module.exports = waitOn`: a named import must fail to link.
import { waitOn } from 'wait-on';

console.log(typeof waitOn);
