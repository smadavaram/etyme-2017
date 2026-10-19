import { prisma } from '@/lib/db'
import { partiesOf } from '@/lib/money/invoice-parties'
import { offPlatformRecord, readWeekChain } from '@/lib/week-approval'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import { attemptDelivery, routeFor } from '@/lib/notification-delivery'
import { configuredSenders } from '@/lib/senders'
import { recordAccess, recordRefusal } from '@/lib/access-log'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'
import { askTheDesk } from '@/lib/permissions'
import { reportError } from '@/lib/alerts'
import {
  billLetter, billNotice, billLinkToken, billLinkUrl, billLinkExpiresAt, billLinkOpen,
  readBillLinkToken, billPageView, billPageInEtyme, billSentSays, deliverySays,
  billLinkClosedSays, billCancelledSays, BILL_LINK_NOT_OURS,
  type BillFacts, type BillDelivery, type BillRecipient, type BillPageView,
} from '@/lib/notify/bill-letter'

/**
 * Sending a bill to the firm that pays it, and the page it opens on.
 *
 * `markSent` in lib/money/bill-send moves a bill to SUBMITTED. This is
 * what makes that true for the payer: one call after the transaction
 * commits, from every door that sends a bill — the Send button, the
 * bulk Send and the supplier's twin's yes.
 *
 * The words are in `lib/notify/bill-letter`; this file reads the record
 * and writes the trail. Every sending is one event on the bill
 * (`invoice.submitted` the first time, `invoice.resent` after), carrying
 * who it went to and what each delivery did — so "was it sent" is read
 * from what happened, never from the status.
 */

type Refused = { ok: false; status: 400 | 403 | 404 | 409 | 410 | 503; code: string; says: string }

export interface BillSent {
  /** Whether it reached at least one person now. */
  sent: boolean
  /** The addresses it went to, or was tried at. */
  to: string[]
  /** The sentence, the same one the Bills page reads. */
  says: string
}

/** A resend within this long of the last sending is refused: a double press is not a second letter. */
export const RESEND_NOT_WITHIN_MS = 5 * 60_000

const SENT_TYPE = 'invoice.submitted' as const
const RESENT_TYPE = 'invoice.resent' as const

// ── Reading the bill ──────────────────────────────────────────────────

async function readBill(invoiceId: string) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true, number: true, status: true, total: true, paid: true, currency: true,
      dueAt: true, periodStart: true, periodEnd: true, billToId: true,
      remitTo: { select: { legalName: true, paymentMethod: true, bankName: true, accountLast4: true } },
      engagement: {
        select: {
          msa: { select: { vendorId: true, clientId: true, vendor: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } } },
        },
      },
      workOrder: {
        select: { issuedById: true, issuedToId: true, issuedBy: { select: { id: true, name: true } }, issuedTo: { select: { id: true, name: true } } },
      },
      invoiceLines: {
        orderBy: { createdAt: 'asc' },
        select: {
          hours: true, rateCents: true, amountCents: true, description: true,
          personId: true, expenseId: true, milestoneId: true,
          person: { select: { name: true, primaryEmail: true } },
          timesheet: {
            select: {
              id: true, periodStart: true, periodEnd: true, clientApprovedAt: true, clientApprovedById: true,
              weekApprovals: {
                where: { OR: [{ outcome: 'APPROVED' }, { how: 'EVIDENCE' }] },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { approverName: true },
              },
            },
          },
          sellContract: {
            select: { companyId: true, clientCompanyId: true, company: { select: { id: true, name: true } }, clientCompany: { select: { id: true, name: true } } },
          },
        },
      },
    },
  })
}

type Bill = NonNullable<Awaited<ReturnType<typeof readBill>>>

interface Read {
  bill: Bill
  supplier: { id: string; name: string }
  payer: { id: string; name: string; onEtyme: boolean; kind: string }
  facts: BillFacts
  weeks: BillWeek[]
}

interface BillWeek { id: string; person: string; start: Date; end: Date; hours: number; signedAt: Date | null; signer: string | null; byEmail: boolean }

/** The bill, who it is between, and what it rests on. Null where nothing can say who pays it. */
async function readWhole(invoiceId: string): Promise<Read | null> {
  const bill = await readBill(invoiceId)
  if (!bill) return null
  const parties = partiesOf({
    agreement: bill.engagement.msa,
    order: bill.workOrder,
    lines: bill.invoiceLines.map((l) => l.sellContract).filter((c): c is NonNullable<typeof c> => c != null),
  })
  if (!parties.vendor || !parties.client) return null
  // Where the bill names a bill-to, that is where it is sent (schema:
  // "Where the invoice is sent"); otherwise the client it is between.
  const payerId = bill.billToId ?? parties.client.id
  const [payer, supplier] = await Promise.all([
    prisma.company.findUnique({ where: { id: payerId }, select: { id: true, name: true, claimedAt: true, kind: true } }),
    prisma.company.findUnique({ where: { id: parties.vendor.id }, select: { id: true, name: true } }),
  ])
  if (!payer || !supplier) return null

  // The weeks the hours rest on, once each, with the hours this bill took from each.
  const byWeek = new Map<string, BillWeek>()
  const approverIds = new Set<string>()
  for (const l of bill.invoiceLines) {
    const t = l.timesheet
    if (!t) continue
    const was = byWeek.get(t.id)
    const viaEmail = t.weekApprovals[0]?.approverName ?? null
    if (!viaEmail && t.clientApprovedById) approverIds.add(t.clientApprovedById)
    byWeek.set(t.id, {
      id: t.id,
      person: l.person?.name ?? 'Somebody',
      start: t.periodStart,
      end: t.periodEnd,
      hours: (was?.hours ?? 0) + Number(l.hours),
      signedAt: t.clientApprovedAt,
      signer: viaEmail ?? (t.clientApprovedById ? `@${t.clientApprovedById}` : null),
      byEmail: viaEmail != null,
    })
  }
  const approvers = approverIds.size
    ? new Map((await prisma.person.findMany({ where: { id: { in: [...approverIds] } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]))
    : new Map<string, string>()
  const weeks = [...byWeek.values()]
    .map((w) => (w.signer?.startsWith('@') ? { ...w, signer: approvers.get(w.signer.slice(1)) ?? null } : w))
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.person.localeCompare(b.person))

  // Who signed them: the client at the top of each week's chain. Named
  // only where it is one firm; two firms, or none readable, and the
  // sentence leaves the name out rather than pick one.
  const signers = new Set<string>()
  for (const w of weeks) {
    try {
      const chain = await readWeekChain(w.id)
      if (chain) signers.add(chain.clientName)
    } catch {
      signers.add('')
    }
  }
  const only = signers.size === 1 ? [...signers][0] : ''
  const signedBy = only || null

  const hourLines = bill.invoiceLines.filter((l) => !l.expenseId && !l.milestoneId)
  const facts: BillFacts = {
    supplierName: supplier.name,
    clientName: payer.name,
    number: bill.number,
    people: hourLines.map((l) => l.person?.name ?? '').filter(Boolean),
    periodStart: bill.periodStart,
    periodEnd: bill.periodEnd,
    hours: hourLines.reduce((s, l) => s + Number(l.hours), 0),
    total: Number(bill.total),
    currency: bill.currency,
    dueAt: bill.dueAt,
    weeks: weeks.length,
    signedBy,
    allSigned: weeks.every((w) => w.signedAt != null),
    expenses: bill.invoiceLines.filter((l) => l.expenseId).length,
    milestones: bill.invoiceLines.filter((l) => l.milestoneId).length,
  }
  return {
    bill,
    supplier,
    payer: { id: payer.id, name: payer.name, onEtyme: payer.claimedAt != null, kind: payer.kind },
    facts,
    weeks,
  }
}

// ── Who receives it ───────────────────────────────────────────────────

interface Contact { email: string; name: string | null; personId: string | null }

/**
 * The people a supplier recorded at a client that is not on Etyme.
 *
 * The same rule the week-approval door reads (`offPlatformRecord`): the
 * supplier's own invitation to the client and its own address book at
 * the client, never an address of the supplier itself and never a
 * worker's. Read from the firm sending the bill, because it is that
 * firm's record. Where it recorded somebody in accounts payable, only
 * they receive bills; otherwise everybody it recorded there.
 */
async function recordedAt(supplierId: string, payerId: string, workerEmails: string[]): Promise<Contact[]> {
  const [invites, contacts, sender] = await Promise.all([
    prisma.supplierInvite.findMany({ where: { companyId: payerId, byId: supplierId }, select: { byId: true, email: true, state: true, contactName: true } }),
    prisma.companyContact.findMany({ where: { companyId: supplierId, atCompanyId: payerId }, select: { companyId: true, email: true, name: true, kind: true, personId: true } }),
    prisma.company.findUnique({
      where: { id: supplierId },
      select: {
        domain: true, domainVerified: true,
        claimedDomains: { where: { verifiedAt: { not: null } }, select: { domain: true } },
        contexts: { where: { revokedAt: null }, select: { person: { select: { primaryEmail: true } } } },
      },
    }),
  ])
  const rec = offPlatformRecord({
    claimedAt: null,
    listedById: supplierId,
    invites,
    contacts,
    listerSeatedEmails: sender?.contexts.map((x) => x.person.primaryEmail) ?? [],
    listerDomains: [
      ...(sender?.domainVerified && sender.domain ? [sender.domain] : []),
      ...(sender?.claimedDomains.map((d) => d.domain) ?? []),
    ],
    workerEmail: null,
  })
  const workers = new Set(workerEmails.map((e) => e.trim().toLowerCase()))
  const lower = (e: string | null | undefined) => (e ?? '').trim().toLowerCase()
  const allowed = rec.recordedContacts.filter((e) => !workers.has(e))
  const ap = new Set(contacts.filter((c) => c.kind === 'AP').map((c) => lower(c.email)))
  const chosen = allowed.some((e) => ap.has(e)) ? allowed.filter((e) => ap.has(e)) : allowed
  return chosen.map((email) => {
    const c = contacts.find((x) => lower(x.email) === email)
    const i = invites.find((x) => lower(x.email) === email)
    return { email, name: c?.name ?? i?.contactName ?? null, personId: c?.personId ?? null }
  })
}

/** The seats that record payments at a client on Etyme; its owner where nobody was named. */
async function payerSeats(payerId: string) {
  const seats = (needs: string) =>
    prisma.context.findMany({
      where: {
        companyId: payerId, revokedAt: null, suspendedAt: null, type: { not: 'CONSULTANT' },
        role: { permissions: { hasSome: [needs] } },
        ...NOT_THE_SAMPLE_SEAT,
      },
      select: { personId: true, person: { select: { name: true, primaryEmail: true } }, role: { select: { name: true } } },
      orderBy: { grantedAt: 'asc' },
    })
  // A role nobody named falls back to the owner; it never refuses (CLAUDE.md).
  const named = await seats('payments.record')
  const found = named.length ? named : await seats('*')
  const seen = new Set<string>()
  return found.filter((s) => (seen.has(s.personId) ? false : (seen.add(s.personId), true)))
}

// ── Sending ───────────────────────────────────────────────────────────

async function history(invoiceId: string): Promise<{ delivery: BillDelivery; type: string }[]> {
  const rows = await prisma.event.findMany({
    where: { subjectType: 'Invoice', subjectId: invoiceId, type: { in: [SENT_TYPE, RESENT_TYPE] } },
    orderBy: { seq: 'asc' },
    select: { type: true, payload: true },
  })
  return rows
    .map((r) => ({ type: r.type, delivery: r.payload as unknown as BillDelivery }))
    .filter((r) => r.delivery && Array.isArray(r.delivery.to) && typeof r.delivery.at === 'string')
}

async function deliver(w: Read, a: { byPersonId: string | null; resend: boolean; now: Date }): Promise<BillSent> {
  const { bill, supplier, payer, facts } = w
  const sender = a.byPersonId
    ? await prisma.person.findUnique({ where: { id: a.byPersonId }, select: { name: true, primaryEmail: true } })
    : null
  const to: BillRecipient[] = []
  let why: string | null = null

  if (payer.onEtyme) {
    const seats = await payerSeats(payer.id)
    const said = billNotice(facts)
    for (const s of seats) {
      // In the app and on the seat's own channel: Teams where the firm
      // set it up, email behind it (lib/notify routes it).
      await notify({
        personId: s.personId, companyId: payer.id, type: 'INVOICE', channel: 'EMAIL',
        title: said.title, body: said.body, entityId: bill.id,
        data: { href: billPageInEtyme(bill.id), invoiceNumber: bill.number },
      })
      to.push({ address: s.person.primaryEmail, via: 'ETYME', state: 'SENT', note: 'Shown in the app, and on their channel', name: s.person.name, role: s.role?.name ?? null })
    }
    if (seats.length === 0) why = `nobody at ${payer.name} can record a payment yet.`
  } else {
    const workerEmails = bill.invoiceLines.map((l) => l.person?.primaryEmail ?? '').filter(Boolean)
    const contacts = await recordedAt(supplier.id, payer.id, workerEmails)
    if (contacts.length === 0) {
      why = `${payer.name} is not on Etyme and no address is recorded for it. Record the person there who receives bills, then send it again.`
    }
    const expiresAt = billLinkExpiresAt(bill.dueAt)
    for (const c of contacts) {
      const url = billLinkUrl(billLinkToken(bill.id, c.email))
      if (!url) {
        to.push({ address: c.email, via: 'EMAIL', state: 'NOT_CONFIGURED', note: 'This deployment does not know its own web address, so a link would not open' })
        continue
      }
      const letter = billLetter({
        facts, contactName: c.name, url, expiresAt,
        sender: sender ? { name: sender.name, email: sender.primaryEmail } : null,
      })
      const outcome = await attemptDelivery(
        routeFor({ isConsultant: false, email: c.email, teamsWebhookUrl: null }),
        c.email, letter.subject, letter.body, configuredSenders(), a.now
      )
      to.push({ address: c.email, via: 'EMAIL', state: outcome.state, note: outcome.note, name: c.name })
    }
  }

  const delivery: BillDelivery = {
    invoiceId: bill.id, number: bill.number, clientName: payer.name, onEtyme: payer.onEtyme,
    resend: a.resend, at: a.now.toISOString(), byPersonId: a.byPersonId, to, why,
  }
  const recorded = await emit({
    type: a.resend ? RESENT_TYPE : SENT_TYPE,
    companyId: supplier.id,
    subjectType: 'Invoice',
    subjectId: bill.id,
    actorPersonId: a.byPersonId,
    payload: delivery as unknown as Record<string, unknown>,
  })
  if (!recorded) {
    void reportError('bill-delivery', new Error(`Bill ${bill.number} was sent and the record of whom it went to could not be written.`), { companyId: supplier.id }).catch(() => {})
  }
  return {
    sent: to.some((t) => t.state === 'SENT'),
    to: to.map((t) => t.address),
    says: deliverySays(delivery, a.now),
  }
}

/**
 * Send a bill to the firm that pays it, once.
 *
 * Called by money after `markSent` commits, never inside its
 * transaction: a letter cannot be called back, and a bill that rolled
 * back must not have reached anybody. A second call for the same bill
 * sends nothing and says what the first did; sending again is
 * `resendBillToCustomer`, a person's own act.
 */
export async function sendBillToCustomer(a: { invoiceId: string; byPersonId: string | null; now?: Date }): Promise<BillSent> {
  const now = a.now ?? new Date()
  const past = await history(a.invoiceId)
  if (past.length) {
    const said = billSentSays(past.map((p) => p.delivery), now)
    return { sent: false, to: past[0].delivery.to.map((t) => t.address), says: said ?? 'Already sent.' }
  }
  const w = await readWhole(a.invoiceId)
  if (!w) return { sent: false, to: [], says: 'Not sent: nothing behind this bill says who pays it.' }
  if (w.bill.status !== 'SUBMITTED') {
    return { sent: false, to: [], says: `Not sent: bill ${w.bill.number} is ${w.bill.status.toLowerCase().replace('_', ' ')}, not sent.` }
  }
  return deliver(w, { byPersonId: a.byPersonId, resend: false, now })
}

/**
 * Send a bill again: a separate act, by somebody at the firm that raised
 * it who sends bills, logged as `invoice.resent` with their name. Reads
 * the recorded people again, so a contact recorded after the first
 * sending receives it now.
 */
export async function resendBillToCustomer(a: {
  invoiceId: string
  byPersonId: string
  companyId: string
  now?: Date
}): Promise<({ ok: true } & BillSent) | Refused> {
  const now = a.now ?? new Date()
  const w = await readWhole(a.invoiceId)
  if (!w || w.supplier.id !== a.companyId) {
    return { ok: false, status: 404, code: 'NOT_FOUND', says: 'No such bill of yours. A bill is sent again by the firm that raised it.' }
  }
  const seat = await prisma.context.findFirst({
    where: {
      personId: a.byPersonId, companyId: a.companyId, revokedAt: null, suspendedAt: null,
      role: { permissions: { hasSome: ['invoices.issue', '*'] } },
      ...NOT_THE_SAMPLE_SEAT,
    },
    select: { id: true },
  })
  if (!seat) {
    const firm = await prisma.company.findUnique({ where: { id: a.companyId }, select: { kind: true, name: true } })
    return { ok: false, status: 403, code: 'FORBIDDEN', says: askTheDesk({ doing: 'Sending a bill again', needs: 'invoices.issue', kind: firm?.kind, companyName: firm?.name }) }
  }
  const n = w.bill.number
  if (w.bill.status === 'DRAFT' || w.bill.status === 'ISSUED') {
    return { ok: false, status: 409, code: 'NOT_SENT', says: `Bill ${n} has not been sent yet. Send it; it reaches ${w.payer.name} then.` }
  }
  if (w.bill.status === 'PAID') return { ok: false, status: 409, code: 'PAID', says: `Bill ${n} is paid, so there is nothing to send again.` }
  if (w.bill.status === 'CANCELLED') return { ok: false, status: 409, code: 'CANCELLED', says: `Bill ${n} is cancelled, so there is nothing to send again.` }

  const past = await history(a.invoiceId)
  const last = past[past.length - 1]?.delivery
  if (last && now.getTime() - new Date(last.at).getTime() < RESEND_NOT_WITHIN_MS) {
    return { ok: false, status: 409, code: 'JUST_SENT', says: `Bill ${n} was sent a few minutes ago. Give it a little while before sending it again.` }
  }
  const sent = await deliver(w, { byPersonId: a.byPersonId, resend: true, now })
  return { ok: true, ...sent }
}

/**
 * The sentence for the Bills page and the bill's own page, read from what
 * actually happened: "Sent to dana@acme.com on Oct 19", "Sent on Etyme to
 * Northbend Athletic's AP Clerk on Oct 19". Null for a bill Etyme never
 * sent anywhere — the page then says nothing rather than guess.
 */
export async function billDeliverySays(invoiceId: string, now = new Date()): Promise<string | null> {
  return billSentSays((await history(invoiceId)).map((p) => p.delivery), now)
}

/** The same sentence for a list of bills at once, keyed by bill. One query, for the Bills list. */
export async function billDeliverySaysFor(invoiceIds: string[], now = new Date()): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (invoiceIds.length === 0) return out
  const rows = await prisma.event.findMany({
    where: { subjectType: 'Invoice', subjectId: { in: invoiceIds }, type: { in: [SENT_TYPE, RESENT_TYPE] } },
    orderBy: { seq: 'asc' },
    select: { subjectId: true, payload: true },
  })
  const by = new Map<string, BillDelivery[]>()
  for (const r of rows) {
    const d = r.payload as unknown as BillDelivery
    if (!d || !Array.isArray(d.to) || typeof d.at !== 'string') continue
    by.set(r.subjectId, [...(by.get(r.subjectId) ?? []), d])
  }
  for (const [id, list] of by) {
    const said = billSentSays(list, now)
    if (said) out.set(id, said)
  }
  return out
}

// ── The page, by its link ─────────────────────────────────────────────

/**
 * What the person a bill was emailed to sees, or why the link is closed.
 *
 * No sign-in: the signed token is the credential and names one bill and
 * one address. Every open is an access-log row about each person on the
 * bill, written before the page is handed over, naming the payer's firm,
 * the address the link was sent to and the bill. A refusal is written
 * too, before the refusal goes out.
 */
export async function openBillLink(token: string, now = new Date()): Promise<{ ok: true; view: BillPageView } | Refused> {
  const named = readBillLinkToken(token)
  if (!named) return { ok: false, status: 404, code: 'NOT_FOUND', says: BILL_LINK_NOT_OURS }
  const w = await readWhole(named.invoiceId)
  // A bill not yet sent was never linked: a token for one is not ours.
  if (!w || w.bill.status === 'DRAFT' || w.bill.status === 'ISSUED') {
    return { ok: false, status: 404, code: 'NOT_FOUND', says: BILL_LINK_NOT_OURS }
  }
  const subjects = [...new Set(w.bill.invoiceLines.map((l) => l.personId).filter((p): p is string => Boolean(p)))]
  const contact = await prisma.companyContact.findFirst({
    where: { atCompanyId: w.payer.id, email: named.to },
    select: { personId: true },
  })
  const actor = { actorCompanyId: w.payer.id, ...(contact?.personId ? { actorPersonId: contact.personId } : {}) }
  const whose = `the link to bill ${w.bill.number} emailed to ${named.to}`

  if (!billLinkOpen(w.bill.dueAt, now)) {
    const says = billLinkClosedSays({ number: w.bill.number, supplierName: w.supplier.name, expiresAt: billLinkExpiresAt(w.bill.dueAt) })
    await recordRefusal(subjects, { action: 'TIMESHEET_VIEW', ...actor, reason: `Refused ${whose}: it ran out.` })
    return { ok: false, status: 410, code: 'LINK_EXPIRED', says }
  }
  if (w.bill.status === 'CANCELLED') {
    await recordRefusal(subjects, { action: 'TIMESHEET_VIEW', ...actor, reason: `Refused ${whose}: the bill is cancelled.` })
    return { ok: false, status: 410, code: 'CANCELLED', says: billCancelledSays({ number: w.bill.number, supplierName: w.supplier.name }) }
  }

  try {
    await recordAccess(subjects, {
      action: 'TIMESHEET_VIEW', ...actor,
      reason: `Opened ${whose}${w.payer.onEtyme ? '' : ` (${w.payer.name} was not on Etyme)`}: the hours, the weeks and the rate on this bill.`,
    })
  } catch (err) {
    void reportError('bill-link', err, { companyId: w.payer.id }).catch(() => {})
    return { ok: false, status: 503, code: 'NOT_RECORDED', says: 'The bill could not be opened just now, because the record of who opened it could not be written. Try again in a minute.' }
  }

  const remit = w.bill.remitTo ?? (await prisma.remitTo.findFirst({
    where: { companyId: w.supplier.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    select: { legalName: true, paymentMethod: true, bankName: true, accountLast4: true },
  }))

  return {
    ok: true,
    view: billPageView({
      supplierName: w.supplier.name,
      clientName: w.payer.name,
      clientOnEtyme: w.payer.onEtyme,
      invoiceId: w.bill.id,
      number: w.bill.number,
      status: w.bill.status,
      total: Number(w.bill.total),
      paid: Number(w.bill.paid),
      currency: w.bill.currency,
      periodStart: w.bill.periodStart,
      periodEnd: w.bill.periodEnd,
      dueAt: w.bill.dueAt,
      lines: w.bill.invoiceLines.map((l) => ({
        hours: Number(l.hours),
        rateCents: l.rateCents,
        amountCents: l.amountCents,
        description: l.description,
        personName: l.person?.name ?? null,
        week: l.timesheet ? { start: l.timesheet.periodStart, end: l.timesheet.periodEnd } : null,
        expense: Boolean(l.expenseId),
        milestone: Boolean(l.milestoneId),
      })),
      weeks: w.weeks,
      signedBy: w.facts.signedBy,
      remit,
    }, now),
  }
}
