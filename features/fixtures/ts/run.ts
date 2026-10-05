// node dist/run.js '<json opts>': the TypeScript default import, Promise form; prints one JSON line.
import waitOn from 'wait-on';

const start = Date.now();
const result: Record<string, unknown> = { exportType: typeof waitOn };
waitOn(JSON.parse(process.argv[2]))
  .then(() => {
    result.outcome = 'resolved';
  })
  .catch((err: Error) => {
    Object.assign(result, { outcome: 'rejected', errorName: err.name, errorMessage: err.message });
  })
  .finally(() => {
    result.elapsedMs = Date.now() - start;
    console.log(JSON.stringify(result));
  });
