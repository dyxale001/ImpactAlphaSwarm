import { describe, it, expect } from 'vitest'
import { discoveryProvenance } from './discovery'

// The tooltip on the "Discovered" badge. It is user-facing copy that makes a
// claim about where a candidate came from, so a wrong or empty phrase is a
// transparency problem rather than a cosmetic one.

describe('discoveryProvenance', () => {
  it.each([
    ['stocktwits_trending', 'trending on StockTwits'],
    ['llm', 'an AI sector scan'],
    ['yfinance_screener', 'a market-activity screen'],
  ])('names the %s source in plain language', (source, phrase) => {
    expect(discoveryProvenance([source])).toContain(phrase)
  })

  it('joins multiple sources', () => {
    const text = discoveryProvenance(['stocktwits_trending', 'llm'])
    expect(text).toContain('trending on StockTwits + an AI sector scan')
  })

  it('lists sources in a fixed order regardless of how they arrive', () => {
    // The order comes from the code, not the array, so the same asset reads the
    // same way on every render.
    const forward = discoveryProvenance(['stocktwits_trending', 'llm', 'yfinance_screener'])
    const reversed = discoveryProvenance(['yfinance_screener', 'llm', 'stocktwits_trending'])
    expect(forward).toBe(reversed)
    expect(forward).toContain('trending on StockTwits + an AI sector scan + a market-activity screen')
  })

  it.each([[null], [undefined], [[]], [['something_unrecognised']]])(
    'falls back to a generic attribution for %s',
    (sources) => {
      expect(discoveryProvenance(sources as string[] | null | undefined))
        .toContain('via the discovery agent')
    },
  )

  it('never produces a dangling phrase', () => {
    for (const sources of [null, undefined, [], ['llm'], ['llm', 'bogus']]) {
      const text = discoveryProvenance(sources as string[] | null | undefined)
      expect(text).not.toContain('via ,')
      expect(text).not.toContain('via .')
      expect(text.endsWith('validated before being analysed.')).toBe(true)
    }
  })

  it('always states that the candidate was validated', () => {
    // The bouncer gates (IPO age, market cap, liquidity, trusted coverage) are
    // the reason a discovered asset is allowed in at all, so the claim must
    // survive any edit to the source list.
    expect(discoveryProvenance(['llm'])).toContain('validated before being analysed')
  })
})
