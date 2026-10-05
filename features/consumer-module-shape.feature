Feature: A project loads the installed wait-on the way it already does
  A CommonJS project requires it, an ESM project default-imports it, and a TypeScript
  project compiles against its index.d.ts. Each gets the same function, from the
  package npm installed.

  @consumer @fixture:cjs @kind:good
  Scenario: the CommonJS default export waits for an existing file
    Given an existing file
    When the consumer calls waitOn with:
      """
      { "resources": ["file:<tmp>"], "timeout": 2000 }
      """
    Then the wait resolves
    And the export is a function

  @consumer @fixture:esm @kind:good
  Scenario: the ESM default export waits for an existing file
    Given an existing file
    When the consumer calls waitOn with:
      """
      { "resources": ["file:<tmp>"], "timeout": 2000 }
      """
    Then the wait resolves
    And the export is a function

  @consumer @fixture:ts @kind:good
  Scenario: the TypeScript default export waits for an existing file
    Given an existing file
    When the consumer calls waitOn with:
      """
      { "resources": ["file:<tmp>"], "timeout": 2000 }
      """
    Then the wait resolves
    And the export is a function

  @consumer @fixture:esm @kind:bad @route:none
  Scenario: a named ESM import fails to link
    When the consumer runs "named.mjs"
    Then it exits 1 with a stderr line containing "Named export 'waitOn' not found"

  @consumer @fixture:ts @kind:good @route:none
  Scenario: both TypeScript import forms and the option type compile
    Then the TypeScript consumer type-checks

  @consumer @fixture:ts @kind:bad @route:none
  Scenario: a number is not a valid input
    When the TypeScript consumer gains the line "waitOn(42);"
    # the repo's TypeScript (7.x) reports TS2345 for this call
    Then the type check fails with "TS2345"
