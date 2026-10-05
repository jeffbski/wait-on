@cli
Feature: Every command-line flag
  Each flag maps to an option. The three timeouts take a ms, s, m or h suffix; an unknown
  flag takes the next argument as its value; --no-<flag> turns a flag off. The command
  exits 0 once the wait succeeds and 1 with the error as the first stderr line otherwise.

  # plain scenarios, not an Outline: cucumber-rs fails a whole file on an outline `<resource 1>`
  @kind:good
  Scenario: --status-codes accepts a single code
    Given an HTTP server answering 403
    When I run wait-on with "--status-codes 403 -t 2000 <resource 1>"
    Then it exits 0

  @kind:good
  Scenario: --status-codes accepts a range
    Given an HTTP server answering 403
    When I run wait-on with "--status-codes 400-499 -t 2000 <resource 1>"
    Then it exits 0

  @kind:good
  Scenario: --status-codes accepts a list
    Given an HTTP server answering 403
    When I run wait-on with "--status-codes 200,403 -t 2000 <resource 1>"
    Then it exits 0

  @kind:bad
  Scenario: --status-codes 200-299 does not accept a 403
    Given an HTTP server answering 403
    When I run wait-on with "--status-codes 200-299 -t 500 -i 100 <resource 1>"
    Then it exits 1 with the first stderr line:
      """
      Error: Timed out waiting for: http://127.0.0.1:<port>/
      """

  @kind:bad @route:none
  Scenario: a --status-codes entry that is no code is refused
    Given an HTTP server answering 403
    When I run wait-on with "--status-codes abc <resource 1>"
    Then it exits 1 with the first stderr line:
      """
      Error: Invalid --status-codes entry "abc", expected a code or range in 100-599 like 404 or 200-499
      """

  @kind:bad @route:none
  Scenario: an option the schema refuses exits 1 with its ValidationError
    Given an existing file
    When I run wait-on with "--interval abc <resource 1>"
    Then it exits 1 with the first stderr line:
      """
      ValidationError: "interval" must be a number
      """

  @kind:bad
  Scenario: -t takes a unit suffix
    Given a missing file
    When I run wait-on with "-t 2s -i 100 <resource 1>"
    Then it exits 1 with the first stderr line:
      """
      Error: Timed out waiting for: file:<tmp>
      """
    And it took about 2000ms

  @kind:good
  Scenario: --httpTimeout takes a unit suffix
    Given an HTTP server that never answers
    When I run wait-on with "-r --httpTimeout 1s -t 5000 -i 100 <resource 1>"
    Then it exits 0
    And it took about 1000ms

  @kind:good
  Scenario: --tcpTimeout takes a unit suffix
    Given a TCP server on a free port
    When I run wait-on with "--tcpTimeout 100ms -t 2000 <resource 1>"
    Then it exits 0

  # an upper-case unit matches the pattern but no unit, so the option is left unset
  @kind:bad @route:none
  Scenario: an upper-case unit leaves the timeout unset
    Given a missing file
    When I run wait-on with "-t 2S -i 100 <resource 1>" and stop it after 3500ms
    Then it was still running

  @kind:good
  Scenario: -d delays the first check
    Given a TCP server on a free port
    When I run wait-on with "-d 1000 -i 100 -t 5000 <resource 1>"
    Then it exits 0
    And it took about 1000ms

  @kind:good
  Scenario: -w sets the stability window
    Given an existing file
    When I run wait-on with "-w 1500 -i 100 -t 5000 <resource 1>"
    Then it exits 0
    And it took about 1500ms

  @kind:good
  Scenario: -i sets the interval
    Given a TCP server that starts listening after 1000ms
    When I run wait-on with "-i 1500 -t 5000 <resource 1>"
    Then it exits 0
    And it took about 1500ms

  @kind:good
  Scenario: -s caps the checks in flight
    Given an HTTP server answering 500 after 300ms
    When I run wait-on with "-s 1 -i 50 -t 1000 <resource 1>"
    Then it exits 1
    And the server saw at most 1 request in flight

  @kind:good
  Scenario: -r waits for a resource to be unavailable
    Given a missing file
    When I run wait-on with "-r -i 100 -t 2000 <resource 1>"
    Then it exits 0

  @kind:good
  Scenario: -l logs the wait
    Given an existing file
    When I run wait-on with "-l -i 100 -w 100 -t 2000 <resource 1>"
    Then it exits 0
    And stdout is:
      """
      waiting for 1 resources: file:<tmp>
      wait-on(<pid>) complete
      """

  @kind:good
  Scenario: --no-log turns -l off
    Given an existing file
    When I run wait-on with "-l --no-log -i 100 -w 100 -t 2000 <resource 1>"
    Then it exits 0
    And stdout is empty

  @kind:good
  Scenario: -v logs with detail
    Given an existing file
    When I run wait-on with "-v -i 100 -w 100 -t 2000 <resource 1>"
    Then it exits 0
    And stdout includes the line "wait-on(<pid>) complete"
    And stdout has lines beyond the log lines

  # pinned: the unknown flag swallows the missing file, leaving only the ready port
  @kind:good
  Scenario: an unknown flag takes the next argument as its value
    Given a missing file
    And a TCP server on a free port
    When I run wait-on with "--bogus <resource 1> -t 2000 <resource 2>"
    Then it exits 0

  # the exit code is not pinned (test/cli-conformance.mocha.js)
  @kind:good @route:none
  Scenario: no resources prints the usage on stdout
    When I run wait-on with no arguments
    Then stdout starts with "Usage: wait-on {OPTIONS} resource [...resource]"
