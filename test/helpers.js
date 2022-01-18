const getPort = global.getPort;

function getAsyncDone() {
  let done;
  const promise = new Promise((resolve, reject) => {
    done = (err) => {
      if (err) {
        reject(err);
      }

      resolve();
    };
  });

  return { promise, done };
}

function wrapAsync(fn) {
  return () => {
    const { promise, done } = getAsyncDone();

    fn(done);

    return promise;
  };
}

function itConcurrent(name, fn, timeout) {
  return it.concurrent(name, wrapAsync(fn), timeout);
}

module.exports = {
  getPort,
  itConcurrent,
};
