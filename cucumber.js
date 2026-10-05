'use strict';

// The consumer contract (features/), run through `npm run contract` (AGENTS.md).
// Support code is only features/support: cucumber would otherwise load the fixture runners
// under features/fixtures as step definitions. Named profiles merge onto each other, but
// `default` applies only when no profile is named, so `contract:9` names both.
module.exports = {
  default: {
    paths: ['features/**/*.feature'],
    require: ['features/support/**/*.js'],
    strict: true,
    // spike-only scenarios; nothing on this branch reads `engines`
    tags: 'not @engines:multi',
    worldParameters: { engines: ['js'] }
  },
  // the same contract against the published 9.5.1, minus intentional 10.x changes
  baseline: {
    tags: 'not @since:10',
    worldParameters: { package: 'wait-on@9.5.1' }
  }
};
