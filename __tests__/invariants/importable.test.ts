import { describe, it, expect } from 'vitest'
import { PERMISSIONS } from '@/lib/permissions'
import {
  IMPORTABLE,
  entityByKey,
  importableFor,
  mapColumnsFor,
  parseCell,
  parseRows,
  previewOf,
} from '@/lib/importable'

/**
 * There was one importer and it loaded candidates. Operations had a way in
 * and finance did not — no cost centres, no GL accounts, no purchase
 * orders — and a cost-centre owner could not load their own budget at all.
 *
 * These tests hold the three properties that make one importer serve three
 * owners: the permission decides what is offered, loading twice changes
 * nothing the second time, and every problem in a row is reported rather
 * than the first one.
 */

const COST_CENTERS = entityByKey('COST_CENTERS')!
const CONSULTANTS = entityByKey('CONSULTANTS')!

describe('who may load what', () => {
  it('offers finance the sheets finance owns', () => {
    const offered = importableFor(['settings.manage']).map((e) => e.key)
    expect(offered).toContain('COST_CENTERS')
  })

  it('does not offer consultants to somebody who can only edit settings', () => {
    // Finance cannot import people; recruiting cannot import GL accounts.
    const offered = importableFor(['settings.manage']).map((e) => e.key)
    expect(offered).not.toContain('CONSULTANTS')
  })

  it('does not offer cost centres to a recruiter', () => {
    const offered = importableFor(['consultants.write']).map((e) => e.key)
    expect(offered).toContain('CONSULTANTS')
    expect(offered).not.toContain('COST_CENTERS')
  })

  it('offers nothing at all to somebody with no relevant permission', () => {
    expect(importableFor(['timesheets.read'])).toHaveLength(0)
  })

  it('offers everything to an owner', () => {
    expect(importableFor(['*'])).toHaveLength(IMPORTABLE.length)
  })

  it('never guards a sheet with a permission that does not exist', () => {
    const known = new Set<string>(PERMISSIONS)
    for (const e of IMPORTABLE) {
      expect(known.has(e.permission), e.key).toBe(true)
    }
  })

  it('gives every sheet a natural key that is one of its own fields', () => {
    // Without one, loading the same file twice duplicates everything.
    for (const e of IMPORTABLE) {
      expect(e.fields.map((f) => f.key), e.key).toContain(e.naturalKey)
    }
  })

  it('names who owns each sheet, so the right person is asked for the file', () => {
    for (const e of IMPORTABLE) {
      expect(e.owner.length, e.key).toBeGreaterThan(2)
      expect(e.blurb.length, e.key).toBeGreaterThan(20)
    }
  })
})

describe('matching a spreadsheet’s columns', () => {
  it('matches the headings people actually type', () => {
    const m = mapColumnsFor(COST_CENTERS, ['Cost Center Code', 'Description', 'GL Account'])
    expect(m.columns.find((c) => c.column === 'Cost Center Code')!.field).toBe('code')
    expect(m.columns.find((c) => c.column === 'GL Account')!.field).toBe('glAccount')
    expect(m.ready).toBe(true)
  })

  it('refuses to proceed when a required column is missing, and names it', () => {
    const m = mapColumnsFor(COST_CENTERS, ['Description'])
    expect(m.ready).toBe(false)
    expect(m.missingRequired).toContain('Code')
  })

  it('marks a guess as a guess rather than a fact', () => {
    // A near miss shown at full confidence is one somebody accepts without
    // reading.
    const m = mapColumnsFor(CONSULTANTS, ['Candidate Email Address'])
    const col = m.columns[0]
    expect(col.field).toBe('email')
    expect(col.confidence).toBeLessThan(1)
    expect(col.note).toMatch(/guessed/i)
  })

  it('says which columns it is ignoring rather than dropping them silently', () => {
    const m = mapColumnsFor(COST_CENTERS, ['Code', 'Name', 'Internal Notes'])
    expect(m.ignored).toContain('Internal Notes')
  })

  it('never maps two columns onto the same field', () => {
    const m = mapColumnsFor(CONSULTANTS, ['Email', 'Email Address'])
    const fields = m.columns.filter((c) => c.field).map((c) => c.field)
    expect(new Set(fields).size).toBe(fields.length)
  })
})

describe('reading cells the way a spreadsheet writes them', () => {
  it('reads money with a currency symbol and thousands separators', () => {
    expect(parseCell('money', '$1,250.50', 'Amount').value).toBe(1250.5)
  })

  it('refuses a number that is not one, naming the cell', () => {
    const r = parseCell('money', 'about 100', 'Amount')
    expect(r.value).toBeNull()
    expect(r.problem).toContain('Amount')
  })

  it('reads yes and no as well as true and false', () => {
    expect(parseCell('boolean', 'Yes', 'Active').value).toBe(true)
    expect(parseCell('boolean', 'inactive', 'Active').value).toBe(false)
  })

  it('splits a skills list on commas, semicolons or pipes', () => {
    expect(parseCell('list', 'SAP FICO; ABAP | S/4HANA', 'Skills').value).toEqual([
      'SAP FICO', 'ABAP', 'S/4HANA',
    ])
  })

  it('tells somebody what a date should look like rather than just refusing', () => {
    const r = parseCell('date', 'next tuesday', 'Start date')
    expect(r.problem).toContain('2027-06-30')
  })

  it('treats an empty cell as nothing said, not as an error', () => {
    expect(parseCell('string', '   ', 'Name')).toEqual({ value: null, problem: null })
  })
})

describe('reporting what is wrong with a file', () => {
  const mapping = mapColumnsFor(COST_CENTERS, ['Code', 'Name', 'GL Account'])

  it('numbers rows the way the person’s spreadsheet does', () => {
    // Row 1 is the header, so the first data row is row 2. Reporting it as
    // row 1 sends somebody to the wrong line.
    const rows = parseRows(COST_CENTERS, mapping, [{ Code: 'A', Name: 'Alpha', 'GL Account': '6120' }])
    expect(rows[0].rowNumber).toBe(2)
  })

  it('collects every problem in a row rather than stopping at the first', () => {
    const rows = parseRows(COST_CENTERS, mapping, [{ Code: '', Name: '', 'GL Account': '6120' }])
    expect(rows[0].problems.length).toBeGreaterThan(1)
    expect(rows[0].ok).toBe(false)
  })

  it('lets the good rows through while naming the bad ones', () => {
    const rows = parseRows(COST_CENTERS, mapping, [
      { Code: 'A', Name: 'Alpha', 'GL Account': '6120' },
      { Code: '', Name: 'Broken', 'GL Account': '6120' },
      { Code: 'C', Name: 'Gamma', 'GL Account': '' },
    ])
    expect(rows.filter((r) => r.ok)).toHaveLength(2)
    expect(rows.find((r) => !r.ok)!.rowNumber).toBe(3)
  })
})

describe('saying what a load will do before it does it', () => {
  const mapping = mapColumnsFor(COST_CENTERS, ['Code', 'Name'])
  const rows = parseRows(COST_CENTERS, mapping, [
    { Code: 'MFG-100', Name: 'Manufacturing' },
    { Code: 'FIN-200', Name: 'Finance' },
    { Code: '', Name: 'Broken' },
  ])

  it('separates what is new from what already exists', () => {
    const p = previewOf(COST_CENTERS, rows, new Set(['mfg-100']))
    expect(p.willUpdate).toBe(1)
    expect(p.willCreate).toBe(1)
    expect(p.willSkip).toBe(1)
  })

  it('promises that loading the same file twice changes nothing the second time', () => {
    const p = previewOf(COST_CENTERS, rows, new Set())
    expect(p.summary).toContain('twice')
  })

  it('says so plainly when nothing in the file can be loaded', () => {
    const allBad = parseRows(COST_CENTERS, mapping, [{ Code: '', Name: '' }])
    expect(previewOf(COST_CENTERS, allBad, new Set()).summary).toMatch(/nothing can be loaded/i)
  })

  it('says so when the file is empty', () => {
    expect(previewOf(COST_CENTERS, [], new Set()).summary).toBe('Nothing in the file.')
  })
})
