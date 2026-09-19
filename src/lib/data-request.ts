/**
 * Somebody asked for their data, or asked to be forgotten — and what
 * happens on the nights in between.
 *
 * ── Two halves, and the seam is the database ─────────────────────────
 *
 * The verdicts are pure and sit at the top: who may ask, who may answer,
 * whether a request names exactly one subject. The rest reads rows,
 * builds the export document, sends the letters and runs the nightly
 * sweep.
 *
 * ── Why the runner lives here and not in `lib/retention` ─────────────
 *
 * `lib/retention` is the schedule and the decision, and it has no
 * database in it on purpose: every branch that deletes a record is
 * testable without one. Something still has to read the rows, call
 * `sweep`, and apply what comes back, and this is the module about
 * requests and their clocks, so it is here. `runRetentionSweep` is what
 * the nightly cron route calls.
 *
 * Owned by etyme-regulatory (`lib/data-request` in `lib/domains.ts`).
 */

import { prisma } from '@/lib/db'
import { HELD, NOT_USED } from '@/lib/legal'
import {
  dueDateFor, coolingEndsAt, sweep, COOLING_DAYS,
  type Regime, type RequestKind,
  type SweepDeps, type SweepRequest, type SweepBreach, type SweepClock,
} from '@/lib/retention'
import { executeErasure, footprintFor, planErasure, keptBecause, isTombstone } from '@/lib/erasure'
import { logAccess } from '@/lib/access-log'
import { notify } from '@/lib/notify'
import { tellStaff } from '@/lib/alerts'
import { daysOnSite } from '@/lib/tenure-days'
import {
  categoriesFor, NOT_IN_AN_EXPORT,
  exportReadyNotice, erasureReceivedNotice, erasureCompleteNotice, erasureHolderNotice,
} from '@/lib/notify/data-rights'
import { breachClockWarning } from '@/lib/notify/breach'
import type { Notice, Audience } from '@/lib/notify/letters'

// ── Who the request is about ──────────────────────────────────────────

export interface SubjectAsked {
  personId?: string | null
  companyId?: string | null
}

export interface SubjectVerdict {
  ok: boolean
  says: string
}

/**
 * Exactly one subject, a person or a company.
 *
 * Prisma cannot express exactly-one-of, so this is the route's job and
 * the sentence is the product. A request about both is not a small
 * mistake — it is a request nobody can answer, because the two are
 * answered by different people out of different records.
 */
export function oneSubject(asked: SubjectAsked): SubjectVerdict {
  const person = !!asked.personId
  const company = !!asked.companyId
  if (person && company) {
    return {
      ok: false,
      says:
        'A request is about one person or one company, never both. A person asks about ' +
        'themselves and a company asks about its own records at the end of a contract, ' +
        'and the two are answered by different people out of different files. Raise two.',
    }
  }
  if (!person && !company) {
    return {
      ok: false,
      says:
        'Say who this request is about — a person, or a company. A request with nobody in ' +
        'it cannot be answered and cannot be counted against a deadline.',
    }
  }
  return { ok: true, says: 'One subject, which is what an answer needs.' }
}

export interface MayAsk {
  ok: boolean
  says: string
}

/**
 * A person may always ask about themselves.
 *
 * Anybody else asking on their behalf has to be a company that holds
 * them: a recruiter forwarding an emailed request, a compliance desk
 * logging one that arrived by post. A company that has never held the
 * person is refused in words, and the refusal is logged as carefully as
 * a grant.
 */
export function mayAsk(input: {
  callerPersonId: string
  subjectPersonId: string | null
  subjectCompanyId: string | null
  callerCompanyId: string | null
  holdsTheSubject: boolean
}): MayAsk {
  if (input.subjectPersonId && input.subjectPersonId === input.callerPersonId) {
    return { ok: true, says: 'Your own record is always yours to ask about.' }
  }
  if (!input.callerCompanyId) {
    return {
      ok: false,
      says:
        'You can ask for your own data from your own page. A request about somebody else ' +
        'has to come from a company that holds their records.',
    }
  }
  if (!input.holdsTheSubject) {
    return {
      ok: false,
      says:
        'This company has no record of the person or firm this request is about — no ' +
        'contract, no listing, no submission and no seat. Whoever does hold their records ' +
        'is the one who can answer, and we cannot tell you who that is.',
    }
  }
  return {
    ok: true,
    says: 'This company holds the subject, so it can log a request that arrived by email.',
  }
}

// ── What a subject is told is being held about them ───────────────────

/** The categories the privacy notice says are held about this reader. */
export function categoriesHeldAbout(audience: Audience): string[] {
  return categoriesFor(audience)
}

/** Everything the notice names, for a screen that renders the list. */
export function heldCategories(): { category: string; examples: string; about: string }[] {
  return HELD.map((h) => ({ category: h.category, examples: h.examples, about: h.about }))
}

// ── The export document ───────────────────────────────────────────────

export interface ExportDocument {
  producedAt: string
  subject: { id: string; name: string; email: string }
  /** The notice's own category names, so the file can be checked against it. */
  categories: Record<string, unknown>
  /** What is deliberately not in it, said out loud. */
  notIncluded: string[]
  /** Services that never see any of this, named because people ask. */
  neverUsed: string[]
}

/**
 * Everything held about one person, by the privacy notice's own
 * categories.
 *
 * Resume bytes are named and not embedded: a person asking for their
 * data wants to know which files we have, and a base64 blob in a JSON
 * document is a file nobody can open. The file itself is downloadable
 * from their own page, where it always was.
 */
export async function exportFor(personId: string, now = new Date()): Promise<ExportDocument | null> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, name: true, primaryEmail: true, timezone: true, createdAt: true },
  })
  if (!person) return null

  const [
    credentials, profile, resumes, visas, verifications, packets,
    classifications, exempts, sells, buys, timesheets, expenses,
    invoiceLines, messages, accessLogs, blacklists, doNotSubmits, favorites,
  ] = await Promise.all([
    prisma.credential.findMany({ where: { personId }, select: { provider: true, email: true, lastUsedAt: true, createdAt: true } }),
    prisma.consultantProfile.findUnique({ where: { personId }, select: { headline: true, skills: true, location: true, workAuth: true, rateFloor: true, slug: true, mobile: true, availableFrom: true, visibility: true } }),
    prisma.resume.findMany({ where: { personId }, select: { label: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true, deletedAt: true } }),
    prisma.visaPetition.findMany({ where: { personId }, select: { type: true, status: true, filedAt: true, approvedAt: true, expiresAt: true } }),
    prisma.verification.findMany({ where: { personId }, select: { type: true, status: true, provider: true, referenceId: true, issuedAt: true, expiresAt: true } }),
    prisma.documentPacket.findMany({ where: { subjectPersonId: personId }, select: { label: true, createdAt: true, company: { select: { name: true } }, items: { select: { label: true, state: true } } } }),
    prisma.classificationCall.findMany({ where: { personId }, select: { decidedAt: true, position: true, arrangement: true, company: { select: { name: true } } } }),
    prisma.exemptAssertion.findMany({ where: { personId }, select: { assertedAt: true, status: true, basis: true, assertedByCompany: { select: { name: true } } } }),
    prisma.sellContract.findMany({ where: { personId }, select: { id: true, startDate: true, endDate: true, state: true, company: { select: { name: true } }, clientCompany: { select: { name: true } } } }),
    prisma.buyContractCandidate.findMany({ where: { personId }, select: { startDate: true, endDate: true, state: true, buyContract: { select: { company: { select: { name: true } } } } } }),
    prisma.timesheet.findMany({ where: { personId }, select: { periodStart: true, periodEnd: true, totalHours: true, acceptedHours: true, status: true } }),
    prisma.expense.findMany({ where: { personId }, select: { description: true, total: true, status: true, periodStart: true } }),
    prisma.invoiceLine.findMany({ where: { personId }, select: { description: true, amountCents: true, invoice: { select: { number: true, status: true } } } }),
    prisma.message.findMany({ where: { authorId: personId }, select: { body: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.accessLog.findMany({ where: { subjectId: personId }, select: { action: true, allowed: true, reason: true, at: true, actorCompany: { select: { name: true } } }, orderBy: { at: 'desc' }, take: 1000 }),
    prisma.blacklist.findMany({ where: { targetType: 'PERSON', targetId: personId }, select: { reason: true, blockedAt: true, liftedAt: true, company: { select: { name: true } } } }),
    prisma.doNotSubmit.findMany({ where: { personId }, select: { note: true, createdAt: true, company: { select: { name: true } } } }),
    prisma.favorite.findMany({ where: { targetType: 'PERSON', targetId: personId }, select: { note: true, createdAt: true, company: { select: { name: true } } } }),
  ])

  // Days on site, per client, counted once per day however many firms
  // billed it. The same arithmetic the tenure ledger uses, because a
  // person asking what we hold should get the number the client sees.
  const bySite = new Map<string, { startDate: Date; endDate: Date | null }[]>()
  for (const s of sells) {
    const site = s.clientCompany?.name ?? s.company.name
    bySite.set(site, [...(bySite.get(site) ?? []), { startDate: s.startDate, endDate: s.endDate }])
  }

  return {
    producedAt: now.toISOString(),
    subject: { id: person.id, name: person.name, email: person.primaryEmail },
    categories: {
      'Identity and sign-in': {
        name: person.name, email: person.primaryEmail, timezone: person.timezone,
        accountOpened: person.createdAt, signInMethods: credentials,
      },
      'A consultant own profile': profile ?? 'You have no consultant profile here.',
      'Resumes': resumes.map((r) => ({
        ...r,
        note: 'The file itself is on your own page. It is named here rather than pasted in, because a file inside a document is a file nobody can open.',
      })),
      'Work authorization and immigration': visas,
      'Checks somebody else ran': verifications.map((v) => ({
        ...v,
        note: 'Held as the record that a check happened — who ran it, when, its reference and when it runs out. Etyme runs none of these and states no verdict about you from them.',
      })),
      'Onboarding paperwork': packets,
      'Positions taken about how somebody is engaged': { classifications, exemptAssertions: exempts },
      'Money about a person': { sellContracts: sells, buyContracts: buys, timesheets, expenses, invoiceLines },
      'Time on site': [...bySite.entries()].map(([site, periods]) => ({
        client: site, days: daysOnSite(periods, now),
        note: 'Counted once per day however many firms billed it, and only days actually served.',
      })),
      'Bars and preferences': { bars: blacklists, doNotSubmit: doNotSubmits, stars: favorites },
      'Messages': messages,
      'Logs': accessLogs,
    },
    notIncluded: NOT_IN_AN_EXPORT,
    neverUsed: [...NOT_USED],
  }
}

// ── Raising one ───────────────────────────────────────────────────────

export interface Raised {
  id: string
  kind: RequestKind
  dueAt: Date
  dueBasis: string
  /** The day an erasure actually runs. Null for an export. */
  runsOn: Date | null
  keptBecause: string[]
}

/**
 * Log a request and start its clock.
 *
 * The clock counts from `receivedAt`, which is when it arrived and not
 * when the row was written: a request emailed on Friday and logged on
 * Monday is three days old.
 */
export async function raiseRequest(input: {
  kind: RequestKind
  subjectPersonId?: string | null
  subjectCompanyId?: string | null
  requestedById?: string | null
  requestedByCompanyId?: string | null
  receivedAt?: Date
  regime?: Regime
  note?: string | null
  now?: Date
}): Promise<Raised> {
  const now = input.now ?? new Date()
  const receivedAt = input.receivedAt ?? now
  const regime: Regime = input.regime ?? 'UNKNOWN'
  const { dueAt, dueBasis } = dueDateFor(input.kind, receivedAt, regime)

  let kept: string[] = []
  if (input.kind === 'ERASURE' && input.subjectPersonId) {
    const footprint = await footprintFor(input.subjectPersonId, now)
    if (footprint) kept = keptBecause(planErasure(footprint))
  }

  const row = await prisma.dataRequest.create({
    data: {
      kind: input.kind,
      subjectPersonId: input.subjectPersonId ?? null,
      subjectCompanyId: input.subjectCompanyId ?? null,
      requestedById: input.requestedById ?? null,
      requestedByCompanyId: input.requestedByCompanyId ?? null,
      receivedAt,
      dueAt,
      dueBasis,
      keptBecause: kept,
      note: input.note ?? null,
    },
    select: { id: true },
  })

  if (input.subjectPersonId) {
    logAccess({
      subjectId: input.subjectPersonId,
      actorPersonId: input.requestedById ?? undefined,
      actorCompanyId: input.requestedByCompanyId ?? undefined,
      action: 'DATA_EXPORT',
      reason:
        input.kind === 'EXPORT'
          ? 'A request for everything held about this person was logged.'
          : 'A request for this person to be forgotten was logged.',
    })
  }

  // One row per company, and the company that asked is the one that
  // hears about it. A person asking about themselves from their own page
  // has no company, and nothing is written — an automation log is a
  // company's own book.
  if (input.requestedByCompanyId) {
    await prisma.automationLog.create({
      data: {
        companyId: input.requestedByCompanyId,
        action: input.kind === 'EXPORT' ? 'DATA_EXPORT_REQUESTED' : 'DATA_ERASURE_REQUESTED',
        summary:
          input.kind === 'EXPORT'
            ? 'Somebody asked for everything held about them, and a statutory clock started.'
            : 'Somebody asked to be forgotten, and a statutory clock started.',
        reason: dueBasis,
        payload: { requestId: row.id, dueAt: dueAt.toISOString() },
        reversible: true,
      },
    })
  }

  const runsOn = input.kind === 'ERASURE' ? coolingEndsAt(receivedAt) : null

  if (input.kind === 'ERASURE' && input.subjectPersonId) {
    await tellSubject(input.subjectPersonId, (person) =>
      erasureReceivedNotice({
        person,
        reference: reference(row.id),
        requestedAt: receivedAt,
        completesOn: runsOn!,
        categories: categoriesFor(person.audience),
        withdrawUrl: withdrawUrl(row.id),
        contactEmail: contactEmail(),
      })
    )
  }

  return { id: row.id, kind: input.kind, dueAt, dueBasis, runsOn, keptBecause: kept }
}

/** Short, quotable, and the same string in every letter about it. */
export function reference(requestId: string): string {
  return `DR-${requestId.slice(-8).toUpperCase()}`
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? (process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL}`)
    : 'http://localhost:3000'
}

export function withdrawUrl(requestId: string): string {
  return `${baseUrl()}/dashboard/my-data?withdraw=${requestId}`
}

export function downloadUrl(requestId: string): string {
  return `${baseUrl()}/api/me/data?download=${requestId}`
}

/** Where a question about any of this goes. */
export function contactEmail(): string {
  return process.env.ETYME_PRIVACY_EMAIL ?? 'privacy@etyme.example'
}

// ── Answering one ─────────────────────────────────────────────────────

/** Produce the export, store it on the request, and tell the person. */
export async function produceExport(requestId: string, now = new Date()): Promise<{ ok: boolean; says: string }> {
  const row = await prisma.dataRequest.findUnique({
    where: { id: requestId },
    select: { id: true, kind: true, subjectPersonId: true, status: true },
  })
  if (!row) return { ok: false, says: 'There is no request with that reference.' }
  if (row.kind !== 'EXPORT') return { ok: false, says: 'That request is to be forgotten, not for a copy. It runs on its own date.' }
  if (!row.subjectPersonId) {
    return {
      ok: false,
      says:
        'This request is about a company, and a company export is not built yet. What a ' +
        'firm is owed at the end of a contract is its own records, and nobody has decided ' +
        'which of the joint ones travel with it. Answering by hand is the honest path today.',
    }
  }

  const document = await exportFor(row.subjectPersonId, now)
  if (!document) return { ok: false, says: 'That person’s record is no longer here.' }

  await prisma.dataRequest.update({
    where: { id: requestId },
    data: { document: document as unknown as object, producedAt: now, status: 'READY' },
  })

  logAccess({
    subjectId: row.subjectPersonId,
    action: 'DATA_EXPORT',
    reason: 'An export of everything held about this person was produced.',
  })

  await tellSubject(row.subjectPersonId, (person) =>
    exportReadyNotice({
      person,
      categories: Object.keys(document.categories),
      downloadUrl: downloadUrl(requestId),
      // The link lives as long as the request does. There is no separate
      // expiry column, so this is the request's own due date and the
      // letter says the same day the screen does.
      linkExpiresAt: new Date(now.getTime() + 7 * 86_400_000),
      now,
      contactEmail: contactEmail(),
    })
  )

  return { ok: true, says: 'The export is ready and the person has been told.' }
}

/**
 * Finish an erasure: run it, tell the person at the address they gave,
 * and tell every firm whose records changed.
 */
export async function completeErasure(
  requestId: string,
  now = new Date()
): Promise<{ ran: boolean; says: string }> {
  const row = await prisma.dataRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true, kind: true, subjectPersonId: true, status: true,
      subjectPerson: { select: { name: true, primaryEmail: true } },
    },
  })
  if (!row || row.kind !== 'ERASURE' || !row.subjectPersonId || !row.subjectPerson) {
    return { ran: false, says: 'There is no erasure request with that reference.' }
  }
  if (row.status === 'DONE') return { ran: false, says: 'That request has already run.' }

  // Taken before the tombstone, because afterwards the account knows
  // neither. The letter goes to the address they gave when they asked.
  const name = row.subjectPerson.name
  const replyTo = row.subjectPerson.primaryEmail
  const audience: Audience = await audienceOf(row.subjectPersonId)
  const categories = categoriesFor(audience)

  const outcome = await executeErasure(row.subjectPersonId, { now })

  if (!outcome.ran) {
    await prisma.dataRequest.update({
      where: { id: requestId },
      data: { status: 'HELD', keptBecause: [outcome.because ?? 'A legal hold applies.'] },
    })
    return { ran: false, says: outcome.because ?? 'A legal hold applies.' }
  }

  await prisma.dataRequest.update({
    where: { id: requestId },
    data: {
      status: 'DONE',
      completedAt: now,
      keptBecause: keptBecause(outcome.plan),
    },
  })

  // The last letter, to the address on the request rather than on the
  // account: the account address is a tombstone by now, and a letter
  // routed the usual way would go to nobody.
  const letter = erasureCompleteNotice({
    person: { name, audience },
    reference: reference(requestId),
    completedOn: now,
    categories,
    replyTo,
    contactEmail: contactEmail(),
  })
  await sendOutside(letter, replyTo)

  for (const holder of outcome.plan.holders) {
    const held = erasureHolderNotice({
      company: { name: holder.companyName, holding: holder.holding },
      person: { name },
      reference: reference(requestId),
      completedOn: now,
      contactEmail: contactEmail(),
    })
    await tellCompany(holder.companyId, held)
  }

  return { ran: true, says: 'It ran. The person and every firm holding their records were told.' }
}

/** A person can stop an erasure any time before it runs. */
export async function withdrawRequest(
  requestId: string,
  byPersonId: string,
  now = new Date()
): Promise<{ ok: boolean; says: string }> {
  const row = await prisma.dataRequest.findUnique({
    where: { id: requestId },
    select: { id: true, kind: true, status: true, subjectPersonId: true, completedAt: true },
  })
  if (!row) return { ok: false, says: 'There is no request with that reference.' }
  if (row.subjectPersonId !== byPersonId) {
    return { ok: false, says: 'A request is withdrawn by the person it is about, and this one is not yours.' }
  }
  if (row.status === 'DONE') {
    return {
      ok: false,
      says:
        'This one has already run. Erasure cannot be undone — the letter you were sent said ' +
        'so before the day, and it is still true.',
    }
  }

  await prisma.dataRequest.update({
    where: { id: requestId },
    data: { status: 'REFUSED', refusedBecause: 'Withdrawn by the person who asked.', completedAt: now },
  })
  return { ok: true, says: 'Withdrawn. Nothing was changed and nothing will be.' }
}

// ── Sending the letters ───────────────────────────────────────────────

async function audienceOf(personId: string): Promise<Audience> {
  const seats = await prisma.context.count({ where: { personId, companyId: { not: null } } })
  return seats > 0 ? 'business' : 'candidate'
}

async function tellSubject(
  personId: string,
  build: (person: { name: string | null; audience: Audience }) => Notice
): Promise<void> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { name: true, primaryEmail: true },
  })
  if (!person) return
  if (isTombstone(person.primaryEmail)) return

  const audience = await audienceOf(personId)
  const letter = build({ name: person.name, audience })
  await notify({
    personId,
    type: 'SYSTEM',
    title: letter.subject,
    body: letter.body,
    channel: 'EMAIL',
  })
}

/**
 * A letter to somebody the platform can no longer address.
 *
 * Nothing in `notify` can reach a tombstone, which is the point of the
 * tombstone, so the completion letter goes out through the staff channel
 * with the address it must be sent to written into it. It is one letter
 * per erasure and it is the last one that person ever gets.
 */
async function sendOutside(letter: Notice, to: string): Promise<void> {
  await tellStaff(
    `Send to ${to}: ${letter.subject}`,
    `This letter must go to ${to}. The address on the account is a tombstone now and ` +
      `nothing in the product can reach it.\n\n${letter.body}`
  )
}

async function tellCompany(companyId: string, letter: Notice): Promise<void> {
  const seats = await prisma.context.findMany({
    where: { companyId, revokedAt: null },
    select: { personId: true },
    take: 25,
  })
  for (const seat of seats) {
    await notify({
      personId: seat.personId,
      companyId,
      type: 'SYSTEM',
      title: letter.subject,
      body: letter.body,
      channel: 'EMAIL',
    })
  }
}

// ── The nightly run ───────────────────────────────────────────────────

export interface SweepOutcome {
  warned: number
  erased: number
  held: number
  deleted: number
  breachWarnings: number
  breachesWithNoClock: number
}

/**
 * Read the rows, ask `lib/retention` what to do, do it.
 *
 * Every act it takes writes its own automation row under the name the
 * autonomy ladder holds, so a buyer asking "what does it do at night"
 * gets a level and a log rather than a paragraph.
 */
export async function runRetentionSweep(now = new Date()): Promise<SweepOutcome> {
  const startOfDay = new Date(now.getTime() - 86_400_000)

  const [open, warnedRows, breaches, tombstoned] = await Promise.all([
    prisma.dataRequest.findMany({
      where: { status: { in: ['RECEIVED', 'HELD', 'READY'] } },
      select: {
        id: true, kind: true, status: true, receivedAt: true, dueAt: true,
        subjectPersonId: true, subjectCompanyId: true,
        subjectPerson: { select: { name: true } },
        subjectCompany: { select: { name: true } },
        requestedByCompanyId: true,
      },
      orderBy: { dueAt: 'asc' },
    }),
    prisma.automationLog.findMany({
      where: { action: 'DATA_REQUEST_CLOCK_WARNED', at: { gte: startOfDay } },
      select: { payload: true },
    }),
    prisma.breach.findMany({
      where: { closedAt: null },
      select: {
        id: true, summary: true, closedAt: true, lastWarnedAt: true,
        discoveredAt: true, populations: true, categories: true,
        notifyAuthorityBy: true, authorityNotifiedAt: true,
        notifySubjectsBy: true, subjectsNotifiedAt: true,
        openedBy: { select: { name: true } },
        companies: { select: { notifyBy: true, notifiedAt: true, company: { select: { id: true, name: true } } } },
      },
    }),
    prisma.person.findMany({
      where: { erasedAt: { not: null } },
      select: { id: true, erasedAt: true },
      take: 500,
    }),
  ])

  const warnedToday = new Set(
    warnedRows.map((r) => (r.payload as { requestId?: string } | null)?.requestId).filter(Boolean) as string[]
  )

  const holds = await prisma.legalHold.findMany({
    where: { liftedAt: null },
    select: { subjectPersonId: true, subjectCompanyId: true, reason: true },
  })
  const heldPerson = new Map(holds.filter((h) => h.subjectPersonId).map((h) => [h.subjectPersonId!, h.reason]))
  const heldCompany = new Map(holds.filter((h) => h.subjectCompanyId).map((h) => [h.subjectCompanyId!, h.reason]))

  const requests: SweepRequest[] = open.map((r) => {
    const reason =
      (r.subjectPersonId ? heldPerson.get(r.subjectPersonId) : null) ??
      (r.subjectCompanyId ? heldCompany.get(r.subjectCompanyId) : null) ??
      null
    return {
      id: r.id, kind: r.kind as RequestKind, status: r.status,
      receivedAt: r.receivedAt, dueAt: r.dueAt,
      subjectPersonId: r.subjectPersonId, subjectCompanyId: r.subjectCompanyId,
      subjectLabel: r.subjectPerson?.name ?? r.subjectCompany?.name ?? 'somebody',
      underLegalHold: reason != null, holdReason: reason,
      warnedToday: warnedToday.has(r.id),
    }
  })

  const sweepBreaches: SweepBreach[] = breaches.map((b) => {
    const owner = b.openedBy?.name ?? 'nobody — this clock has no owner'
    const clocks: SweepClock[] = [
      { which: 'AUTHORITY', dueAt: b.notifyAuthorityBy, notifiedAt: b.authorityNotifiedAt, owner },
      { which: 'PEOPLE', dueAt: b.notifySubjectsBy, notifiedAt: b.subjectsNotifiedAt, owner },
      ...b.companies.map((c) => ({
        which: { companyId: c.company.id, companyName: c.company.name },
        dueAt: c.notifyBy, notifiedAt: c.notifiedAt, owner,
      })),
    ]
    return {
      id: b.id, reference: referenceOfBreach(b.id), summary: b.summary,
      closedAt: b.closedAt, lastWarnedAt: b.lastWarnedAt, clocks,
    }
  })

  // Only people already under a tombstone are handed to the retention
  // half. `lib/retention` says why at length: nothing here ages out a
  // living person who has merely gone quiet.
  const subjects = await Promise.all(
    tombstoned.map(async (p) => {
      const footprint = await footprintFor(p.id, now)
      if (!footprint) return null
      const stillHeld = Object.entries(footprint.counts)
        .filter(([c, n]) => n > 0 && ['Checks somebody else ran', 'Onboarding paperwork', 'Work authorization and immigration', 'Positions taken about how somebody is engaged'].includes(c))
        .map(([c]) => c)
      return {
        personId: p.id,
        companyIds: footprint.holders.map((h) => h.companyId),
        facts: footprint.facts,
        stillHeld,
      }
    })
  )

  const deps: SweepDeps = {
    requests,
    breaches: sweepBreaches,
    subjects: subjects.filter((s): s is NonNullable<typeof s> => s != null),
  }
  const plan = sweep(now, deps)

  const outcome: SweepOutcome = {
    warned: 0, erased: 0, held: 0, deleted: 0,
    breachWarnings: 0, breachesWithNoClock: plan.breachesWithNoClock.length,
  }

  // ── Requests falling due ────────────────────────────────────────────

  if (plan.warnRequests.length > 0) {
    await tellStaff(
      plan.warnRequests.some((w) => w.late)
        ? `${plan.warnRequests.length} data request${plan.warnRequests.length === 1 ? '' : 's'} due or overdue`
        : `${plan.warnRequests.length} data request${plan.warnRequests.length === 1 ? '' : 's'} due inside a day`,
      plan.warnRequests.map((w) => `— ${w.says}`).join('\n')
    )
  }
  for (const w of plan.warnRequests) {
    const row = open.find((r) => r.id === w.requestId)
    const companyId = row?.requestedByCompanyId ?? row?.subjectCompanyId ?? null
    if (companyId) {
      await prisma.automationLog.create({
        data: {
          companyId,
          action: 'DATA_REQUEST_CLOCK_WARNED',
          summary: w.says,
          reason: 'A statutory clock on a data request falls due inside a day and nobody has answered it.',
          payload: { requestId: w.requestId, hoursLeft: w.hoursLeft },
          reversible: true,
        },
      })
    }
    outcome.warned++
  }

  // ── Erasures whose day has come ────────────────────────────────────

  for (const e of plan.erasures) {
    if (e.action === 'RETENTION_HELD') {
      await prisma.dataRequest.update({
        where: { id: e.requestId },
        data: { status: 'HELD', keptBecause: [e.says] },
      })
      const row = open.find((r) => r.id === e.requestId)
      const companyId = row?.requestedByCompanyId ?? null
      if (companyId) {
        await prisma.automationLog.create({
          data: {
            companyId,
            action: 'RETENTION_HELD',
            summary: e.says,
            reason: 'An unlifted legal hold names this subject, so nothing was deleted.',
            payload: { requestId: e.requestId },
            reversible: true,
          },
        })
      }
      outcome.held++
      continue
    }
    const ran = await completeErasure(e.requestId, now)
    if (ran.ran) outcome.erased++
  }

  // ── Records past their period, for somebody already forgotten ──────

  for (const act of plan.retention) {
    for (const companyId of act.companyIds) {
      await prisma.automationLog.create({
        data: {
          companyId,
          action: act.action === 'RETENTION_DELETE' ? 'RETENTION_DELETE' : 'RETENTION_HELD',
          summary: act.says,
          reason: act.basis,
          payload: { personId: act.personId, category: act.category },
          reversible: act.action === 'RETENTION_HELD',
        },
      })
    }
    if (act.action === 'RETENTION_DELETE') {
      await deleteHeldEvidence(act.personId, act.category)
      outcome.deleted++
    } else {
      outcome.held++
    }
  }

  // ── Breach clocks ──────────────────────────────────────────────────

  for (const w of plan.breachWarnings) {
    const b = breaches.find((x) => x.id === w.breachId)!
    const letter = breachClockWarning({
      breach: {
        reference: referenceOfBreach(b.id),
        what: b.summary,
        discoveredAt: b.discoveredAt,
        discoveredBy: null,
        populations: b.populations as Audience[],
        peopleAffected: null,
        companiesAffected: b.companies.map((c) => c.company.name),
        categories: b.categories,
        clocks: [],
      },
      clock: { id: w.which === 'PEOPLE' ? 'PEOPLE' : 'AUTHORITY', dueAt: w.dueAt, owner: w.owner },
      now,
      url: `${baseUrl()}/dashboard/privacy`,
    })
    await tellStaff(letter.subject, letter.body)
    outcome.breachWarnings++
  }

  const warnedBreaches = [...new Set(plan.breachWarnings.map((w) => w.breachId))]
  for (const breachId of warnedBreaches) {
    await prisma.breach.update({ where: { id: breachId }, data: { lastWarnedAt: now } })
    const which = plan.breachWarnings.filter((w) => w.breachId === breachId)
    for (const w of which) {
      for (const c of breaches.find((b) => b.id === breachId)!.companies) {
        await prisma.automationLog.create({
          data: {
            companyId: c.company.id,
            action: w.action === 'BREACH_CLOCK_MISSED' ? 'BREACH_CLOCK_MISSED' : 'BREACH_CLOCK_WARNED',
            summary: w.says,
            reason:
              w.action === 'BREACH_CLOCK_MISSED'
                ? 'A deadline for telling somebody about a breach passed with no notice recorded against it.'
                : 'A deadline for telling somebody about a breach falls inside a day.',
            payload: { breachId, owner: w.owner },
            reversible: true,
          },
        })
      }
    }
  }

  if (plan.breachesWithNoClock.length > 0) {
    await tellStaff(
      `${plan.breachesWithNoClock.length} breach${plan.breachesWithNoClock.length === 1 ? '' : 'es'} with no clock decided`,
      plan.breachesWithNoClock.map((b) => `— ${b.says}`).join('\n')
    )
  }

  return outcome
}

/** Short and quotable, the same way a data request's reference is. */
export function referenceOfBreach(breachId: string): string {
  return `DB-${breachId.slice(-8).toUpperCase()}`
}

/**
 * Delete the evidence a statutory period was holding back.
 *
 * Narrow on purpose: only the four categories the schema puts under
 * "kept until a statutory period runs, then deleted", and only for
 * somebody already under a tombstone.
 */
async function deleteHeldEvidence(personId: string, category: string): Promise<void> {
  if (category === 'Checks somebody else ran') {
    const ids = (await prisma.verification.findMany({ where: { personId }, select: { id: true } })).map((v) => v.id)
    await prisma.verificationDoc.deleteMany({ where: { verificationId: { in: ids } } })
    await prisma.verification.deleteMany({ where: { personId } })
    return
  }
  if (category === 'Onboarding paperwork') {
    const ids = (await prisma.documentPacket.findMany({ where: { subjectPersonId: personId }, select: { id: true } })).map((p) => p.id)
    await prisma.packetItem.deleteMany({ where: { packetId: { in: ids } } })
    await prisma.documentPacket.deleteMany({ where: { subjectPersonId: personId } })
    return
  }
  if (category === 'Positions taken about how somebody is engaged') {
    await prisma.classificationCall.deleteMany({ where: { personId } })
    await prisma.exemptAssertion.deleteMany({ where: { personId } })
    return
  }
  // Work authorization has no citable federal minimum, so `verdictFor`
  // never returns a date for it and this is never reached for it. Left
  // as a refusal rather than a silent fall-through.
  throw new Error(
    `Nothing here knows how to delete "${category}" on a schedule, and guessing would ` +
      'delete a record that is gone.'
  )
}

/** The day an erasure logged on this date actually runs. */
export function coolingEndsAtFor(receivedAt: Date): Date {
  return coolingEndsAt(receivedAt)
}

export { COOLING_DAYS }
