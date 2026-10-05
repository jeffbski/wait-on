@engine
Feature: Waiting for resources to go away
  In reverse mode a wait succeeds once every resource is unavailable, and times out
  naming the resources that are still there.

  @kind:good
  Scenario Outline: an unavailable <kind> satisfies a reverse wait
    Given <given>
    When I wait in reverse with timeout 3000ms, interval 100ms, window 100ms, delay 0ms, tcp timeout 300ms and command timeout 0ms
    Then the wait succeeds

    Examples:
      | kind        | given                              |
      | file        | a missing file                     |
      | tcp port    | nothing listening on a free port   |
      | unix socket | nothing listening on a unix socket |
      | http HEAD   | an HTTP server answering 500       |
      | http GET    | an HTTP server answering 404 to GET |
      | command     | a command that exits 1             |

  @kind:bad
  Scenario Outline: an available <kind> times out a reverse wait
    Given <given>
    When I wait in reverse with timeout 600ms, interval 100ms, window 100ms, delay 0ms, tcp timeout 300ms and command timeout 0ms
    Then the wait times out naming resource 1

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
