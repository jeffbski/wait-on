@api
Feature: The Promise and callback forms
  waitOn(opts) returns a Promise. waitOn(opts, cb) calls cb exactly once; when the wait
  runs, cb is called later and waitOn returns undefined. A string or an array is
  shorthand for the resources option. Errors reach the Promise or the callback; they are
  never thrown. Errors found before the wait starts (options, resource syntax, building
  the http client) call back synchronously.

  @kind:good
  Scenario: the Promise form resolves
    Given an existing file
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000 }
      """
    Then the wait resolves
    And waitOn returned a Promise

  @kind:bad
  Scenario: the Promise form rejects with an Error when the wait times out
    Given a missing file
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 300 }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>
      """
    And waitOn returned a Promise

  @kind:good
  Scenario: the callback form calls back once, later, with undefined
    Given an existing file
    When the consumer calls waitOn with a callback and:
      """
      { "resources": ["<resource 1>"], "timeout": 2000 }
      """
    Then the callback was called once, later, with undefined
    And waitOn returned undefined

  @kind:bad
  Scenario: the callback form calls back once, later, with an Error when the wait times out
    Given a missing file
    When the consumer calls waitOn with a callback and:
      """
      { "resources": ["<resource 1>"], "timeout": 300 }
      """
    Then the callback was called once, later, with an Error
    And the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>
      """
    And waitOn returned undefined

  @kind:bad @route:none
  Scenario: an invalid option calls back synchronously and waitOn returns what the callback returned
    When the consumer calls waitOn with a callback and:
      """
      { "resources": ["file:/wait-on-contract-never"], "timeout": 2000, "httpsAgent": {} }
      """
    Then the callback was called once, synchronously, with an Error
    And waitOn returned what the callback returned

  @kind:good
  Scenario: a string is shorthand for one resource
    Given a TCP server on a free port
    When the consumer calls waitOn with:
      """
      "<resource 1>"
      """
    Then the wait resolves

  @kind:good
  Scenario: an array is shorthand for its resources
    Given a TCP server on a free port
    And an existing file
    When the consumer calls waitOn with:
      """
      ["<resource 1>", "<resource 2>"]
      """
    Then the wait resolves

  # 9.5.1: a malformed HTTP_PROXY was ignored for a NO_PROXY host; the wait polled until "Timed out waiting for"
  @kind:bad @route:js @since:10
  Scenario: a malformed env proxy reaches the callback
    Given the environment variable HTTP_PROXY is "proxy.corp:3128"
    And the environment variable NO_PROXY is "localhost"
    When the consumer calls waitOn with a callback and:
      """
      { "resources": ["https://localhost:1/"], "timeout": 2000 }
      """
    Then the callback was called once, synchronously, with an Error
    And waitOn returned undefined
    And the wait rejects with an InvalidArgumentError:
      """
      Invalid URL protocol: the URL must start with `http:` or `https:`.
      """

  # 9.5.1: a proxy host that cannot form a URL was accepted; the wait polled until "Timed out waiting for"
  @kind:bad @route:js @since:10
  Scenario: a proxy object that cannot form a URL reaches the callback
    When the consumer calls waitOn with a callback and:
      """
      { "resources": ["http://localhost:1/"], "timeout": 2000, "proxy": { "host": "bad host", "port": 1 } }
      """
    Then the callback was called once, synchronously, with an Error
    And waitOn returned undefined
    And the wait rejects with a TypeError:
      """
      Invalid URL
      """
