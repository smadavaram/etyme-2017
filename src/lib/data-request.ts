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
import { hasPermission } from '@/lib/permissions'
import { logAccess } from '@/lib/access-log'
import { seatFor, seatTrail, noSeatYet, type LiveSeat } from '@/lib/program-seat'
import { seatMayRead } from '@/lib/walls'
import type { CallerContext } from '@/lib/api-context'
import { notify } from '@/lib/notify'
import { tellStaff } from '@/lib/alerts'
import { emailSender } from '@/lib/senders'
import { daysOnSite } from '@/lib/tenure-days'
import {
  categoriesFor, NOT_IN_AN_EXPORT,
  exportReadyNotice, erasureReceivedNotice, erasureCompleteNotice, erasureHolderNotice,
} from '@/lib/notify/data-rights'
import { breachClockWarning } from '@/lib/notify/breach'
import {
  censusClockStaffNotice, censusDeletedNotice, type CensusStaffNotice,
} from '@/lib/notify/census'
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
 * in its program office" — and that seat landed on 2026-09-20 as
 * `ProgramSeat`, which `lib/program-seat` both writes and reads. What
 * this paragraph used to say — that the table had no writer and no
 * reader, so it was a column rather than a feature — was true when it
 * was typed and is not any more.
 *
 * The framing below is unchanged and still right: a program office
 * reading this page answers for nobody's workforce until it holds a
 * seat, so it is told what is missing rather than shown an empty list
 * that reads as "nobody has asked".
 */
export function deskFraming(
  kind: DeskKind | string,
  companyName: string,
  /**
   * The desk this firm holds in somebody else's program, if any.
   *
   * Only an MSP's sentence changes on it, and it changes completely: the
   * office used to be told the seat "is not built yet", which stopped
   * being true on 2026-09-20 and went on being printed because the
   * framing was picked off the company kind and nothing else. A seated
   * office is told where the client's own queue is instead; an unseated
   * one is told who can grant it one.
   */
  seated?: { clientName: string; roleName: string; permissions: readonly string[] } | null
): DeskFraming {
  // Whether that desk would open the client's queue is decided here
  // rather than by the caller, so the sentence and the gate read the
  // same permission through the same function. An owner's `["*"]` is
  // invisible to a raw `includes`, which is how ten of these were wrong
  // before `owner-permissions` started failing the build on them.
  const mayReadQueue = seated ? hasPermission(seated.permissions, 'privacy.manage') : false
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
        missing: seated
          ? mayReadQueue
            ? `This page is ${companyName}’s own. ${seated.clientName} has also seated ` +
              `${companyName} at its ${seated.roleName} desk, and a request from one of ` +
              `${seated.clientName}’s contractors belongs to ${seated.clientName}’s queue rather ` +
              `than this one — name that program to open it, and every read there is logged ` +
              'against the seat.'
            : `This page is ${companyName}’s own. ${seated.clientName} has seated ${companyName} ` +
              `at its ${seated.roleName} desk, and that desk does not read data requests — a ` +
              `request from one of ${seated.clientName}’s contractors is answered from ` +
              `${seated.clientName}’s own compliance desk. An owner or the program manager there ` +
              `can seat ${companyName} at a desk that reads it.`
          : `${companyName} runs somebody else's program and places nobody, so nothing here ` +
            'ties it to a client. A request from one of a client’s contractors is answered ' +
            `by that client’s own compliance desk, and reading one from here needs a desk in ` +
            `the client’s program office — granted by the client, the way it grants one to ` +
            `its own people. No client has granted ${companyName} one yet: ask an owner or the ` +
            'program manager at that client. So this page shows ' +
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
 * ── Writing to somebody who has no account here ──────────────────────
 *
 * Every other letter in this product is addressed by `notify`, which
 * needs a `Person`. A census contact is not one and must not become one:
 * they typed their name into a page with no login behind it, nothing
 * about them is verified, and creating a person row from an
 * unauthenticated form is how a database fills up with names somebody
 * typed. So the letters `lib/notify/census` builds carry their own `to`,
 * and this is the one place that reads it.
 *
 * `emailSender()` is the only route to an address with no account behind
 * it. Where none is configured the letter does not vanish: it is handed
 * to staff as an instruction — "Send to dana@…: Your census files
 * arrived" with the letter under it — which is the pattern the erasure
 * completion letter already uses for a tombstoned address. A deployment
 * with no key then produces somebody's job rather than a silent drop,
 * and the client is still written to by a human.
 *
 * The send is awaited rather than fired and forgotten. Elsewhere that is
 * the right trade — a notification is cheap and a request should not
 * wait on it — but a census runs at a handful a week and the whole
 * design is a promise about a file somebody entrusted to us. A serverless
 * function that froze before an un-awaited promise resolved would drop
 * the one letter carrying the upload link, and nobody would know.
 */
export interface CensusLetterSent {
  /** The address it was written to, off the census row. */
  to: string
  subject: string
  /** True only where a sender actually took it. Never optimistic. */
  sent: boolean
  /** What staff were asked to do instead. Null where it left. */
  staffInstruction: string | null
  /** Why it did not leave, in words. Null where it did. */
  note: string | null
}

/** Where another census is asked for. The public page, no login behind it. */
export function censusAskUrl(): string {
  return `${baseUrl()}/census`
}

/** The one page somebody at the client accepts by name. */
export function censusAgreementUrl(): string {
  return `${baseUrl()}/legal/census-agreement`
}

/**
 * Where the files go.
 *
 * **The dependency this has on a screen that does not read it yet.**
 * `app/census` is one page holding the token in its own state and
 * nothing in it reads `?token=`, which its own comment says out loud:
 * "the letter carrying the upload link is etyme-conversation's and is
 * not built." It is built now and this is the address it names, so the
 * page has to pick the token up and open at the upload step. Until it
 * does, somebody following this link lands on step one. Reported to
 * etyme-market rather than fixed here: `app/census` is theirs.
 */
export function censusUploadUrl(token: string): string {
  return `${baseUrl()}/census?token=${encodeURIComponent(token)}`
}

/**
 * Where the named person at Etyme works it from.
 *
 * The API route, because there is no staff screen for a census yet and a
 * link to a page that does not exist is worse than a link to JSON a
 * staff person can actually open. When the screen lands this points at
 * it and nothing else changes.
 */
export function censusReviewUrl(requestId: string): string {
  return `${baseUrl()}/api/census/review?id=${encodeURIComponent(requestId)}`
}

/** One letter to a census contact, and an honest answer about it. */
export async function sendCensusLetter(letter: Notice): Promise<CensusLetterSent> {
  const to = letter.to
  if (!to) {
    // Every client census letter sets `to`, because there is nobody here
    // to look up. One with none is a bug in the letter, not a send.
    return {
      to: '',
      subject: letter.subject,
      sent: false,
      staffInstruction: null,
      note: 'The letter named no address, so there was nowhere to send it.',
    }
  }

  const instruction = `Send to ${to}: ${letter.subject}`
  const handToStaff = async (why: string): Promise<CensusLetterSent> => {
    await tellStaff(
      instruction,
      `This letter has to go to ${to} and the product could not send it: ${why}\n\n` +
        'They have no account here — a census is asked for before anybody is a customer — so ' +
        'there is no other way to reach them.\n\n' +
        letter.body
    )
    return { to, subject: letter.subject, sent: false, staffInstruction: instruction, note: why }
  }

  const sender = emailSender()
  if (!sender) {
    return handToStaff(
      'no email sender is configured (NOTIFY_FROM_EMAIL with RESEND_API_KEY or SENDGRID_API_KEY).'
    )
  }

  try {
    await sender.send(to, letter.subject, letter.body)
    return { to, subject: letter.subject, sent: true, staffInstruction: null, note: null }
  } catch (err) {
    return handToStaff(`the email sender refused — ${String((err as Error)?.message ?? err).slice(0, 160)}.`)
  }
}

/**
 * One letter to the named person at Etyme, and to the staff channel.
 *
 * The notification is the telling *and* the memory: `entityId` carries
 * the census id, which is what the sweep reads back to warn once a night
 * rather than once a run. Staff hear as well either way, because a
 * census whose named person holds no `Person` row — staff are an address
 * and need no seat anywhere — is exactly the census most likely to be
 * forgotten.
 */
export async function sendCensusStaffLetter(
  letter: CensusStaffNotice,
  assignedTo: string | null
): Promise<{ toldByName: boolean }> {
  let toldByName = false
  if (assignedTo) {
    const person = await prisma.person.findFirst({
      where: { primaryEmail: assignedTo },
      select: { id: true },
    })
    if (person) {
      await notify({
        personId: person.id,
        type: 'SYSTEM',
        title: letter.subject,
        body: letter.body,
        entityId: letter.entityId,
        channel: 'EMAIL',
      })
      toldByName = true
    }
  }
  await tellStaff(letter.subject, letter.body)
  return { toldByName }
}


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
 * ── The automation rows, which can now be written ────────────────────
 *
 * `AutomationLog.companyId` was a required foreign key until
 * 2026-09-20, and a census's only company is the sandbox its rows were
 * imported into — which the deletion destroys, so a row written against
 * it would have cascaded away at the exact moment somebody audits
 * whether we deleted on the day we said. `companyId String?` landed, so
 * both acts here write a row with **no company on it**: an act of the
 * platform, before or outside any tenant, which is what a null company
 * now means. The row survives the sandbox because it never pointed at
 * it.
 *
 * The `CensusRequest` row is still the primary record — `deletedAt`,
 * the status, and the file count and byte total kept on purpose so the
 * day after a deletion we can still say what went. The log row is the
 * sentence beside it.
 *
 * ── And the client is told, on both ──────────────────────────────────
 *
 * The deletion letter goes to the address on the row, because "the
 * client is told the day it ran" is the brief's own line and a promise
 * kept where nobody can see it is indistinguishable from one broken.
 * The clock warning goes to the named person here and never to the
 * client: it is our lateness, not theirs.
 */
export interface CensusSweepOutcome {
  deleted: number
  warned: number
  /** One per client letter this run tried to send, said honestly. */
  letters: CensusLetterSent[]
}

export async function runCensusSweep(now = new Date()): Promise<CensusSweepOutcome> {
  const startOfDay = new Date(now.getTime() - 86_400_000)

  const rows = await prisma.censusRequest.findMany({
    where: { deletedAt: null, status: { notIn: ['DELETED', 'PROGRAM_STARTED'] }, deleteBy: { not: null } },
    select: {
      id: true, companyName: true, contactName: true, workEmail: true, status: true,
      deleteBy: true, deletedAt: true, assignedStaffEmail: true,
      receivedFileCount: true, receivedBytes: true, sandboxCompanyId: true,
      // Read rather than inferred from the status. A census can reach
      // its day as DELIVERED or as IN_REVIEW, and the deletion letter
      // says a different last line for each — "your page stays exactly
      // as it was sent" against "no page was ever sent from it". A
      // status is a state; whether a page went is a date, and the date
      // is the only thing that knows.
      deliveredAt: true,
      lastWarnedAt: true,
    },
    orderBy: { deleteBy: 'asc' },
  })
  if (rows.length === 0) return { deleted: 0, warned: 0, letters: [] }

  // Who was already warned tonight — read off `CensusRequest.lastWarnedAt`
  // and nothing else.
  //
  // This used to count the notifications written against the census id
  // since the start of the day, and that was wrong in a way nothing
  // caught until a second letter existed: the named person is now told
  // when a census *arrives* as well, on the same `entityId`, so an
  // arrival silenced the clock for the rest of that day. A memory that
  // remembers the wrong event is worse than none, because it fails quiet
  // and it fails on the census closest to its date.
  //
  // `lastWarnedAt` landed on 2026-09-20, the column `Breach` already
  // had, and it means exactly one thing: when the clock warning last
  // went out. It also closes the case the notification never could —
  // staff are an address and need no seat anywhere, so a census whose
  // named person holds no `Person` row had nothing to read back at all
  // and warned once a run rather than once a night.
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
  for (const r of rows) if (r.lastWarnedAt && r.lastWarnedAt >= startOfDay) toldTonight.add(r.id)

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

  const letters: CensusLetterSent[] = []

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

    await prisma.automationLog.create({
      data: {
        companyId: null,
        action: 'CENSUS_DELETED',
        summary: d.says,
        reason:
          'The day on the agreement the client accepted by name came, and no program started. Nobody ' +
          'was asked, because the date was agreed in writing before the file was sent. The row carries ' +
          'no company on purpose: the sandbox their rows sat in has just been destroyed, and a record ' +
          'of the deletion that went with it would prove nothing.',
        payload: {
          requestId: row.id,
          companyName: row.companyName,
          fileCount: d.fileCount,
          bytes: d.bytes,
          dueOn: row.deleteBy ? row.deleteBy.toISOString() : null,
          deletedAt: now.toISOString(),
          pageDelivered: row.deliveredAt !== null,
        },
        // Nothing puts a deleted file back, and saying otherwise here
        // would be the one lie this whole design exists to prevent.
        reversible: false,
      },
    })

    // The client hears on the day, which is the whole of the promise.
    // Every figure in the letter is the row's own — the count and the
    // bytes kept precisely so this sentence survives the files, and
    // `deliveredAt` read rather than guessed from the status, because
    // whether a page ever went changes what is left to say.
    letters.push(await sendCensusLetter(censusDeletedNotice({
      contact: { name: row.contactName, workEmail: row.workEmail },
      companyName: row.companyName,
      assignedTo: row.assignedStaffEmail,
      count: row.receivedFileCount,
      bytes: row.receivedBytes,
      deletedAt: now,
      pageDelivered: row.deliveredAt !== null,
      askAgainUrl: censusAskUrl(),
    })))
  }

  // ── Warnings ───────────────────────────────────────────────────────

  for (const w of plan.warnings) {
    const row = byId.get(w.requestId)!
    const ownerId = w.owner ? owners.get(w.owner.toLowerCase()) ?? null : null

    // `censusSweep` builds its own sentence for the plan and this is the
    // letter the person reads. Both are built from the same two facts —
    // the row's `deleteBy` and the days left the plan counted — and
    // neither computes a date of its own.
    const letter = censusClockStaffNotice({
      censusId: row.id,
      companyName: row.companyName,
      daysLeft: w.daysLeft,
      deleteBy: row.deleteBy!,
      status: row.status === 'RECEIVED' ? 'RECEIVED' : 'IN_REVIEW',
      assignedTo: row.assignedStaffEmail,
      reviewUrl: censusReviewUrl(row.id),
    })

    if (ownerId) {
      await notify({
        personId: ownerId,
        type: 'SYSTEM',
        title: letter.subject,
        body: letter.body,
        // The memory as well as the telling. Read back at the top of the
        // next run, so a census warns once a night and not once a run.
        entityId: letter.entityId,
        channel: 'EMAIL',
      })
    }
    // Staff hear either way. A census whose named person has no account
    // here is the case the notification cannot reach, and it is exactly
    // the census most likely to be forgotten.
    await tellStaff(letter.subject, letter.body)

    // The other half of the memory, and the half that works where the
    // named person holds no account. Stamped after the telling, so a
    // failure to tell does not leave a census marked as told.
    await prisma.censusRequest.update({
      where: { id: row.id },
      data: { lastWarnedAt: now },
    })

    await prisma.automationLog.create({
      data: {
        companyId: null,
        action: 'CENSUS_CLOCK_WARNED',
        summary: w.says,
        reason:
          'The date the client holds in writing is close and their page has not gone. It deletes ' +
          'nothing, sends the client nothing and writes no page — the whole act is telling the person ' +
          'who owns it, once a night rather than once a run.',
        payload: {
          requestId: row.id,
          companyName: row.companyName,
          daysLeft: w.daysLeft,
          deleteBy: row.deleteBy ? row.deleteBy.toISOString() : null,
          toldByName: ownerId !== null,
        },
        // A warning that has gone out cannot be taken back, and nothing
        // about the census itself moved.
        reversible: false,
      },
    })
  }

  return { deleted: plan.deletions.length, warned: plan.warnings.length, letters }
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

// ── The privacy desk, opened from a seat a client granted ─────────────
//
// The three compliance routes — the queue of data requests, the legal
// holds, the breach register — are all "this company's own book", scoped
// to `caller.company.id`. A program office that runs a client's program
// has two books, not one: its own staff's requests, and the requests of
// the client's contractors, which belong to the client.
//
// So the seat is asked for explicitly here rather than assumed. Naming
// no client reads the caller's own desk, exactly as before, because an
// office's own staff still have their own rights and silently swapping
// their queue for a client's would lose them. Naming a client opens that
// client's book, and only from a seat the client granted.
//
// ── Why the gate is the privacy permission and not the governance read ─
//
// For a company's own staff, reading the queue asks only for
// `governance.read`, because refusing the very desk the page is named
// for is worse than a refusal (CLAUDE.md). That reasoning does not carry
// across a company boundary. A program office reading this book is
// reading requests made by people who are not its own, about records it
// does not hold, at a company it is a guest of — which is the narrow act
// `privacy.manage` exists to name. A client that wants its office to do
// that seats it at its Compliance Officer desk, which holds the
// permission; a client that seats it at Program Manager has decided it
// should not, and the refusal says so in the client's own terms.

export type PrivacyDesk =
  | {
      ok: true
      /** Whose book is being read — the caller's own, or the client's. */
      companyId: string
      companyName: string
      /** Null when the caller is reading their own company's book. */
      seat: LiveSeat | null
      /** The caller as they act inside the seat, or unchanged. */
      acting: CallerContext
    }
  | { ok: false; status: number; says: string }

/**
 * Which compliance book this caller may open, and what they are told
 * when the answer is none.
 *
 * `what` is the book in the reader's own words — "data requests", "legal
 * holds", "the breach register" — so the refusal names what was refused.
 */
export async function privacyDesk(
  caller: CallerContext,
  requestedClientId: string | null,
  what: string
): Promise<PrivacyDesk> {
  const company = caller.company
  if (!company) {
    return {
      ok: false,
      status: 403,
      says: 'A compliance desk belongs to a company, and this seat has none.',
    }
  }

  // Nobody named, or the caller's own company named: their own book,
  // unchanged. A client is never in a seat at itself.
  if (!requestedClientId || requestedClientId === company.id || company.kind === 'CLIENT') {
    if (requestedClientId && requestedClientId !== company.id) {
      return {
        ok: false,
        status: 403,
        says:
          `${company.name} runs its own program from its own desks, so this page is its own book. ` +
          'A seat is for a firm that is not the client.',
      }
    }
    return { ok: true, companyId: company.id, companyName: company.name, seat: null, acting: caller }
  }

  const seat = await seatFor(caller, requestedClientId)
  if (!seat) return { ok: false, status: 403, says: noSeatYet(company.name) }

  const verdict = seatMayRead(seat, 'privacy.manage', what)
  if (!verdict.ok) return { ok: false, status: 403, says: verdict.says! }

  return {
    ok: true,
    companyId: seat.clientCompany.id,
    companyName: seat.clientCompany.name,
    seat,
    acting: { ...caller, permissions: seat.role.permissions, orgUnitId: seat.orgUnitId },
  }
}

/**
 * The seat a firm holds somewhere, for the sentence on its own desk.
 *
 * Read with no client named, so it answers "do you hold one at all" —
 * which is the only thing the framing sentence needs to know.
 */
export async function seatHeldAnywhere(caller: CallerContext): Promise<LiveSeat | null> {
  if (!caller.company || caller.company.kind === 'CLIENT') return null
  return seatFor(caller, null)
}

/** Re-exported so the three routes have one import for the whole subject. */
export { seatTrail }
