import { describe, expect, it } from 'vitest'
import type { MacroArticle } from '../services/api/macroNews'
import {
  SECTOR_SETTING,
  latestTagged,
  leadStories,
  leadTag,
  readSector,
  showsOverview,
  storyLimit,
} from './macroNewsWidgets'

const UNIVERSES = ['Technology', 'Finance', 'Energy']
const MW = 'Market-wide'

function story(id: number, extra: Partial<MacroArticle> = {}): MacroArticle {
  return {
    id,
    headline: `Story ${id}`,
    blurb: '',
    source: 'Wire',
    url: `https://example.invalid/${id}`,
    image_url: null,
    published_at: `2026-10-${String(10 + id).padStart(2, '0')}T08:00:00Z`,
    scored: true,
    relevance: 0.9,
    market_wide: 0.1,
    universes: { Technology: 0.1, Finance: 0.1, Energy: 0.1 },
    tags: [],
    ...extra,
  }
}

describe('which sector a widget follows', () => {
  it('the one it was set to, matched without regard to case', () => {
    expect(readSector({ [SECTOR_SETTING]: ' finance ' }, UNIVERSES, ['Energy'])).toBe('Finance')
  })

  it('falls back to the first onboarding sector when unset or no longer offered', () => {
    expect(readSector({}, UNIVERSES, ['Energy', 'Technology'])).toBe('Technology')
    expect(readSector({ [SECTOR_SETTING]: 'Crypto' }, UNIVERSES, ['Energy'])).toBe('Energy')
  })

  it('then to the first universe, and to nothing only when there are none', () => {
    expect(readSector(undefined, UNIVERSES, null)).toBe('Technology')
    expect(readSector(undefined, [], ['Energy'])).toBeNull()
  })

  it('ignores a setting that is not a string', () => {
    expect(readSector({ [SECTOR_SETTING]: 7 }, UNIVERSES, null)).toBe('Technology')
  })
})

describe('what fits', () => {
  it('lists more stories as the widget grows, and the overview from medium up', () => {
    expect([storyLimit('small'), storyLimit('medium'), storyLimit('wide')]).toEqual([3, 4, 6])
    expect([showsOverview('small'), showsOverview('medium'), showsOverview('wide')]).toEqual([false, true, true])
  })
})

describe('choosing stories', () => {
  it('a group list keeps its order, drops commentary and stops at the limit', () => {
    const stories = [story(1), story(2, { commentary: true }), story(3), story(4)]
    expect(leadStories(stories, 2).map((s) => s.id)).toEqual([1, 3])
  })

  it('the latest list is newest first, tagged only, commentary left out', () => {
    const tagged = [
      story(1, { tags: ['Finance'] }),
      story(5, { tags: ['Energy'] }),
      story(3, { tags: [] }),
      story(4, { tags: ['Technology'], commentary: true }),
      story(2, { tags: [MW] }),
    ]
    expect(latestTagged(tagged, 3).map((s) => s.id)).toEqual([5, 2, 1])
  })

  it('labels a story with the tag it is most relevant to', () => {
    const s = story(1, {
      tags: ['Finance', MW],
      market_wide: 0.92,
      universes: { Technology: 0.1, Finance: 0.71, Energy: 0.1 },
    })
    expect(leadTag(s, MW)).toBe(MW)
    expect(leadTag(story(2), MW)).toBeNull()
  })
})
