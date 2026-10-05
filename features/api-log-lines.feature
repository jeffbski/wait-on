@api
Feature: log and verbose print progress on stdout
  With log, waitOn prints what it waits for and how the wait ended, prefixed with the
  process id. verbose turns log on and adds per-check detail, whose wording is not part
  of the contract. Without either, waitOn prints nothing.

  @kind:good
  Scenario: without log nothing is printed
    Given an existing file
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "interval": 100, "window": 100 }
      """
    Then the wait resolves
    And stdout is empty

  @kind:good
  Scenario: log prints the resources and completion
    Given an existing file
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "interval": 100, "window": 100, "log": true }
      """
    Then the wait resolves
    And stdout is:
      """
      waiting for 1 resources: <resource 1>
      wait-on(<pid>) complete
      """

  @kind:bad
  Scenario: log prints the timeout before exiting with the error
    Given a missing file
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 300, "interval": 100, "log": true }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>
      """
    And stdout is:
      """
      waiting for 1 resources: <resource 1>
      wait-on(<pid>) Timed out waiting for: <resource 1>; exiting with error
      """

  @kind:good
  Scenario: log announces reverse mode
    Given a missing file
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "interval": 100, "window": 100, "log": true, "reverse": true }
      """
    Then the wait resolves
    And stdout is:
      """
      wait-on reverse mode - waiting for resources to be unavailable
      waiting for 1 resources: <resource 1>
      wait-on(<pid>) complete
      """

  @kind:good
  Scenario: verbose implies log and adds detail
    Given an existing file
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "interval": 100, "window": 100, "verbose": true }
      """
    Then the wait resolves
    And stdout includes the line "wait-on(<pid>) complete"
    And stdout has lines beyond the log lines
