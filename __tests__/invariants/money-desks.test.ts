import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MONEY_PAGES, RECEIVABLE, PAYABLE,
  mayOpen, refusal, maySeeBothSides, mayRecordSupplierInvoice,
  type MoneyPage,
} from '@/lib/money/desks'
import { rolesFor, type CompanyKind, type RoleSeed } from '@/lib/company-defaults'

/**
 * The desk a money page is named for can open it.
 *
 * `GET /api/ar` and `GET /api/ap` were gated on `margin.read || pnl.read`
 * from the day they were written. The Accounts Receivable clerk holds
 * neither, nor does AP & Payroll, nor does a client's AP Clerk. So the
 * two desks the pages are named after were refused by them in
 * production, and the refusal said "A recruiter role deliberately does
 * not" to a person who was not a recruiter.
 *
 * It survived because nobody sat in the seat. Unit tests proved the
 * arithmetic on both pages and none of them had a role attached. This
 * file walks every default role of every kind of company through every
 * money gate, which is the only check that would have caught it.
 */

const KINDS: CompanyKind[] = ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP']

function role(kind: CompanyKind, name: string): RoleSeed {
  const r = rolesFor(kind).find((x) => x.name === name)
  if (!r) throw new Error(`${kind} has no role called "${name}"`)
  return r
}

/** Every (kind, role) pair in the product, once. */
function everySeat(): { kind: CompanyKind; role: RoleSeed }[] {
  return KINDS.flatMap((kind) => rolesFor(kind).map((role) => ({ kind, role })))
}

describe('The desk a money page is named after can open it', () => {

  it('the clerk who bills the client can open the page they bill from', () => {
    const ar = role('VENDOR', 'Accounts Receivable')
    expect(ar.blurb).toContain('Bills the client')
    expect(mayOpen(ar.permissions, RECEIVABLE)).toBe(true)
  })

  it('the desk that pays the supplier can open the page it pays from', () => {
    const ap = role('VENDOR', 'AP & Payroll')
    expect(mayOpen(ap.permissions, PAYABLE)).toBe(true)
  })

  it('a client’s AP clerk can open the page they match supplier invoices on', () => {
    const clerk = role('CLIENT', 'AP Clerk')
    expect(clerk.blurb).toContain('supplier invoices')
    expect(mayOpen(clerk.permissions, PAYABLE)).toBe(true)
  })

  it('the one-person finance desk at a small firm can open both of them', () => {
    const finance = role('VENDOR', 'Finance')
    expect(mayOpen(finance.permissions, RECEIVABLE)).toBe(true)
    expect(mayOpen(finance.permissions, PAYABLE)).toBe(true)
  })

  it('the desk that pays the supplier can record the invoice the supplier sent', () => {
    // It is the supplier who issues that document and we who receive it,
    // so receiving it cannot need the permission to issue one of ours.
    expect(mayRecordSupplierInvoice(role('VENDOR', 'AP & Payroll').permissions)).toBe(true)
    expect(mayRecordSupplierInvoice(role('CLIENT', 'AP Clerk').permissions)).toBe(true)
    expect(mayRecordSupplierInvoice(role('MSP', 'AP Clerk').permissions)).toBe(true)
  })

  it('an owner can open every money page in every kind of company', () => {
    for (const kind of KINDS) {
      const owner = rolesFor(kind).find((r) => r.isOwner)!
      for (const page of MONEY_PAGES) {
        expect(mayOpen(owner.permissions, page), `${kind} owner / ${page.title}`).toBe(true)
      }
    }
  })
})

describe('A money gate never refuses the desk the page is for', () => {

  // The sweep. This is the test that would have caught the bug, and the
  // one that catches the next gate copied from a profitability route.
  it('every desk a money page is named for can open it, in every kind of company', () => {
    const refused: string[] = []
    for (const page of MONEY_PAGES) {
      for (const { kind, role } of everySeat()) {
        if (!page.desks.includes(role.name)) continue
        if (!mayOpen(role.permissions, page)) {
          refused.push(`${kind} “${role.name}” cannot open ${page.title} — ${role.blurb}`)
        }
      }
    }
    expect(refused, refused.join('\n  ')).toEqual([])
  })

  it('every desk a money page names is a real role somebody is actually seated in', () => {
    const known = new Set(everySeat().map(({ role }) => role.name))
    for (const page of MONEY_PAGES) {
      expect(page.desks.length, page.title).toBeGreaterThan(0)
      for (const desk of page.desks) {
        expect(known.has(desk), `${page.title} names a desk that no longer exists: ${desk}`).toBe(true)
      }
    }
  })

  it('every role whose job description says it bills clients can read the receivable book', () => {
    const refused: string[] = []
    for (const { kind, role } of everySeat()) {
      const b = role.blurb.toLowerCase()
      const bills = /bills the client|bills, pays|what was billed|records what came in/.test(b)
      if (bills && !mayOpen(role.permissions, RECEIVABLE)) {
        refused.push(`${kind} “${role.name}”: ${role.blurb}`)
      }
    }
    expect(refused, refused.join('\n  ')).toEqual([])
  })

  it('every role whose job description says it pays suppliers can read the bill book', () => {
    const refused: string[] = []
    for (const { kind, role } of everySeat()) {
      const b = role.blurb.toLowerCase()
      const pays = /supplier invoices|settles bills|bills, pays|pays the consultant or the sub-vendor/.test(b)
      if (pays && !mayOpen(role.permissions, PAYABLE)) {
        refused.push(`${kind} “${role.name}”: ${role.blurb}`)
      }
    }
    expect(refused, refused.join('\n  ')).toEqual([])
  })

  it('a money page never refuses a read to a desk it would accept a write from', () => {
    // The giveaway on the original bug: the same file took the AR
    // clerk's receipt on POST and refused her the queue on GET.
    const wrong: string[] = []
    for (const { kind, role } of everySeat()) {
      const writesAR =
        role.permissions.includes('invoices.issue') || role.permissions.includes('payments.record')
      if (writesAR && !mayOpen(role.permissions, RECEIVABLE)) {
        wrong.push(`${kind} “${role.name}” may record against the receivable book and may not read it`)
      }
      const writesAP = role.permissions.includes('payments.record')
      if (writesAP && !mayOpen(role.permissions, PAYABLE)) {
        wrong.push(`${kind} “${role.name}” may pay a supplier bill and may not read the bill book`)
      }
    }
    expect(wrong, wrong.join('\n  ')).toEqual([])
  })
})

describe('And still refuses the desks it was always meant to', () => {

  it('a recruiter still cannot, because a bench total must not be workable backwards into a salary', () => {
    for (const kind of ['VENDOR', 'GSI'] as CompanyKind[]) {
      const recruiter = role(kind, 'Recruiter')
      expect(recruiter.permissions).not.toContain('consultants.cost')
      for (const page of MONEY_PAGES) {
        expect(mayOpen(recruiter.permissions, page), `${kind} recruiter / ${page.title}`).toBe(false)
      }
      expect(maySeeBothSides(recruiter.permissions)).toBe(false)
    }
  })

  it('an HR desk that sees no money sees no money', () => {
    const hr = role('VENDOR', 'HR')
    expect(hr.blurb).toContain('Sees no money')
    for (const page of MONEY_PAGES) expect(mayOpen(hr.permissions, page)).toBe(false)
  })

  it('a compliance officer reading paperwork is not handed the invoice book', () => {
    for (const kind of ['VENDOR', 'CLIENT', 'MSP'] as CompanyKind[]) {
      const co = role(kind, 'Compliance Officer')
      for (const page of MONEY_PAGES) {
        expect(mayOpen(co.permissions, page), `${kind} compliance / ${page.title}`).toBe(false)
      }
    }
  })

  it('a hiring manager who raises requisitions is not handed the firm’s payables', () => {
    const hm = role('CLIENT', 'Hiring Manager')
    for (const page of MONEY_PAGES) expect(mayOpen(hm.permissions, page)).toBe(false)
  })
})

describe('Cost beside revenue for the same work is margin, whoever is reading', () => {

  it('what a client paid and what its supplier was paid are laid side by side only for somebody who may read margin', () => {
    const allowed = everySeat().filter(({ role }) => maySeeBothSides(role.permissions))
    // Whoever may is named, so a role quietly gaining it is visible here.
    expect(allowed.map(({ kind, role }) => `${kind}/${role.name}`).sort()).toEqual([
      'CLIENT/Owner',
      'CONSULTANT_CORP/Owner',
      'GSI/Admin',
      'GSI/Finance',
      'GSI/Owner',
      'MSP/Owner',
      'VENDOR/Admin',
      'VENDOR/Finance',
      'VENDOR/Owner',
    ])
  })

  it('the desk that pays suppliers keeps the page it pays from even without margin', () => {
    const ap = role('VENDOR', 'AP & Payroll')
    expect(maySeeBothSides(ap.permissions)).toBe(false)
    expect(mayOpen(ap.permissions, PAYABLE)).toBe(true)
  })

  it('the payables screen withholds the chains rather than drawing them as zero', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/ap/route.ts'), 'utf8')
    expect(src).toContain('maySeeBothSides')
    expect(src).toContain('BOTH_SIDES_WITHHELD')
    // Days to pay is ours alone and stays on the page for the paying desk.
    expect(src).toContain('dpo: ourDpo')
  })
})

describe('The refusal describes the reader it is actually in front of', () => {

  it('names the desk that is missing and what to do, never a permission code', () => {
    for (const page of MONEY_PAGES) {
      const message = refusal(page).error.message
      expect(message.length, page.title).toBeGreaterThan(80)
      expect(message).toMatch(/Ask whoever manages roles/)
      expect(message, `${page.title} names a permission code at a person`).not.toMatch(
        /margin\.read|pnl\.read|invoices\.read|FORBIDDEN/
      )
    }
  })

  it('does not tell an accounts receivable clerk that she is a recruiter', () => {
    for (const page of MONEY_PAGES) {
      expect(refusal(page).error.message.toLowerCase()).not.toContain('recruiter')
    }
    const ROUTES = [
      'src/app/api/ar/route.ts',
      'src/app/api/ap/route.ts',
    ]
    for (const r of ROUTES) {
      const src = readFileSync(join(process.cwd(), r), 'utf8')
      expect(src, `${r} still tells whoever it refuses that they are a recruiter`)
        .not.toContain('A recruiter role deliberately does not')
    }
  })

  it('every money route that reads a book asks the shared table rather than a margin permission of its own', () => {
    const READS = [
      'src/app/api/ar/route.ts',
      'src/app/api/ar/payments/route.ts',
      'src/app/api/ar/dunning/route.ts',
      'src/app/api/ar/collections/route.ts',
      'src/app/api/ar/credit-notes/route.ts',
      'src/app/api/ar/credit-limit/route.ts',
      'src/app/api/ap/route.ts',
      'src/app/api/ap/bills/route.ts',
      'src/app/api/ap/payment-runs/route.ts',
    ]
    for (const r of READS) {
      const src = readFileSync(join(process.cwd(), r), 'utf8')
      expect(src, `${r} does not use the shared desk gate`).toContain("@/lib/money/desks")
      expect(src, `${r} gates a read on margin again`).toContain('mayOpen(caller.permissions')
    }
  })
})
