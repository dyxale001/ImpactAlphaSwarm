import { describe, it, expect } from 'vitest'
import type { MacroArticle } from '../services/api/macroNews'
import {
  blurbRepeatsHeadline,
  displayHeadline,
  filterByTag,
  formatProbability,
  groupByDay,
  probabilityRows,
  tagCounts,
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
