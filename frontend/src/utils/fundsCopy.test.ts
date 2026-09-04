import { describe, it, expect } from 'vitest'
import {
  FORBIDDEN_TERMS,
  allStrings,
  findForbiddenTerms,
  formatAsAt,
  formatFundSize,
  formatMinTerm,
  formatPercent,
} from './fundsCopy'

/**
 * Two claims.
 *
 * The first is the legal one, and it is the reason this file exists. The product
 * is not a licensed financial services provider, so a fund page may describe a
 * filter over published labels and may not read as a proposal. That lives
 * entirely in wording, so it needs a test rather than good intentions. The
 * backend scans its own strings the same way; this covers the page furniture,
 * which is the half a component author is most likely to add to.
 *
 * The second is that the formatters render a fact sheet's figures the way the
 * sheet prints them. A charge shown as 1.2599999 or a date as 2026-07-31 is not
 * wrong, but it reads as a machine's output rather than as a quotation from a
 * document, which is what it is.
 */

describe('the forbidden-term scan', () => {
  it.each([
    ['We recommend this fund.', 'recommend'],
    ['This fund is suitable.', 'suitable'],
    ['You should hold it.', 'should'],
    ['The best in its class.', 'best'],
    ['Our top pick.', 'top pick'],
    ['An ideal option.', 'ideal'],
    ['It outperformed.', 'outperform'],
    ['Where to buy.', 'buy'],
    ['A safe home for cash.', 'safe'],
    ['Returns are guaranteed.', 'guaranteed'],
    ['Chosen for you.', 'for you'],
  ])('catches %s', (text, expected) => {
    expect(findForbiddenTerms(text)).toContain(expected)
  })

  it.each([
    'Read about fund safety.',
    "The buyer's own research matters.",
    'Idealism is not a strategy.',
    'Performance is reported by the manager.',
    'you told us your risk profile is Conservative',
  ])('does not flag %s', (text) => {
    // A scan with false positives is a scan somebody disables.
    expect(findForbiddenTerms(text)).toEqual([])
  })

  it('has a pattern for every listed term', () => {
    for (const term of FORBIDDEN_TERMS) {
      const probe = `A sentence containing ${term} inside it.`
      expect(findForbiddenTerms(probe).length).toBeGreaterThan(0)
    }
  })
})

describe('the shipped page copy', () => {
  it('contains no forbidden term', () => {
    const offenders = allStrings()
      .map((text) => [text, findForbiddenTerms(text)] as const)
      .filter(([, found]) => found.length > 0)
    expect(offenders).toEqual([])
  })

  it('actually scanned something', () => {
    // Guards the test above: an empty allStrings would police nothing.
    const strings = allStrings()
    expect(strings.length).toBeGreaterThan(20)
    for (const text of strings) {
      expect(text.trim()).not.toBe('')
    }
  })
})

describe('formatPercent', () => {
  it('prints a charge the way a fact sheet does', () => {
    expect(formatPercent(1.26)).toBe('1.26%')
    expect(formatPercent(0.1)).toBe('0.1%')
    expect(formatPercent(12)).toBe('12%')
  })

  it('trims floating-point noise', () => {
    expect(formatPercent(1.2599999999)).toBe('1.26%')
  })

  it('is null when there is nothing published', () => {
    // So the card omits the line rather than showing "null%".
    expect(formatPercent(null)).toBeNull()
    expect(formatPercent(undefined)).toBeNull()
    expect(formatPercent(NaN)).toBeNull()
  })
})

describe('formatFundSize', () => {
  it('scales to something readable', () => {
    expect(formatFundSize(12_000_000_000)).toBe('R12bn')
    expect(formatFundSize(1_500_000_000)).toBe('R1.5bn')
    expect(formatFundSize(739_191_735)).toBe('R739m')
  })

  it('is null when absent or zero', () => {
    expect(formatFundSize(null)).toBeNull()
    expect(formatFundSize(0)).toBeNull()
  })
})

describe('formatAsAt', () => {
  it('reads as a date in a sentence', () => {
    expect(formatAsAt('2026-07-31')).toBe('31 July 2026')
    expect(formatAsAt('2026-07-01')).toBe('1 July 2026')
  })

  it('shows an unrecognised value as stored rather than guessing', () => {
    // A wrong date beside a figure is worse than an ugly one.
    expect(formatAsAt('July 2026')).toBe('July 2026')
    expect(formatAsAt('2026-13-45')).toBe('2026-13-45')
  })

  it('is null when there is no date', () => {
    expect(formatAsAt(null)).toBeNull()
    expect(formatAsAt('')).toBeNull()
  })
})

describe('formatMinTerm', () => {
  it('uses months below a year', () => {
    expect(formatMinTerm(0.25)).toBe('3 months')
    expect(formatMinTerm(1 / 12)).toBe('1 month')
  })

  it('uses years above one', () => {
    expect(formatMinTerm(1)).toBe('1 year')
    expect(formatMinTerm(3)).toBe('3 years')
    expect(formatMinTerm(5.5)).toBe('5.5 years')
  })

  it('is null when the sheet states none', () => {
    // Silence is not a claim, and the card omits the line.
    expect(formatMinTerm(null)).toBeNull()
    expect(formatMinTerm(0)).toBeNull()
  })
})
