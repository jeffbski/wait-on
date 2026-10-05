@consumer @fixture:ts
Feature: The types a TypeScript project compiles against
  index.d.ts types both call forms, the string and string[] shorthand, every option
  (WaitOnOptions extends Node's SecureContextOptions), the option types by name, and the
  deprecated AxiosProxyConfig and HttpSignature names kept for @types/wait-on users. It
  rejects unknown options and values an option does not take. Each scenario compiles the
  fixture's consumer.ts plus one line against the installed package.

  @kind:good @route:none
  Scenario Outline: <case> type-checks
    When the TypeScript consumer gains the line "<line>"
    Then the type check passes

    Examples:
      | case                              | line                                                                                                       |
      | a string with a callback          | export const cbForm: void = waitOn('tcp:3000', (err?: Error) => { if (err) throw err; });                  |
      | a SecureContextOptions field      | export const tlsOpts: WaitOnOptions = { resources: [], minVersion: 'TLSv1.2' };                            |
      | the option types by name          | import type { WaitOnAuth, ValidateStatus, WaitOnInput } from 'wait-on'; export const typed: WaitOnInput = { resources: [], auth: {} as WaitOnAuth, validateStatus: ((s) => s === 403) as ValidateStatus }; |
      | AxiosProxyConfig as a proxy       | import type { AxiosProxyConfig, WaitOnProxyOptions } from 'wait-on'; export const px: WaitOnProxyOptions = { host: 'h', port: 1 } as AxiosProxyConfig; |
      | HttpSignature                     | import type { HttpSignature } from 'wait-on'; export const sig: HttpSignature = { keyId: 'k', key: 'v' };  |

  @kind:bad @route:none
  Scenario Outline: <case> is a type error
    When the TypeScript consumer gains the line "<line>"
    Then the type check fails with "<code>"

    Examples:
      | case             | line                                      | code   |
      | an unknown option | waitOn({ resources: [], bogus: 1 });     | TS2353 |
      | proxy true       | waitOn({ resources: [], proxy: true });   | TS2345 |
