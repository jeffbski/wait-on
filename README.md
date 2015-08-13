# wait-on - wait for files, ports, sockets, http(s) resources

wait-on is a command line utility which will wait for files, ports, sockets, and http(s) resources to become available. Functionality is also available via a Node.js API. Cross-platform runs everywhere Node.js runs (linux, unix, mac OS X, windows)

wait-on will wait for period of time for a file to stop growing before triggering availability which is good for monitoring files that are being built. Likewise wait-on will wait for period of time for other resources to remain available before triggering success.

For http(s) resources wait-on will check that the requests are returning 2XX (success) to HEAD requests (after following any redirects).

[![Build Status](https://secure.travis-ci.org/jeffbski/wait-on.png?branch=master)](http://travis-ci.org/jeffbski/wait-on)

## Installation

Requires node.js/iojs >= 0.10

```bash
npm install wait-on # local version
OR
npm install -g wait-on # global version
```

## Usage

Use from command line or using Node.js programmatic API.

### CLI Usage

Assuming NEXT_CMD is the command to run when resources are available, then wait-on will wait and then exit with successfull exit code (0) once all resrouces are available causing NEXT_CMD to be run.

If wait-on is interrupted before all resources are available, it will exit with non-zero exit code and thus NEXT_CMD will not be run.

```bash
wait-on file1 && NEXT_CMD # wait for file1, then exec NEXT_CMD
wait-on f1 f2 && NEXT_CMD # wait for both f1 and f2, the exec NEXT_CMD
wait-on http://localhost:8000/foo && NEXT_CMD # wait for http 2XX HEAD
wait-on https://myserver/foo && NEXT_CMD # wait for https 2XX HEAD
wait-on tcp:4000 && NEXT_CMD # wait for service to listen on a TCP port
wait-on socket:/path/mysock # wait for service to listen on domain socket
wait-on http://unix:/var/SOCKPATH:/a/foo # wait for http on domain socket
```

```
Usage: wait-on {OPTIONS} resource [...resource]

Description:

     wait-on is a command line utility which will wait for files, ports,
     sockets, and http(s) resources to become available. Exits with
     success code (0) when all resources are ready. Non-zero exit code
     if interrupted or timed out.

     In shell combine with && to conditionally run another command
     once resources are available. ex: wait-on f1 && NEXT_CMD

     resources types are defined by their prefix, if no prefix is
     present, the resource is assumed to be of type 'file'

     resource prefixes are:

       file:   - regular file (also default type). ex: file:/path/to/file
       http:   - HTTP HEAD returns 2XX response. ex: http://m.com:90/foo
       https:  - HTTPS HEAD returns 2XX response. ex: https://my/bar
       tcp:    - TCP port is listening. ex: 1.2.3.4:9000 or foo.com:700
       socket: - Domain Socket is listening. ex: socket:/path/to/sock
                 For http over socket, use http://unix:SOCK_PATH:URL_PATH
                   like http://unix:/path/to/sock:/foo/bar

Standard Options:

 -d, --delay

  Initial delay before checking for resources in ms, default 0

 -i, --interval

  Interval to poll resources in ms, default 250ms

 -t, --timeout

  Maximum time in ms to wait before exiting with failure (1) code,
  default Infinity

 -v, --verbose

  Enable debug output to stdout

 -w, --window

  Stability window, the time in ms defining the window of time that
  resource needs to have not changed (file size or availability) before
  signalling success, default 750ms. If less than interval, it will be
  reset to the value of interval.

 -h, --help

  Show this message
```

### Node.js API usage

```javascript
var waitOn = require('wait-on');
var opts = {
  resources: [
    'file1',
    'http://foo.com:8000/bar',
    'https://my.com/cat',
    'tcp:foo.com:8000',
    'socket:/my/sock',
    'http://unix:/my/sock:/my/url'
  ],
  delay: 1000, // initial delay in ms, default 0
  interval: 100, // poll interval in ms, default 250ms
  timeout: 30000, // timeout in ms, default Infinity
  window: 1000, // stabilization time in ms, default 750ms
};
waitOn(opts, function (err) {
  if (err) { return handleError(err); }
  // once here, all resources are available
});
```

waitOn(opts, cb) - function which triggers resource checks

 - opts.resources - array of string resources to wait for. prefix determines the type of resource with the default type of `file:`
 - opts.delay - optional initial delay in ms, default 0
 - opts.interval - optional poll resource interval in ms, default 250ms
 - opts.timeout - optional timeout in ms, default Infinity. Aborts with error.
 - opts.verbose - optional flag which outputs debug output, default false
 - opts.window - optional stabilization time in ms, default 750ms. Waits this amount of time for file sizes to stabilize or other resource availability to remain unchanged.
 - cb(err) - if err is provided then, resource checks did not succeed


## Goals

 - simple command line utility and Node.js API for waiting for resources
 - wait for files to stabilize
 - wait for http(s) resources to return 2XX in response to HEAD request
 - wait for services to be listening on tcp ports
 - wait for services to be listening on unix domain sockets
 - configurable initial delay, poll interval, stabilization window, timeout
 - command line utility returns success code (0) when resources are availble
 - cross platform - runs anywhere Node.js runs (linux, unix, mac OS X, windows)

## Why

I frequently need to wait on build tasks to complete or services to be available before starting next command, so this project makes that easier and is portable to everywhere Node.js runs.

## Get involved

If you have input or ideas or would like to get involved, you may:

 - contact me via twitter @jeffbski  - <http://twitter.com/jeffbski>
 - open an issue on github to begin a discussion - <https://github.com/jeffbski/wait-on/issues>
 - fork the repo and send a pull request (ideally with tests) - <https://github.com/jeffbski/wait-on>

## License

 - [MIT license](http://github.com/jeffbski/wait-on/raw/master/LICENSE)
