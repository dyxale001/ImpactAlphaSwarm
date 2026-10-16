import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as copy from './fundUploadsCopy'
import { findForbiddenTerms } from './fundsCopy'
import {
  FIELD_META,
  FIELD_NAMES,
  MAX_UPLOAD_BYTES,
  REQUIRED_FIELDS,
  buildSaveValues,
  clearField,
  confirmField,
  describeSource,
  fileProblem,
  formatFieldValue,
  initialReview,
  isChanged,
  reviewProgress,
  reviewSections,
  setInput,
  undoField,
  UPLOAD_COMPARE_PREFIX,
  asCatalogueDetail,
  asCatalogueFund,
  uploadCompareId,
  uploadIdOf,
} from './fundUploads'
import { cleanId } from './compareUrl'
import type { ReadField, UploadedFundDetail } from '../services/api/fundUploads'

/**
 * The review screen's rules. The claim that matters most is the first one: a
 * flagged value cannot reach Save without the person deciding about it. The
 * server refuses it too; this side is what keeps Save disabled and says why.
 */

function field(name: string, value: ReadField['value'], status: ReadField['status'] = 'confirmed'): ReadField {
  return {
    field: name,
    value,
    status,
    quote: status === 'missing' ? null : `${name} line`,
    page: status === 'missing' ? null : 1,
    source: status === 'missing' ? null : 'text',
    reasons: status === 'confirmed' ? [] : ['a reason'],
  }
}

function reading(...fields: ReadField[]) {
  const given = new Map(fields.map((f) => [f.field, f]))
  return {
    fields: FIELD_NAMES.map((name) => given.get(name) ?? field(name, null, 'missing')),
  }
}

const SHEET = reading(
  field('fund_name', 'Example Balanced Fund (A)'),
  field('as_of', '2026-08-31'),
  field('ter', 1.15),
  field('tic', 1.33),
  field('risk_indicator_raw', 'Moderate - High', 'check'),
  field('annual_management_fee', 0.88, 'check'),
  field('regulation_28', true),
)

describe('a flagged value needs a decision', () => {
  it('blocks Save until every flagged value is decided', () => {
    const review = initialReview(SHEET)
    const progress = reviewProgress(review)
    expect(progress.canSave).toBe(false)
    expect(progress.pending).toEqual(['risk_indicator_raw', 'annual_management_fee'])
    expect(progress.summary).toBe('2 flagged values still need your decision.')
  })

  it.each([
    ['confirming it', (r: ReturnType<typeof initialReview>, f: string) => confirmField(r, f)],
    ['correcting it', (r: ReturnType<typeof initialReview>, f: string) => setInput(r, f, '0.8')],
    ['clearing it', (r: ReturnType<typeof initialReview>, f: string) => clearField(r, f)],
  ])('%s counts as a decision', (_name, decide) => {
    let review = initialReview(SHEET)
    review = confirmField(review, 'risk_indicator_raw')
    review = decide(review, 'annual_management_fee')
    expect(reviewProgress(review).canSave).toBe(true)
  })

  it('typing the value back to what was read is not a correction', () => {
    const review = setInput(initialReview(SHEET), 'annual_management_fee', ' 0.880% ')
    expect(isChanged(review.annual_management_fee)).toBe(false)
    expect(reviewProgress(review).pending).toContain('annual_management_fee')
  })

  it('undo puts a decided value back to undecided', () => {
    let review = clearField(initialReview(SHEET), 'annual_management_fee')
    review = undoField(review, 'annual_management_fee')
    expect(review.annual_management_fee.input).toBe('0.88')
    expect(reviewProgress(review).pending).toContain('annual_management_fee')
  })

  it('editing a confirmed value withdraws the confirmation', () => {
    let review = confirmField(initialReview(SHEET), 'annual_management_fee')
    review = setInput(review, 'annual_management_fee', '0.8')
    expect(review.annual_management_fee.decision).toBe('none')
    expect(isChanged(review.annual_management_fee)).toBe(true)
  })

  it('a value read cleanly needs no decision', () => {
    const progress = reviewProgress(initialReview(SHEET))
    expect(progress.pending).not.toContain('ter')
  })
})

describe('the required fields', () => {
  it('a sheet with no date cannot be saved, and says so', () => {
    let review = initialReview(reading(field('fund_name', 'A Fund'), field('ter', 1.1)))
    let progress = reviewProgress(review)
    expect(progress.canSave).toBe(false)
    expect(progress.missingRequired).toEqual(['as_of'])
    expect(progress.summary).toBe('Add the fact sheet date to save.')
    review = setInput(review, 'as_of', '2026-08-31')
    progress = reviewProgress(review)
    expect(progress.canSave).toBe(true)
  })

  it('clearing the name blocks Save', () => {
    const review = clearField(confirmField(confirmField(initialReview(SHEET), 'risk_indicator_raw'), 'annual_management_fee'), 'fund_name')
    expect(reviewProgress(review).missingRequired).toEqual(['fund_name'])
  })
})

describe('what Save sends', () => {
  it('sends unchanged values exactly as read, and lists the confirmed flags', () => {
    let review = initialReview(SHEET)
    review = confirmField(review, 'risk_indicator_raw')
    review = setInput(review, 'annual_management_fee', '0.80')
    const { values, confirmed } = buildSaveValues(review)
    expect(values.ter).toBe(1.15)
    expect(values.regulation_28).toBe(true)
    expect(values.risk_indicator_raw).toBe('Moderate - High')
    expect(values.annual_management_fee).toBe('0.80')
    expect(confirmed).toEqual(['risk_indicator_raw'])
  })

  it('a cleared value is sent as null, a blank missing one is left out', () => {
    const review = clearField(initialReview(SHEET), 'annual_management_fee')
    const { values } = buildSaveValues(review)
    expect(values.annual_management_fee).toBeNull()
    expect('min_lump_sum' in values).toBe(false)
  })

  it('a missing value the person typed is sent', () => {
    const review = setInput(initialReview(SHEET), 'fee_period', '1y')
    expect(buildSaveValues(review).values.fee_period).toBe('1y')
  })

  it('a yes/no the person changed is sent as a boolean', () => {
    const review = setInput(initialReview(SHEET), 'regulation_28', 'no')
    expect(buildSaveValues(review).values.regulation_28).toBe(false)
  })
})

describe('the sections', () => {
  it('puts flagged first, then missing with the required ones leading, then the rest', () => {
    const sections = reviewSections(initialReview(reading(field('fund_name', 'A'), field('ter', 1, 'check'))))
    expect(sections.flagged.map((s) => s.field)).toEqual(['ter'])
    expect(sections.missing[0].field).toBe('as_of')
    expect(sections.confirmed.map((s) => s.field)).toEqual(['fund_name'])
  })
})

describe('the file', () => {
  it.each([
    [{ name: 'sheet.pdf', type: 'application/pdf', size: 200_000 }, null],
    [{ name: 'SHEET.PDF', type: '', size: 200_000 }, null],
    [{ name: 'sheet.png', type: 'image/png', size: 200_000 }, copy.FILE_NOT_PDF],
    [{ name: 'sheet.pdf', type: 'application/pdf', size: MAX_UPLOAD_BYTES + 1 }, copy.FILE_TOO_LARGE],
    [{ name: 'sheet.pdf', type: 'application/pdf', size: 0 }, copy.FILE_EMPTY],
  ])('%o', (file, problem) => {
    expect(fileProblem(file)).toBe(problem)
  })

  it('the size limit matches the server', () => {
    const config = readFileSync(new URL('../../../backend/src/funds/config.py', import.meta.url), 'utf-8')
    expect(config).toContain('"FUND_UPLOAD_MAX_BYTES", str(10 * 1024 * 1024)')
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024)
  })
})

describe('showing values and where they came from', () => {
  it.each([
    ['ter', 1.15, '1.15%'],
    ['min_lump_sum', 5000, 'R5 000'],
    ['nav_cpu', 923, 'R9.23'],
    ['as_of', '2026-08-31', '31 August 2026'],
    ['fee_period', '1y', 'One year'],
    ['regulation_28', true, 'Yes'],
    ['recommended_min_term_years', 5, '5 years'],
  ])('%s %o reads as %s', (name, value, shown) => {
    expect(formatFieldValue(name, value)).toBe(shown)
  })

  it.each([
    [{ read: 'confirmed', by: 'model', page: 2 }, 'Read from page 2'],
    [{ read: 'check', by: 'model', page: 1, source: 'text' }, 'Read from page 1, flagged and confirmed by you'],
    [{ read: 'check', by: 'model', page: 1, source: 'graphic' }, 'Read off a graphic on page 1, confirmed by you'],
    [{ read: 'confirmed', by: 'person', page: 2, model_value: 1.15 }, 'Corrected by you; AI read 1.15%'],
    [{ read: 'missing', by: 'person' }, 'Typed by you; not on the sheet'],
    [{ read: 'check', by: null, page: 1, model_value: 1.15 }, 'Left blank by you; AI read 1.15%'],
    [{ derived_from: 'risk_indicator_raw' }, 'Placed on the 1 to 5 scale from the risk rating'],
  ] as const)('%o', (provenance, line) => {
    expect(describeSource('ter', provenance)).toBe(line)
  })
})

describe('the field list matches the reader', () => {
  // The reader's FIELDS dict is the list the server returns and accepts. A field
  // added there and not here would be read, shown with a raw name, and its
  // value formatted as plain text; one removed there would be refused on save.
  const source = readFileSync(new URL('../../../backend/src/funds/reading.py', import.meta.url), 'utf-8')
  const block = source.slice(source.indexOf('FIELDS: dict[str, str] = {'), source.indexOf('\n}\n', source.indexOf('FIELDS: dict')))
  const backendFields = [...block.matchAll(/^ {4}"([a-z0-9_]+)":/gm)].map((m) => m[1])

  it('in the same order', () => {
    expect(backendFields.length).toBeGreaterThan(20)
    expect(FIELD_NAMES).toEqual(backendFields)
  })

  it('with the same required fields as the server', () => {
    const service = readFileSync(new URL('../../../backend/src/funds/upload_service.py', import.meta.url), 'utf-8')
    expect(service).toContain(`REQUIRED = (${REQUIRED_FIELDS.map((f) => `"${f}"`).join(', ')})`)
  })

  it('each with a label and a group', () => {
    for (const meta of Object.values(FIELD_META)) {
      expect(meta.label).toBeTruthy()
      expect(meta.group).toBeTruthy()
    }
  })
})

describe('an uploaded fund beside the catalogue', () => {
  const UPLOAD_ID = '6f1c1a2e-0b7d-4a35-9d3e-2f9c0a1b2c3d'
  const fund: UploadedFundDetail = {
    id: UPLOAD_ID,
    name: 'Private Balanced Fund (B)',
    fund_house: null,
    isin: null,
    jse_code: null,
    vehicle: 'unit_trust',
    asisa_category: 'South African - Multi Asset - High Equity',
    sheets: [
      {
        uploaded_fund_id: UPLOAD_ID,
        as_of: '2026-08-31',
        file_sha256: 'b',
        figures: { ter: 0.95, tic: 1.1, risk_indicator_1to5: 4, risk_indicator_raw: 'Moderate to High', regulation_28: true },
        provenance: {},
        model: 'm',
        prompt_version: '2',
      },
      {
        uploaded_fund_id: UPLOAD_ID,
        as_of: '2026-07-31',
        file_sha256: 'a',
        figures: {},
        provenance: {},
        model: 'm',
        prompt_version: '2',
      },
    ],
  }

  it('is named mine-<id>, which Compare keeps and the backend reads', () => {
    expect(uploadCompareId(UPLOAD_ID)).toBe(`mine-${UPLOAD_ID}`)
    expect(uploadIdOf(`mine-${UPLOAD_ID}`)).toBe(UPLOAD_ID)
    expect(uploadIdOf(UPLOAD_ID)).toBeNull()
    expect(cleanId(uploadCompareId(UPLOAD_ID), 'funds')).toBe(`mine-${UPLOAD_ID}`)
    const service = readFileSync(new URL('../../../backend/src/funds/upload_service.py', import.meta.url), 'utf-8')
    expect(service).toContain(`UPLOAD_PREFIX = "${UPLOAD_COMPARE_PREFIX}"`)
  })

  it('reads as a catalogue fund page, newest sheet first', () => {
    const shaped = asCatalogueDetail(fund)
    expect(shaped.fund_id).toBe(`mine-${UPLOAD_ID}`)
    expect(shaped.as_of).toBe('2026-08-31')
    expect(shaped.ter).toBe(0.95)
    expect(shaped.risk_level).toBe(4)
    expect(shaped.snapshot?.regulation_28).toBe(true)
    expect(shaped.snapshot?.risk_indicator_raw).toBe('Moderate to High')
    expect(shaped.snapshot_history.map((s) => s.as_of)).toEqual(['2026-08-31', '2026-07-31'])
    expect(shaped.asisa_geography).toBe('South African')
    expect(shaped.asisa_asset_class).toBe('Multi Asset')
    expect(shaped.disclaimer).toBeTruthy()
    expect(shaped.not_licensed).toBeTruthy()
    // Never shown as a catalogue curation or a match.
    expect(shaped.why_this_appears).toBeNull()
    expect(shaped.curation_rule).toBeNull()
  })

  it('says why a risk level is missing rather than borrowing the catalogue note', () => {
    const offScale = { ...fund, sheets: [{ ...fund.sheets[0], figures: { risk_indicator_raw: '6/10 Moderate' } }] }
    expect(asCatalogueDetail(offScale).risk_note).toContain('6/10 Moderate')
    const none = { ...fund, sheets: [{ ...fund.sheets[0], figures: {} }] }
    expect(asCatalogueDetail(none).risk_note).toBe(copy.DETAIL_RISK_NONE)
    expect(asCatalogueDetail(fund).risk_note).toBeNull()
  })

  it('a fund with no sheet yet still has a shape', () => {
    const bare = asCatalogueFund(fund, null)
    expect(bare.has_factsheet).toBe(false)
    expect(bare.ter).toBeNull()
  })
})

describe('the copy', () => {
  // The same scan the catalogue's copy passes: an uploaded fund is still a fund
  // page, and nothing on it may read as a proposal.
  const strings = Object.values(copy).filter((v): v is string => typeof v === 'string')
  const labels = Object.values(FIELD_META).flatMap((m) => [m.label, m.hint ?? '', ...(m.choices ?? []).map(([, l]) => l)])

  it.each([...strings, ...labels].filter(Boolean))('%s', (text) => {
    expect(findForbiddenTerms(text)).toEqual([])
  })
})
