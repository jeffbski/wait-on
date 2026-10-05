@cli
Feature: A config file feeds the command
  -c / --config requires a js or json file whose object supplies resources and options.
  Resources on the command line replace the file's, and -H headers merge with the file's
  headers, the command line winning on a name conflict.

  @kind:good
  Scenario: a js config supplies the resources
    Given a TCP server on a free port
    And a config file "wait-on.config.js" containing:
      """
      module.exports = { resources: ["<resource 1>"], timeout: 2000 };
      """
    When I run wait-on with the arguments:
      """
      -c
      <config>
      """
    Then it exits 0

  @kind:bad
  Scenario: a json config supplies the options
    Given a missing file
    And a config file "wait-on.json" containing:
      """
      { "resources": ["<resource 1>"], "timeout": 500, "interval": 100 }
      """
    When I run wait-on with the arguments:
      """
      --config
      <config>
      """
    Then it exits 1 with the first stderr line:
      """
      Error: Timed out waiting for: file:<tmp>
      """
    And it took about 500ms

  @kind:good
  Scenario: command-line resources replace the config's
    Given a missing file
    And a TCP server on a free port
    And a config file "wait-on.json" containing:
      """
      { "resources": ["<resource 1>"], "timeout": 2000 }
      """
    When I run wait-on with the arguments:
      """
      -c
      <config>
      <resource 2>
      """
    Then it exits 0

  @kind:good
  Scenario: -H merges with the config headers and wins a conflict
    Given an HTTP server answering 200 that records requests
    And a config file "wait-on.config.js" containing:
      """
      module.exports = { headers: { "x-file": "file", "x-both": "file" } };
      """
    When I run wait-on with the arguments:
      """
      -c
      <config>
      -H
      x-both: cli
      --header
      x-cli: cli
      -t
      2000
      <resource 1>
      """
    Then it exits 0
    And the server saw the header "x-file" as "file"
    And the server saw the header "x-both" as "cli"
    And the server saw the header "x-cli" as "cli"

  @kind:bad @route:none
  Scenario: a header without a colon is refused
    Given a TCP server on a free port
    When I run wait-on with the arguments:
      """
      -H
      nocolon
      <resource 1>
      """
    Then it exits 1 with the first stderr line:
      """
      Error: Invalid header "nocolon", expected "Name: value"
      """
