// commitlint config — CI only (no husky). Lints PR commits against Conventional Commits.
//
// KTD6: three in-flight contributor commits carry non-conventional subjects. Ignore those exact
// subjects so PRs #228/#233/#235 do not turn red while they are open. Keep the contributors'
// authorship. REMOVE this `ignores` block (and this comment) once those PRs merge upstream.
const inFlightSubjects = [
  "improve: use Node's util.parseArgs over `minimist`", // d76fa26
  '[Api]: QOL imporvement. Allow string as opts.', // dae5e74
  'Support Windows named pipe paths in http://unix: resources and run tests on Windows', // b594acb
];

module.exports = {
  extends: ['@commitlint/config-conventional'],
  ignores: [(message) => inFlightSubjects.includes(message.split('\n')[0].trim())],
};
