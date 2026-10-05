@cli
Feature: The installed wait-on command
  The CLI exits 0 once its resources are available, and exits 1 with the error as the
  first stderr line when they are not.

  @kind:good
  Scenario: a ready tcp port exits 0
    Given a TCP server on a free port
    When I run wait-on with "--timeout 2000 --interval 100 <resource 1>"
    Then it exits 0

  @kind:bad
  Scenario: a port nothing listens on times out and exits 1
    Given nothing listening on a free port
    When I run wait-on with "--timeout 500 --interval 100 <resource 1>"
    Then it exits 1 with the first stderr line:
      """
      Error: Timed out waiting for: tcp:127.0.0.1:<port>
      """
    And it took about 500ms

  @kind:good @route:none
  Scenario: --help prints the usage on stdout
    When I run wait-on with "--help"
    Then stdout starts with "Usage: wait-on {OPTIONS} resource [...resource]"
