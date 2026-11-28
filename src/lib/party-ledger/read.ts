/**
 * The party's one ledger, read (record 134).
 *
 * A reader over the record, never a table: activity, money and documents of
 * a person or a company, each line naming the record it came from. Nothing
 * here computes a figure. Margin comes from `placementBooks`, papers from
 * `papersOnRecord`, a rate's visibility from `mayReadBillRate`, the
 * before-her-yes reading from `firmReadsAt`, a client's lines from
 * `clientLineWhere`. A refusal is written before it is returned; a read of
 * another party's data is written too.
 *
 * What a reader never gets: a rung it is not party to (so no rate and no
 * sub-vendor name below the firm it pays, record 119), a supplier's margin
 * unless it is the seller holding the margin permission, a commission that
 * is not its own, a sensitive number.
 */
import { prisma } from '@/lib/db'
import type { CallerContext } from '@/lib/api-context'
import { seatedDesk, unitsReachedBy } from '@/lib/resolve-client-company'
import { reachFor, jobsWhere, submissionsWhere } from '@/app/api/requisitions/grant-reach'
import { recordAccess, recordRefusal } from '@/lib/access-log'
import { hasPermission } from '@/lib/permissions'
import { findOnBook } from '@/app/api/records/lookup'
import { firmReadsAt } from '@/lib/consultant-portfolio/before-her-yes'
import { clientLineWhere } from '@/lib/money/team-lines'
import { invoiceBetween } from '@/lib/money/invoice-parties'
import { mayReadBillRate } from '@/lib/money/pay-visibility'
import { marginReachFor, sellLinesInReach } from '@/lib/money/margin-reach'
import { placementBooks } from '@/lib/money/margin'
import { papersOnRecord } from '@/lib/document-stages/paper-record'
import { amount, units } from '@/lib/money-display'
import { formatDay } from '@/lib/format-date'
import {
  BEFORE_HER_YES_SAYS, NOT_ON_YOUR_BOOK_SAYS, mayShowMargin, newestFirst, pluginLine, recordHref,
  type LedgerAnswer, type LedgerLine, type PartyLedger,
} from './lines'

export type LedgerSubject = { kind: 'person' | 'company'; id: string }

interface Reader {
  personId: string
  companyId: string | null
  companyKind: string | null
  permissions: readonly string[]
  acting: CallerContext
  /** Extra narrowing of jobs and submissions for a seat confined to a team, region or unit; empty for the firm's book. */
  jobNarrow: Record<string, unknown>[]
  submissionNarrow: Record<string, unknown>[]
}

const on = (pluginsOn: readonly string[] | null | undefined, key: string) => !!pluginsOn?.includes(key)

export async function readPartyLedger(caller: CallerContext, subject: LedgerSubject): Promise<LedgerAnswer> {
  const desk = await seatedDesk(caller)
  const companyId = desk?.companyId ?? caller.company?.id ?? null
  const acting = desk?.acting ?? caller
  const kind = companyId ? (await prisma.company.findUnique({ where: { id: companyId }, select: { kind: true } }))?.kind ?? null : null
  // The same scope the jobs and submissions routes apply: a program seat over one unit (and the units under it),
  // or an Owner's grant to one team or to the reader's own work. Never the whole company's book.
  const jobNarrow: Record<string, unknown>[] = []
  const submissionNarrow: Record<string, unknown>[] = []
  const seatUnits = await unitsReachedBy(desk?.seat ?? null)
  if (seatUnits) {
    jobNarrow.push({ orgUnitId: { in: seatUnits } })
    submissionNarrow.push({ requirement: { orgUnitId: { in: seatUnits } } })
  } else if (!desk?.seat) {
    const jobs = await reachFor(caller, 'requirements.read')
    const subs = await reachFor(caller, 'submissions.read')
    if (jobs.scope === 'UNIT' || jobs.scope === 'PERSON') jobNarrow.push(jobsWhere(jobs, caller.person.id) ?? { id: '__none__' })
    if (subs.scope === 'UNIT' || subs.scope === 'PERSON') submissionNarrow.push(submissionsWhere(subs, caller.person.id) ?? { id: '__none__' })
  }
  const reader: Reader = { personId: caller.person.id, companyId, companyKind: kind, permissions: acting.permissions, acting, jobNarrow, submissionNarrow }
  return subject.kind === 'person' ? personLedger(reader, subject.id) : companyLedger(reader, subject.id)
}

async function refuse(reader: Reader, subject: LedgerSubject, says: string): Promise<LedgerAnswer> {
  // Logged before it is sent: a serverless host may stop the function the moment the answer goes out.
  await recordRefusal([subject.kind === 'person' ? { personId: subject.id } : { companyId: subject.id }], {
    actorPersonId: reader.personId, actorCompanyId: reader.companyId ?? undefined,
    action: subject.kind === 'person' ? 'PROFILE_VIEW' : 'CONTRACT_VIEW',
    reason: `Refused the party ledger of ${subject.kind} ${subject.id}: ${says}`,
  })
  return { ok: false, status: 403, says }
}

/** The margin reach, and so the sell lines this seat may read margin on (null: every line). */
async function marginLines(reader: Reader): Promise<{ readsMargin: boolean; only: string[] | null }> {
  if (!reader.companyId || !hasPermission(reader.permissions, 'margin.read') && !hasPermission(reader.permissions, 'pnl.read')) return { readsMargin: false, only: null }
  const reach = await marginReachFor(reader.acting as never)
  if (reach.scope === 'NONE') return { readsMargin: false, only: null }
  return { readsMargin: true, only: await sellLinesInReach(reader.companyId, reach, reader.personId) }
}

type Line = {
  id: string; companyId: string; clientCompanyId: string; billRate: number; billCurrency: string; state: string
  startDate: Date; endDate: Date | null; conversionFee: number | null; person: { id: string; name: string }
  clientCompany: { name: string }; company: { name: string }
}
const LINE_SELECT = {
  id: true, companyId: true, clientCompanyId: true, billRate: true, billCurrency: true, state: true, startDate: true, endDate: true, conversionFee: true,
  person: { select: { id: true, name: true } }, clientCompany: { select: { name: true } }, company: { select: { name: true } },
} as const

/** The lines a firm reads: the ones it sells or buys, never a rung between two other firms. */
function linesWhere(reader: Reader, extra: Record<string, unknown>) {
  const mine = { OR: [{ companyId: reader.companyId }, { clientCompanyId: reader.companyId }] }
  const where = { AND: [extra, mine] } as never
  return reader.companyKind === 'CLIENT' ? clientLineWhere(where) : where
}

async function personLedger(reader: Reader, personId: string): Promise<LedgerAnswer> {
  const self = personId === reader.personId
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true, name: true } })
  if (!person) return refuse(reader, { kind: 'person', id: personId }, NOT_ON_YOUR_BOOK_SAYS)
  // On the book: seated or on one of its lines, or a person the firm has asked onto its bench (it reads her only as it typed her).
  const asked = !self && !!reader.companyId && (await prisma.benchListing.count({ where: { companyId: reader.companyId, revokedAt: null, consultant: { personId } } })) > 0
  if (!self && !asked && (!reader.companyId || !(await findOnBook(reader.companyId, 'Person', personId)))) {
    return refuse(reader, { kind: 'person', id: personId }, NOT_ON_YOUR_BOOK_SAYS)
  }
  if (!self) {
    await recordAccess([{ personId }], { actorPersonId: reader.personId, actorCompanyId: reader.companyId ?? undefined, action: 'PROFILE_VIEW', reason: 'Opened the person’s party ledger.' })
    // Before her yes a firm reads only what it typed (record 75): the ledger says so and reads nothing else.
    const profile = await prisma.consultantProfile.findUnique({ where: { personId }, select: { id: true } })
    if (profile) {
      const read = (await firmReadsAt({ companyId: reader.companyId!, callerPersonId: reader.personId, consultantIds: [profile.id] })).get(profile.id)
      if (read?.onlyTyped) {
        return { ok: true, ledger: { subject: { kind: 'person', id: personId, name: read.typed?.name ?? person.name }, activity: [], money: [], documents: [], notes: [BEFORE_HER_YES_SAYS] } }
      }
    }
  }

  const notes: string[] = []
  const firm = reader.companyId
  const scope = (a: Record<string, unknown>, b: Record<string, unknown>) => (self ? {} : (firm ? { OR: [a, b] } : { id: '__none__' }))
  const activity: LedgerLine[] = []
  const money: LedgerLine[] = []
  const documents: LedgerLine[] = []

  const lines = (await prisma.sellContract.findMany({
    where: self ? { personId } : linesWhere(reader, { personId }),
    select: LINE_SELECT, orderBy: { startDate: 'desc' }, take: 200,
  })) as Line[]
  const lineIds = lines.map((l) => l.id)

  const [subs, sheets, enrolls, pods, certs, verifs] = await Promise.all([
    prisma.submission.findMany({ where: { AND: [{ personId, ...scope({ fromCompanyId: firm }, { toCompanyId: firm }) }, ...(self ? [] : reader.submissionNarrow)] } as never, select: { id: true, status: true, submittedAt: true, requirement: { select: { id: true, title: true } } }, orderBy: { submittedAt: 'desc' }, take: 100 }),
    prisma.timesheet.findMany({ where: { personId, sellContractId: { in: lineIds } }, select: { id: true, periodStart: true, periodEnd: true, totalHours: true, status: true }, orderBy: { periodStart: 'desc' }, take: 100 }),
    prisma.enrollment.findMany({ where: { personId, ...(self ? {} : { companyId: firm }), company: { pluginsOn: { has: 'TRAIN_TO_BENCH' } } }, select: { id: true, status: true, enrolledAt: true, completedAt: true, course: { select: { title: true } }, company: { select: { slug: true } } }, orderBy: { enrolledAt: 'desc' }, take: 100 }),
    prisma.podMember.findMany({ where: { personId, podRole: { pod: { ...(self ? {} : { companyId: firm ?? '__none__' }), company: { pluginsOn: { has: 'PODS' } } } } }, select: { id: true, addedAt: true, podRole: { select: { title: true, pod: { select: { name: true, company: { select: { slug: true } } } } } } }, take: 100 }),
    prisma.learnCredential.findMany({ where: { enrollment: { personId }, revokedAt: null, ...(self ? {} : { companyId: firm ?? '__none__', shownAt: { not: null } }) }, select: { id: true, createdAt: true, enrollment: { select: { course: { select: { title: true } } } }, company: { select: { slug: true } } }, take: 100 }),
    prisma.verification.findMany({ where: { personId, ...(self ? {} : { OR: [{ companyId: firm }, { orderedByCompanyId: firm }] }) }, select: { id: true, type: true, status: true, expiresAt: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ])

  for (const l of lines) {
    activity.push({ section: 'activity', kind: 'placement', says: `${l.person.name} at ${l.clientCompany.name}, ${l.state.toLowerCase()}, from ${formatDay(l.startDate)}${l.endDate ? ` to ${formatDay(l.endDate)}` : ''}`, when: l.startDate, source: { type: 'SellContract', id: l.id }, href: recordHref('SellContract', l.id, '/dashboard/contracts'), plugin: null })
  }
  for (const s of subs) activity.push({ section: 'activity', kind: 'application', says: `Put forward for ${s.requirement.title}: ${s.status.toLowerCase()}`, when: s.submittedAt, source: { type: 'Submission', id: s.id }, href: recordHref('Requirement', s.requirement.id, '/dashboard/submissions'), plugin: null })
  for (const t of sheets) activity.push({ section: 'activity', kind: 'timesheet', says: `Week of ${formatDay(t.periodStart)}: ${Number(t.totalHours)} hours, ${t.status.toLowerCase()}`, when: t.periodStart, source: { type: 'Timesheet', id: t.id }, href: '/dashboard/timesheets', plugin: null })
  for (const e of enrolls) activity.push(pluginLine('TRAIN_TO_BENCH', { section: 'activity', kind: e.completedAt ? 'training completed' : 'training', says: `${e.course.title}: ${e.completedAt ? `completed ${formatDay(e.completedAt)}` : e.status.toLowerCase()}`, when: e.completedAt ?? e.enrolledAt, source: { type: 'Enrollment', id: e.id } }, e.company?.slug ? `/${e.company.slug}/home` : ''))
  for (const p of pods) activity.push(pluginLine('PODS', { section: 'activity', kind: 'pod work', says: `${p.podRole.title} on ${p.podRole.pod.name}`, when: p.addedAt, source: { type: 'PodMember', id: p.id } }, `/${p.podRole.pod.company.slug}`))

  // Money: rates only where the reader pays or bills them; margin only where the reader is the seller and holds it.
  const m = await marginLines(reader)
  for (const l of lines) {
    if (firm && mayReadBillRate({ permissions: reader.permissions, companyId: firm, companyKind: reader.companyKind }, { sellerId: l.companyId, clientId: l.clientCompanyId })) {
      money.push({ section: 'money', kind: 'rate', says: `${l.person.name} bills at ${amount(l.billRate, l.billCurrency)} an hour to ${l.clientCompany.name}`, when: l.startDate, source: { type: 'SellContract', id: l.id }, href: recordHref('SellContract', l.id, '/dashboard/contracts'), plugin: null })
    }
    if (l.conversionFee != null && firm && (l.companyId === firm || l.clientCompanyId === firm)) {
      money.push({ section: 'money', kind: 'fee', says: `Conversion fee ${amount(l.conversionFee, l.billCurrency)}`, when: l.startDate, source: { type: 'SellContract', id: l.id }, href: recordHref('SellContract', l.id, '/dashboard/contracts'), plugin: null })
    }
  }
  if (firm) {
    const [bills, receipts] = await Promise.all([
      prisma.invoice.findMany({ where: { AND: [invoiceBetween(firm) as never, { invoiceLines: { some: { sellContractId: { in: lineIds } } } }] }, select: { id: true, number: true, total: true, paid: true, currency: true, status: true, issuedAt: true, periodStart: true }, take: 100 }),
      prisma.vendorBill.findMany({ where: { AND: [{ OR: [{ companyId: firm }, { vendorCompanyId: firm }] }, { buyContract: { candidates: { some: { personId } } } }] }, select: { id: true, number: true, totalCents: true, paidCents: true, currency: true, status: true, receivedAt: true }, take: 100 }),
    ])
    for (const b of bills) money.push({ section: 'money', kind: 'bill', says: `Bill ${b.number}: ${units(Number(b.total), b.currency)}, ${units(Number(b.paid), b.currency)} paid, ${b.status.toLowerCase()}`, when: b.issuedAt ?? b.periodStart, source: { type: 'Invoice', id: b.id }, href: recordHref('Invoice', b.id, '/dashboard/invoices'), plugin: null })
    for (const r of receipts) money.push({ section: 'money', kind: 'invoice receipt', says: `Invoice receipt ${r.number}: ${amount(r.totalCents, r.currency)}, ${amount(r.paidCents, r.currency)} paid, ${r.status.toLowerCase()}`, when: r.receivedAt, source: { type: 'VendorBill', id: r.id }, href: recordHref('VendorBill', r.id, '/dashboard/invoices'), plugin: null })
    const own = lines.filter((l) => mayShowMargin({ readerCompanyId: firm, lineSellerId: l.companyId, readsMargin: m.readsMargin }) && (m.only === null || m.only.includes(l.id)))
    if (own.length) {
      for (const b of await placementBooks(firm, { sellContractIds: own.map((l) => l.id) })) {
        money.push({ section: 'money', kind: 'margin', says: b.profit.says, when: null, source: { type: 'SellContract', id: b.sellContractId }, href: recordHref('SellContract', b.sellContractId, '/dashboard/contracts'), plugin: null })
      }
    }
  }
  if (self) {
    // A person reads only her own commissions.
    for (const c of await prisma.contractCommission.findMany({ where: { earnedById: personId }, select: { id: true, kind: true, amountCents: true, rateBps: true, setAt: true }, take: 100 })) {
      money.push({ section: 'money', kind: 'commission', says: `${c.kind.toLowerCase()} commission ${c.amountCents != null ? amount(c.amountCents) : `${(c.rateBps ?? 0) / 100}%`}`, when: c.setAt, source: { type: 'ContractCommission', id: c.id }, href: '/dashboard/payroll', plugin: null })
    }
  } else if (!m.readsMargin) notes.push('Margin and commissions are not shown to your seat.')

  // Documents: papers through the paper record, never a second reading of what is on file.
  const record = await papersOnRecord({ personIds: self ? [personId] : [], companyIds: [], sellContractIds: lineIds })
  for (const p of record.papers.filter((x) => x.sellContractId ? lineIds.includes(x.sellContractId) : self)) {
    documents.push({ section: 'documents', kind: 'paper', says: `${p.template.name}, ${p.status.toLowerCase()}${p.expiresAt ? `, to ${formatDay(p.expiresAt)}` : ''}`, when: p.signedAt ?? p.validFrom, source: { type: 'DocInstance', id: p.id }, href: '/dashboard/documents', plugin: null })
  }
  for (const v of verifs) documents.push({ section: 'documents', kind: 'compliance check', says: `${v.type.toLowerCase().replace(/_/g, ' ')}: ${v.status.toLowerCase()}${v.expiresAt ? `, to ${formatDay(v.expiresAt)}` : ''}`, when: v.createdAt, source: { type: 'Verification', id: v.id }, href: '/dashboard/compliance', plugin: null })
  for (const c of certs) documents.push(pluginLine('TRAIN_TO_BENCH', { section: 'documents', kind: 'certificate', says: `Certificate: ${c.enrollment.course.title}`, when: c.createdAt, source: { type: 'LearnCredential', id: c.id } }, c.company?.slug ? `/${c.company.slug}/credential` : ''))

  const ledger: PartyLedger = { subject: { kind: 'person', id: personId, name: person.name }, activity: activity.sort(newestFirst), money: money.sort(newestFirst), documents: documents.sort(newestFirst), notes }
  return { ok: true, ledger }
}

async function companyLedger(reader: Reader, companyId: string): Promise<LedgerAnswer> {
  const firm = reader.companyId
  const own = firm === companyId
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, slug: true, pluginsOn: true } })
  if (!company || !firm || (!own && !(await findOnBook(firm, 'Company', companyId)))) {
    return refuse(reader, { kind: 'company', id: companyId }, NOT_ON_YOUR_BOOK_SAYS)
  }
  if (!own) {
    await recordAccess([{ companyId }], { actorPersonId: reader.personId, actorCompanyId: firm, action: 'CONTRACT_VIEW', reason: 'Opened the company’s party ledger.' })
  }
  const notes: string[] = []
  const activity: LedgerLine[] = []
  const money: LedgerLine[] = []
  const documents: LedgerLine[] = []

  // The lines between the reader and this company (all the reader's own lines where it is the reader).
  // Only a rung the reader is party to: a client never reads the line between its supplier and a firm below.
  const between = own ? {} : { OR: [{ companyId: firm, clientCompanyId: companyId }, { companyId: firm, endClientCompanyId: companyId }, { companyId, clientCompanyId: firm }] }
  const lines = (await prisma.sellContract.findMany({ where: linesWhere(reader, between), select: LINE_SELECT, orderBy: { startDate: 'desc' }, take: 200 })) as Line[]
  const lineIds = lines.map((l) => l.id)
  const pair = own ? [{ fromCompanyId: firm }, { toCompanyId: firm }] : [{ fromCompanyId: firm, toCompanyId: companyId }, { fromCompanyId: companyId, toCompanyId: firm }]

  const [jobs, subs, pods, enrolls, proposals] = await Promise.all([
    prisma.requirement.findMany({ where: { AND: [own ? { companyId } : { OR: [{ companyId: firm, invitations: { some: { toCompanyId: companyId } } }, { companyId, invitations: { some: { toCompanyId: firm } } }] }, ...reader.jobNarrow] } as never, select: { id: true, title: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.submission.findMany({ where: { AND: [{ OR: pair }, ...reader.submissionNarrow] } as never, select: { id: true, status: true, submittedAt: true, person: { select: { name: true } }, requirement: { select: { id: true, title: true } } }, orderBy: { submittedAt: 'desc' }, take: 100 }),
    own && on(company.pluginsOn, 'PODS') ? prisma.pod.findMany({ where: { companyId }, select: { id: true, name: true, createdAt: true }, take: 100 }) : [],
    own && on(company.pluginsOn, 'TRAIN_TO_BENCH') ? prisma.enrollment.findMany({ where: { companyId }, select: { id: true, enrolledAt: true, completedAt: true, status: true, person: { select: { name: true } }, course: { select: { title: true } } }, orderBy: { enrolledAt: 'desc' }, take: 100 }) : [],
    own && on(company.pluginsOn, 'PUBLIC_SECTOR') ? prisma.proposal.findMany({ where: { companyId }, select: { id: true, title: true, state: true, createdAt: true }, take: 100 }) : [],
  ])
  for (const j of jobs) activity.push({ section: 'activity', kind: 'job', says: `${j.title}, ${j.status.toLowerCase()}`, when: j.createdAt, source: { type: 'Requirement', id: j.id }, href: recordHref('Requirement', j.id, '/dashboard/requirements'), plugin: null })
  for (const s of subs) activity.push({ section: 'activity', kind: 'application', says: `${s.person.name} put forward for ${s.requirement.title}: ${s.status.toLowerCase()}`, when: s.submittedAt, source: { type: 'Submission', id: s.id }, href: recordHref('Requirement', s.requirement.id, '/dashboard/submissions'), plugin: null })
  for (const l of lines) activity.push({ section: 'activity', kind: 'placement', says: `${l.person.name} at ${l.clientCompany.name}, ${l.state.toLowerCase()}, from ${formatDay(l.startDate)}`, when: l.startDate, source: { type: 'SellContract', id: l.id }, href: recordHref('SellContract', l.id, '/dashboard/contracts'), plugin: null })
  const sheets = await prisma.timesheet.findMany({ where: { sellContractId: { in: lineIds } }, select: { id: true, periodStart: true, totalHours: true, status: true, person: { select: { name: true } } }, orderBy: { periodStart: 'desc' }, take: 100 })
  for (const t of sheets) activity.push({ section: 'activity', kind: 'timesheet', says: `${t.person.name}, week of ${formatDay(t.periodStart)}: ${Number(t.totalHours)} hours, ${t.status.toLowerCase()}`, when: t.periodStart, source: { type: 'Timesheet', id: t.id }, href: '/dashboard/timesheets', plugin: null })
  for (const p of pods) activity.push(pluginLine('PODS', { section: 'activity', kind: 'pod work', says: `Project team ${p.name}`, when: p.createdAt, source: { type: 'Pod', id: p.id } }, `/${company.slug}`))
  for (const e of enrolls) activity.push(pluginLine('TRAIN_TO_BENCH', { section: 'activity', kind: e.completedAt ? 'training completed' : 'training', says: `${e.person.name}: ${e.course.title}, ${e.completedAt ? 'completed' : e.status.toLowerCase()}`, when: e.completedAt ?? e.enrolledAt, source: { type: 'Enrollment', id: e.id } }))
  for (const p of proposals) activity.push(pluginLine('PUBLIC_SECTOR', { section: 'activity', kind: 'proposal', says: `${p.title}, ${p.state.toLowerCase()}`, when: p.createdAt, source: { type: 'Proposal', id: p.id } }, `/${company.slug}`))

  const m = await marginLines(reader)
  for (const l of lines) {
    if (mayReadBillRate({ permissions: reader.permissions, companyId: firm, companyKind: reader.companyKind }, { sellerId: l.companyId, clientId: l.clientCompanyId })) {
      money.push({ section: 'money', kind: 'rate', says: `${l.person.name} bills at ${amount(l.billRate, l.billCurrency)} an hour`, when: l.startDate, source: { type: 'SellContract', id: l.id }, href: recordHref('SellContract', l.id, '/dashboard/contracts'), plugin: null })
    }
    if (l.conversionFee != null) money.push({ section: 'money', kind: 'fee', says: `Conversion fee ${amount(l.conversionFee, l.billCurrency)}`, when: l.startDate, source: { type: 'SellContract', id: l.id }, href: recordHref('SellContract', l.id, '/dashboard/contracts'), plugin: null })
  }
  const [bills, receipts] = await Promise.all([
    prisma.invoice.findMany({ where: { AND: [invoiceBetween(firm) as never, { invoiceLines: { some: { sellContractId: { in: lineIds } } } }] }, select: { id: true, number: true, total: true, paid: true, currency: true, status: true, issuedAt: true, periodStart: true }, take: 100 }),
    prisma.vendorBill.findMany({ where: own ? { OR: [{ companyId: firm }, { vendorCompanyId: firm }] } : { OR: [{ companyId: firm, vendorCompanyId: companyId }, { companyId, vendorCompanyId: firm }] }, select: { id: true, number: true, totalCents: true, paidCents: true, currency: true, status: true, receivedAt: true }, take: 100 }),
  ])
  for (const b of bills) money.push({ section: 'money', kind: 'bill', says: `Bill ${b.number}: ${units(Number(b.total), b.currency)}, ${units(Number(b.paid), b.currency)} paid, ${b.status.toLowerCase()}`, when: b.issuedAt ?? b.periodStart, source: { type: 'Invoice', id: b.id }, href: recordHref('Invoice', b.id, '/dashboard/invoices'), plugin: null })
  for (const r of receipts) money.push({ section: 'money', kind: 'invoice receipt', says: `Invoice receipt ${r.number}: ${amount(r.totalCents, r.currency)}, ${amount(r.paidCents, r.currency)} paid, ${r.status.toLowerCase()}`, when: r.receivedAt, source: { type: 'VendorBill', id: r.id }, href: recordHref('VendorBill', r.id, '/dashboard/invoices'), plugin: null })
  const sold = lines.filter((l) => mayShowMargin({ readerCompanyId: firm, lineSellerId: l.companyId, readsMargin: m.readsMargin }) && (m.only === null || m.only.includes(l.id)))
  if (sold.length) {
    for (const b of await placementBooks(firm, { sellContractIds: sold.map((l) => l.id) })) {
      money.push({ section: 'money', kind: 'margin', says: `${b.person.name}: ${b.profit.says}`, when: null, source: { type: 'SellContract', id: b.sellContractId }, href: recordHref('SellContract', b.sellContractId, '/dashboard/contracts'), plugin: null })
    }
  } else notes.push('Margin is not shown to your seat on these lines.')

  const [record, agreements, verifs, certs] = await Promise.all([
    papersOnRecord({ personIds: [], companyIds: own ? [companyId] : [], sellContractIds: lineIds }),
    prisma.masterAgreement.findMany({ where: own ? { OR: [{ vendorId: companyId }, { clientId: companyId }] } : { OR: [{ vendorId: firm, clientId: companyId }, { vendorId: companyId, clientId: firm }] }, select: { id: true, createdAt: true, vendor: { select: { name: true } }, client: { select: { name: true } } }, take: 50 }),
    own ? prisma.verification.findMany({ where: { companyId }, select: { id: true, type: true, status: true, expiresAt: true, createdAt: true }, take: 100 }) : [],
    own && on(company.pluginsOn, 'TRAIN_TO_BENCH') ? prisma.learnCredential.findMany({ where: { companyId, revokedAt: null }, select: { id: true, createdAt: true, enrollment: { select: { course: { select: { title: true } } } } }, take: 100 }) : [],
  ])
  for (const a of agreements) documents.push({ section: 'documents', kind: 'agreement', says: `Agreement, ${a.vendor.name} and ${a.client.name}`, when: a.createdAt, source: { type: 'MasterAgreement', id: a.id }, href: '/dashboard/contracts', plugin: null })
  for (const p of record.papers) documents.push({ section: 'documents', kind: 'paper', says: `${p.template.name}, ${p.status.toLowerCase()}${p.expiresAt ? `, to ${formatDay(p.expiresAt)}` : ''}`, when: p.signedAt ?? p.validFrom, source: { type: 'DocInstance', id: p.id }, href: '/dashboard/documents', plugin: null })
  for (const v of verifs) documents.push({ section: 'documents', kind: 'compliance check', says: `${v.type.toLowerCase().replace(/_/g, ' ')}: ${v.status.toLowerCase()}`, when: v.createdAt, source: { type: 'Verification', id: v.id }, href: '/dashboard/compliance', plugin: null })
  for (const c of certs) documents.push(pluginLine('TRAIN_TO_BENCH', { section: 'documents', kind: 'certificate', says: `Certificate: ${c.enrollment.course.title}`, when: c.createdAt, source: { type: 'LearnCredential', id: c.id } }))

  return { ok: true, ledger: { subject: { kind: 'company', id: companyId, name: company.name }, activity: activity.sort(newestFirst), money: money.sort(newestFirst), documents: documents.sort(newestFirst), notes } }
}
