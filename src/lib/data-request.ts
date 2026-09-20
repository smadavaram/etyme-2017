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
import { censusSweep, day, mb, type SweepCensus } from '@/lib/census'
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

/**
 * Which populations one person is in — and it can be both.
 *
 * `categoriesFor` takes one audience and the code asked it one question:
 * does this person hold a seat at a company. That substituted one answer
 * for the other, and it was wrong at both ends. A systems integrator's
 * own W2 holds a seat *and* is the person the work is about, so he was
 * shown the business categories and none of the ones about candidates —
 * no resumes, no work authorization, no time on site, which is most of
 * what is actually held about him. A consultant with a CONSULTANT seat
 * at the firm that benches her had the same bug facing the other way.
 *
 * It is the same decision the shell makes about his menu, decided
 * 2026-09-17: appended, never substituted, and whether somebody is a
 * worker is read off the work rather than off a seat type.
 *
 * Business is read off a seat that is not the consultant seat, or off
 * anything decided from a seat — an approval, a requisition, a week
 * signed — because that is what the "a seat at a company, and what was
 * decided from it" category actually contains. A person with neither is
 * a candidate: somebody who has just signed up is asked no questions
 * about which they are.
 */
export async function audiencesOf(personId: string): Promise<Audience[]> {
  const [seats, approvals, requisitions, signedWeeks, profile, submissions, sells, buys, weeks] =
    await Promise.all([
      prisma.context.count({ where: { personId, companyId: { not: null }, type: { not: 'CONSULTANT' } } }),
      prisma.requirementApproval.count({ where: { approverId: personId } }),
      prisma.requirement.count({ where: { raisedById: personId } }),
      prisma.timesheet.count({
        where: { OR: [{ clientApprovedById: personId }, { employerAcceptedById: personId }] },
      }),
      prisma.consultantProfile.count({ where: { personId } }),
      prisma.submission.count({ where: { personId } }),
      prisma.sellContract.count({ where: { personId } }),
      prisma.buyContractCandidate.count({ where: { personId } }),
      prisma.timesheet.count({ where: { personId } }),
    ])

  const business = seats + approvals + requisitions + signedWeeks > 0
  const worker = profile + submissions + sells + buys + weeks > 0

  if (business && worker) return ['business', 'candidate']
  if (business) return ['business']
  return ['candidate']
}

/**
 * The categories the privacy notice says are held about this reader.
 *
 * Takes one audience or several, and the several are unioned in the
 * notice's own order so a person who is both reads one list rather than
 * two lists with the same category in both.
 */
export function categoriesHeldAbout(audience: Audience | Audience[]): string[] {
  const all = Array.isArray(audience) ? audience : [audience]
  const mine = new Set(all.flatMap((a) => categoriesFor(a)))
  return HELD.map((h) => h.category).filter((c) => mine.has(c))
}

/** Everything the notice names, for a screen that renders the list. */
export function heldCategories(): { category: string; examples: string; about: string }[] {
  return HELD.map((h) => ({ category: h.category, examples: h.examples, about: h.about }))
}

/**
 * What the compliance desk's page says when it could not read itself.
 *
 * The page wrote its own refusal — "this seat does not hold it" — and
 * showed it whenever all three of its reads came back empty. Two things
 * were wrong with that and both reached a real screen. The envelope was
 * misread, so a 200 with a full queue in it looked like nothing; and the
 * incidents route correctly refuses a company that was in no incident,
 * which is the ordinary case and not a refusal of the page.
 *
 * So the decision is here, it takes the routes' own sentences rather
 * than a second copy of one, and it only speaks when both of the two
 * lists that belong to every compliance desk were refused. A company
 * with no incident reads its incidents list as empty, because that is
 * what it is.
 */
export function deskRefusal(refusals: {
  /** The refusal from `/api/data-requests`, or null where it answered. */
  requests: string | null
  /** The refusal from `/api/legal-holds`, or null where it answered. */
  holds: string | null
}): string | null {
  if (!refusals.requests || !refusals.holds) return null
  return refusals.requests
}

// ── Whose desk this is, in this reader's own words ────────────────────

export type DeskKind = 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' | 'CONSULTANT_CORP'

export interface DeskFraming {
  /** Whose requests, holds and incidents this desk answers for. */
  says: string
  /**
   * What this desk cannot reach, and what is missing to reach it. Null
   * where nothing is missing — never a sentence invented to fill a slot.
   */
  missing: string | null
}

/**
 * The compliance desk is one page and four kinds of firm open it.
 *
 * "Implement it across the app and not for client" — the founder,
 * 2026-09-19. The page described the reader as a client program, which
 * is the wrong sentence for a staffing supplier answering for the people
 * it employs, and a false one for a program office that answers for
 * nobody yet. Same data, same route, the framing picked off the company
 * kind — the rule `lib/order-naming` already applies to a document that
 * is a purchase order at one end and a sales order at the other.
 *
 * ── The program office is a refusal, on purpose ──────────────────────
 *
 * An MSP runs a client's program and places nobody, so no contract ties
 * it to a client and nothing here can tell a real program office from a
 * firm that typed a client's name. CLAUDE.md settled this for
 * requisitions — "the answer is a seat: the client grants the MSP a desk
 * in its program office" — and that seat is not built. `Delegation` is a
 * table with no writer and no reader, which is a column rather than a
 * feature. So the honest answer is to say what is missing, rather than
 * show an empty list that reads as "nobody has asked", and never to
 * invent the seat here.
 */
export function deskFraming(kind: DeskKind | string, companyName: string): DeskFraming {
  switch (kind) {
    case 'CLIENT':
      return {
        says:
          'Requests from the people on your sites and from your own staff, the records ' +
          'this program has asked to keep, and any incident its records were in.',
        missing: null,
      }
    case 'VENDOR':
      return {
        says:
          `Requests from the people ${companyName} employs or lists and from its own ` +
          'staff, the records it has asked to keep, and any incident its records were in.',
        missing: null,
      }
    case 'GSI':
      return {
        says:
          `Requests from the people ${companyName} employs or places and from its own ` +
          'staff, the records it has asked to keep, and any incident its records were in.',
        missing: null,
      }
    case 'MSP':
      return {
        says:
          `Requests ${companyName} has logged itself, the records it has asked to keep, ` +
          'and any incident its records were in.',
        missing:
          `${companyName} runs somebody else's program and places nobody, so nothing here ` +
          'ties it to a client. A request from one of a client’s contractors is answered ' +
          `by that client’s own compliance desk, and reading one from here needs a desk in ` +
          `the client’s program office — granted by the client, the way it grants one to ` +
          'its own people. That seat is not built yet, so this page shows ' +
          `${companyName}’s own and says so rather than showing an empty list.`,
      }
    case 'CONSULTANT_CORP':
      return {
        says:
          'Requests about the people this company contracts out, and any incident its ' +
          'records were in. Your own data is on your own page and needs nobody’s permission.',
        missing: null,
      }
    default:
      return {
        says:
          'Requests for somebody’s data, the records this company has asked to keep, and ' +
          'any incident its records were in. Soonest due first.',
        missing: null,
      }
  }
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
    seats, approvals, raised, signedWeeks, overtimeCalls, classedOthers,
    supplierDecisions, holdsPlaced, breachesOpened, censuses, signatures,
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

    // ── The business-user half of the same person ────────────────────
    //
    // The privacy notice has said since it was written that a seat and
    // what was decided from it is held, and for a week the export did
    // not contain it: an AP clerk, a procurement lead, a compliance
    // officer — anybody whose whole relationship with Etyme is a seat —
    // asked for everything held about them and got a file with nothing
    // about them in it. `footprintFor` counted all of this from the
    // first commit, so the erasure letter named a category the export
    // did not carry.
    //
    // What is deliberately **not** in it is the other person: the week
    // somebody signed names the week and not the contractor, and a
    // position taken about how somebody is engaged names the decision
    // and not the worker. Those are somebody else's personal data and
    // they belong in that person's own file, not in this one.
    prisma.context.findMany({
      where: { personId },
      select: {
        type: true, side: true, persona: true, grantReason: true, grantedAt: true,
        lastUsedAt: true, suspendedAt: true, revokedAt: true, revokeReason: true,
        company: { select: { name: true } }, role: { select: { name: true, permissions: true } },
      },
    }),
    prisma.requirementApproval.findMany({
      where: { approverId: personId },
      select: {
        stage: true, outcome: true, reason: true, decidedAt: true,
        requirement: { select: { title: true, company: { select: { name: true } } } },
      },
    }),
    prisma.requirement.findMany({
      where: { raisedById: personId },
      select: { title: true, status: true, createdAt: true, company: { select: { name: true } } },
    }),
    prisma.timesheet.findMany({
      where: { OR: [{ clientApprovedById: personId }, { employerAcceptedById: personId }] },
      select: {
        periodStart: true, periodEnd: true, totalHours: true, acceptedHours: true,
        clientApprovedAt: true, employerAcceptedAt: true, clientApprovedById: true,
      },
    }),
    prisma.overtimeDecision.findMany({
      where: { decidedById: personId },
      select: { weekOf: true, treatment: true, decidedAt: true },
    }),
    prisma.classificationCall.findMany({
      where: { decidedById: personId },
      select: { decidedAt: true, position: true, arrangement: true, company: { select: { name: true } } },
    }),
    prisma.supplierRequest.findMany({
      where: { decidedById: personId },
      select: { name: true, state: true, stage: true, decidedAt: true },
    }),
    prisma.legalHold.findMany({
      where: { placedById: personId },
      select: { reason: true, matter: true, placedAt: true, liftedAt: true },
    }),
    prisma.breach.findMany({
      where: { openedById: personId },
      select: { summary: true, discoveredAt: true, closedAt: true },
    }),
    prisma.censusRequest.findMany({
      where: { workEmail: person.primaryEmail },
      select: {
        companyName: true, contactName: true, desk: true, option: true, status: true,
        createdAt: true, queuePosition: true, assignedStaffEmail: true,
        agreementAcceptedBy: true, agreementAcceptedAt: true, agreementVersion: true,
        filesReceivedAt: true, receivedFileCount: true, receivedBytes: true,
        deliveredAt: true, gapsNote: true,
        deleteBy: true, deletedAt: true, deletionCancelledBecause: true,
        files: { select: { fileName: true, contentType: true, sizeBytes: true, uploadedAt: true, readCount: true } },
      },
    }),
    prisma.agreementSignature.findMany({
      where: { OR: [{ attestedById: personId }, { signerEmail: person.primaryEmail }] },
      select: {
        party: true, signerName: true, signerTitle: true, signerEmail: true,
        signedAt: true, method: true, attestation: true, attestedAt: true,
      },
    }),
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
      'A seat at a company, and what was decided from it': {
        seats: seats.map((c) => ({
          company: c.company?.name ?? 'no company',
          role: c.role?.name ?? 'no role',
          permissions: c.role?.permissions ?? [],
          kind: c.type, side: c.side, reach: c.persona,
          whyItWasGranted: c.grantReason, granted: c.grantedAt, lastUsed: c.lastUsedAt,
          paused: c.suspendedAt, ended: c.revokedAt, endedBecause: c.revokeReason,
        })),
        requisitionsRaised: raised.map((r) => ({
          role: r.title, client: r.company.name, raised: r.createdAt, where: r.status,
        })),
        approvalsGiven: approvals.map((a) => ({
          role: a.requirement.title, client: a.requirement.company.name,
          desk: a.stage, decision: a.outcome, reason: a.reason, decided: a.decidedAt,
        })),
        weeksSignedOff: signedWeeks.map((t) => ({
          week: t.periodStart, to: t.periodEnd,
          hours: Number(t.totalHours), accepted: t.acceptedHours ? Number(t.acceptedHours) : null,
          as: t.clientApprovedById === personId ? 'signed by the client' : 'accepted by the employer',
          at: t.clientApprovedById === personId ? t.clientApprovedAt : t.employerAcceptedAt,
          note: 'The week is here; the person who worked it is not. Their hours are in their own file.',
        })),
        overtimeCalls: overtimeCalls.map((o) => ({ week: o.weekOf, treatment: o.treatment, decided: o.decidedAt })),
        positionsTakenAboutSomebodyElse: classedOthers.map((c) => ({
          company: c.company.name, position: c.position, arrangement: c.arrangement, decided: c.decidedAt,
        })),
        suppliersDecided: supplierDecisions,
        legalHoldsPlaced: holdsPlaced,
        incidentsOpened: breachesOpened,
        agreementsSigned: signatures,
      },
      'A contractor census': censuses.map((c) => ({
        ...c,
        note:
          'What you sent us before you were a customer, and what we did with it. The files ' +
          'are named rather than pasted in. They are deleted on the date shown, whether or ' +
          'not you ask; what stays after that is the count and the day, which is how we ' +
          'prove we deleted them when we said we would.',
      })),
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
    // The categories are the union of every population this person is
    // in, and the tone is the single audience the letter is written for.
    // An integrator's own W2 is both, and a letter listing only one half
    // promises a fate for half of what is held about him.
    const mine = categoriesHeldAbout(await audiencesOf(input.subjectPersonId))
    await tellSubject(input.subjectPersonId, (person) =>
      erasureReceivedNotice({
        person,
        reference: reference(row.id),
        requestedAt: receivedAt,
        completesOn: runsOn!,
        categories: mine,
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
  const categories = categoriesHeldAbout(await audiencesOf(row.subjectPersonId))

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

/**
 * The one voice a letter is written in.
 *
 * Which categories a person is shown is `audiencesOf`, and can be both.
 * A letter still has to pick one register to speak in, and a person with
 * a seat is addressed as a business user because that is the inbox it
 * arrives in.
 */
async function audienceOf(personId: string): Promise<Audience> {
  return (await audiencesOf(personId)).includes('business') ? 'business' : 'candidate'
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
  /** Censuses whose promised day came tonight and whose files are gone. */
  censusDeleted: number
  /** Censuses three days out with the page still unsent. */
  censusWarned: number
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
    censusDeleted: 0, censusWarned: 0,
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

  // ── The censuses whose promised day has come ───────────────────────

  const census = await runCensusSweep(now)
  outcome.censusDeleted = census.deleted
  outcome.censusWarned = census.warned

  return outcome
}

// ─────────────────────────────────────────────────────────────────────
// The census branch
// ─────────────────────────────────────────────────────────────────────

/**
 * What the nightly sweep does with a contractor census.
 *
 * A client sent us their own file before they were a customer, and the
 * agreement they accepted by name says the day it goes. That date is on
 * their confirmation, on the page we sent them and in this function, and
 * it is one column — `CensusRequest.deleteBy` — because three places
 * that each computed it would eventually disagree and the client would
 * be the one to find out.
 *
 * `censusSweep` in `lib/census` decides; this reads the rows and does
 * what it says. Two things happen and they are different in kind:
 *
 *   — a census past its day, with no program started, is **deleted**
 *     with nobody asked, because a written agreement said the day had
 *     come. Nothing puts it back.
 *   — a census three days out whose page has not gone **warns the named
 *     person**, because data deleted before the client ever saw their
 *     page is the failure this whole design exists to prevent.
 *
 * ── The automation rows this cannot write ────────────────────────────
 *
 * `AutomationLog.companyId` is a required foreign key. A census's only
 * company is the sandbox its rows were imported into — and the deletion
 * destroys that sandbox, so a row written against it would cascade away
 * at the exact moment somebody audits whether we deleted on the day we
 * said. `CENSUS_DELETED` therefore stays in `PLANNED` in `lib/autonomy`
 * and the record is the `CensusRequest` row itself: `deletedAt`, the
 * status, and the file count and byte total kept on purpose so that the
 * day after a deletion we can still say what went. Staff are told in the
 * same act. `companyId String?` is the one-word fix and is a schema
 * request for the architect.
 */
export interface CensusSweepOutcome {
  deleted: number
  warned: number
}

export async function runCensusSweep(now = new Date()): Promise<CensusSweepOutcome> {
  const startOfDay = new Date(now.getTime() - 86_400_000)

  const rows = await prisma.censusRequest.findMany({
    where: { deletedAt: null, status: { notIn: ['DELETED', 'PROGRAM_STARTED'] }, deleteBy: { not: null } },
    select: {
      id: true, companyName: true, contactName: true, workEmail: true, status: true,
      deleteBy: true, deletedAt: true, assignedStaffEmail: true,
      receivedFileCount: true, receivedBytes: true, sandboxCompanyId: true,
    },
    orderBy: { deleteBy: 'asc' },
  })
  if (rows.length === 0) return { deleted: 0, warned: 0 }

  // Who was already told tonight. The warning is written as a
  // notification to the named person, so the notification is both the
  // telling and the memory of it — "once a day, not once a run".
  //
  // Where the assigned address has no `Person` row — staff are an
  // address and need no seat anywhere — there is nothing to write a
  // notification against and nothing to read back, so that census warns
  // once per run rather than once per day. In production the run is
  // nightly and the two are the same; said out loud because they are not
  // the same thing. `CensusRequest.lastWarnedAt`, the column `Breach`
  // already has, would close it.
  const owners = new Map<string, string>()
  const addresses = [...new Set(rows.map((r) => r.assignedStaffEmail).filter((a): a is string => !!a))]
  if (addresses.length > 0) {
    const people = await prisma.person.findMany({
      where: { primaryEmail: { in: addresses } },
      select: { id: true, primaryEmail: true },
    })
    for (const p of people) owners.set(p.primaryEmail.toLowerCase(), p.id)
  }

  const toldTonight = new Set<string>()
  if (owners.size > 0) {
    const already = await prisma.notification.findMany({
      where: {
        personId: { in: [...owners.values()] },
        entityId: { in: rows.map((r) => r.id) },
        createdAt: { gte: startOfDay },
      },
      select: { entityId: true },
    })
    for (const n of already) if (n.entityId) toldTonight.add(n.entityId)
  }

  const input: SweepCensus[] = rows.map((r) => ({
    id: r.id,
    companyName: r.companyName,
    status: r.status as SweepCensus['status'],
    deleteBy: r.deleteBy,
    deletedAt: r.deletedAt,
    receivedFileCount: r.receivedFileCount,
    receivedBytes: r.receivedBytes,
    assignedStaffEmail: r.assignedStaffEmail,
    warnedToday: toldTonight.has(r.id),
  }))

  const plan = censusSweep(now, input)
  const byId = new Map(rows.map((r) => [r.id, r]))

  // ── Deletions ──────────────────────────────────────────────────────

  for (const d of plan.deletions) {
    const row = byId.get(d.requestId)!
    await deleteCensusData(row.id, row.sandboxCompanyId)
    await prisma.censusRequest.update({
      where: { id: row.id },
      data: {
        status: 'DELETED',
        deletedAt: now,
        // Kept deliberately. The row outlives the data because it is the
        // proof we deleted on the day we said, and a count of zero file
        // rows cannot say what went.
        receivedFileCount: row.receivedFileCount,
        receivedBytes: row.receivedBytes,
        sandboxCompanyId: null,
      },
    })
    await tellStaff(`Census deleted: ${row.companyName}`, [
      d.says,
      `Asked for by ${row.contactName} (${row.workEmail}).`,
      `What is left is the row: ${d.fileCount} file${d.fileCount === 1 ? '' : 's'}, ${mb(d.bytes)}, ` +
        `deleted on ${day(now)}.`,
    ].join('\n\n'))
  }

  // ── Warnings ───────────────────────────────────────────────────────

  for (const w of plan.warnings) {
    const row = byId.get(w.requestId)!
    const ownerId = w.owner ? owners.get(w.owner.toLowerCase()) ?? null : null
    if (ownerId) {
      await notify({
        personId: ownerId,
        type: 'SYSTEM',
        title: `${row.companyName}'s census data goes in ${w.daysLeft} day${w.daysLeft === 1 ? '' : 's'}`,
        body: w.says,
        entityId: row.id,
        channel: 'EMAIL',
      })
    }
    // Staff hear either way. A census whose named person has no account
    // here is the case the notification cannot reach, and it is exactly
    // the census most likely to be forgotten.
    await tellStaff(
      `Census clock: ${row.companyName}, ${w.daysLeft} day${w.daysLeft === 1 ? '' : 's'} left`,
      w.says
    )
  }

  return { deleted: plan.deletions.length, warned: plan.warnings.length }
}

/**
 * Tear down everything a census put in the database, in the order
 * `DELETION_ORDER` in `lib/census` sets out.
 *
 * The files first, because they are the client's actual data and the
 * thing the promise is about. Then the rows `lib/census-import` made
 * from them — one person per reference number, one seat, one sell
 * contract, a site per location and a company per supplier name — and
 * then the sandbox company itself, which held nothing else.
 *
 * Read against `lib/census-import` rather than guessed: that file is the
 * only thing that writes into a sandbox, and this deletes exactly what
 * it creates. Nothing cascades from `Company` or `Person` onto a
 * `SellContract`, so the order matters and a shortcut here leaves a
 * client's rate in the database after we told them it was gone.
 *
 * The `AccessLog` rows recording who read those contractors go with the
 * contractors, because they cascade from the person they are about.
 * That is the right way round: the trail exists to say who read somebody
 * and there is no longer a somebody.
 */
export async function deleteCensusData(requestId: string, sandboxCompanyId: string | null): Promise<void> {
  await prisma.censusFile.deleteMany({ where: { requestId } })
  if (!sandboxCompanyId) return

  const sandbox = await prisma.company.findUnique({
    where: { id: sandboxCompanyId },
    select: { id: true, slug: true },
  })
  if (!sandbox) return

  const contracts = await prisma.sellContract.findMany({
    where: { clientCompanyId: sandbox.id },
    select: { personId: true },
  })
  const personIds = [...new Set(contracts.map((c) => c.personId))]

  await prisma.sellContract.deleteMany({ where: { clientCompanyId: sandbox.id } })
  await prisma.requirement.deleteMany({ where: { companyId: sandbox.id } })
  await prisma.companyLocation.deleteMany({ where: { companyId: sandbox.id } })
  if (personIds.length > 0) await prisma.person.deleteMany({ where: { id: { in: personIds } } })
  // One company per supplier name, slugged under the sandbox's own slug
  // by the importer, so they are found by the same rule that made them.
  await prisma.company.deleteMany({
    where: { isCensusSandbox: true, slug: { startsWith: `${sandbox.slug}-s-` } },
  })
  await prisma.company.delete({ where: { id: sandbox.id } })
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
