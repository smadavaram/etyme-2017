import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as generate } from '@/app/api/invoices/generate/route'
import { GET as invoiceList } from '@/app/api/invoices/route'
import { GET as invoiceRead } from '@/app/api/invoices/[id]/route'
import { act, decideApproval } from '@/lib/twin/ledger'
import { supplierAuthorityAt } from '@/lib/twin/run'
import { billsDueAt } from '@/lib/money/supplier-bills'
import { runSupplierBills } from '@/lib/money/supplier-bills-run'
import { iso } from '@/lib/periods'

/**
 * A refused bill names the week, the person and who must sign first.
 *
 * A client tester, 2026-10-03, as Brightmoor Staffing's accounts
 * receivable desk: "Generate bill" over the week of Omar Haddad's 45
 * hours was refused with "No approved timesheets left to bill for this
 * engagement and period." True, and it did not say why — the week was
 * with Northbend Athletic, unsigned, because five hours over the line
 * were still undecided. On the seeded world, the sentence now says so.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'

let engagementId = ''
let week: { periodStart: Date; periodEnd: Date } | null = null

describe('a refused bill names the week, the person and who must sign first', () => {
  beforeAll(async () => {
    await freshWorld()
    const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' } })
    // Omar Haddad's week nobody at Northbend has signed yet.
    const ts = await prisma.timesheet.findFirstOrThrow({
      where: {
        person: { name: 'Omar Haddad' },
        status: 'SUBMITTED',
        sellContract: { companyId: brightmoor.id },
        assertions: { none: { role: 'CLIENT_APPROVAL', state: 'LIVE' } },
      },
      select: { periodStart: true, periodEnd: true, sellContract: { select: { engagementId: true } } },
      orderBy: { periodStart: 'desc' },
    })
    engagementId = ts.sellContract.engagementId!
    week = { periodStart: ts.periodStart, periodEnd: ts.periodEnd }
  }, 600_000)

  it('a supplier refused a bill for Omar Haddad’s unsigned week is told it is waiting for Northbend Athletic to sign it', async () => {
    as(OWNER)
    const day = (d: Date) => d.toISOString().slice(0, 10)
    const out = await json(await generate(req('POST', '/api/invoices/generate', {
      engagementId,
      periodStart: day(week!.periodStart),
      periodEnd: day(week!.periodEnd),
    })))
    expect(out.status).toBe(422)
    const says: string = out.body.error.message
    const weekOf = week!.periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    expect(says).toContain(`Omar Haddad’s week of ${weekOf} is waiting for Northbend Athletic to sign it.`)
    expect(says).not.toContain('No approved timesheets')
  })
})

/**
 * The supplier's twin drafts the bill on the agreement's billing date
 * (founder, 2026-10-18): Brightmoor Staffing bills Northbend Athletic for
 * Rosa Delgado, whose signed weeks the seeded world never billed. The
 * twin drafts the oldest period whose billing date has passed, from
 * signed weeks only, through the Bills page's own generator; somebody who
 * sends bills says yes before anything is sent. The twin acts on the
 * owner's authority (coordinator, 2026-10-18), so the owner never answers
 * its question and Accounts Receivable, Finance and Admin may.
 *
 * The two performers are money's, wired into `PERFORMERS`
 * (lib/twin/performers) by the architect on 2026-10-18.
 */
describe('the supplier’s twin drafts the bill and a person sends it', () => {
  const t: Record<string, any> = {}
  const NORTHBEND_AP = 'world-nike-ap@demo.etyme.local'

  const decider = async (email: string) => {
    const seat = await prisma.context.findFirstOrThrow({
      where: { person: { primaryEmail: email }, companyId: t.brightmoor, revokedAt: null },
      select: { personId: true, person: { select: { name: true } }, role: { select: { permissions: true } } },
    })
    return {
      personId: seat.personId, personName: seat.person.name, companyId: t.brightmoor,
      companyKind: 'VENDOR', companyName: 'Brightmoor Staffing', permissions: seat.role?.permissions ?? [],
    }
  }

  beforeAll(async () => {
    const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' } })
    const northbend = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' } })
    t.brightmoor = brightmoor.id
    t.northbend = northbend.id
    // The agreement says how often it bills. Demand's agreement routes
    // will write this; the story writes it on the row so the rhythm is
    // read from the agreement, not the order.
    await prisma.masterAgreement.updateMany({
      where: { vendorId: brightmoor.id, clientId: northbend.id },
      data: { billFrequency: 'MONTHLY', billAnchor: 'CALENDAR', billStraddle: 'END' },
    })
    t.rosa = await prisma.sellContract.findFirstOrThrow({
      where: { companyId: brightmoor.id, clientCompanyId: northbend.id, person: { name: 'Rosa Delgado' }, state: 'IN_PROGRESS' },
      select: { id: true, engagementId: true, billRate: true },
    })
    // Her weeks, as the seed left them: every one signed by Northbend,
    // none billed by Brightmoor.
    t.weeks = await prisma.timesheet.findMany({
      where: { sellContractId: t.rosa.id },
      select: {
        id: true, periodStart: true, periodEnd: true, days: true, totalHours: true,
        assertions: { where: { role: 'CLIENT_APPROVAL', state: 'LIVE' }, select: { id: true } },
        invoiceLines: { select: { id: true } },
      },
      orderBy: { periodStart: 'asc' },
    })
    expect(t.weeks.length).toBeGreaterThan(4)
    expect(t.weeks.every((w: any) => w.invoiceLines.length === 0)).toBe(true)
    // One of them goes back to unsigned, so "signed weeks only" has
    // something to leave off: the second week of her first month.
    t.unsigned = t.weeks[1]
    await prisma.workAssertion.updateMany({ where: { timesheetId: t.unsigned.id, role: 'CLIENT_APPROVAL' }, data: { state: 'WITHDRAWN' } })
  }, 600_000)

  it('the supplier’s twin drafts a bill on the agreement’s billing date from signed weeks only', async () => {
    const first = t.weeks[0]
    // The month her first week bills in, under the agreement: the month
    // of its last worked day.
    const lastWorked = Object.keys(first.days as Record<string, number>).filter((k) => Number((first.days as any)[k]) > 0).sort().pop()!
    const monthStart = new Date(Date.UTC(Number(lastWorked.slice(0, 4)), Number(lastWorked.slice(5, 7)) - 1, 1))
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0))

    // On the last day of that month the agreement's billing date has not
    // come: nothing is due for her yet.
    const early = await billsDueAt(t.brightmoor, monthEnd)
    expect(early.find((d) => d.sellContractId === t.rosa.id)).toBeUndefined()

    // The day after, it has.
    const onTheDay = new Date(monthEnd.getTime() + 86_400_000)
    const due = (await billsDueAt(t.brightmoor, onTheDay)).find((d) => d.sellContractId === t.rosa.id)!
    expect(due, 'Rosa’s first month is due the day after it ends').toBeTruthy()
    expect(iso(due.period.start)).toBe(iso(monthStart))
    expect(iso(due.period.end)).toBe(iso(monthEnd))
    expect(iso(due.billingDate)).toBe(iso(onTheDay))
    expect(due.rhythmSays).toBe('monthly, from your agreement with Northbend Athletic')
    // Signed weeks only: the week put back to unsigned is not on it.
    expect(due.planned.timesheetIds).toContain(first.id)
    expect(due.planned.timesheetIds).not.toContain(t.unsigned.id)
    for (const id of due.planned.timesheetIds) {
      expect((t.weeks as any[]).find((w) => w.id === id)!.assertions.length).toBe(1)
    }
    t.planned = due.planned

    // The run drafts it, alone, and asks a person to send it.
    const run = await runSupplierBills(t.brightmoor, { now: onTheDay, surface: 'WEB' })
    expect(run.drafted).toBeGreaterThanOrEqual(1)
    const draft = await prisma.invoice.findFirstOrThrow({
      where: { invoiceLines: { some: { sellContractId: t.rosa.id } } },
      include: { invoiceLines: true },
    })
    expect(draft.status).toBe('DRAFT')
    expect(draft.issuedAt).toBeNull()
    expect(iso(draft.periodStart)).toBe(iso(monthStart))
    expect(iso(draft.periodEnd)).toBe(iso(monthEnd))
    expect(draft.invoiceLines.map((l) => l.timesheetId).sort()).toEqual([...due.planned.timesheetIds].sort())
    t.draft = draft

    const drafted = await prisma.twinAction.findFirstOrThrow({ where: { companyId: t.brightmoor, action: 'bill.draft', outcome: 'PERFORMED' } })
    expect(drafted.twinKind).toBe('SUPPLIER')
    expect(drafted.ruleCited).toContain('ended on')
    expect(drafted.rationale).toContain('Nothing unsigned is on it.')
    const asked = await prisma.twinAction.findFirstOrThrow({
      where: { companyId: t.brightmoor, action: 'bill.send', outcome: 'AWAITING_APPROVAL', entityId: draft.id },
      include: { approvalRequested: true },
    })
    expect(asked.approvalRequested?.needsPermission).toBe('invoices.issue')
    expect(asked.approvalRequested?.decision).toBe('PENDING')
    t.approvalId = asked.approvalRequested!.id
    // What a card shows: the customer, the period, the hours, the money, what it is built from.
    const card = asked.payload as Record<string, any>
    expect(card.customerName).toBe('Northbend Athletic')
    expect(card.period.label).toBe(due.period.label)
    expect(card.hours).toBe(due.planned.hours)
    expect(card.totalMinor).toBe(due.planned.totalMinor)
    expect(card.builtFrom.timesheetIds.length).toBe(due.planned.timesheetIds.length)
    expect(card.invoiceNumber).toBe(draft.number)
  })

  it('a draft the twin wrote and a bill made on the Bills page for the same weeks are the same bill, never two', async () => {
    // Priced by one generator: the draft is what the Bills page would
    // have raised for those weeks, to the cent.
    expect(Math.round(Number(t.draft.total) * 100)).toBe(t.planned.totalMinor)
    const lineCents = t.draft.invoiceLines.reduce((n: number, l: any) => n + l.amountCents, 0)
    expect(lineCents).toBe(t.planned.totalMinor)

    // And the Bills page, asked for the same month, finds nothing left:
    // the twin's draft already holds the weeks.
    as('world-brightmoor-finance@demo.etyme.local')
    const out = await json(await generate(req('POST', '/api/invoices/generate', {
      engagementId: t.rosa.engagementId,
      periodStart: iso(t.draft.periodStart),
      periodEnd: iso(t.draft.periodEnd),
    })))
    expect(out.status).toBe(422)
    for (const id of t.planned.timesheetIds) {
      expect(await prisma.invoiceLine.count({ where: { timesheetId: id, sellContractId: t.rosa.id } })).toBe(1)
    }

    // A second night drafts nothing new while this one waits.
    const again = await runSupplierBills(t.brightmoor, { now: new Date(t.draft.periodEnd.getTime() + 2 * 86_400_000), surface: 'WEB' })
    expect(await prisma.invoice.count({ where: { invoiceLines: { some: { sellContractId: t.rosa.id } } } })).toBe(1)
    expect(again.asked).toBe(0)
  })

  it('where only the owner the twin acts for may send bills, the twin asks nobody and says to send it from the Bills page', async () => {
    // A one-person firm, drawn on Brightmoor for one moment: every other
    // seat that may send a bill steps away, and nothing is put in a queue
    // nobody may answer.
    const authority = await supplierAuthorityAt(t.brightmoor)
    expect(authority.role).toBe('Owner')
    const others = await prisma.context.findMany({
      where: {
        companyId: t.brightmoor, revokedAt: null, personId: { not: authority.personId! },
        role: { permissions: { hasSome: ['invoices.issue', '*'] } },
      },
      select: { id: true },
    })
    expect(others.length).toBeGreaterThan(0)
    const ids = others.map((o) => o.id)
    await prisma.context.updateMany({ where: { id: { in: ids } }, data: { revokedAt: new Date() } })
    try {
      const questionsBefore = await prisma.twinApproval.count({ where: { companyId: t.brightmoor } })
      const r = await act({
        companyId: t.brightmoor, twin: 'SUPPLIER', action: 'bill.send',
        entity: { type: 'Invoice', id: t.draft.id, partyCompanyIds: [t.brightmoor, t.northbend] },
        rule: 'The agreement’s billing date has come.', rationale: 'A one-person firm, for the test.',
        surface: 'WEB', authority, payload: {},
      })
      expect(r.outcome).toBe('REFUSED')
      expect((r as { says: string }).says).toContain('Send it from the Bills page.')
      expect(await prisma.twinApproval.count({ where: { companyId: t.brightmoor } })).toBe(questionsBefore)
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: t.draft.id } })).status).toBe('DRAFT')
    } finally {
      await prisma.context.updateMany({ where: { id: { in: ids } }, data: { revokedAt: null } })
    }
  })

  it('the twin never sends a bill without a yes from somebody who sends bills, and the owner it acts for is never that somebody', async () => {
    // Drafted is not sent: the customer does not see a draft at all.
    as(NORTHBEND_AP)
    const seen = await json(await invoiceList(req('GET', `/api/invoices?limit=50&engagementId=${t.rosa.engagementId}`)))
    expect(seen.status).toBe(200)
    expect(seen.body.data.invoices.map((r: any) => r.id)).not.toContain(t.draft.id)
    const opened = await json(await invoiceRead(req('GET', `/api/invoices/${t.draft.id}`), { params: Promise.resolve({ id: t.draft.id }) }))
    expect(opened.status).toBe(404)
    // Brightmoor, whose working paper it is, does see it.
    as('world-brightmoor-finance@demo.etyme.local')
    const ours = await json(await invoiceList(req('GET', `/api/invoices?limit=50&engagementId=${t.rosa.engagementId}`)))
    expect(ours.body.data.invoices.map((r: any) => r.id)).toContain(t.draft.id)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: t.draft.id } })).status).toBe('DRAFT')

    // AP & Payroll does not issue bills, so its yes is refused.
    const payroll = await decideApproval({ approvalId: t.approvalId, decider: await decider('world-brightmoor-payroll@demo.etyme.local'), decision: 'APPROVED', surface: 'WEB' })
    expect(payroll.ok).toBe(false)
    // Nor does the owner, whose seat the twin acts on, answer its question.
    const own = await decideApproval({ approvalId: t.approvalId, decider: await decider('world-brightmoor@demo.etyme.local'), decision: 'APPROVED', surface: 'WEB' })
    expect(own.ok).toBe(false)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: t.draft.id } })).status).toBe('DRAFT')

    // Accounts Receivable, who sends bills, says yes, and it goes.
    const yes = await decideApproval({ approvalId: t.approvalId, decider: await decider('world-brightmoor-ar@demo.etyme.local'), decision: 'APPROVED', surface: 'WEB' })
    expect(yes.ok, JSON.stringify(yes)).toBe(true)
    const sent = await prisma.invoice.findUniqueOrThrow({ where: { id: t.draft.id } })
    expect(sent.status).toBe('SUBMITTED')
    expect(sent.issuedAt).not.toBeNull()
    expect(sent.submittedAt).not.toBeNull()
  })
})
