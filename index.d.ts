/// <reference types="node" />

import { SecureContextOptions } from 'tls';

declare function waitOn(opts: waitOn.WaitOnOptions, cb: (err: Error | null) => void): void;
declare function waitOn(opts: waitOn.WaitOnOptions): Promise<void>;

declare namespace waitOn {
  interface WaitOnOptions extends Pick<SecureContextOptions, 'ca' | 'cert' | 'key' | 'passphrase'> {
    /** Array of resources to wait for. Prefix determines type: file:, http:, https:, http-get:, https-get:, tcp:, socket: */
    resources: string[];
    /** Initial delay in ms before polling begins. @default 0 */
    delay?: number;
    /** HTTP HEAD/GET timeout in ms. */
    httpTimeout?: number;
    /** Poll interval in ms. @default 250 */
    interval?: number;
    /** Log remaining resources to stdout. @default false */
    log?: boolean;
    /** Reverse mode: succeed when resources are NOT available. @default false */
    reverse?: boolean;
    /** Max concurrent connections per resource. @default Infinity */
    simultaneous?: number;
    /** Overall timeout in ms. Rejects/errors when exceeded. @default Infinity */
    timeout?: number;
    /** Custom function to determine if an HTTP status code is a success. Defaults to 2xx. */
    validateStatus?: ValidateStatus;
    /** Enable debug output (also enables log). @default false */
    verbose?: boolean;
    /** Stabilization window in ms. Resource must remain available for this duration. @default 750 */
    window?: number;
    /** TCP connect timeout in ms. @default 300 */
    tcpTimeout?: number;

    /** HTTP proxy configuration. Set to false to disable. @default undefined */
    proxy?: false | WaitOnProxyOptions;
    /** HTTP Basic auth credentials. */
    auth?: WaitOnAuth;
    /** Reject unauthorized TLS certificates. @default false */
    strictSSL?: boolean;
    /** Follow HTTP 3xx redirects. @default true */
    followRedirect?: boolean;
    /** Additional HTTP request headers. */
    headers?: Record<string, string>;
  }

  interface WaitOnAuth {
    username: string;
    password: string;
  }

  interface WaitOnProxyOptions {
    host: string;
    port: number;
    /** @default 'http' */
    protocol?: string;
    auth?: {
      username: string;
      password: string;
    };
  }

  type ValidateStatus = (status: number) => boolean;
}

export = waitOn;
