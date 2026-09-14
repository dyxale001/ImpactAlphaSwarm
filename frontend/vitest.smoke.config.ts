import { defineConfig } from 'vitest/config'

// The SMOKE tier of the frontend suite: one small file per user-facing feature
// area, so that a single fast run touches every feature once. Breadth, not
// depth -- the depth lives in vitest.core.config.ts (money path) and
// vitest.config.ts (everything). Vitest has no per-test marker, so the unit of
// selection here is a file; keep each pick the smallest file that exercises
// the feature; even so, table-driven files mean this tier is about the size of
// the frontend core -- different content, not less of it. Runs on every push (.github/workflows/tests.yml). See
// TESTING.md under "Tiers".
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/dashboard/quantWidgetSettings.test.ts',      // dashboard widgets
      'src/dashboard/guideSteps.test.ts',               // onboarding tour
      'src/utils/goalAnswers.test.ts',                  // onboarding questionnaire / goals
      'src/utils/learningRoadmap.test.ts',              // learning centre: personalised roadmap
      'src/utils/learningBadgeMilestones.test.ts',      // gamification: badges
      'src/components/research/sentimentDays.test.ts',  // research page: sentiment
      'src/utils/fundsCommonCore.test.ts',              // funds catalogue
      'src/utils/discovery.test.ts',                    // asset discovery presentation
      'src/utils/profileHistory.test.ts',               // profile / risk history
      'src/utils/assetsLoading.test.ts',                // staged loading screen
      'src/utils/settingsCopy.test.ts',                 // settings
    ],
  },
})
