// node run.mjs '<json opts>': the ESM default import, Promise form; prints one JSON line.
import waitOn from 'wait-on';

const start = Date.now();
const result = { exportType: typeof waitOn };
try {
  await waitOn(JSON.parse(process.argv[2]));
  result.outcome = 'resolved';
} catch (err) {
  Object.assign(result, { outcome: 'rejected', errorName: err.name, errorMessage: err.message });
}
result.elapsedMs = Date.now() - start;
console.log(JSON.stringify(result));
