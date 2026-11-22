import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as counterparty from '@/lib/counterparty'

/**
 * The owner's ruling of 2026-11-22, which replaced record 110's A1:
 * customer and client are the same for every business. A company is one
 * record with one Kind, and nothing classifies it a second time as a
 * customer apart from a client.
 *
 * "End client" is a different thing and stays: it is a term on a
 * placement, the company where the consultant does the work, named only
 * where that differs from the customer. It is never a kind of company.
 *
 * Both halves are held here by reading the code, so the split cannot come
 * back by one file.
 */

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const p = `${dir}/${name}`
    if (statSync(join(root, p)).isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('customer and client are the same for every business', () => {
  it('a company’s Kind is one fact, and no screen or route asks whether it is a customer or a client apart from it', () => {
    // The classify route, the groups reader and its route, and the Classify page are gone.
    for (const gone of [
      'src/app/api/companies/[id]/classify/route.ts',
      'src/app/api/companies/groups.ts',
      'src/app/api/companies/groups/route.ts',
      'src/app/dashboard/companies/classify/page.tsx',
    ]) expect(existsSync(join(root, gone)), gone).toBe(false)

    // Nothing in the app draws the two checkboxes, calls the gone routes or reads their reader.
    const FORBIDDEN: [RegExp, string][] = [
      [/Customer: pays us/, 'the "Customer: pays us" checkbox'],
      [/Client: where our people work/, 'the "Client: where our people work" checkbox'],
      [/A client: where our people work/, 'the end client choice on Add a company'],
      [/companies\/groups\b/, 'the groups route'],
      [/\/classify\b/, 'the classify route'],
      [/\bEND_CLIENT_ROW\b/, 'the END_CLIENT register relationship'],
      [/relationship: 'END_CLIENT'/, 'an END_CLIENT register row'],
      [/\bCOMPANY_CLASSIFIED\b/, 'the classify act on the ledger'],
      [/\bneedsClassifying\b|Needs classifying/, 'a company that needs classifying'],
      [/\bclassifiedAt\b|\bclassifiedById\b/, 'the classify stamp'],
    ]
    const found: string[] = []
    for (const f of sources('src')) {
      const text = read(f)
      for (const [re, what] of FORBIDDEN) if (re.test(text)) found.push(`${f}: ${what}`)
    }
    expect(found).toEqual([])

    // The register holds the four relationships it held, and no fifth.
    expect(Object.keys(counterparty.RELATIONSHIPS)).toEqual(['CLIENT', 'SUPPLIER', 'PRIME', 'MSP'])
    for (const gone of ['groupsOf', 'groupTotals', 'pickerOptions', 'pickerLabel', 'groupsComeFrom', 'ADD_AS_CHOICES', 'mayClassify', 'classifiedSays', 'SAY_CUSTOMER', 'SAY_CLIENT']) {
      expect(gone in counterparty, gone).toBe(false)
    }

    // The register row carries no stamp of somebody classifying it.
    const schema = read('prisma/schema.prisma')
    const row = schema.slice(schema.indexOf('model Counterparty {'), schema.indexOf('\n}', schema.indexOf('model Counterparty {')))
    expect(row).not.toMatch(/classified/i)
  })

  it('a placement names its end client only where the worksite differs from the customer, and a company is never classified by it', () => {
    // The end client lives on the placement's own line.
    const schema = read('prisma/schema.prisma')
    const line = schema.slice(schema.indexOf('model SellContract {'), schema.indexOf('\n}', schema.indexOf('model SellContract {')))
    expect(line).toMatch(/\bendClientCompanyId\s+String\?/)

    // Record a placement offers it, empty by default, and sends it only when one is chosen.
    const page = read('src/app/dashboard/contracts/page.tsx')
    expect(page).toContain('End client (where consultant works)')
    expect(page).toContain('<option value="">Same as billing client</option>')
    expect(page).toContain("endClientCompanyId: '',")
    expect(page).toMatch(/if \(form\.endClientCompanyId\) \{\s+payload\.endClientCompanyId = form\.endClientCompanyId\s+\}/)
    // The contract's own panel shows the end client where one is named apart from the customer.
    expect(page).toContain('&& contract.endClientName !== contract.counterpartyName')
    expect(page).toContain('<span className="text-xs font-semibold text-etyme-muted">End client</span>')

    // Naming an end client writes the line, and nothing on the company or the register.
    const route = read('src/app/api/contracts/route.ts')
    expect(route).toContain('endClientCompanyId: endClientCompanyId ?? null,')
    expect(route).not.toMatch(/company\.update\([^)]*kind/)
    // The register's rules and the doors that write it never read a line's end client.
    for (const f of ['src/lib/counterparty.ts', 'src/app/api/companies/positions.ts', 'src/app/api/companies/route.ts', 'src/app/api/clients/route.ts', 'src/app/api/companies/[id]/extend/route.ts']) {
      expect(read(f), f).not.toMatch(/endClient/i)
    }
  })
})
