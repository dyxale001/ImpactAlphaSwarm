import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_TABS,
  SETTINGS_TAB_LABELS,
  parseSettingsTab,
  settingsPath,
} from './settingsTabs'

/**
 * The claim: a link into Settings lands on the view it names, and anything
 * else lands somewhere sensible.
 *
 * Other pages build these links — the fund-bracket tile sends someone with no
 * profile to the questions — so the round trip from `settingsPath` back through
 * `parseSettingsTab` has to hold, and a stale or mistyped value must fall back
 * to the default rather than an empty page.
 */

describe('parsing the tab from the URL', () => {
  it.each(SETTINGS_TABS)('accepts %s', (tab) => {
    expect(parseSettingsTab(tab)).toBe(tab)
  })

  it.each([null, undefined, '', 'Profile', 'billing', 'account '])(
    'falls back to the default for %s',
    (value) => {
      expect(parseSettingsTab(value)).toBe(DEFAULT_SETTINGS_TAB)
    },
  )

  it('opens on the investor profile, where the questionnaire lives', () => {
    expect(DEFAULT_SETTINGS_TAB).toBe('profile')
  })
})

describe('building a link to a tab', () => {
  it.each(SETTINGS_TABS)('round-trips %s', (tab) => {
    const url = new URL(settingsPath(tab), 'http://localhost')
    expect(url.pathname).toBe('/settings')
    expect(parseSettingsTab(url.searchParams.get('tab'))).toBe(tab)
  })

  it('has a label for every tab', () => {
    for (const tab of SETTINGS_TABS) {
      expect(SETTINGS_TAB_LABELS[tab].length).toBeGreaterThan(0)
    }
  })
})
