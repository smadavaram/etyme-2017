import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  TEMPLATE_CSV,
  TEMPLATE_COLUMNS,
  parseCensusCsv,
  readDate,
  readRate,
  readHours,
  looksLikeCsv,
  stateFor,
} from '@/lib/census-import'

/**
 * A client's own spreadsheet, read once, with every gap kept.
 *
 * `docs/census-brief.md`: "What we could not see ... is never empty and
 * never hidden. It is what makes the other four numbers believable." So
 * every sentence below is about something the file did not say, and what
 * the importer does about it instead of guessing.
 */

const HEAD = TEMPLATE_CSV.split('\n')[0]
const file = (...rows: string[]) => [HEAD, ...rows].join('\n') + '\n'
const kinds = (text: string) => parseCensusCsv(text).gaps.map((g) => g.kind)

describe('The template asks for what a census needs and for nothing about a person', () => {

  it('the template is a header row and one example row, and nothing else', () => {
    const lines = TEMPLATE_CSV.trim().split('\n')
    expect(lines).toHaveLength(2)
  })

  it('the template asks for no names, so a filled one holds no personal data beyond a reference number', () => {
    expect(HEAD.toLowerCase()).not.toMatch(/\bname\b/)
    expect(HEAD.toLowerCase()).not.toMatch(/email|phone|address|date of birth|ssn/)
    expect(HEAD).toContain('reference number')
  })

  it('the template asks the eight questions the page is built from', () => {
    expect(HEAD.split(',')).toEqual([...TEMPLATE_COLUMNS])
  })

  it('the file a client downloads is the template this code reads, so the two cannot drift apart', () => {
    const onDisk = readFileSync(join(process.cwd(), 'public/census-template.csv'), 'utf8')
    expect(onDisk).toBe(TEMPLATE_CSV)
  })

  it('the example row in the template imports cleanly, with nothing missing', () => {
    const parsed = parseCensusCsv(TEMPLATE_CSV)
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.gaps).toEqual([])
  })
})

describe('A client fills the template their own way and it still imports', () => {

  it('a client who reorders their columns still imports, because a row is read by column name', () => {
    const text =
      'reference number,bill rate,supplier,hours per week,end date,start date,role,site\n' +
      'C-2,80,Veritan Talent,40,2026-01-01,2025-01-01,Nurse,Elmira\n'
    const [row] = parseCensusCsv(text).rows
    expect(row.reference).toBe('C-2')
    expect(row.supplier).toBe('Veritan Talent')
    expect(row.rateMinor).toBe(8000)
  })

  it('"Start Date", "start_date" and "START DATE" are one question, not three', () => {
    const text =
      'Supplier,Role,Site,START DATE,End_Date,Bill Rate,Hours Per Week,Reference Number\n' +
      'Veritan Talent,Nurse,Elmira,2025-01-01,2026-01-01,80,40,C-3\n'
    expect(parseCensusCsv(text).rows).toHaveLength(1)
  })

  it('a rate typed as $92.50/hr is stored as 9250 cents, because money is kept in minor units', () => {
    expect(readRate('$92.50/hr')).toEqual({ ok: true, minor: 9250 })
    expect(readRate('1,250')).toEqual({ ok: true, minor: 125_000 })
  })

  it('a date can be written the ISO way or the American way, and both mean the same day', () => {
    expect(readDate('2024-03-04')?.toISOString().slice(0, 10)).toBe('2024-03-04')
    expect(readDate('3/4/2024')?.toISOString().slice(0, 10)).toBe('2024-03-04')
  })

  it('the thirty-first of February is refused rather than rolled quietly into March', () => {
    expect(readDate('2024-02-31')).toBeNull()
  })

  it('a file without the required columns is refused whole, and says which column is missing', () => {
    const text = 'role,site,end date\nNurse,Elmira,2026-01-01\n'
    const parsed = parseCensusCsv(text)
    expect(parsed.rows).toEqual([])
    expect(parsed.gaps.map((g) => g.says).join(' ')).toContain('"supplier"')
    expect(parsed.gaps.map((g) => g.says).join(' ')).toContain('"reference number"')
  })
})

describe('Every gap in a client file is recorded against the line it was on', () => {

  it('a row with no end date counts as on site today and is listed as a gap', () => {
    const parsed = parseCensusCsv(file('Veritan Talent,Nurse,Elmira,2025-01-01,,80,40,C-9'))
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0].endDate).toBeNull()

    const gap = parsed.gaps.find((g) => g.kind === 'NO_END_DATE')!
    expect(gap.stopsTheRow).toBe(false)
    expect(gap.says).toContain('counted as on site today')

    const state = stateFor(parsed.rows[0], new Date('2026-09-20T00:00:00Z'))
    expect(state).toBe('IN_PROGRESS')
  })

  it('a row with no rate imports as a contractor, and the missing rate is a gap rather than a zero', () => {
    const parsed = parseCensusCsv(file('Veritan Talent,Nurse,Elmira,2025-01-01,2026-01-01,,40,C-10'))
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0].rateMinor).toBeNull()
    expect(kinds(file('Veritan Talent,Nurse,Elmira,2025-01-01,2026-01-01,,40,C-10'))).toContain('NO_RATE')
  })

  it('a rate of zero is no rate at all, because nobody is placed for nothing', () => {
    expect(readRate('0')).toEqual({ ok: false, why: 'blank' })
    expect(readRate('0.00')).toEqual({ ok: false, why: 'blank' })
  })

  it('a rate written as a negative number is a typo somebody has to look at, not a price', () => {
    expect(readRate('-40')).toEqual({ ok: false, why: 'unreadable' })
    const parsed = parseCensusCsv(file('Veritan Talent,Nurse,Elmira,2025-01-01,2026-01-01,-40,40,C-19'))
    expect(parsed.rows[0].rateMinor).toBeNull()
    expect(parsed.gaps.find((g) => g.kind === 'NO_RATE')!.says).toContain('-40')
  })

  it('a row with no hours a week imports, and the hours are a gap rather than forty', () => {
    const parsed = parseCensusCsv(file('Veritan Talent,Nurse,Elmira,2025-01-01,2026-01-01,80,,C-11'))
    expect(parsed.rows[0].hoursPerWeek).toBeNull()
    expect(parsed.gaps.map((g) => g.kind)).toContain('NO_HOURS')
    expect(parsed.gaps.find((g) => g.kind === 'NO_HOURS')!.says).toContain('Nothing is assumed')
  })

  it('a hundred and eighty hours in a week is not hours, and is read as nothing rather than believed', () => {
    expect(readHours('180')).toBeNull()
    expect(readHours('37.5')).toBe(37.5)
  })

  it('a start date nobody can read stops the row and names the value that could not be read', () => {
    const parsed = parseCensusCsv(file('Veritan Talent,Nurse,Elmira,04 Mar 24,2026-01-01,80,40,C-12'))
    expect(parsed.rows).toEqual([])
    const gap = parsed.gaps.find((g) => g.kind === 'UNREADABLE_DATE')!
    expect(gap.stopsTheRow).toBe(true)
    expect(gap.says).toContain('04 Mar 24')
  })

  it('a placement that ends before it starts is not guessed at, and neither date is corrected', () => {
    const parsed = parseCensusCsv(file('Veritan Talent,Nurse,Elmira,2026-01-01,2025-01-01,80,40,C-13'))
    expect(parsed.rows).toEqual([])
    expect(kinds(file('Veritan Talent,Nurse,Elmira,2026-01-01,2025-01-01,80,40,C-13'))).toContain('END_BEFORE_START')
  })

  it('two rows with the same reference number import once, so nobody is counted twice', () => {
    const parsed = parseCensusCsv(file(
      'Veritan Talent,Nurse,Elmira,2025-01-01,2026-01-01,80,40,C-14',
      'Auralis Software,Nurse,Elmira,2025-02-01,2026-01-01,90,40,C-14'
    ))
    expect(parsed.rows).toHaveLength(1)
    const gap = parsed.gaps.find((g) => g.kind === 'DUPLICATE_REFERENCE')!
    expect(gap.says).toContain('The first was counted and the second was not')
  })

  it('a row with no supplier is not counted at all, because a census with no supplier cannot say who is paid', () => {
    const parsed = parseCensusCsv(file(',Nurse,Elmira,2025-01-01,2026-01-01,80,40,C-15'))
    expect(parsed.rows).toEqual([])
    expect(kinds(file(',Nurse,Elmira,2025-01-01,2026-01-01,80,40,C-15'))).toContain('NO_SUPPLIER')
  })

  it('a row with no reference number is not counted, because it cannot be told apart from the next one', () => {
    expect(parseCensusCsv(file('Veritan Talent,Nurse,Elmira,2025-01-01,2026-01-01,80,40,')).rows).toEqual([])
  })

  it('a rate typed in rupees is refused rather than added to dollars', () => {
    const parsed = parseCensusCsv(file('Veritan Talent,Nurse,Elmira,2025-01-01,2026-01-01,₹4500,40,C-16'))
    expect(parsed.rows).toEqual([])
    const gap = parsed.gaps.find((g) => g.kind === 'ANOTHER_CURRENCY')!
    expect(gap.says).toContain('Nothing here converts one currency')
  })

  it('a reference already loaded from an earlier file is left alone rather than counted a second time', () => {
    const parsed = parseCensusCsv(
      file('Veritan Talent,Nurse,Elmira,2025-01-01,2026-01-01,80,40,C-17'),
      { alreadyImported: ['c-17'] }
    )
    expect(parsed.rows).toEqual([])
    expect(parsed.gaps.map((g) => g.kind)).toContain('ALREADY_IMPORTED')
  })

  it('every gap says what is missing in a sentence, and never in a code', () => {
    const parsed = parseCensusCsv(file(
      ',Nurse,Elmira,,,,,',
      'Veritan Talent,,,,2026-01-01,₹4500,999,C-18'
    ))
    expect(parsed.gaps.length).toBeGreaterThan(4)
    for (const g of parsed.gaps) {
      expect(g.says, `gap ${g.kind} has no sentence`).toMatch(/^[A-Z][^]*[.]$/)
      expect(g.says).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/)
    }
  })

  it('a placement whose last day has passed is ended, and one that has not started is not on site', () => {
    const now = new Date('2026-09-20T00:00:00Z')
    expect(stateFor({ startDate: new Date('2024-01-01'), endDate: new Date('2025-01-01') }, now)).toBe('ENDED')
    expect(stateFor({ startDate: new Date('2026-12-01'), endDate: null }, now)).toBe('DRAFT')
    expect(stateFor({ startDate: new Date('2026-01-01'), endDate: new Date('2027-01-01') }, now)).toBe('IN_PROGRESS')
  })

  it('a file that is not a spreadsheet is never read as one', () => {
    expect(looksLikeCsv('Q3 Veritan invoices.pdf', 'application/pdf')).toBe(false)
    expect(looksLikeCsv('census.csv', 'application/octet-stream')).toBe(true)
    expect(looksLikeCsv('census.xlsx', 'application/vnd.ms-excel')).toBe(false)
  })
})
