import { defineConfig } from 'vitest/config'

// The CORE tier of the frontend suite: the calculations and validation a user
// sees the result of. Runs on every pull request; the full suite
// (vitest.config.ts) runs on main and nightly. Selection rule and the reasoning
// are in TESTING.md under "Tiers". Keep this list short and deliberate -- a file
// is core when a failure means a wrong number, a wrong recommendation, or a
// guard that did not fire.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/utils/scoringEngine.test.ts',
      'src/utils/compoundInterest.test.ts',
      'src/utils/tfsaPlanner.test.ts',
      'src/utils/validation.test.ts',
      'src/utils/learningRoadmap.test.ts',
    ],
  },
})
