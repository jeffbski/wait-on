@api
Feature: HTTP request options
  headers and auth are sent with every check, redirects are followed unless
  followRedirect is false, validateStatus replaces the 2xx rule, and httpTimeout fails a
  check whose response does not arrive in time.

  @kind:good
  Scenario: headers reach the server
    Given an HTTP server answering 200 that records requests
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "headers": { "x-contract": "yes" } }
      """
    Then the wait resolves
    And the server saw the header "x-contract" as "yes"

  @kind:good
  Scenario: auth is sent as a Basic authorization header
    Given an HTTP server answering 200 that records requests
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "auth": { "username": "user", "password": "pass" } }
      """
    Then the wait resolves
    And the server saw the header "authorization" as "Basic dXNlcjpwYXNz"

  @kind:good
  Scenario: a redirect is followed by default
    Given an HTTP server redirecting to a page answering 200
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000 }
      """
    Then the wait resolves

  @kind:bad
  Scenario: followRedirect false treats the redirect as the answer
    Given an HTTP server redirecting to a page answering 200
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 600, "interval": 100, "followRedirect": false }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>
      """

  @kind:good
  Scenario: validateStatus accepts a status outside 2xx
    Given an HTTP server answering 403
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "validateStatus": "return status === 403" }
      """
    Then the wait resolves

  @kind:bad
  Scenario: without validateStatus a 403 is not available
    Given an HTTP server answering 403
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 600, "interval": 100 }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>
      """

  @kind:good
  Scenario: httpTimeout fails a check that gets no answer, which satisfies a reverse wait
    Given an HTTP server that never answers
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "interval": 100, "reverse": true, "httpTimeout": 200 }
      """
    Then the wait resolves

  @kind:bad
  Scenario: without httpTimeout a check that gets no answer keeps a reverse wait waiting
    Given an HTTP server that never answers
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 1000, "interval": 100, "reverse": true }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>
      """
