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
 * and finance did not — no cost centers, no GL accounts, no purchase
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

  it('does not offer cost centers to a recruiter', () => {
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

// ── The model boundary, on the import door (2026-10-27) ────────────────
//
// An import read pasted content with the model whenever the deployment had
// a key: no per-company switch, no masking, no log. These hold the four
// things the boundary of 2026-10-13 asks of it.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readImportContent, SAY, IMPORT_PURPOSE, type ReadDeps } from '@/app/api/imports/sheets/read'
import { maskForModel } from '@/lib/model-boundary'
import type { ExtractionResult } from '@/lib/extract'
import type { PromptToRecord } from '@/lib/model-boundary'


const SHEET = [
  'Name,Email,Phone,Rate,Skills',
  'Helena Marsh,helena.marsh@example.com,(503) 555-0142,$98.00/hr,"Java, Spring"',
  'Omar Haddad,omar@example.com,+1 415 555 0199,85,Python',
].join('\n')

const PROSE =
  'Hi team, please add Helena Marsh (helena.marsh@example.com, 503-555-0142). She asks $98/hr and is paid 45 an hour by Techpeple today.'

function fakeDeps(on: boolean, opts: { setUp?: boolean } = {}) {
  const sent: string[] = []
  const logged: PromptToRecord[] = []
  const deps: ReadDeps = {
    modelOn: async () => on,
    readerSetUp: () => opts.setUp ?? true,
    vocab: async () => ({ firms: ['Techpeple'], people: [] }),
    record: async (p) => { logged.push(p); return { ok: true } },
    // A reader that answers the way the model does: it copies the tokens
    // it was handed into the fields it was asked for.
    extract: async (_spec, masked): Promise<ExtractionResult> => {
      sent.push(masked)
      const name = masked.match(/PERSON_\d+/)?.[0] ?? null
      const email = masked.match(/EMAIL_\d+/)?.[0] ?? null
      const rate = masked.match(/RATE_\d+/)?.[0] ?? null
      return {
        method: 'MODEL',
        records: [{
          rowNumber: 1,
          problems: [],
          fields: [
            { field: 'name', value: name, confidence: 1, foundIn: name, concern: null },
            { field: 'email', value: email, confidence: 1, foundIn: email, concern: null },
            { field: 'rateFloor', value: rate, confidence: 0.9, foundIn: `asks ${rate}`, concern: null },
          ],
        }],
        note: 'Read by the document reader, with confidence and a source quote on every value.',
        unread: [],
      }
    },
  }
  return { deps, sent, logged }
}

const REAL = ['Helena Marsh', 'Helena', 'Marsh', 'helena.marsh@example.com', '503', '0142', '$98', '98.00', 'Techpeple', 'Omar', '45 an hour']

describe('an import under the model boundary', () => {
  it('an import reads a document with the model only where the company turned the model on, and says so in a sentence otherwise', async () => {
    const off = fakeDeps(false)
    const table = await readImportContent({ companyId: 'c', personId: 'p', spec: CONSULTANTS, content: SHEET }, off.deps)
    expect(off.sent).toHaveLength(0)
    expect(off.logged).toHaveLength(0)
    expect(table.ok && table.readBy).toBe('HEADERS')
    expect(table.ok && table.note).toBe(SAY.modelOff)
    expect(SAY.modelOff).toMatch(/has not turned the model on/)
    expect(SAY.modelOff).toMatch(/Settings/)
    expect(table.ok && table.rows[0].Email).toBe('helena.marsh@example.com')

    // Prose cannot be read by headings, and is refused in a sentence that names the switch.
    const prose = await readImportContent({ companyId: 'c', personId: 'p', spec: CONSULTANTS, content: PROSE }, off.deps)
    expect(prose.ok).toBe(false)
    expect(!prose.ok && prose.message).toBe(SAY.proseModelOff)
    expect(off.sent).toHaveLength(0)

    // On, but no reader on this deployment: still nothing leaves, and it says which.
    const unset = fakeDeps(true, { setUp: false })
    const r = await readImportContent({ companyId: 'c', personId: 'p', spec: CONSULTANTS, content: SHEET }, unset.deps)
    expect(unset.sent).toHaveLength(0)
    expect(r.ok && r.note).toBe(SAY.readerNotSetUp)

    const on = fakeDeps(true)
    const m = await readImportContent({ companyId: 'c', personId: 'p', spec: CONSULTANTS, content: PROSE }, on.deps)
    expect(on.sent).toHaveLength(1)
    expect(m.ok && m.readBy).toBe('MODEL')
  })

  it('what an import sends to the model carries no name, rate, pay, email or phone, and the answer is put back', async () => {
    for (const content of [SHEET, PROSE]) {
      const on = fakeDeps(true)
      const r = await readImportContent({ companyId: 'c', personId: 'p', spec: CONSULTANTS, content }, on.deps)
      const sent = on.sent[0]
      for (const real of REAL) expect(sent.toLowerCase()).not.toContain(real.toLowerCase())
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      expect(r.rows[0]['Name']).toBe('Helena Marsh')
      expect(r.rows[0]['Email']).toBe('helena.marsh@example.com')
      // A rate the model saw as a token comes back as the plain number the parser reads.
      expect(Number(r.rows[0]['Rate floor'])).toBe(98)
    }
    // The pay in words, the firm and the phone are tokens in prose too.
    const m = maskForModel(PROSE, { firms: ['Techpeple'] })
    expect(m.masked).toMatch(/FIRM_\d+/)
    expect(m.masked).toMatch(/PHONE_\d+/)
    expect(m.unmask(m.masked)).toBe(PROSE)
  })

  it('every import prompt and answer is logged on the record', async () => {
    const on = fakeDeps(true)
    await readImportContent({ companyId: 'c1', personId: 'p1', spec: CONSULTANTS, content: SHEET }, on.deps)
    expect(on.logged).toHaveLength(1)
    const row = on.logged[0]
    expect(row.companyId).toBe('c1')
    expect(row.personId).toBe('p1')
    expect(row.purpose).toBe(IMPORT_PURPOSE)
    expect(row.maskedPrompt).toContain(on.sent[0])
    expect(row.maskedAnswer).toMatch(/PERSON_\d+/)
    // The log is handed the real values so it can refuse a text that still holds one.
    expect(row.realValues).toEqual(expect.arrayContaining(['Helena Marsh', 'helena.marsh@example.com']))
    for (const real of REAL) {
      expect(row.maskedPrompt.toLowerCase()).not.toContain(real.toLowerCase())
      expect(row.maskedAnswer.toLowerCase()).not.toContain(real.toLowerCase())
    }
  })

  it('no sentence a person reads names a key or an environment variable', () => {
    const machine = /API_KEY|_SECRET\b|_TOKEN\b|process\.env|environment variable|ANTHROPIC_|[A-Z]{2,}_KEY\b/
    for (const said of Object.values(SAY)) expect(said).not.toMatch(machine)
    for (const file of ['src/app/api/imports/sheets/route.ts', 'src/app/api/imports/sheets/read.ts']) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      const literals = src.match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? []
      for (const lit of literals) expect(lit, `${file}: ${lit}`).not.toMatch(machine)
    }
  })
})
