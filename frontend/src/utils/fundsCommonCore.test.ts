import { describe, it, expect } from 'vitest'
import {
  findForbiddenTerms,
  formatDistributionMonth,
  formatExtremesBasis,
  formatFeePeriod,
  formatNav,
  formatSignedPercent,
} from './fundsCopy'

/**
 * The formatters for the regulated common core.
 *
 * Two of these carry a claim rather than a format. `formatNav` converts a stored
 * cents-per-unit figure into rand, and it is the only place that conversion
 * happens, because the two managers in the catalogue print the price in
 * different units — Satrix in rand ("NAV Price R9.23"), FundRock in cents
 * ("183.63 cents") — so one of them is always being converted. Getting it wrong
 * is a factor-of-a-hundred error on the one figure that is a unit trust's whole
 * price, and no range check can catch it: plausible rand prices and plausible
 * cent prices overlap almost entirely.
 *
 * `formatExtremesBasis` refuses to render an unknown basis, and that refusal is
 * load-bearing rather than defensive. Satrix publishes its strongest and weakest
 * year over rolling twelve-month periods, FundRock over calendar years since
 * inception. If the basis renders as nothing, the section that shows the figures
 * does not draw at all — which is the intended outcome, because a figure whose
 * basis cannot be named cannot honestly be put beside another fund's.
 */

describe('formatNav', () => {
  it('renders a Satrix ETF price back as the sheet prints it', () => {
    // "NAV Price R9.23" is stored as 923 cents.
    expect(formatNav(923)).toBe('R9.23')
  })

  it('renders a unit trust price in rand', () => {
    // FundRock prints "183.63 cents", stored as 183.63.
    expect(formatNav(183.63)).toBe('R1.84')
  })

  it('groups thousands so a large price stays readable', () => {
    expect(formatNav(10339)).toBe('R103.39')
    expect(formatNav(1234567)).toMatch(/^R12\D?345\.67$/)
  })

  it('always shows two decimals, because a price is a price', () => {
    expect(formatNav(500)).toBe('R5.00')
  })

  it('renders nothing for an absent or impossible price', () => {
    expect(formatNav(null)).toBeNull()
    expect(formatNav(undefined)).toBeNull()
    expect(formatNav(0)).toBeNull()
    expect(formatNav(-1)).toBeNull()
    expect(formatNav(Number.NaN)).toBeNull()
  })
})

describe('formatSignedPercent', () => {
  it('signs a gain so a weak year reads as a loss', () => {
    expect(formatSignedPercent(18.51)).toBe('+18.51%')
    expect(formatSignedPercent(-4.49)).toBe('-4.49%')
  })

  it('leaves zero unsigned', () => {
    expect(formatSignedPercent(0)).toBe('0%')
  })

  it("keeps a positive worst year positive", () => {
    // The Satrix 40 sheet's lowest annual rolling return is +1.17%: it measures
    // ten non-overlapping years and none of them lost money.
    expect(formatSignedPercent(1.17)).toBe('+1.17%')
  })

  it('renders nothing for an absent figure', () => {
    expect(formatSignedPercent(null)).toBeNull()
    expect(formatSignedPercent(undefined)).toBeNull()
  })
})

describe('formatFeePeriod', () => {
  it('names each published period', () => {
    expect(formatFeePeriod('1y')).toContain('one year')
    expect(formatFeePeriod('3y')).toContain('three years')
  })

  it('renders nothing when the period was never recorded', () => {
    // Fifteen of the nineteen seeded sheets are in this state, and an
    // unqualified cost beats a cost qualified wrongly.
    expect(formatFeePeriod(null)).toBeNull()
    expect(formatFeePeriod('')).toBeNull()
    expect(formatFeePeriod('ytd')).toBeNull()
  })
})

describe('formatExtremesBasis', () => {
  it('spells out each basis rather than showing the code', () => {
    expect(formatExtremesBasis('rolling_12m')).toContain('twelve-month')
    expect(formatExtremesBasis('calendar_year')).toContain('calendar year')
  })

  it('distinguishes the two, since they are different statistics', () => {
    expect(formatExtremesBasis('rolling_12m')).not.toBe(
      formatExtremesBasis('calendar_year'),
    )
  })

  it('renders nothing for a basis it does not know', () => {
    expect(formatExtremesBasis(null)).toBeNull()
    expect(formatExtremesBasis('ytd')).toBeNull()
  })

  it('says nothing a licence would be needed for', () => {
    for (const basis of ['rolling_12m', 'calendar_year']) {
      expect(findForbiddenTerms(formatExtremesBasis(basis) ?? '')).toEqual([])
    }
  })
})

describe('formatDistributionMonth', () => {
  it('renders a stored month as the sheet labels it', () => {
    expect(formatDistributionMonth('2026-06')).toBe('Jun 2026')
    expect(formatDistributionMonth('2025-12')).toBe('Dec 2025')
  })

  it('returns an unrecognised key untouched rather than guessing', () => {
    expect(formatDistributionMonth('Jun-26')).toBe('Jun-26')
    expect(formatDistributionMonth('2026-13')).toBe('2026-13')
  })
})
