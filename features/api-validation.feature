@api
Feature: Options and resource syntax are checked before anything is polled
  A malformed resource or an unknown option fails at once with a message naming it,
  instead of polling until the timeout.

  @kind:bad @route:none
  Scenario Outline: a malformed resource fails at once: <case>
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource>"], "timeout": 2000 }
      """
    Then the wait rejects with an Error:
      """
      <message>
      """

    Examples:
      | case                  | resource             | message                                                                                                    |
      | http without //       | http:localhost:3000  | Invalid resource "http:localhost:3000": http(s) resources must include "//", e.g. http://host:port/path |
      | http that is no URL   | http://[::1          | Invalid resource "http://[::1": not a valid URL                                                            |
      | tcp with //           | tcp://localhost:3000 | Invalid resource "tcp://localhost:3000": use tcp:host:port (no "//"), e.g. tcp:127.0.0.1:3000             |
      | tcp without a port    | tcp:nohost           | Invalid resource "tcp:nohost": expected tcp:host:port or tcp:[ipv6]:port                                   |

  @kind:bad @route:none
  Scenario: an unknown option is rejected
    When the consumer calls waitOn with:
      """
      { "resources": ["file:/wait-on-contract-never"], "timeout": 2000, "httpsAgent": {} }
      """
    Then the wait rejects with a ValidationError:
      """
      "httpsAgent" is not allowed
      """

  # 9.5.1: any proxy object passed validation; the wait polled until "Timed out waiting for"
  @kind:bad @since:10
  Scenario: a proxy object without a port is rejected
    When the consumer calls waitOn with:
      """
      { "resources": ["http://localhost:1/"], "timeout": 2000, "proxy": { "host": "127.0.0.1" } }
      """
    Then the wait rejects with a ValidationError:
      """
      "proxy.port" is required
      """

  @kind:good
  Scenario: a bare tcp port waits on localhost
    Given a TCP server on localhost
    When the consumer calls waitOn with:
      """
      { "resources": ["tcp:<port>"], "timeout": 2000 }
      """
    Then the wait resolves

  @kind:good
  Scenario: a bracketed IPv6 tcp address waits on the IPv6 loopback
    Given a TCP server on the IPv6 loopback
    When the consumer calls waitOn with:
      """
      { "resources": ["tcp:[::1]:<port>"], "timeout": 2000 }
      """
    Then the wait resolves

  @kind:bad
  Scenario: a timeout of 0 names every resource
    Given an existing file
    And a missing file
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>", "<resource 2>"], "timeout": 0 }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>, <resource 2>
      """

  @kind:bad
  Scenario: a timeout beyond the timer range times out at once
    Given an existing file
    And a missing file
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>", "<resource 2>"], "timeout": 3000000000 }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>, <resource 2>
      """
    And it took less than 1000ms
