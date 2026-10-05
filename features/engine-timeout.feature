@engine
Feature: A timed-out wait names what is still missing
  The timeout error lists only the resources that never became available, in the order
  the caller gave them.

  @kind:bad
  Scenario: only the missing resource is named
    Given an existing file
    And a missing file
    When I wait with timeout 600ms, interval 100ms, window 100ms, delay 0ms, tcp timeout 300ms and command timeout 0ms
    Then the wait fails with:
      """
      Timed out waiting for: <resource 2>
      """

  @kind:bad
  Scenario: every missing resource is named in order
    Given a missing file
    And nothing listening on a free port
    When I wait with timeout 600ms, interval 100ms, window 100ms, delay 0ms, tcp timeout 300ms and command timeout 0ms
    Then the wait fails with:
      """
      Timed out waiting for: <resource 1>, <resource 2>
      """
