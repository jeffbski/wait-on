@api
Feature: Timing and concurrency options
  delay holds off the first check, a file must keep its size for window ms, interval
  (default 250ms) and window (default 750ms) pace the checks, simultaneous caps the
  checks in flight per resource, and tcpTimeout and commandTimeout bound one attempt.

  @kind:good
  Scenario: with no timing options a stable file resolves after the default window
    Given an existing file
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 5000 }
      """
    Then the wait resolves
    And it took about 750ms

  @kind:good
  Scenario: delay holds off the first check
    Given a TCP server on a free port
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 5000, "delay": 1000, "interval": 100, "window": 100 }
      """
    Then the wait resolves
    And it took about 1000ms

  @kind:good
  Scenario: window keeps waiting until the file size has held
    Given an existing file
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 5000, "interval": 100, "window": 600 }
      """
    Then the wait resolves
    And it took about 600ms

  @kind:good
  Scenario: simultaneous 1 keeps one check in flight
    Given an HTTP server answering 500 after 300ms
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 1000, "interval": 50, "simultaneous": 1 }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>
      """
    And the server saw at most 1 request in flight

  @kind:good
  Scenario: without simultaneous checks overlap
    Given an HTTP server answering 500 after 300ms
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 1000, "interval": 50 }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>
      """
    And the server saw at least 2 requests in flight

  @kind:good
  Scenario: tcpTimeout 0 sets no connect limit
    Given a TCP server on a free port
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "tcpTimeout": 0 }
      """
    Then the wait resolves

  @kind:good
  Scenario: commandTimeout kills a hung command, which counts as unavailable
    Given a command that never exits
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 3000, "interval": 100, "reverse": true, "commandTimeout": 200 }
      """
    Then the wait resolves

  @kind:bad
  Scenario: a hung command killed by commandTimeout never becomes available
    Given a command that never exits
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 1000, "interval": 100, "commandTimeout": 200 }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>
      """
