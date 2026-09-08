import { describe, it, expect } from 'vitest'
import { formatDbString, formatNumberWithSpaces, unformatNumberSpaces } from './stringFormatters'

describe('formatDbString', () => {
  it('turns a snake_case database value into title case', () => {
    expect(formatDbString('risk_tolerance')).toBe('Risk Tolerance')
    expect(formatDbString('bullish_crossover')).toBe('Bullish Crossover')
  })

  it('normalises shouty database values', () => {
    expect(formatDbString('CONSERVATIVE')).toBe('Conservative')
    expect(formatDbString('AGREE_STRONGLY')).toBe('Agree Strongly')
  })

  it('leaves a single lowercase word capitalised', () => {
    expect(formatDbString('novice')).toBe('Novice')
  })

  it.each([[undefined], [''], [null as unknown as string]])(
    'renders a missing value as N/A (%s)',
    (value) => {
      expect(formatDbString(value)).toBe('N/A')
    },
  )

  it('is display-only and must not be fed back into a query', () => {
    // PINNED: the transform is lossy in both directions -- it lowercases
    // everything after the first letter and replaces underscores with spaces, so
    // it cannot round-trip. Comparing a formatted value against a stored one is
    // exactly how the six-spellings risk_tolerance problem happened.
    expect(formatDbString('AI_Analysis')).toBe('Ai Analysis')
    expect(formatDbString('already Spaced')).toBe('Already spaced')
  })
})

describe('formatNumberWithSpaces', () => {
  it('groups thousands with spaces', () => {
    expect(formatNumberWithSpaces(1234567)).toBe('1 234 567')
    expect(formatNumberWithSpaces(1000)).toBe('1 000')
  })

  it('leaves numbers under a thousand alone', () => {
    expect(formatNumberWithSpaces(100)).toBe('100')
    expect(formatNumberWithSpaces(999)).toBe('999')
  })

  it('groups only the integer part', () => {
    expect(formatNumberWithSpaces('1234.56')).toBe('1 234.56')
    expect(formatNumberWithSpaces('1234567.891')).toBe('1 234 567.891')
  })

  it('strips currency symbols and existing spacing before regrouping', () => {
    // The input is a controlled text field, so it re-formats its own output on
    // every keystroke and must be idempotent.
    expect(formatNumberWithSpaces('R 1 234')).toBe('1 234')
    expect(formatNumberWithSpaces(formatNumberWithSpaces(1234567))).toBe('1 234 567')
  })

  it('accepts a number or a string', () => {
    expect(formatNumberWithSpaces(1234)).toBe(formatNumberWithSpaces('1234'))
  })

  it('renders zero as an empty string', () => {
    // PINNED DEFECT, deliberately captured rather than fixed here. The guard is
    // `if (!value) return ''`, and 0 is falsy, so a genuine zero -- an empty
    // paper-trading balance, a zero holding -- renders as a blank field rather
    // than "0". The fix is a null/undefined check instead of a truthiness one,
    // but that is a behaviour change and belongs in its own commit, not in the
    // pre-presentation freeze.
    expect(formatNumberWithSpaces(0)).toBe('')
    expect(formatNumberWithSpaces('0')).toBe('0') // the string form is unaffected
  })

  it('returns an empty string for input with no digits', () => {
    expect(formatNumberWithSpaces('abc')).toBe('')
    expect(formatNumberWithSpaces('')).toBe('')
  })
})

describe('unformatNumberSpaces', () => {
  it('removes the grouping spaces', () => {
    expect(unformatNumberSpaces('1 234 567')).toBe('1234567')
  })

  it('leaves an unformatted value untouched', () => {
    expect(unformatNumberSpaces('1234567')).toBe('1234567')
    expect(unformatNumberSpaces('')).toBe('')
  })

  it('round-trips whatever formatNumberWithSpaces produced', () => {
    for (const value of [1, 999, 1000, 1234567, 987654321]) {
      expect(unformatNumberSpaces(formatNumberWithSpaces(value))).toBe(String(value))
    }
  })

  it('preserves the decimal point', () => {
    expect(unformatNumberSpaces('1 234.56')).toBe('1234.56')
  })
})
