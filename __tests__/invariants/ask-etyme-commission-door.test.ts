import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { respond, menuOf, type Readers } from '@/app/api/conversations/twin/ask'
import {
  commissionAnswer, commissionTable, commissionDoorsOn,
  COMMISSIONS_HREF, YOUR_COMMISSIONS_HREF,
  type CommissionRead, type CommissionLine,
} from '@/app/api/conversations/twin/commission-answer'
import { onTheReadersMenu } from '@/app/api/conversations/twin/doors'
import { rolesFor, type CompanyKind } from '@/lib/company-defaults'

/**
 * Walk 8, item 14 (2026-11-09). Marisa Delacroix, Brightmoor's account
 * manager, asked "What did I earn in commission last month?" and the
 * answer was right, but its link "Open Commissions" went to Payroll's
 * Commissions, which refuses her. Her own page is Your commissions, under
 * Accounting. The rule: a link in an answer opens a page the reader's own
 * menu offers, read off the same permissions the menu reads.
 */

const permsOf = (kind: CompanyKind, role: string): string[] => {
  const r = rolesFor(kind).find((x) => x.name === role)
  if (!r) throw new Error(`no ${role} at a ${kind}`)
  return [...r.permissions]
}
const ACCOUNT_MANAGER = permsOf('VENDOR', 'Account Manager')
const RECRUITER = permsOf('VENDOR', 'Recruiter')
const FINANCE = permsOf('VENDOR', 'Finance')
const OWNER = permsOf('VENDOR', 'Owner')

const ME = 'p-marisa'
const line = (over: Partial<CommissionLine> = {}): CommissionLine => ({
  rowId: 'r1', earnedById: ME, earnedBy: 'Marisa Delacroix', kind: 'SALES', person: 'Rajesh Iyer', client: 'Northbend Athletic',
  amountMinor: 64000, currency: 'USD', blankedBecause: null, ...over,
})
const read = (over: Partial<CommissionRead> = {}): CommissionRead => ({
  reach: 'OWN', from: '2026-10-01', to: '2026-10-31', periodWords: 'last month', selfId: ME,
  readers: ['Owner', 'Contract Manager', 'AP & Payroll'], rows: [], ...over,
})
function readers(over: Partial<Readers> = {}): Readers {
  const none = async () => []
  return {
    waiting: none, othersWaiting: none, limits: async () => ({ ok: true as const, entries: [] }),
    told: async () => ({ told: [], stale: [] }), spendIn: async () => ({ ok: true as const, receipts: [], undated: 0 }),
    entry: async () => null, receiptsIn: async () => ({ ok: true as const, receipts: [] }), named: async () => ({}),
    ledgerLines: none, modelOn: async () => false, vocabulary: async () => ({ people: [], firms: [] }),
    model: async () => null, logPrompt: async () => undefined,
    ...over,
  } as Readers
}
const NOV_9 = new Date('2026-11-09T12:00:00Z')
const ask = (text: string, permissions: string[], r: CommissionRead, earnsCommission: boolean) =>
  respond(text, readers({ commissions: async () => ({ ok: true as const, ...r }) }), {
    env: {}, party: 'FIRM', companyKind: 'VENDOR', ownCompany: 'Brightmoor Staffing', permissions, earnsCommission, now: NOV_9,
  })
const linksOf = (a: unknown): { label: string; href: string }[] => ((a as { links?: { label: string; href: string }[] }).links ?? [])
const menuHrefs = (permissions: string[], earnsCommission: boolean) =>
  new Set(menuOf({ companyKind: 'VENDOR', party: 'FIRM', permissions, earnsCommission }).flatMap((s) => s.items.map((i) => i.href.split(/[?#]/)[0])))

describe('a commission answer opens the page the reader’s menu offers', () => {
  it('an account manager asking what she earned in commission is linked to her own commissions page', async () => {
    const a = await ask('What did I earn in commission last month?', ACCOUNT_MANAGER, read(), true)
    expect(a.kind === 'TEXT' && a.says).toBe('You have no commission on the record for last month (Oct 1 – Oct 31). Checked just now.')
    expect(linksOf(a)).toEqual([{ label: 'Open Your commissions', href: '/dashboard/my-work/commissions' }])
  })

  it('a seat that runs the firm’s commissions is linked to Payroll’s Commissions', async () => {
    const rows = [line(), line({ rowId: 'r2', earnedById: 'p-ruth', earnedBy: 'Ruth Ellis', kind: 'RECRUITING', amountMinor: 52000 })]
    const a = await ask('Which recruiter earned the most commission?', FINANCE, read({ reach: 'FIRM', rows }), false)
    expect(linksOf(a)).toEqual([{ label: 'Open Commissions', href: '/dashboard/payroll/commissions' }])
    if (a.kind !== 'LIST') throw new Error(JSON.stringify(a))
    expect(a.table!.rows.every((r) => r.href === COMMISSIONS_HREF)).toBe(true)
  })

  it('no commission answer links a page the reader’s menu does not offer', async () => {
    const cases: { text: string; permissions: string[]; earns: boolean; r: CommissionRead }[] = [
      { text: 'What did I earn in commission last month?', permissions: ACCOUNT_MANAGER, earns: true, r: read({ rows: [line()] }) },
      { text: 'What did I earn in commission last month?', permissions: RECRUITER, earns: true, r: read() },
      { text: 'What did I earn in commission last month?', permissions: RECRUITER, earns: false, r: read() },
      { text: 'What did I earn in commission last month?', permissions: FINANCE, earns: true, r: read({ reach: 'FIRM', rows: [line()] }) },
      { text: 'Our commissions last month', permissions: OWNER, earns: false, r: read({ reach: 'FIRM', rows: [line()] }) },
      { text: 'Our commissions last month', permissions: ACCOUNT_MANAGER, earns: true, r: read({ rows: [line()] }) },
      { text: 'What will I earn in commission next month?', permissions: ACCOUNT_MANAGER, earns: true, r: read() },
      { text: 'What did I earn in commission this week?', permissions: RECRUITER, earns: false, r: read() },
    ]
    for (const c of cases) {
      const a = await ask(c.text, c.permissions, c.r, c.earns)
      const offered = menuHrefs(c.permissions, c.earns)
      const table = (a as { table?: { rows: { href?: string }[] } }).table
      const hrefs = [...linksOf(a).map((l) => l.href), ...(table?.rows.map((r) => r.href).filter((h): h is string => !!h) ?? [])]
      for (const h of hrefs) expect(offered.has(h.split(/[?#]/)[0]), `${c.text} as ${c.permissions.length} permissions linked ${h}`).toBe(true)
    }
  })

  it('a seat whose menu offers neither commission page is answered with no link and names no page', () => {
    const many = Array.from({ length: 5 }, (_, i) => line({ rowId: `r${i}`, person: `Person ${i}` }))
    const a = commissionAnswer(read({ rows: many }), { whose: 'OWN' }, { firm: false, own: false })
    expect(a.links).toEqual([])
    expect(a.says).toContain('; and 2 more.')
    expect(a.says).not.toMatch(/more on/)
    expect(commissionTable(a.rows, null).rows.every((r) => !('href' in r))).toBe(true)
  })

  it('a seat that reads payroll and asks about its own commission is linked to Payroll’s Commissions, where its own row is listed', async () => {
    const a = await ask('What did I earn in commission last month?', FINANCE, read({ reach: 'FIRM', rows: [line()] }), true)
    expect(linksOf(a)).toEqual([{ label: 'Open Commissions', href: COMMISSIONS_HREF }])
  })

  it('a long list of your own names the page it links for the rest', () => {
    const many = Array.from({ length: 5 }, (_, i) => line({ rowId: `r${i}`, person: `Person ${i}` }))
    const a = commissionAnswer(read({ rows: many }), { whose: 'OWN' }, { firm: false, own: true })
    expect(a.says).toContain('; and 2 more on Your commissions.')
    expect(commissionTable(a.rows, a.links[0]?.href ?? null).rows.every((r) => r.href === YOUR_COMMISSIONS_HREF)).toBe(true)
  })

  it('the commission pages a menu offers are read off the menu the sidebar draws, never typed in the answer', () => {
    const own = menuOf({ companyKind: 'VENDOR', party: 'FIRM', permissions: ACCOUNT_MANAGER, earnsCommission: true })
    expect(commissionDoorsOn(own)).toEqual({ firm: false, own: true })
    expect(commissionDoorsOn(menuOf({ companyKind: 'VENDOR', party: 'FIRM', permissions: FINANCE, earnsCommission: true }))).toEqual({ firm: true, own: false })
    expect(commissionDoorsOn(menuOf({ companyKind: 'VENDOR', party: 'FIRM', permissions: RECRUITER, earnsCommission: false }))).toEqual({ firm: false, own: false })
  })

  it('“Where are my commissions?” answers Your commissions for a person who earns commission and does not read payroll', async () => {
    const a = await respond('Where are my commissions?', readers(), { env: {}, party: 'FIRM', companyKind: 'VENDOR', ownCompany: 'Brightmoor Staffing', permissions: ACCOUNT_MANAGER, earnsCommission: true })
    expect(linksOf(a)).toEqual([{ label: 'Open Your commissions', href: YOUR_COMMISSIONS_HREF }])
  })
})

// ── Every other answer, through the reader's own menu ──────────────────

describe('every link Ask Etyme hands a person opens a page that person’s menu offers', () => {
  const accountManager = menuOf({ companyKind: 'VENDOR', party: 'FIRM', permissions: ACCOUNT_MANAGER, earnsCommission: true })

  it('a link to a page the reader’s permissions keep off the menu is dropped, never handed to them', () => {
    const a = onTheReadersMenu({ kind: 'TEXT', says: 'x', links: [{ label: 'Open Payroll', href: '/dashboard/payroll' }, { label: 'Open Bills', href: '/dashboard/invoices' }] }, accountManager, { companyKind: 'VENDOR', party: 'FIRM', earnsCommission: true })
    expect(a.kind === 'TEXT' && a.links).toEqual([{ label: 'Open Bills', href: '/dashboard/invoices' }])
  })

  it('a link to another kind of firm’s page is moved to the reader’s own page of the same name', () => {
    const a = onTheReadersMenu({ kind: 'TEXT', says: 'x', links: [{ label: 'Open Jobs', href: '/dashboard/requisitions' }] }, accountManager, { companyKind: 'VENDOR', party: 'FIRM', earnsCommission: true })
    expect(a.kind === 'TEXT' && a.links).toEqual([{ label: 'Open Jobs', href: '/dashboard/requirements' }])
  })

  it('a link to a page no menu draws, a placement or a week, is left as it is', () => {
    const links = [{ label: 'Open Rajesh Iyer', href: '/dashboard/placements/s1' }, { label: 'Open the week', href: '/dashboard/weeks/t1' }]
    const a = onTheReadersMenu({ kind: 'TEXT', says: 'x', links }, accountManager, { companyKind: 'VENDOR', party: 'FIRM', earnsCommission: true })
    expect(a.kind === 'TEXT' && a.links).toEqual(links)
  })

  it('a page this kind of firm’s menu never draws, where the route still opens it, keeps its link', () => {
    // The twin's ledger opens for any seat that reads the twin; a supplier's menu has no link to it yet.
    const a = onTheReadersMenu({ kind: 'TEXT', says: 'x', links: [{ label: 'Open the ledger', href: '/dashboard/twin' }] }, menuOf({ companyKind: 'VENDOR', party: 'FIRM', permissions: OWNER }), { companyKind: 'VENDOR', party: 'FIRM' })
    expect(a.kind === 'TEXT' && a.links).toEqual([{ label: 'Open the ledger', href: '/dashboard/twin' }])
  })

  it('a table row that opens a page the reader’s permissions hide opens nothing, and “take me there” never names it', () => {
    const a = onTheReadersMenu(
      { kind: 'LIST', says: 'x', table: { caption: 'c', head: ['a'], rows: [{ cells: ['a'], href: '/dashboard/payroll/commissions' }, { cells: ['b'], href: '/dashboard/placements/s1' }] } },
      accountManager, { companyKind: 'VENDOR', party: 'FIRM', earnsCommission: true },
    )
    if (a.kind !== 'LIST') throw new Error('kind')
    expect(a.table!.rows.map((r) => r.href)).toEqual([undefined, '/dashboard/placements/s1'])
    const t = onTheReadersMenu({ kind: 'TEXT', says: 'x', place: '/dashboard/payroll', go: true, links: [] }, accountManager, { companyKind: 'VENDOR', party: 'FIRM', earnsCommission: true })
    expect(t.kind === 'TEXT' && [t.place, t.go]).toEqual([undefined, undefined])
  })

  it('an answer with permissions unknown is left as it is', () => {
    const answer = { kind: 'TEXT' as const, says: 'x', links: [{ label: 'Open Payroll', href: '/dashboard/payroll' }] }
    expect(onTheReadersMenu(answer, menuOf({ companyKind: 'VENDOR', party: 'FIRM', permissions: null }), { companyKind: 'VENDOR', party: 'FIRM' })).toEqual(answer)
  })

  it('Ask Etyme’s firm and worker doors put every answer through the reader’s own menu before it is sent', () => {
    const route = readFileSync(join(__dirname, '../../src/app/api/conversations/twin/route.ts'), 'utf8')
    expect(route.match(/onTheReadersMenu\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    // The person's own commission page is on Ask Etyme's menu exactly where it is on the sidebar's.
    expect(route).toMatch(/earnsCommission/)
  })
})
