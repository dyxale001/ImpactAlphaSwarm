import { describe, it, expect } from 'vitest'
import type { MacroArticle } from '../services/api/macroNews'
import {
  blurbRepeatsHeadline,
  displayHeadline,
  filterByTag,
  formatProbability,
  groupByDay,
  probabilityRows,
  shortLabel,
  shortWhen,
  splitScores,
  storiesFor,
  tagCounts,
  userSectors,
} from './macroNews'

// What a reader of the Market News page sees: every probability, in order, with
// nothing dropped. A row that silently disappeared would undercut the page's one
// promise, which is that the model's numbers are all on show.

const UNIVERSES = ['Technology', 'Green Energy', 'Finance', 'AI & Robotics', 'Healthcare', 'Media & Communications']
const MW = 'Market-wide'

function article(over: Partial<MacroArticle> = {}): MacroArticle {
  return {
    id: 1,
    headline: 'Fed signals it may pause rate cuts',
    blurb: '',
    source: 'Reuters',
    url: 'https://www.reuters.com/x',
    image_url: null,
    published_at: '2026-10-04T10:00:00Z',
    scored: true,
    relevance: 0.99,
    market_wide: 0.98,
    universes: Object.fromEntries(UNIVERSES.map((u) => [u, 0.02])),
    tags: [MW, 'Finance'],
    ...over,
  }
}

describe('probabilityRows', () => {
  it('lists market-wide and every universe, highest first', () => {
    const a = article({ universes: { ...article().universes, Finance: 0.97 } })
    const rows = probabilityRows(a, UNIVERSES, MW)
    expect(rows).toHaveLength(UNIVERSES.length + 1)
    expect(rows.map((r) => r.label).slice(0, 2)).toEqual([MW, 'Finance'])
    expect(rows[0]).toMatchObject({ tagged: true, marketWide: true })
    expect(rows.find((r) => r.label === 'Healthcare')!.tagged).toBe(false)
  })

  it('keeps unscored rows, at the bottom', () => {
    const a = article({ universes: { ...article().universes, 'Media & Communications': null } })
    const rows = probabilityRows(a, UNIVERSES, MW)
    expect(rows[rows.length - 1]).toMatchObject({ label: 'Media & Communications', p: null })
  })
})

describe('splitScores', () => {
  it('boxes tagged and notable scores and keeps the near-zero rest', () => {
    const a = article({ universes: { ...article().universes, Finance: 0.33, Healthcare: 0.04 }, market_wide: 0.86, tags: [MW] })
    const { cells, rest } = splitScores(probabilityRows(a, UNIVERSES, MW))
    expect(cells.map((c) => c.label)).toEqual([MW, 'Finance'])
    expect(rest).toHaveLength(UNIVERSES.length - 1)
    expect(cells.length + rest.length).toBe(UNIVERSES.length + 1)
  })

  it('always boxes a tagged score, even under the floor', () => {
    const a = article({ market_wide: 0.05, tags: [MW] })
    expect(splitScores(probabilityRows(a, UNIVERSES, MW)).cells.map((c) => c.label)).toContain(MW)
  })

  it('puts unscored rows with the rest', () => {
    const a = article({ universes: { ...article().universes, Healthcare: null } })
    const { rest } = splitScores(probabilityRows(a, UNIVERSES, MW))
    expect(rest.find((r) => r.label === 'Healthcare')!.p).toBeNull()
  })
})

describe('shortLabel', () => {
  it('shortens the long universe names and leaves unknown ones alone', () => {
    expect(shortLabel('Media & Communications')).toBe('Media')
    expect(shortLabel('Healthcare')).toBe('Health')
    expect(shortLabel('Space')).toBe('Space')
  })
})

describe('blurbRepeatsHeadline', () => {
  it('hides the Reuters pattern and empty blurbs', () => {
    expect(blurbRepeatsHeadline('Oil jumps 4%', 'Oil jumps 4%  Reuters')).toBe(true)
    expect(blurbRepeatsHeadline('Oil jumps 4% - Reuters', 'Oil jumps 4%  Reuters', 'Reuters')).toBe(true)
    expect(blurbRepeatsHeadline("IEA's Birol says oil prices falling - Reuters", "IEA's Birol says oil prices falling  Reuters", 'Reuters')).toBe(true)
    expect(blurbRepeatsHeadline('Oil jumps 4%', '')).toBe(true)
  })
  it('keeps a real summary', () => {
    expect(blurbRepeatsHeadline('Private capital is reshaping Hollywood', 'As financing diversifies, private capital funds more films.')).toBe(false)
  })
})

describe('displayHeadline', () => {
  it('drops a trailing " - Publisher" the card already shows', () => {
    expect(displayHeadline('Oil jumps 4% - Reuters', 'Reuters')).toBe('Oil jumps 4%')
    expect(displayHeadline('Nvidia hits a record', 'CNBC')).toBe('Nvidia hits a record')
  })
})

describe('filters and counts', () => {
  const list = [article({ id: 1 }), article({ id: 2, tags: ['Healthcare'] })]
  it('filters by tag, or not at all', () => {
    expect(filterByTag(list, 'Healthcare').map((a) => a.id)).toEqual([2])
    expect(filterByTag(list, null)).toHaveLength(2)
  })
  it('counts every tag a story carries', () => {
    expect(tagCounts(list)).toEqual({ [MW]: 1, Finance: 1, Healthcare: 1 })
  })
})

describe('groupByDay', () => {
  it('labels today and yesterday and orders newest first', () => {
    const now = new Date(2026, 9, 4, 18, 0)
    const at = (d: number, h: number) => new Date(2026, 9, d, h, 0).toISOString()
    const groups = groupByDay(
      [article({ id: 1, published_at: at(3, 9) }), article({ id: 2, published_at: at(4, 8) }), article({ id: 3, published_at: at(4, 15) }), article({ id: 4, published_at: at(1, 12) })],
      now,
    )
    expect(groups.map((g) => g.label).slice(0, 2)).toEqual(['Today', 'Yesterday'])
    expect(groups[0].articles.map((a) => a.id)).toEqual([3, 2])
    expect(groups).toHaveLength(3)
  })
})

describe('formatProbability', () => {
  it('shows a percentage, or a dash when there is no score', () => {
    expect(formatProbability(0.824)).toBe('82%')
    expect(formatProbability(null)).toBe('–')
  })
})

describe('storiesFor', () => {
  it('keeps a group\'s tagged stories, most relevant first', () => {
    const list = [
      article({ id: 1, tags: ['Finance'], universes: { ...article().universes, Finance: 0.7 } }),
      article({ id: 2, tags: ['Healthcare'], universes: { ...article().universes, Healthcare: 0.9 } }),
      article({ id: 3, tags: ['Finance'], universes: { ...article().universes, Finance: 0.95 } }),
    ]
    expect(storiesFor(list, 'Finance', MW).map((a) => a.id)).toEqual([3, 1])
  })
  it('ranks market-wide stories by their market-wide score', () => {
    const list = [article({ id: 1, market_wide: 0.7 }), article({ id: 2, market_wide: 0.98 })]
    expect(storiesFor(list, MW, MW).map((a) => a.id)).toEqual([2, 1])
  })
})

describe('userSectors', () => {
  it('keeps known sectors in the feed order and drops the rest', () => {
    expect(userSectors(['Healthcare', 'Space', 'Technology'], UNIVERSES)).toEqual(['Technology', 'Healthcare'])
  })
  it('treats a missing or malformed choice as none', () => {
    expect(userSectors(undefined, UNIVERSES)).toEqual([])
    expect(userSectors('Technology', UNIVERSES)).toEqual([])
  })
})

describe('shortWhen', () => {
  it('names today and yesterday, and dates anything older', () => {
    const now = new Date(2026, 9, 4, 18, 0)
    expect(shortWhen(new Date(2026, 9, 4, 9, 30).toISOString(), now)).toMatch(/^Today /)
    expect(shortWhen(new Date(2026, 9, 3, 9, 30).toISOString(), now)).toMatch(/^Yesterday /)
    expect(shortWhen(new Date(2026, 9, 1, 9, 30).toISOString(), now)).not.toMatch(/Today|Yesterday/)
  })
})
