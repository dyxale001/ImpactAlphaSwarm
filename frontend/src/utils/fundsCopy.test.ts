import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import * as copy from './fundsCopy'
import {
  FORBIDDEN_TERMS,
  FUND_BRACKET_NONE,
  allStrings,
  factSheetAgeDays,
  findForbiddenTerms,
  formatAsAt,
  formatBracketCount,
  formatFundCount,
  formatFundSize,
  formatMinTerm,
  formatPercent,
  splitAsisaCategory,
} from './fundsCopy'
import { SOFT_STALE_DAYS, STALE_DAYS } from '../components/funds/StalenessChip'

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

describe('formatBracketCount', () => {
  it('agrees the verb with the count', () => {
    expect(formatBracketCount(1)).toBe('1 fund carries a published risk label at or below it.')
    expect(formatBracketCount(3)).toBe('3 funds carry a published risk label at or below it.')
  })

  it('states an empty bracket as an outcome, not as a count of zero', () => {
    // "0 funds carry" reads as a fault on a tile; the catalogue being small is
    // a fact about the catalogue, and the sentence says so.
    expect(formatBracketCount(0)).toBe(FUND_BRACKET_NONE)
    expect(formatBracketCount(0)).not.toMatch(/^0 /)
  })
})

describe('every user-facing string is registered for scanning', () => {
  it('has no exported copy string missing from allStrings()', () => {
    // The forbidden-term scan above only polices what allStrings() returns, so
    // a string added to this module but not registered there is invisible to
    // it — the failure mode is silent, and the thing it lets through is
    // exactly the wording the product is not licensed to use.
    const registered = new Set(allStrings())
    const exported = Object.entries(copy).filter(
      ([name, value]) => typeof value === 'string' && name === name.toUpperCase(),
    )
    const unregistered = exported
      .filter(([, value]) => !registered.has(value as string))
      .map(([name]) => name)

    // Guards the assertion below: if the filter ever stops finding the copy
    // constants, this test would pass while checking nothing.
    expect(exported.length).toBeGreaterThan(30)
    expect(unregistered).toEqual([])
  })
})

describe('the provenance copy keeps its two admissions', () => {
  // These sentences are the page's honesty about itself. Softening either one
  // turns a hand-transcribed catalogue into something that reads as though it
  // were fetched from an authority, which is the claim the whole feature is
  // built to avoid making.

  it('says the figures were read by hand off the manager document', () => {
    expect(copy.DETAIL_PROVENANCE_MANUAL).toMatch(/by hand/i)
    expect(copy.DETAIL_PROVENANCE_MANUAL).toMatch(/nothing here is calculated by us/i)
  })

  it('says a missing section is our gap, not the fund lacking it', () => {
    expect(copy.DETAIL_PROVENANCE_GAPS).toMatch(/gap in our reading, not in the fund/i)
  })

  it('warns that a platform fee sits on top of the published charge', () => {
    // The fact sheet's TIC is not what the investor actually pays; omitting
    // this would understate the cost on the page that leads with cost.
    expect(copy.DETAIL_PLATFORM_FEE_NOTE).toMatch(/platform/i)
  })

  it('attributes the objective to the manager rather than to us', () => {
    expect(copy.DETAIL_OBJECTIVE_ATTRIB).toMatch(/manager's own words/i)
  })
})

describe('factSheetAgeDays', () => {
  // A fixed "today" so these do not drift with the clock. 9 September 2026 is
  // the day the staleness chip was written, and the ages below are the real
  // ones the eleven live funds had that day.
  const today = new Date('2026-09-09T00:00:00Z')

  it('counts whole days from a month-end sheet date', () => {
    expect(factSheetAgeDays('2026-07-31', today)).toBe(40)
    expect(factSheetAgeDays('2026-05-31', today)).toBe(101)
    expect(factSheetAgeDays('2025-05-31', today)).toBe(466)
  })

  it('is zero on the day the sheet is dated', () => {
    expect(factSheetAgeDays('2026-09-09', today)).toBe(0)
  })

  it('does not go negative on a date in the future', () => {
    // Somebody typed next month's date, which is a data question. Rendering
    // it as "-22 days old" would make a typo look like a feature.
    expect(factSheetAgeDays('2026-10-01', today)).toBe(0)
  })

  it('is null when there is no date to work from', () => {
    // A fund with no fact sheet already says so where its figures would be,
    // and a chip reading "out of date" beside no figures would be describing
    // a document that does not exist.
    expect(factSheetAgeDays(null, today)).toBeNull()
    expect(factSheetAgeDays('', today)).toBeNull()
    expect(factSheetAgeDays('July 2026', today)).toBeNull()
  })

  it('compares both dates at midnight UTC', () => {
    // A sheet date carries no time. Compared against a local Date, a reader in
    // Johannesburg would be two hours into the previous day and an age would
    // cross a threshold on the boundary depending on where they sat.
    const lateInJohannesburg = new Date('2026-09-09T23:30:00+02:00')
    expect(factSheetAgeDays('2026-07-31', lateInJohannesburg)).toBe(40)
  })
})

describe('formatFundCount', () => {
  it('has both grammatical numbers', () => {
    expect(formatFundCount(1)).toBe('1 fund')
    expect(formatFundCount(3)).toBe('3 funds')
    expect(formatFundCount(0)).toBe('0 funds')
  })

  it('names what it counted when the grid is narrowed', () => {
    expect(formatFundCount(3, 'South African · Multi Asset')).toBe(
      '3 funds in South African · Multi Asset',
    )
  })
})

describe('splitAsisaCategory', () => {
  it('separates the three tiers the classification stores as one name', () => {
    expect(splitAsisaCategory('South African - Multi Asset - High Equity')).toEqual({
      geography: 'South African',
      assetClass: 'Multi Asset',
      focus: 'High Equity',
    })
  })

  it('keeps every word, because the names are ASISA\'s and not ours', () => {
    const name = 'South African - Interest Bearing - Short Term'
    const tiers = splitAsisaCategory(name)
    expect(`${tiers?.geography} - ${tiers?.assetClass} - ${tiers?.focus}`).toBe(name)
  })

  it('is null for anything that is not three tiers', () => {
    // The caller then prints the name as it is stored. A category we cannot
    // parse is still a category we have to show.
    expect(splitAsisaCategory('Global - Equity')).toBeNull()
    expect(splitAsisaCategory('Worldwide')).toBeNull()
    expect(splitAsisaCategory(null)).toBeNull()
  })
})

describe('the two footer statements mirrored from the backend', () => {
  // They exist here only so the footer can render when the catalogue request
  // fails, which is when a page listing funds would otherwise carry no
  // statement that the product is not licensed to advise on them. A copy is a
  // drift risk, so the copy is checked against its source rather than trusted.

  const source = readFileSync(
    new URL('../../../backend/src/funds/copy.py', import.meta.url),
    'utf-8',
  )

  /** One `NAME = ( "..." "..." )` constant, joined the way Python joins it. */
  function pythonConstant(name: string): string {
    const start = source.indexOf(`${name} = (`)
    expect(start).toBeGreaterThan(-1)
    const block = source.slice(start, source.indexOf('\n)', start))
    const parts = block.match(/"((?:[^"\\]|\\.)*)"/g) ?? []
    expect(parts.length).toBeGreaterThan(0)
    return parts.map((part: string) => part.slice(1, -1)).join('')
  }

  it('matches FOOTER_NOT_LICENSED in backend/src/funds/copy.py', () => {
    expect(copy.FOOTER_NOT_LICENSED).toBe(pythonConstant('FOOTER_NOT_LICENSED'))
  })

  it('matches CIS_DISCLAIMER in backend/src/funds/copy.py', () => {
    expect(copy.CIS_DISCLAIMER).toBe(pythonConstant('CIS_DISCLAIMER'))
  })
})

describe('the staleness thresholds mirrored from the backend', () => {
  it('matches SOFT_STALE_DAYS and STALE_DAYS in admin_routes.py', () => {
    // A public card cannot ask an admin endpoint what its own thresholds are,
    // so the two numbers are written twice. If the backend's move and these do
    // not, the page grades a sheet as current that the catalogue calls stale.
    const source = readFileSync(
      new URL('../../../backend/src/funds/admin_routes.py', import.meta.url),
      'utf-8',
    )
    const read = (name: string) => {
      const found = new RegExp(`^${name} = (\\d+)$`, 'm').exec(source)
      expect(found).not.toBeNull()
      return Number(found?.[1])
    }
    expect(SOFT_STALE_DAYS).toBe(read('SOFT_STALE_DAYS'))
    expect(STALE_DAYS).toBe(read('STALE_DAYS'))
  })
})
