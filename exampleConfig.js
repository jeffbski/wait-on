module.exports = {
  // specify additional options here, especially http(s)
  // see https://nodejs.org/api/tls.html#tls_tls_connect_options_callback for specifics
  ca: [
    /* strings or binaries */
  ],
  cert: [
    /* strings or binaries */
  ],
  key: [
    /* strings or binaries */
  ],
  passphrase: 'yourpassphrase',
  auth: {
    username: 'yourusername',
    password: 'yourpassword'
  },
  strictSSL: false,
  followRedirect: false,
  headers: {
    'x-custom': 'headers'
  },
  // validateStatus decides which HTTP status codes count as success.
  // It is a function, so it can only be set from a .js config (not JSON).
  // This example treats any non-5xx response as success (default accepts 2XX).
  validateStatus: function (status) {
    return status < 500;
  },
  // optional default resources if not specified in command args
  resources: ['http://foo/bar', 'http://cat/dog']
};
