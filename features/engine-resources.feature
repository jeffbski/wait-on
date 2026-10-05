@engine
Feature: Waiting for each kind of resource
  A wait succeeds once every resource is available, and a wait that runs out of time
  fails naming the resources that never became available. These scenarios name no
  resource strings and state every timing option, so any runner can run them unchanged.

  @kind:good
  Scenario Outline: an available <kind> is waited for
    Given <given>
    When I wait with timeout 3000ms, interval 100ms, window 100ms, delay 0ms, tcp timeout 300ms and command timeout 0ms
    Then the wait succeeds

    Examples:
      | kind                    | given                                                 |
      | file                    | an existing file                                      |
      | tcp port                | a TCP server on a free port                           |
      | IPv6 tcp port           | a TCP server on the IPv6 loopback                     |
      | unix socket             | a unix socket server                                  |
      | http HEAD               | an HTTP server answering 200                          |
      | http GET                | an HTTP server answering 204 to GET                   |
      | https                   | an HTTPS server answering 200, trusted through its CA |
      | http over a unix socket | an HTTP server on a unix socket answering 200         |
      | command                 | a command that exits 0                                |

  @kind:bad
  Scenario Outline: an unavailable <kind> times out naming it
    Given <given>
    When I wait with timeout 600ms, interval 100ms, window 100ms, delay 0ms, tcp timeout 300ms and command timeout 0ms
    Then the wait times out naming resource 1

    Examples:
      | kind                  | given                                    |
      | file                  | a missing file                           |
      | tcp port              | nothing listening on a free port         |
      | unix socket           | nothing listening on a unix socket       |
      | http HEAD             | an HTTP server answering 500             |
      | http GET              | an HTTP server answering 404 to GET      |
      | https, untrusted leaf | an HTTPS server answering 200, not trusted |
      | command               | a command that exits 1                   |
