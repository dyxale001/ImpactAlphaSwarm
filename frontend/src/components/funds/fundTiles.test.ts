import { describe, it, expect } from 'vitest'
import { hasPerformance } from './FundPerformance'
import { hasSwings } from './FundSwings'
import { hasAllocation } from './FundAllocation'
import { hasIncome } from './FundIncomeHistory'
import { hasHoldings } from './FundHoldings'
import { hasMinimums } from './FundMinimums'
import { hasPrices } from './FundPriceChart'
import { formatRandAmount } from '../../utils/fundsCopy'

/**
 * The predicates the fund page composes its tabs from.
 *
 * Each one is exported by the component that uses it internally, and that is
 * the whole point of testing them here. The page has to know whether a panel
 * would be empty *before* it renders that panel's tab label, and the failure
 * mode of answering that with a second copy of the condition is silent: a tab
 * that promises figures and opens on nothing, or a tab that never appears for a
 * fund that had something to show.
 *
 * Fixtures are real transcriptions from `backend/data/funds/snapshots.csv`, so
 * the cases these cover are cases the catalogue actually contains.
 */

describe('hasPerformance', () => {
  it('is true for a sheet that prints periods', () => {
    // Coronation Balanced Plus.
    expect(hasPerformance({ '1y': 6.0, '3y': 12.7, '5y': 10.9, '10y': 9.1 })).toBe(true)
  })

  it('is false for nothing, and for an empty object', () => {
    // Fifteen of twenty-six sheets have no performance transcribed at all.
    expect(hasPerformance(null)).toBe(false)
    expect(hasPerformance(undefined)).toBe(false)
    expect(hasPerformance({})).toBe(false)
  })

  it('is false when every value is unusable', () => {
    // A row of non-numbers is not a chart, and the component would drop them
    // all and draw an empty frame.
    expect(hasPerformance({ '1y': Number.NaN, '3y': Number.POSITIVE_INFINITY })).toBe(false)
  })
})

describe('hasSwings', () => {
  it('is true with figures and a basis we can name', () => {
    // Coronation Balanced Plus: +49.3% and -17.4% over rolling twelve months.
    expect(hasSwings(49.3, -17.4, 'rolling_12m')).toBe(true)
    expect(hasSwings(null, -17.4, 'calendar_year')).toBe(true)
  })

  it('is false without a basis, whatever the figures', () => {
    // The strict half. Satrix reports rolling twelve-month periods and FundRock
    // reports calendar years; they answer the same question and are not the
    // same statistic, so a figure whose basis we cannot name is a figure
    // nobody can use.
    expect(hasSwings(49.3, -17.4, null)).toBe(false)
    expect(hasSwings(49.3, -17.4, 'since_launch')).toBe(false)
  })

  it('is false with a basis and no figures', () => {
    expect(hasSwings(null, null, 'rolling_12m')).toBe(false)
  })
})

describe('hasAllocation', () => {
  it('is true for a real breakdown', () => {
    expect(hasAllocation({ 'Domestic equities': 36.2, 'International equities': 37.9 })).toBe(true)
  })

  it('keeps a slice a hundredth of a percent wide', () => {
    // Coronation publishes 0.1% international real estate. It is a figure the
    // manager chose to print, so it is not ours to round away.
    expect(hasAllocation({ 'International real estate': 0.1 })).toBe(true)
  })

  it('is false when every share is zero', () => {
    expect(hasAllocation({ Equities: 0, Cash: 0 })).toBe(false)
    expect(hasAllocation(null)).toBe(false)
  })
})

describe('hasIncome', () => {
  it('is true for declared months', () => {
    expect(hasIncome({ '2026-03': 102.47, '2025-09': 151.16 })).toBe(true)
  })

  it('keeps a month declared as zero', () => {
    // A month printed as "0.00" is a declaration of nothing; a month printed
    // as "-" is absent from the data. The two are different statements and
    // only the first is a figure.
    expect(hasIncome({ '2026-03': 0 })).toBe(true)
  })

  it('is false for nothing', () => {
    expect(hasIncome(null)).toBe(false)
    expect(hasIncome({})).toBe(false)
  })
})

describe('hasHoldings', () => {
  it('is true for a list of positions', () => {
    expect(hasHoldings({ 'Naspers Ltd': 9.16, 'FirstRand Ltd': 7.17 })).toBe(true)
  })

  it('is false for nothing, which is nineteen of the twenty-six sheets', () => {
    expect(hasHoldings(null)).toBe(false)
    expect(hasHoldings({})).toBe(false)
  })

  it('is false when every share is zero', () => {
    expect(hasHoldings({ 'Some Holding': 0 })).toBe(false)
  })
})

describe('hasMinimums', () => {
  it('is true for the four funds that state one', () => {
    expect(hasMinimums(5000, 500)).toBe(true) // Coronation Balanced Plus
    expect(hasMinimums(10000, null)).toBe(true) // the three Ninety One funds
    expect(hasMinimums(null, 500)).toBe(true)
  })

  it('is FALSE for a zero, which is the case that matters', () => {
    // Twelve of the fifteen transcribed minimums are 0 — every FundRock
    // boutique fund, all carrying 0/0, which reads as one bulk seed default
    // rather than twelve separate readings. Rendered, "R0" would say a reader
    // can start with nothing: a claim no document made, and a good deal more
    // consequential than a blank.
    expect(hasMinimums(0, 0)).toBe(false)
    expect(hasMinimums(0, null)).toBe(false)
  })

  it('is false when the sheet states neither', () => {
    expect(hasMinimums(null, null)).toBe(false)
    expect(hasMinimums(undefined, undefined)).toBe(false)
  })
})

describe('hasPrices', () => {
  const close = (date: string, close_zar: number) => ({ date, close_zar })
  const series = (closes: Array<{ date: string; close_zar: number }>) => ({
    fund_id: 'f1',
    listed: true,
    currency: 'ZAR' as const,
    closes,
    note: '',
  })

  it('is true for a listed fund with a line to draw', () => {
    expect(hasPrices(series([close('2026-07-30', 103.1), close('2026-07-31', 103.4)]))).toBe(true)
  })

  it('is false for a unit trust, which has no market price at all', () => {
    expect(hasPrices({ ...series([close('2026-07-31', 103.4)]), listed: false })).toBe(false)
  })

  it('is false for a single close', () => {
    // One point is a dot, and a dot drawn on a price axis reads as a flat year.
    expect(hasPrices(series([close('2026-07-31', 103.4)]))).toBe(false)
  })

  it('is false when prices were never fetched', () => {
    expect(hasPrices(null)).toBe(false)
  })
})

describe('formatRandAmount', () => {
  // The separator is a NON-BREAKING space, written as an escape here on
  // purpose: a literal one is invisible in a diff, and the next person to
  // retype this line would put an ordinary space in and get a failure with no
  // visible cause. It is non-breaking so "R5 000" cannot wrap across two lines
  // inside a tile.
  const nb = '\u00a0'

  it('groups thousands with a space, the way the sheets print them', () => {
    expect(formatRandAmount(5000)).toBe(`R5${nb}000`)
    expect(formatRandAmount(10000)).toBe(`R10${nb}000`)
    expect(formatRandAmount(500)).toBe('R500')
    expect(formatRandAmount(1000000)).toBe(`R1${nb}000${nb}000`)
  })

  it('rounds to whole rand', () => {
    // No sheet prints a minimum in cents, and "R5 000.00" in a tile of round
    // numbers reads as a precision the document never claimed.
    expect(formatRandAmount(4999.6)).toBe(`R5${nb}000`)
  })

  it('is null at zero and below', () => {
    expect(formatRandAmount(0)).toBeNull()
    expect(formatRandAmount(-100)).toBeNull()
    expect(formatRandAmount(null)).toBeNull()
    expect(formatRandAmount(undefined)).toBeNull()
    expect(formatRandAmount(Number.NaN)).toBeNull()
  })
})
