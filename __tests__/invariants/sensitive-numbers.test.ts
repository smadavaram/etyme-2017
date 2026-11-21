import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  DATA_SEAL_KEY_ENV, SAYS_NO_KEY, isMasked, lastFourOf, masked, mayReveal, openFromForm, openTaxId,
  sealForForm, taxIdShown, taxIdToWrite,
} from '@/lib/sensitive'

/**
 * Record 99 (2026-11-18): a tax ID, bank details and a social security
 * number are masked for everyone and sealed at rest; only an Owner reveals
 * one, after a fresh second check. Record 104, item 1, found a tax ID
 * shown whole on production.
 */

const env = { [DATA_SEAL_KEY_ENV]: randomBytes(32).toString('base64') }

describe('a sensitive number is masked and sealed', () => {
  it('a tax ID shows its last four and dots, for everyone', () => {
    expect(masked('6789')).toBe('•••••6789')
    expect(taxIdShown({ taxIdLast4: '6789' })).toBe('•••••6789')
    expect(taxIdShown({ taxIdLast4: null, taxId: null })).toBeNull()
    expect(isMasked('•••••6789')).toBe(true)
    expect(isMasked('12-3456789')).toBe(false)
  })

  it('a tax ID written before the rule still leaves masked, never whole', () => {
    expect(taxIdShown({ taxId: '12-3456789' })).toBe('•••••6789')
    expect(lastFourOf('DE 123 456 789')).toBe('6789')
  })

  it('a tax ID is written sealed with its last four, and the plain column empty', () => {
    const w = taxIdToWrite('12-3456789', env)
    expect(w.ok).toBe(true)
    if (!w.ok) return
    expect(w.data.taxId).toBeNull()
    expect(w.data.taxIdLast4).toBe('6789')
    expect(w.data.taxIdSealed).not.toContain('3456789')
    expect(openTaxId(w.data, env)).toBe('12-3456789')
  })

  it('without the data key a tax ID is refused in a sentence, never kept in plain text', () => {
    expect(taxIdToWrite('12-3456789', {})).toEqual({ ok: false, says: SAYS_NO_KEY })
    expect(taxIdToWrite('', {})).toEqual({ ok: true, data: { taxId: null, taxIdSealed: null, taxIdLast4: null } })
  })

  it('a sealed value does not open under another key', () => {
    const w = taxIdToWrite('12-3456789', env)
    if (!w.ok) throw new Error('sealed')
    expect(openTaxId(w.data, { [DATA_SEAL_KEY_ENV]: randomBytes(32).toString('base64') })).toBeNull()
  })

  it('a number read off a paper is handed to the form sealed for that company only', () => {
    const token = sealForForm('co-a', '12-3456789', env)!
    expect(token).not.toContain('3456789')
    expect(openFromForm('co-a', token, env)).toBe('12-3456789')
    expect(openFromForm('co-b', token, env)).toBeNull()
    expect(sealForForm('co-a', '12-3456789', {})).toBeNull()
  })
})

describe('who may reveal', () => {
  const base = { ownCompany: true, asHerself: true, companyName: 'Quillbrook Staffing' }
  it('the Owner of the company may reveal its tax ID', () => {
    expect(mayReveal({ ...base, isOwner: true })).toEqual({ ok: true })
  })
  it('an Admin cannot reveal, and is told the request window is not built yet', () => {
    const v = mayReveal({ ...base, isOwner: false })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.says).toMatch(/^Only an Owner of Quillbrook Staffing can show the full tax ID\..*not built yet\.$/)
  })
  it('nobody reveals a number from another company or as somebody else', () => {
    expect(mayReveal({ ...base, isOwner: true, ownCompany: false }).ok).toBe(false)
    expect(mayReveal({ ...base, isOwner: true, asHerself: false }).ok).toBe(false)
  })
})

// ── The guard on every read ──────────────────────────────────────────

const ROOT = process.cwd()
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(ROOT, p).split('\\').join('/'))
  }
  return out
}

/**
 * Every file that names a column holding a full tax ID, and why it may.
 * A new file that reads `taxId` or `taxIdSealed` fails here until it is
 * added with its reason, which is when somebody asks whether it masks.
 */
const MAY_NAME_THE_COLUMN: Record<string, string> = {
  'src/lib/sensitive.ts': 'The one reader: masks, seals and opens.',
  'src/lib/sensitive-mask.ts': 'The masking half of the one reader, with no server-only import, so a screen may reach it.',
  'src/lib/sensitive-backfill.ts': 'Moves plain values to the sealed column.',
  'src/app/api/settings/sensitive/reveal/route.ts': 'The one reply that carries the full value, Owner only, after a second check.',
  'src/app/api/settings/setup/read.ts': 'Reads the plain column only to mask it (taxIdShown).',
  'src/app/api/settings/setup/[item]/route.ts': 'Writes sealed through taxIdToWrite; reads the last four to compare.',
  'src/app/api/settings/setup/read-paper/route.ts': 'Masks a paper’s tax ID and seals it for Save.',
  'src/app/api/settings/remit-to/route.ts': 'Writes sealed; every reply goes through shownRow.',
  'src/lib/money/pay-to.ts': 'Every bill row goes through onBill, which masks.',
  'src/app/api/invoices/[id]/coding/route.ts': 'Passes on payToOnBill’s already masked value.',
  'src/app/dashboard/invoices/invoice-money.tsx': 'The type of the masked value the coding route sends.',
  'src/app/dashboard/settings/setup/items.tsx': 'The setup form; holds the masked value and the sealed paper token.',
  'src/lib/billing-cascade.ts': 'A type field no caller fills from the database.',
  'src/lib/setup-fill.ts': 'Reads a tax ID off a paper the company sent; the route masks it.',
  'src/lib/setup-fill-model.ts': 'Keeps the tax ID away from the model.',
  'src/lib/setup-checklist.ts': 'A label: where on the W-9 the tax ID is.',
  'src/lib/seed-rebuild.ts': 'Says the column is not an id of ours.',
  'src/lib/matrix.ts': 'Words: the delivery matrix describes the rule.',
}

describe('no API reply carries a full tax ID, bank account or social security number except the reveal', () => {
  it('every file that names a tax ID column is one that masks it, by name', () => {
    const naming = files(join(ROOT, 'src')).filter((f) => /\btaxId(Sealed)?\b/.test(readFileSync(join(ROOT, f), 'utf8')))
    const unlisted = naming.filter((f) => !(f in MAY_NAME_THE_COLUMN))
    expect(unlisted, 'a new read of a tax ID column: mask it through lib/sensitive, then list it here').toEqual([])
  })

  it('nothing outside the reader, the reveal and the backfill opens a sealed tax ID', () => {
    const opening = files(join(ROOT, 'src')).filter((f) => /\bopenTaxId\(/.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(opening.sort()).toEqual(['src/app/api/settings/sensitive/reveal/route.ts', 'src/lib/sensitive-backfill.ts', 'src/lib/sensitive.ts'])
  })

  it('no column holds a full bank account, routing or social security number', () => {
    const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8')
    expect(schema).not.toMatch(/^\s+(accountNumber|routingNumber|iban|ssn|socialSecurityNumber)\s/im)
  })

  it('this data reaches no model: no model prompt reads a tax ID', () => {
    for (const f of files(join(ROOT, 'src')).filter((x) => /model-boundary|lib\/twin|lib\/model-|prompt/.test(x))) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(/\btaxId(Sealed)?\b|openTaxId/)
    }
  })

  it('a company page, a bill, an export and an email print only the masked form', () => {
    // The emailed bill page names no tax ID at all; a bill and its coding
    // read payToOnBill, which masks; the company page and the exports name none.
    const delivery = readFileSync(join(ROOT, 'src/lib/notify/bill-delivery.ts'), 'utf8')
    expect(delivery).not.toMatch(/\btaxId\b/)
    const payTo = readFileSync(join(ROOT, 'src/lib/money/pay-to.ts'), 'utf8')
    expect(payTo).toMatch(/row: printedOnBill\(onBill\(read\)\)/)
    expect(payTo).toMatch(/row: onBill\(row\)/)
    for (const f of files(join(ROOT, 'src')).filter((x) => /app\/site\/|app\/api\/site\/|export|csv/i.test(x))) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(/\btaxId(Sealed)?\b/)
    }
  })
})

describe('every question the reveal route asks, its screen has a field for', () => {
  it('the Show button sends the field, the record and the proof the reveal route reads', () => {
    const route = readFileSync(join(ROOT, 'src/app/api/settings/sensitive/reveal/route.ts'), 'utf8')
    const screen = readFileSync(join(ROOT, 'src/components/step-up/reveal-number.tsx'), 'utf8')
    const asked = [...new Set([...route.matchAll(/body\.(\w+)/g)].map((m) => m[1]))].sort()
    expect(asked).toEqual(['field', 'id', 'proof'])
    expect(screen).toMatch(/JSON\.stringify\(\{ field, id, \.\.\.\(proof \? \{ proof \} : \{\}\) \}\)/)
    // A route that asks for a second check is answered by opening one.
    expect(screen).toMatch(/askedFor\(r\.body\)/)
  })

  it('the setup form sends the paper’s sealed number back as the field Save reads', () => {
    const route = readFileSync(join(ROOT, 'src/app/api/settings/setup/[item]/route.ts'), 'utf8')
    const form = readFileSync(join(ROOT, 'src/app/dashboard/settings/setup/items.tsx'), 'utf8')
    expect(route).toContain('body.taxIdFromPaper')
    expect(form).toContain('taxIdFromPaper')
  })
})
