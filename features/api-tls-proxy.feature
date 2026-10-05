@api
Feature: TLS material and proxies
  strictSSL is off by default; with it, the ca option names what to trust. cert, key and
  passphrase present a client certificate. A proxy object or HTTP_PROXY / HTTPS_PROXY
  carry the checks through a proxy, unless proxy is false or NO_PROXY names the host.

  @kind:good
  Scenario: a self-signed server is accepted without strictSSL
    Given an HTTPS server with a self-signed certificate
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000 }
      """
    Then the wait resolves

  @kind:bad
  Scenario: strictSSL with an unrelated ca does not trust the server
    Given an HTTPS server with a self-signed certificate
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 600, "interval": 100, "strictSSL": true, "ca": "<otherCert>" }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>
      """

  @kind:good
  Scenario: cert and key present a client certificate
    Given an HTTPS server that requires a client certificate
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "cert": "<cert>", "key": "<key>" }
      """
    Then the wait resolves
    And the server saw an authorized client certificate

  @kind:good
  Scenario: passphrase opens an encrypted client key
    Given an HTTPS server that requires a client certificate
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "cert": "<cert>", "key": "<encryptedKey>", "passphrase": "<passphrase>" }
      """
    Then the wait resolves
    And the server saw an authorized client certificate

  @kind:bad
  Scenario: without a client certificate the server refuses the check
    Given an HTTPS server that requires a client certificate
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 600, "interval": 100 }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>
      """

  @kind:bad
  Scenario: a wrong passphrase leaves the client key closed
    Given an HTTPS server that requires a client certificate
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 600, "interval": 100, "cert": "<cert>", "key": "<encryptedKey>", "passphrase": "wrong" }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>
      """

  @kind:good
  Scenario: a proxy object carries the check
    Given a proxy that records what it carries
    And an HTTP server answering 200
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "proxy": { "host": "127.0.0.1", "port": <proxyPort> } }
      """
    Then the wait resolves
    And the proxy carried "HEAD http://127.0.0.1:<port>/"

  @kind:good
  Scenario: a proxy object's protocol and auth reach the proxy
    Given a proxy that records what it carries
    And an HTTP server answering 200
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "proxy": { "host": "127.0.0.1", "port": <proxyPort>, "protocol": "http", "auth": { "username": "user", "password": "pass" } } }
      """
    Then the wait resolves
    And the proxy carried "HEAD http://127.0.0.1:<port>/" with the authorization "Basic dXNlcjpwYXNz"

  @kind:good
  Scenario: HTTP_PROXY carries the check when proxy is unset
    Given a proxy that records what it carries
    And the environment variable HTTP_PROXY is "<proxy>"
    And an HTTP server answering 200
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000 }
      """
    Then the wait resolves
    And the proxy carried "HEAD http://127.0.0.1:<port>/"

  @kind:good
  Scenario: proxy false ignores HTTP_PROXY
    Given a proxy that records what it carries
    And the environment variable HTTP_PROXY is "<proxy>"
    And an HTTP server answering 200 that records requests
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000, "proxy": false }
      """
    Then the wait resolves
    And the proxy carried nothing
    And the server saw the check

  # 9.5.1: ALL_PROXY carried http checks through the proxy
  @kind:good @since:10
  Scenario: ALL_PROXY is not a proxy setting
    Given a proxy that records what it carries
    And the environment variable ALL_PROXY is "<proxy>"
    And an HTTP server answering 200 that records requests
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000 }
      """
    Then the wait resolves
    And the proxy carried nothing
    And the server saw the check

  @kind:good
  Scenario: NO_PROXY sends a matching host direct
    Given a proxy that records what it carries
    And the environment variable HTTP_PROXY is "<proxy>"
    And the environment variable NO_PROXY is "127.0.0.1"
    And an HTTP server answering 200 that records requests
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 2000 }
      """
    Then the wait resolves
    And the proxy carried nothing
    And the server saw the check

  # Today's behaviour, pinned, and an open defect: EnvHttpProxyAgent receives the TLS options
  # as `connect`, but undici's ProxyAgent builds the tunnelled target's TLS only from
  # `requestTls`, so the check verifies against the default roots even without strictSSL.
  # The follow-up lib/ fix turns this into a good/bad pair.
  @kind:bad @route:js
  Scenario: HTTPS_PROXY tunnels an https check without the TLS options
    Given a proxy that records what it carries
    And the environment variable HTTPS_PROXY is "<proxy>"
    And an HTTPS server with a self-signed certificate
    When the consumer calls waitOn with:
      """
      { "resources": ["<resource 1>"], "timeout": 600, "interval": 100 }
      """
    Then the wait rejects with an Error:
      """
      Timed out waiting for: <resource 1>
      """
    And the proxy carried "CONNECT 127.0.0.1:<port>"
