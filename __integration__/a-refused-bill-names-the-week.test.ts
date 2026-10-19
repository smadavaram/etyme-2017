import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { POST as generate } from '@/app/api/invoices/generate/route'
import { GET as invoiceList } from '@/app/api/invoices/route'
import { GET as invoiceRead } from '@/app/api/invoices/[id]/route'
import { POST as sendBill } from '@/app/api/invoices/[id]/submit/route'
import { POST as sendBills } from '@/app/api/invoices/submit/route'
import { POST as withdrawBill } from '@/app/api/invoices/[id]/withdraw/route'
import { act, decideApproval, waitingQuestions } from '@/lib/twin/ledger'
import { supplierAuthorityAt } from '@/lib/twin/run'
import { billsDueAt } from '@/lib/money/supplier-bills'
import { runSupplierBills } from '@/lib/money/supplier-bills-run'
import { iso } from '@/lib/periods'
import { billDeliverySays } from '@/lib/notify/bill-delivery'
import { formatDay } from '@/lib/format-date'

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

  it('where nobody but the owner sends bills, Ask Etyme asks the owner, and the ledger says the exception applied', async () => {
    // A one-person firm, drawn on Brightmoor for one moment: every other
    // seat that may send a bill steps away. The owner the twin acts for
    // is asked (founder, 2026-10-19, decision 2), and may answer.
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
      const r = await act({
        companyId: t.brightmoor, twin: 'SUPPLIER', action: 'bill.send',
        entity: { type: 'Invoice', id: t.draft.id, partyCompanyIds: [t.brightmoor, t.northbend] },
        rule: 'The agreement’s billing date has come.', rationale: 'A one-person firm, for the test.',
        surface: 'WEB', authority, payload: {},
      })
      expect(r.outcome).toBe('AWAITING_APPROVAL')
      if (r.outcome !== 'AWAITING_APPROVAL') return
      expect(r.says).toContain('Only you send bills here, so Ask Etyme asks you.')

      // The question and the entry that asked it both say the exception applied.
      const question = await prisma.twinApproval.findUniqueOrThrow({ where: { id: r.approvalId }, include: { twinAction: true } })
      expect(question.needsPermission).toBe('invoices.issue')
      expect(question.selfApprovalReason).toContain('Nobody else at the firm sends bills')
      expect((question.twinAction.payload as Record<string, unknown>).ownerOnlyException).toBe(question.selfApprovalReason)
      expect(await prisma.automationLog.count({
        where: { companyId: t.brightmoor, action: 'TWIN_APPROVAL_REQUESTED', payload: { path: ['approvalId'], equals: r.approvalId } },
      })).toBe(1)

      // The owner's queue offers the yes, with the reason in a sentence.
      const owner = await decider('world-brightmoor@demo.etyme.local')
      const waiting = await waitingQuestions({
        company: { id: t.brightmoor, kind: 'VENDOR', name: 'Brightmoor Staffing' } as any,
        person: { id: owner.personId } as any,
        permissions: owner.permissions as any,
      })
      const mine = waiting.find((q) => q.id === r.approvalId)!
      expect(mine.mayDecide).toBe(true)
      expect(mine.own).toBe(false)
      expect(mine.askedYouBecause).toBe('Only you send bills here, so Ask Etyme asks you.')

      // The owner answers it. A no, here, so the draft stays for the
      // stories below; the yes that sends one is walked at the end.
      const no = await decideApproval({ approvalId: r.approvalId, decider: owner, decision: 'REJECTED', reason: 'Not this month; I will send it with the expenses.', surface: 'WEB' })
      expect(no.ok, JSON.stringify(no)).toBe(true)
      const answered = await prisma.twinAction.findFirstOrThrow({ where: { approvalId: r.approvalId, actorType: 'PERSON' } })
      expect(answered.actorId).toBe(owner.personId)
      expect((answered.payload as Record<string, unknown>).ownerOnlyException).toBe(question.selfApprovalReason)
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: t.draft.id } })).status).toBe('DRAFT')
    } finally {
      await prisma.context.updateMany({ where: { id: { in: ids } }, data: { revokedAt: null } })
    }
  })

  it('where a second person sends bills, the owner still cannot say yes to the twin’s bill', async () => {
    const authority = await supplierAuthorityAt(t.brightmoor)
    const owner = await decider('world-brightmoor@demo.etyme.local')

    // Asked with Accounts Receivable, Finance and Admin seated: the
    // question is theirs, and it claims no exception.
    const asked = await prisma.twinApproval.findUniqueOrThrow({ where: { id: t.approvalId } })
    expect(asked.selfApprovalReason).toBeNull()

    // And a question asked while the owner was alone is taken back the
    // moment somebody else sends bills: the owner's yes is refused.
    const others = await prisma.context.findMany({
      where: {
        companyId: t.brightmoor, revokedAt: null, personId: { not: authority.personId! },
        role: { permissions: { hasSome: ['invoices.issue', '*'] } },
      },
      select: { id: true },
    })
    const ids = others.map((o) => o.id)
    await prisma.context.updateMany({ where: { id: { in: ids } }, data: { revokedAt: new Date() } })
    let approvalId = ''
    try {
      const r = await act({
        companyId: t.brightmoor, twin: 'SUPPLIER', action: 'bill.send',
        entity: { type: 'Invoice', id: t.draft.id, partyCompanyIds: [t.brightmoor, t.northbend] },
        rule: 'The agreement’s billing date has come.', rationale: 'A one-person firm, for the test.',
        surface: 'WEB', authority, payload: {},
      })
      expect(r.outcome).toBe('AWAITING_APPROVAL')
      approvalId = (r as { approvalId: string }).approvalId
    } finally {
      await prisma.context.updateMany({ where: { id: { in: ids } }, data: { revokedAt: null } })
    }
    const late = await decideApproval({ approvalId, decider: owner, decision: 'APPROVED', surface: 'WEB' })
    expect(late.ok).toBe(false)
    if (late.ok) return
    expect(late.status).toBe(403)
    expect(late.says).toContain('Somebody else at your firm sends bills now, so they answer this.')
    expect((await prisma.twinApproval.findUniqueOrThrow({ where: { id: approvalId } })).decision).toBe('PENDING')
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: t.draft.id } })).status).toBe('DRAFT')
    const waiting = await waitingQuestions({
      company: { id: t.brightmoor, kind: 'VENDOR', name: 'Brightmoor Staffing' } as any,
      person: { id: owner.personId } as any,
      permissions: owner.permissions as any,
    })
    const mine = waiting.find((q) => q.id === approvalId)!
    expect(mine.mayDecide).toBe(false)
    expect(mine.askedYouBecause).toBeNull()
    expect(mine.whyNot).toContain('Somebody else at your firm sends bills now')
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

  it('the twin’s send reaches the customer the same way a person’s send does', async () => {
    // Northbend Athletic is on Etyme: its accounts payable seat is told
    // in the app and on its channel, as when a person presses Send, and
    // the sending is recorded under the person who said yes, not the twin.
    const ar = await decider('world-brightmoor-ar@demo.etyme.local')
    const event = await prisma.event.findFirstOrThrow({ where: { subjectType: 'Invoice', subjectId: t.draft.id, type: 'invoice.submitted' } })
    expect(event.companyId).toBe(t.brightmoor)
    expect(event.actorPersonId).toBe(ar.personId)
    const says = `Sent on Etyme to Northbend Athletic’s AP Clerk on ${formatDay(new Date(), { year: false })}`
    expect(await billDeliverySays(t.draft.id)).toBe(says)

    const ap = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: NORTHBEND_AP }, select: { id: true } })
    const notice = await prisma.notification.findFirstOrThrow({ where: { personId: ap.id, type: 'INVOICE', entityId: t.draft.id } })
    expect(notice.title).toContain(`Brightmoor Staffing’s bill ${t.draft.number}`)

    // Brightmoor's Bills page says so on the row.
    as('world-brightmoor-finance@demo.etyme.local')
    const ours = await json(await invoiceList(req('GET', `/api/invoices?limit=50&engagementId=${t.rosa.engagementId}`)))
    expect(ours.body.data.invoices.find((r: any) => r.id === t.draft.id)?.deliverySays).toBe(says)
  })
})

describe('a draft only the owner may send is asked once, not every night', () => {
  // Halcyon Talent, as seeded: one seat, the Owner, who is also the
  // person the supplier's twin acts for. Nobody else may send its bills,
  // so Ask Etyme asks the Owner (founder, 2026-10-19, decision 2).
  const h: Record<string, any> = {}

  beforeAll(async () => {
    h.halcyon = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-halcyon' } })).id
  })

  const questions = () => prisma.twinAction.count({ where: { companyId: h.halcyon, action: 'bill.send' } })

  it('a one-person firm’s drafted bill is checked against its weeks and passes, and Ask Etyme asks the owner it acts for, because only they send bills', async () => {
    const run = await runSupplierBills(h.halcyon, { surface: 'CRON' })
    expect(run.drafted).toBe(1)
    expect(run.asked).toBe(1)
    expect(run.outcomes.REFUSED).toBe(0)
    const asked = await prisma.twinAction.findFirstOrThrow({
      where: { companyId: h.halcyon, action: 'bill.send', outcome: 'AWAITING_APPROVAL' },
      include: { approvalRequested: true },
    })
    expect(asked.approvalRequested?.needsPermission).toBe('invoices.issue')
    expect(asked.approvalRequested?.selfApprovalReason).toContain('Nobody else at the firm sends bills')
    expect((asked.payload as Record<string, unknown>).ownerOnlyException).toBe(asked.approvalRequested?.selfApprovalReason)
    h.draftId = asked.entityId
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: h.draftId } })).status).toBe('DRAFT')
  })

  it('the next night, with nothing changed, the twin neither drafts again nor asks again', async () => {
    const drafts = await prisma.invoice.count({ where: { status: 'DRAFT', invoiceLines: { some: { sellContract: { companyId: h.halcyon } } } } })
    const before = await questions()
    const run = await runSupplierBills(h.halcyon, { surface: 'CRON' })
    expect(run.drafted).toBe(0)
    expect(run.asked).toBe(0)
    expect(run.outcomes.REFUSED).toBe(0)
    expect(await questions()).toBe(before)
    expect(await prisma.invoice.count({ where: { status: 'DRAFT', invoiceLines: { some: { sellContract: { companyId: h.halcyon } } } } })).toBe(drafts)
  })

  it('once somebody who sends bills is seated at the firm, the question about the same draft is theirs, and the owner can no longer answer it', async () => {
    const role = await prisma.role.create({ data: { companyId: h.halcyon, name: 'Accounts Receivable', permissions: ['invoices.issue', 'invoices.read'] } })
    const person = await prisma.person.create({ data: { name: 'Ines Halloran', primaryEmail: 'ines.halloran@halcyon.example' } })
    await prisma.context.create({ data: { personId: person.id, companyId: h.halcyon, type: 'EMPLOYEE', roleId: role.id } })
    const rows = await questions()
    const run = await runSupplierBills(h.halcyon, { surface: 'CRON' })
    expect(run.asked).toBe(0)
    expect(await questions()).toBe(rows)
    const asked = await prisma.twinAction.findFirstOrThrow({
      where: { companyId: h.halcyon, action: 'bill.send', outcome: 'AWAITING_APPROVAL', entityId: h.draftId },
      include: { approvalRequested: true },
    })
    expect(asked.approvalRequested?.decision).toBe('PENDING')
    const company = { id: h.halcyon, kind: 'VENDOR', name: 'Halcyon Talent' } as any
    const ines = await waitingQuestions({ company, person: { id: person.id } as any, permissions: ['invoices.issue', 'invoices.read'] as any })
    expect(ines.find((q) => q.id === asked.approvalRequested!.id)?.mayDecide).toBe(true)
    const ownerSeat = await prisma.context.findFirstOrThrow({
      where: { companyId: h.halcyon, revokedAt: null, role: { name: 'Owner' } },
      select: { personId: true, person: { select: { name: true } }, role: { select: { permissions: true } } },
    })
    const owner = await waitingQuestions({ company, person: { id: ownerSeat.personId } as any, permissions: (ownerSeat.role?.permissions ?? []) as any })
    expect(owner.find((q) => q.id === asked.approvalRequested!.id)?.mayDecide).toBe(false)
    const refused = await decideApproval({
      approvalId: asked.approvalRequested!.id,
      decider: { personId: ownerSeat.personId, personName: ownerSeat.person.name, companyId: h.halcyon, permissions: ownerSeat.role?.permissions ?? [] },
      decision: 'APPROVED', surface: 'WEB',
    })
    expect(refused.ok).toBe(false)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: h.draftId } })).status).toBe('DRAFT')
  })

  it('a bill the twin drafted says Ask Etyme drafted it, in the words the firm reads', async () => {
    const drafted = await prisma.twinAction.findFirstOrThrow({ where: { companyId: h.halcyon, action: 'bill.draft', outcome: 'PERFORMED' } })
    expect(drafted.twinKind).toBe('SUPPLIER')
    const asked = await prisma.twinAction.findFirstOrThrow({ where: { companyId: h.halcyon, action: 'bill.send', outcome: 'AWAITING_APPROVAL' } })
    expect(asked.rationale).not.toContain('twin')
    // The question as the firm's log reads it names Ask Etyme, and says
    // why it went to the owner.
    const said = await prisma.automationLog.findFirstOrThrow({
      where: { companyId: h.halcyon, action: 'TWIN_APPROVAL_REQUESTED', payload: { path: ['twinActionId'], equals: asked.id } },
    })
    expect(said.summary).toMatch(/^Ask Etyme asked the person it acts for, because nobody else at the firm may answer/)
    expect(said.summary).not.toContain('twin')
  })
})

/**
 * A draft never locks billing (release walk, 2026-10-18). At sixteen of
 * nineteen seeded suppliers only the Owner sends bills, and the twin acts
 * on the Owner's authority, so nobody could be asked; Submit refused a
 * draft, the Bills page refused its weeks, and nothing withdrew it. Now
 * whoever sends bills sends or withdraws a draft from the Bills page.
 * Halcyon Talent's draft, as the describe above left it: still a draft,
 * Ines Halloran of Accounts Receivable asked about it.
 */
describe('a draft bill never locks billing: a person sends it or withdraws it', () => {
  const h: Record<string, any> = {}
  const params = (id: string) => ({ params: Promise.resolve({ id }) })

  beforeAll(async () => {
    h.halcyon = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-halcyon' } })).id
    const owner = await prisma.context.findFirstOrThrow({
      where: { companyId: h.halcyon, revokedAt: null, role: { name: 'Owner' } },
      select: { personId: true, person: { select: { primaryEmail: true } } },
    })
    h.ownerEmail = owner.person.primaryEmail
    h.ownerId = owner.personId
    h.draft = await prisma.invoice.findFirstOrThrow({
      where: { status: 'DRAFT', invoiceLines: { some: { sellContract: { companyId: h.halcyon } } } },
      include: { invoiceLines: { select: { timesheetId: true } } },
    })
  })

  it('the Bills page asked for weeks on an unsent draft names the draft and says to send it or withdraw it', async () => {
    as(h.ownerEmail)
    const out = await json(await generate(req('POST', '/api/invoices/generate', {
      engagementId: h.draft.engagementId, periodStart: iso(h.draft.periodStart), periodEnd: iso(h.draft.periodEnd),
    })))
    expect(out.status).toBe(422)
    expect(out.body.error.message).toContain(`on draft bill ${h.draft.number}, which has not been sent. Send it or withdraw it.`)
    expect(out.body.error.message).not.toContain('Nothing signed and unbilled')
    expect(out.body.error.draft).toEqual({ id: h.draft.id, number: h.draft.number, href: `/dashboard/invoices/${h.draft.id}` })
  })

  it('a draft is not withdrawn without a reason', async () => {
    as(h.ownerEmail)
    const out = await json(await withdrawBill(req('POST', `/api/invoices/${h.draft.id}/withdraw`, {}), params(h.draft.id)))
    expect(out.status).toBe(422)
    expect(out.body.error.message).toContain('Say why')
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: h.draft.id } })).status).toBe('DRAFT')
  })

  it('whoever sends bills withdraws a draft with a reason, the open question about sending it closes as overtaken rather than as their no, and the next run drafts those weeks again', async () => {
    as('ines.halloran@halcyon.example')
    const out = await json(await withdrawBill(
      req('POST', `/api/invoices/${h.draft.id}/withdraw`, { reason: 'The client asked for the month on one bill with the expenses.' }),
      params(h.draft.id)
    ))
    expect(out.status, JSON.stringify(out.body)).toBe(200)
    expect(await prisma.invoice.findUnique({ where: { id: h.draft.id } })).toBeNull()
    const weeks = h.draft.invoiceLines.map((l: any) => l.timesheetId).filter(Boolean)
    expect(await prisma.invoiceLine.count({ where: { timesheetId: { in: weeks }, sellContract: { companyId: h.halcyon } } })).toBe(0)

    // Who and why, on the twin's ledger beside the draft, and the question closed.
    const no = await prisma.twinAction.findFirstOrThrow({
      where: { companyId: h.halcyon, action: 'bill.draft', actorType: 'PERSON', outcome: 'REJECTED' },
    })
    expect(no.rationale).toContain('Ines Halloran withdrew draft bill')
    expect(no.rationale).toContain('The client asked for the month on one bill with the expenses.')
    const question = await prisma.twinAction.findFirstOrThrow({
      where: { companyId: h.halcyon, action: 'bill.send', outcome: 'AWAITING_APPROVAL', entityId: h.draft.id },
      include: { approvalRequested: true },
    })
    expect(question.approvalRequested?.decision).toBe('OVERTAKEN')
    expect(question.approvalRequested?.approverPersonId).toBeNull()
    const closed = await prisma.twinAction.findFirstOrThrow({ where: { approvalId: question.approvalRequested!.id, outcome: 'OVERTAKEN' } })
    expect(closed.actorType).toBe('SYSTEM')
    expect(closed.rationale).toBe('Withdrawn by Ines Halloran: The client asked for the month on one bill with the expenses.')
    expect(await prisma.automationLog.count({
      where: { companyId: h.halcyon, action: 'INVOICE_DRAFT_WITHDRAWN', payload: { path: ['invoiceId'], equals: h.draft.id } },
    })).toBe(1)

    // The next run drafts the same weeks again, as a new draft.
    const run = await runSupplierBills(h.halcyon, { surface: 'CRON' })
    expect(run.drafted).toBe(1)
    h.redraft = await prisma.invoice.findFirstOrThrow({
      where: { status: 'DRAFT', invoiceLines: { some: { sellContract: { companyId: h.halcyon } } } },
      include: { invoiceLines: { select: { timesheetId: true } } },
    })
    expect(h.redraft.id).not.toBe(h.draft.id)
    expect(h.redraft.invoiceLines.map((l: any) => l.timesheetId).sort()).toEqual([...weeks].sort())
  })

  it('sending several bills at once runs the three-way check on each, and one that fails is skipped with its sentence and never sent', async () => {
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: h.redraft.id, timesheetId: { not: null } } })
    await prisma.invoiceLine.update({ where: { id: line.id }, data: { amountCents: line.amountCents + 10_000 } })
    try {
      as(h.ownerEmail)
      const out = await json(await sendBills(req('POST', '/api/invoices/submit', { invoiceIds: [h.redraft.id, 'no-such-bill'] })))
      expect(out.status, JSON.stringify(out.body)).toBe(200)
      expect(out.body.data.submitted).toBe(0)
      const mine = out.body.data.results.find((r: any) => r.invoiceId === h.redraft.id)
      expect(mine.status).toBe('skipped')
      expect(mine.reason).toContain('does not match')
      expect(out.body.data.results.find((r: any) => r.invoiceId === 'no-such-bill').status).toBe('not_found')
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: h.redraft.id } })).status).toBe('DRAFT')
    } finally {
      await prisma.invoiceLine.update({ where: { id: line.id }, data: { amountCents: line.amountCents } })
    }
  })

  it('the owner Ask Etyme acts for sends its draft from the Bills page through the same check, and the sender is recorded', async () => {
    h.redraftQuestion = await prisma.twinAction.findFirstOrThrow({
      where: { companyId: h.halcyon, action: 'bill.send', outcome: 'AWAITING_APPROVAL', entityId: h.redraft.id },
      include: { approvalRequested: true },
    })
    expect(h.redraftQuestion.approvalRequested?.decision).toBe('PENDING')
    as(h.ownerEmail)
    const out = await json(await sendBill(req('POST', `/api/invoices/${h.redraft.id}/submit`, {}), params(h.redraft.id)))
    expect(out.status, JSON.stringify(out.body)).toBe(200)
    const sent = await prisma.invoice.findUniqueOrThrow({ where: { id: h.redraft.id } })
    expect(sent.status).toBe('SUBMITTED')
    expect(sent.issuedAt).not.toBeNull()
    const logged = await prisma.automationLog.findFirstOrThrow({
      where: { companyId: h.halcyon, action: 'INVOICE_SUBMITTED', payload: { path: ['invoiceId'], equals: sent.id } },
    })
    expect((logged.payload as Record<string, unknown>).submittedBy).toBe(h.ownerId)

    // And a sent bill is not withdrawn.
    const late = await json(await withdrawBill(req('POST', `/api/invoices/${sent.id}/withdraw`, { reason: 'Too late.' }), params(sent.id)))
    expect(late.status).toBe(409)
    expect(late.body.error.message).toContain('has been sent, so it cannot be withdrawn')
  })
  it('a bill sent from the Bills page by the owner closes Ask Etyme’s question about sending it as overtaken, not as the owner’s own yes', async () => {
    const approval = await prisma.twinApproval.findUniqueOrThrow({ where: { id: h.redraftQuestion.approvalRequested.id } })
    expect(approval.decision).toBe('OVERTAKEN')
    expect(approval.approverPersonId).toBeNull()
    const closed = await prisma.twinAction.findFirstOrThrow({ where: { approvalId: approval.id, outcome: 'OVERTAKEN' } })
    expect(closed.rationale).toMatch(/^Bill .+ was sent by .+\.$/)
    // The owner never answered their own question: no yes under their name.
    expect(await prisma.twinAction.count({ where: { approvalId: approval.id, actorType: 'PERSON' } })).toBe(0)
    expect(await prisma.automationLog.count({
      where: { companyId: h.halcyon, action: 'TWIN_QUESTION_OVERTAKEN', payload: { path: ['approvalId'], equals: approval.id } },
    })).toBe(1)
  })

  it('a yes pressed later on the overtaken card is told what overtook it, and nothing is done', async () => {
    const ines = await prisma.person.findFirstOrThrow({ where: { primaryEmail: 'ines.halloran@halcyon.example' } })
    const out = await decideApproval({
      approvalId: h.redraftQuestion.approvalRequested.id,
      decider: { personId: ines.id, personName: ines.name, companyId: h.halcyon, permissions: ['invoices.issue', 'invoices.read'] },
      decision: 'APPROVED',
      surface: 'WEB',
    })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.status).toBe(409)
    expect(out.says).toContain('This question is closed, because it was overtaken: Bill ')
    expect(out.says).toContain('Nothing was done on your answer.')
    expect(out.says).not.toContain('already answered')
  })
})

/**
 * The owner's yes, end to end (founder, 2026-10-19, decision 2). A
 * seeded firm where nobody but the Owner sends bills: the nightly pass
 * drafts, asks the Owner, and the Owner's yes sends the bill through the
 * same check the Bills page runs, recorded under their name with the
 * exception on the line.
 */
describe('where only the owner sends bills, the owner’s yes in Ask Etyme sends the twin’s bill', () => {
  it('the owner says yes to the twin’s drafted bill, the bill is sent, and the ledger records the owner-only exception', async () => {
    const firms = await prisma.company.findMany({
      where: { slug: { startsWith: 'world-', notIn: ['world-halcyon', 'world-brightmoor'] }, kind: { in: ['VENDOR', 'GSI', 'CONSULTANT_CORP'] }, isDemo: false },
      select: { id: true, name: true, kind: true },
      orderBy: { slug: 'asc' },
    })
    let found: { companyId: string; approvalId: string; invoiceId: string } | null = null
    for (const f of firms) {
      const authority = await supplierAuthorityAt(f.id)
      if (!authority.personId) continue
      const others = await prisma.context.count({
        where: { companyId: f.id, revokedAt: null, personId: { not: authority.personId }, role: { permissions: { hasSome: ['invoices.issue', '*'] } } },
      })
      if (others > 0) continue
      await runSupplierBills(f.id, { surface: 'CRON' })
      const asked = await prisma.twinAction.findFirst({
        where: { companyId: f.id, action: 'bill.send', outcome: 'AWAITING_APPROVAL', approvalRequested: { decision: 'PENDING', selfApprovalReason: { not: null } } },
        include: { approvalRequested: true },
      })
      if (asked?.approvalRequested) { found = { companyId: f.id, approvalId: asked.approvalRequested.id, invoiceId: asked.entityId }; break }
    }
    expect(found, 'a seeded firm where only the owner sends bills and a bill is due').not.toBeNull()
    if (!found) return
    const seat = await prisma.context.findFirstOrThrow({
      where: { companyId: found.companyId, revokedAt: null, personId: (await supplierAuthorityAt(found.companyId)).personId! },
      select: { personId: true, person: { select: { name: true } }, role: { select: { permissions: true } } },
    })
    const yes = await decideApproval({
      approvalId: found.approvalId,
      decider: { personId: seat.personId, personName: seat.person.name, companyId: found.companyId, permissions: seat.role?.permissions ?? [] },
      decision: 'APPROVED', surface: 'WEB',
    })
    expect(yes.ok, JSON.stringify(yes)).toBe(true)
    const sent = await prisma.invoice.findUniqueOrThrow({ where: { id: found.invoiceId } })
    expect(sent.status).toBe('SUBMITTED')
    const line = await prisma.twinAction.findFirstOrThrow({ where: { approvalId: found.approvalId, actorType: 'PERSON', outcome: 'PERFORMED' } })
    expect(line.actorId).toBe(seat.personId)
    expect(String((line.payload as Record<string, unknown>).ownerOnlyException)).toContain('Nobody else at the firm sends bills')
    const logged = await prisma.automationLog.findFirstOrThrow({
      where: { companyId: found.companyId, action: 'TWIN_ACT_APPROVED', payload: { path: ['approvalId'], equals: found.approvalId } },
    })
    expect(logged.summary).toContain('the owner answered, because nobody else at the firm may')
  })
})
