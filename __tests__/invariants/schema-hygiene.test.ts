import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Things the database is supposed to guarantee, checked against the schema
 * rather than against memory.
 *
 * CLAUDE.md is explicit that certain rules belong to the database and not
 * the interface — "Not the UI. The database." A rule enforced only in a
 * route is enforced until somebody adds a second route.
 */

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')

function model(name: string): string {
  const m = schema.match(new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm'))
  expect(m, `model ${name} should exist`).not.toBeNull()
  return m![1]
}

describe('the invariants CLAUDE.md puts in the database', () => {
  it('lets one person be submitted to one requirement only once', () => {
    // "Submission is unique on (requirementId, personId) — first
    // submission wins on duplicates."
    expect(model('Submission')).toMatch(/@@unique\(\[requirementId,\s*personId\]\)/)
  })

  it('lets one agency represent one person at one client, and no more', () => {
    // Two vendors submitting the same person to the same client in the
    // same week gets both rejected and burns the consultant. A route
    // check would hold until somebody adds a second route or two
    // recruiters press submit in the same second.
    expect(model('Representation')).toMatch(/@@unique\(\[personId,\s*holdKey\]\)/)
  })

  it('keeps a person from being sent to the same client twice on their own list', () => {
    expect(model('DoNotSubmit')).toMatch(/@@unique\(\[personId,\s*companyId\]\)/)
  })

  it('bills a timesheet at most once, ever', () => {
    // Anti-double-billing lives in the column, not in a check somebody can
    // forget to call.
    expect(model('InvoiceLine')).toMatch(/timesheetId\s+String\s+@unique/)
  })

  it('gives every company one address that nobody else can hold', () => {
    expect(model('Company')).toMatch(/slug\s+String\s+@unique/)
    expect(model('SubdomainAlias')).toMatch(/subdomain\s+String\s+@unique/)
    expect(model('CustomDomain')).toMatch(/domain\s+String\s+@unique/)
  })

  it('never lets two companies claim the same email domain', () => {
    expect(model('Company')).toMatch(/domain\s+String\?\s+@unique/)
  })

  it('gives one person one account', () => {
    expect(model('Person')).toMatch(/primaryEmail\s+String\s+@unique/)
  })

  it('lets a purchase order number repeat across issuers but not within one', () => {
    // Two clients may both call theirs PO-001.
    expect(model('PurchaseOrder')).toMatch(/@@unique\(\[issuedById,\s*number\]\)/)
  })

  it('sends one event to a subscriber once', () => {
    expect(model('WebhookDelivery')).toMatch(/@@unique\(\[subscriptionId,\s*eventId\]\)/)
  })

  it('stores an API key only as a hash, and only once', () => {
    expect(model('ServiceAccount')).toMatch(/keyHash\s+String\s+@unique/)
    // If the key itself were stored, a leak of this table would be a leak
    // of every integration.
    expect(model('ServiceAccount')).not.toMatch(/^\s*key\s+String/m)
  })

  it('keeps one holiday per date per company', () => {
    expect(model('Holiday')).toMatch(/@@unique\(\[companyId,\s*date\]\)/)
  })

  it('keeps one cost centre code per company', () => {
    // The code must match the customer's ERP exactly, and two rows with
    // the same code would post spend to different places.
    expect(model('CostCenter')).toMatch(/@@unique\(\[companyId,\s*code\]\)/)
  })
})

describe('what happens when a company is deleted', () => {
  const OWNED = [
    'Role', 'CompanyLocation', 'CostCenter', 'RemitTo', 'ApprovalRule',
    'ServiceAccount', 'WebhookSubscription', 'SubdomainAlias', 'CustomDomain',
    'AutomationLog', 'DocumentShare', 'DocumentPacket', 'OrgUnit', 'LegalEntity',
  ]

  const FINANCIAL = ['Requirement', 'SellContract', 'BuyContract', 'Invoice', 'Expense', 'MasterAgreement']

  it('takes its own configuration with it', () => {
    // These are meaningless without the company, and having to delete
    // forty tables in the right order by hand is how the seed broke twice.
    for (const name of OWNED) {
      expect(model(name), name).toMatch(/companyId\][^)]*onDelete:\s*Cascade/)
    }
  })

  it('refuses while financial history still points at it', () => {
    // A cascade here turns one wrong click into a silent deletion of a
    // year's accounts. Postgres refusing is the correct answer.
    for (const name of FINANCIAL) {
      const body = model(name)
      const rel = body.match(/@relation\([^)]*fields:\s*\[(?:companyId|vendorId|clientCompanyId|engagementId)\][^)]*\)/)
      if (rel) expect(rel[0], name).not.toMatch(/onDelete:\s*Cascade/)
    }
  })
})

describe('foreign keys are indexed', () => {
  it('indexes every foreign key, because Postgres does not do it for you', () => {
    // An unindexed foreign key makes both the join and the parent's delete
    // a table scan, and it stays invisible until there is enough data for
    // it to matter — which is the worst moment to find out.
    const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
    const missing: string[] = []

    for (const [, name, body] of models) {
      const indexBlocks =
        [...body.matchAll(/@@index\(\[(.*?)\]\)/g)].map((m) => m[1]).join(' ') +
        ' ' +
        [...body.matchAll(/@@unique\(\[(.*?)\]\)/g)].map((m) => m[1]).join(' ')

      const inlineUnique = new Set(
        body.split('\n')
          .filter((l) => l.includes('@unique') && !l.includes('@@'))
          .map((l) => l.trim().split(/\s+/)[0])
      )

      for (const line of body.split('\n')) {
        const m = line.match(/@relation\(.*?fields:\s*\[(\w+)\]/)
        if (!m) continue
        const field = m[1]
        if (inlineUnique.has(field)) continue
        if (new RegExp(`\\b${field}\\b`).test(indexBlocks)) continue
        missing.push(`${name}.${field}`)
      }
    }

    expect(missing, `unindexed foreign keys: ${missing.join(', ')}`).toEqual([])
  })
})

// ── Every read of a Check is scoped to a company ─────────────────────

import { readFileSync as readSrc } from 'node:fs'
import { globSync } from 'node:fs'

describe('nothing reads a verdict across companies', () => {
  /**
   * `lastVerdict` shipped with `where: { recordType, recordId }` and no
   * companyId — the exact leak class closed across the rest of the build
   * that morning, reintroduced in a shared helper that afternoon.
   *
   * A record id is a cuid and hard to guess, which is not a control.
   */
  it('scopes every prisma.check read to a companyId', () => {
    const files = [
      'src/lib/loop.ts',
      'src/app/api/bar/route.ts',
      'src/app/api/checks/queue/route.ts',
      'src/app/api/checks/[id]/review/route.ts',
    ]

    const unscoped: string[] = []

    for (const file of files) {
      const src = readSrc(file, 'utf8')
      // Each `prisma.check.find*` call, with the ~6 lines that follow it —
      // far enough to reach the where clause, short enough not to bleed
      // into the next query.
      const calls = [...src.matchAll(/prisma\.check\.(findMany|findFirst|findUnique)\(/g)]
      for (const m of calls) {
        const window = src.slice(m.index!, m.index! + 400)
        const where = window.match(/where:\s*\{[\s\S]{0,200}?\}/)
        if (!where || !where[0].includes('companyId')) {
          unscoped.push(`${file} — ${window.slice(0, 60).replace(/\s+/g, ' ')}`)
        }
      }
    }

    expect(unscoped).toEqual([])
  })
})
