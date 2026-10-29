import { prisma } from '@/lib/db'
import { notifyBulk, type NotifyParams } from '@/lib/notify'
import { isZone, timeFor } from '@/lib/interviews'

export { timeFor }

/**
 * Who is told what, when a round moves.
 *
 * Three diaries, and until now none of them heard from the other two.
 * A client proposed a round and the supplier found out by opening the
 * app; the candidate answered and the note went to — the candidate. So
 * this is the one list of who hears about each event, in what words, on
 * which channel, and both routes that move a round call it.
 *
 * ── The rules ────────────────────────────────────────────────────────
 *
 * The supplier's people hear in the app; business users live on Teams
 * and the bell. The candidate is a person, not a firm, and CLAUDE.md
 * gives them email — so the candidate's notice leaves the building.
 *
 * The client's notes stay the client's. The supplier is told the
 * outcome of a round — through, an offer, not going forward — and never
 * the feedback behind it; that is between the client and its own file
 * (the integration walk pins "Techpeple can see she is interviewing
 * without seeing Adobe's notes"). A rejection reaches the candidate
 * through their supplier, the way the trade does it, not from us.
 *
 * Nobody is told twice: a requester who is also on the supplier's
 * staff list (it happens, on a GSI) gets one row.
 */

export type InterviewEvent =
  | 'PROPOSED'      // the client asked for a round
  | 'CONFIRMED'     // the supplier confirmed (for itself, or for the candidate)
  | 'ANSWERED_YES'  // the candidate accepted a time themselves
  | 'ANSWERED_NO'   // the candidate cannot make it
  | 'CANCELLED'     // somebody called it off
  | 'ADVANCED'      // the client: through to the next round
  | 'OFFERED'       // the client: making an offer
  | 'REJECTED'      // the client: not going forward
  | 'NO_SHOW'       // somebody did not turn up

export interface NoticeContext {
  interviewId: string
  submissionId: string
  round: number
  stage: string
  /** The requirement's title — what the round is for. */
  role: string
  consultant: { id: string; name: string }
  client: { id: string; name: string }
  vendor: { id: string; name: string }
  /** The person at the client who asked for the round. */
  requesterId: string
  /** Active staff seats at the supplier. */
  vendorStaffIds: string[]
  /** How many times were offered (PROPOSED). */
  slotCount: number
  /** The time that stuck, once one has (CONFIRMED / ANSWERED_YES). */
  when: Date | null
  /** The candidate's words when declining; the reason when cancelling. */
  reason: string | null
  /** Who did not turn up (NO_SHOW). */
  noShowBy: 'CLIENT' | 'VENDOR' | 'CONSULTANT' | null
  /**
   * The zone to fall back on for a reader who never set one: the client
   * requester's, because the round was booked in their day. Null or
   * absent means UTC, and the time says so.
   */
  timezone?: string | null
  /**
   * Each reader's own zone, by person id, where they set one. A
   * candidate in Chicago reads the round in Chicago time even though the
   * client booked it from Portland.
   */
  zones?: Record<string, string | null | undefined>
  /** The times offered, for the candidate's own letter (PROPOSED). */
  slots?: Date[]
  /** Where the round has got to once the event landed — CONFIRMED means in all three diaries. */
  state?: string
  /**
   * The firms further down the chain that put this person forward to the
   * supplier, nearest first (`parentSubmission`): a sub-vendor, and the
   * bench firm below it. Each is told of its own person's round, through
   * the firm it sold to, and never the client's notes.
   */
  below?: BelowFirm[]
}

/** A firm below the supplier in a chain: who it is, its seats, and the firm it sold the person to. */
export interface BelowFirm {
  id: string
  name: string
  staffIds: string[]
  soldTo: string
}

/** How many rungs below the supplier are told: a sub-vendor and the bench firm under it, and no further. */
export const BELOW_TOLD = 3

/** "Thursday, Oct 30", in the reader's own day. */
export function dayIn(d: Date, zone: string | null): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: zone ?? 'UTC' })
}

/**
 * What a firm below the supplier reads of its person's round (the Tapin
 * walk, 2026-10-29: Tapin was never told its person had an interview).
 * The round as the client booked it, through the firm the reader sold to,
 * so the firm that will call the person knows before the person asks.
 */
export function belowSays(
  event: InterviewEvent,
  f: { person: string; role: string; client: string; through: string; round: number; firstDay: string | null; slotCount: number; at: string },
): { title: string; body: string } | null {
  const through = f.through !== f.client ? `, through ${f.through}` : ''
  switch (event) {
    case 'PROPOSED': {
      const when = f.firstDay ? ` for ${f.firstDay}${f.slotCount > 1 ? ` or one of ${f.slotCount - 1} other times` : ''}` : ''
      return {
        title: `${possessive(f.person)} interview with ${f.client} for ${f.role} is proposed${when}${through}`,
        body: `Round ${f.round}, for ${f.role}. ${f.through} confirms the time with ${f.client}; tell ${f.through} if ${f.person} cannot make it.`,
      }
    }
    case 'CONFIRMED':
      return {
        title: `${possessive(f.person)} interview with ${f.client} for ${f.role} is booked${f.at ? ` for ${f.at}` : ''}${through}`,
        body: `Round ${f.round}, for ${f.role}${f.at ? `, ${f.at}` : ''}.`,
      }
    case 'CANCELLED':
      return { title: `${possessive(f.person)} round ${f.round} with ${f.client} is off${through}`, body: `For ${f.role}.` }
    case 'OFFERED':
      return {
        title: `${f.client} is making ${f.person} an offer for ${f.role}${through}`,
        body: `After round ${f.round}. ${f.through} places ${f.person} with you when ${f.client} awards the position.`,
      }
    case 'REJECTED':
      return { title: `${f.person} is not going forward at ${f.client} for ${f.role}${through}`, body: `After round ${f.round}.` }
    default:
      return null
  }
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`
}

/** The zone one reader is told a time in: their own, else the fallback, else UTC. */
function zoneOf(c: NoticeContext, personId: string): string | null {
  const own = c.zones?.[personId]
  if (isZone(own)) return own
  return isZone(c.timezone) ? c.timezone : null
}

/** The notices for one event — pure, so the rules can be read as tests. */
export function noticesFor(event: InterviewEvent, c: NoticeContext): NotifyParams[] {
  const out: NotifyParams[] = []
  const seen = new Set<string>()
  const add = (n: NotifyParams) => {
    if (seen.has(n.personId)) return
    seen.add(n.personId)
    out.push({ entityId: c.interviewId, ...n, data: { interviewId: c.interviewId, submissionId: c.submissionId, round: c.round, event, ...(n.data ?? {}) } })
  }
  // A body is a function of the reader's own time where it names one,
  // so each person reads the round in their own day.
  type Body = string | ((at: string) => string)
  const said = (body: Body, personId: string) =>
    typeof body === 'string' ? body : body(c.when ? timeFor(c.when, zoneOf(c, personId)) : '')
  const toVendorStaff = (title: string, body: Body) =>
    c.vendorStaffIds.forEach((personId) => add({ personId, companyId: c.vendor.id, type: 'INTERVIEW', title, body: said(body, personId) }))
  const toRequester = (title: string, body: Body) =>
    add({ personId: c.requesterId, companyId: c.client.id, type: 'INTERVIEW', title, body: said(body, c.requesterId) })
  const toConsultant = (title: string, body: Body) =>
    add({ personId: c.consultant.id, companyId: c.vendor.id, type: 'INTERVIEW', title, body: said(body, c.consultant.id), channel: 'EMAIL' })

  const round = `round ${c.round}`
  // The firm the candidate hears from is the one nearest them: the bottom
  // of the chain where there is one, else the supplier.
  const nearest = c.below && c.below.length ? c.below[c.below.length - 1].name : c.vendor.name
  // The candidate's own clock for the times offered, so the letter can
  // be answered without converting anything.
  const offered = (c.slots ?? []).map((t) => timeFor(t, zoneOf(c, c.consultant.id)))

  // The firms below the supplier, each in its own words, before the
  // supplier's own notices so a seat on both hears the supplier's.
  for (const b of c.below ?? []) {
    for (const personId of b.staffIds) {
      // The person is told as the person, and the client's requester as the client.
      if (c.vendorStaffIds.includes(personId) || personId === c.consultant.id || personId === c.requesterId) continue
      const zone = zoneOf(c, personId)
      const said = belowSays(event, {
        person: c.consultant.name, role: c.role, client: c.client.name, through: b.soldTo, round: c.round,
        firstDay: c.slots && c.slots.length ? dayIn([...c.slots].sort((x, y) => x.getTime() - y.getTime())[0], zone) : null,
        slotCount: c.slotCount, at: c.when ? timeFor(c.when, zone) : '',
      })
      if (said) add({ personId, companyId: b.id, type: 'INTERVIEW', title: said.title, body: said.body })
    }
  }

  switch (event) {
    case 'PROPOSED':
      // The job is in the title: a supplier with three people in rounds at
      // one client reads which job this is from the line alone (handoffs
      // station, 2026-10-20: the greeting said the title and nothing else).
      toVendorStaff(
        `${c.client.name} wants to interview ${c.consultant.name} for ${c.role}`,
        `${c.stage}, ${round}, for ${c.role}. ${c.slotCount === 1 ? 'One time' : `${c.slotCount} times`} offered — confirm one, or confirm for ${c.consultant.name.split(' ')[0]} if they have told you.`
      )
      toConsultant(
        `${c.client.name} would like to interview you for ${c.role}`,
        `${c.stage}, ${round}, for ${c.role}. ${c.slotCount === 1 ? 'One time' : `${c.slotCount} times`} offered${offered.length > 0 ? `: ${offered.join('; ')}` : ''} — pick one on your page, or tell ${nearest}.`
      )
      break
    case 'CONFIRMED':
      toRequester(
        `${c.vendor.name} confirmed ${c.consultant.name}`,
        (at) => `${c.stage}, ${round}, for ${c.role}${at ? ` — ${at}` : ''}.`
      )
      // The supplier confirmed, often on the candidate's behalf. The
      // candidate is the one who has to turn up, so they get the time
      // that stuck, in their own day.
      if (c.when && c.state === 'CONFIRMED') {
        toConsultant(
          `Your ${round} with ${c.client.name} for ${c.role} is booked`,
          (at) => `${c.stage}, for ${c.role} — ${at}. ${c.vendor.name} confirmed it. If you cannot make it, say so on your page.`
        )
      }
      break
    case 'ANSWERED_YES':
      toRequester(`${c.consultant.name} accepted ${round} for ${c.role}`, (at) => `For ${c.role}${at ? ` — ${at}` : ''}.`)
      toVendorStaff(`${c.consultant.name} accepted ${round} at ${c.client.name} for ${c.role}`, (at) => `For ${c.role}${at ? ` — ${at}` : ''}. They answered it themselves.`)
      break
    case 'ANSWERED_NO':
      toRequester(`${c.consultant.name} cannot make ${round}`, `For ${c.role}.${c.reason ? ` They said: ${c.reason}` : ''} Offer other times, or ask ${c.vendor.name}.`)
      toVendorStaff(`${c.consultant.name} cannot make ${round} at ${c.client.name}`, `For ${c.role}.${c.reason ? ` They said: ${c.reason}` : ''}`)
      break
    case 'CANCELLED': {
      // A booked round names the time it was booked for, in each
      // reader's own day, so nobody has to work out which morning they
      // got back (client tester, 2026-10-03).
      const off = (at: string) => `For ${c.role}${at ? `, ${at}` : ''}.${c.reason ? ` ${c.reason}` : ''}`
      toVendorStaff(`Round ${c.round} for ${c.consultant.name} at ${c.client.name} is off`, off)
      toConsultant(`Your ${round} with ${c.client.name} is off`, (at) => `${off(at)} ${nearest} will be in touch.`)
      toRequester(`Round ${c.round} for ${c.consultant.name} is off`, off)
      break
    }
    case 'ADVANCED':
      // The job in the title as well as the body: a candidate in rounds for
      // four jobs at one client read four letters under one subject line
      // (handoffs station, 2026-10-20).
      toVendorStaff(`${c.consultant.name} goes through to round ${c.round + 1} at ${c.client.name} for ${c.role}`, `For ${c.role}. ${c.client.name} will propose times.`)
      toConsultant(`You are through to round ${c.round + 1} with ${c.client.name} for ${c.role}`, `For ${c.role}. They will propose times; ${nearest} will let you know.`)
      break
    case 'OFFERED': {
      // An offer is not a placement. The client places somebody by
      // awarding the position, which writes the contract in the same
      // step, and both readers are told that in those words so nobody
      // mistakes the offer for the start. The candidate hears it from us
      // because they are the person it is about; the terms stay the
      // supplier's to agree with them, so no rate is named.
      const first = c.consultant.name.split(' ')[0]
      toVendorStaff(
        `${c.client.name} is making ${c.consultant.name} an offer`,
        `After ${round} for ${c.role}. ${first} is placed when ${c.client.name} awards the position, which writes the contract in the same step. Nothing is needed from you until then.`
      )
      toConsultant(
        `${c.client.name} is making you an offer`,
        `For ${c.role}, after ${round}. You are placed when ${c.client.name} awards the position. ${c.vendor.name} will be in touch about your start date and terms.`
      )
      break
    }
    case 'REJECTED':
      // The outcome, never the notes. The supplier tells the candidate.
      toVendorStaff(`${c.consultant.name} is not going forward at ${c.client.name}`, `After ${round} for ${c.role}. Please let ${c.consultant.name.split(' ')[0]} know.`)
      break
    case 'NO_SHOW': {
      const who = c.noShowBy === 'CONSULTANT' ? c.consultant.name : c.noShowBy === 'VENDOR' ? c.vendor.name : c.client.name
      if (c.noShowBy !== 'CLIENT') toRequester(`Nobody came to ${round} for ${c.consultant.name}`, `${who} did not turn up for ${c.role}.`)
      if (c.noShowBy !== 'VENDOR') toVendorStaff(`Round ${c.round} for ${c.consultant.name} at ${c.client.name}: no show`, `${who} did not turn up for ${c.role}.`)
      break
    }
  }
  return out
}

/**
 * A round's kind as a person says it: "Technical", never `TECHNICAL`.
 * The column holds the machine's word; every letter and greeting read
 * it raw until the handoffs station read "TECHNICAL, round 1" back.
 */
export function stageWords(stage: string | null | undefined): string {
  const s = (stage ?? '').trim()
  if (!s) return 'Interview'
  const known: Record<string, string> = { SCREEN: 'Screening', SCREENING: 'Screening', TECHNICAL: 'Technical', FINAL: 'Final', CULTURE: 'Culture', BEHAVIORAL: 'Behavioral', MANAGER: 'Hiring manager', HIRING_MANAGER: 'Hiring manager', PANEL: 'Panel' }
  if (known[s.toUpperCase()]) return known[s.toUpperCase()]
  if (s !== s.toUpperCase()) return s
  const words = s.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The context, read once from the round and its submission. */
export async function noticeContextFor(interviewId: string): Promise<NoticeContext | null> {
  const row = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      id: true, round: true, stage: true, state: true, scheduledAt: true, proposedSlots: true,
      requestedById: true, cancelledReason: true, noShowBy: true,
      company: { select: { id: true, name: true } },
      vendor: {
        select: {
          id: true, name: true,
          contexts: {
            where: { revokedAt: null, suspendedAt: null, type: { in: ['EMPLOYEE', 'PARTNER'] } },
            select: { personId: true },
          },
        },
      },
      submission: {
        select: {
          id: true,
          parentSubmissionId: true,
          person: { select: { id: true, name: true } },
          requirement: { select: { title: true } },
        },
      },
    },
  })
  if (!row) return null
  const below = await belowOf(row.submission.parentSubmissionId).catch(() => [] as BelowFirm[])
  // Every reader's own zone, in one read, so each is told the time in
  // their own day.
  const readers = Array.from(new Set([row.requestedById, row.submission.person.id, ...row.vendor.contexts.map((x) => x.personId), ...below.flatMap((b) => b.staffIds)]))
  const people = await prisma.person.findMany({ where: { id: { in: readers } }, select: { id: true, timezone: true } })
  const zones = Object.fromEntries(people.map((p) => [p.id, p.timezone]))
  const slots = (Array.isArray(row.proposedSlots) ? (row.proposedSlots as any[]) : [])
    .map((x) => new Date(x?.start))
    .filter((d) => !Number.isNaN(d.getTime()))
  return {
    interviewId: row.id,
    submissionId: row.submission.id,
    round: row.round,
    stage: stageWords(row.stage),
    role: row.submission.requirement.title,
    consultant: row.submission.person,
    client: row.company,
    vendor: { id: row.vendor.id, name: row.vendor.name },
    requesterId: row.requestedById,
    vendorStaffIds: Array.from(new Set(row.vendor.contexts.map((x) => x.personId))),
    slotCount: Array.isArray(row.proposedSlots) ? (row.proposedSlots as unknown[]).length : 0,
    when: row.scheduledAt,
    reason: row.cancelledReason ?? null,
    noShowBy: (row.noShowBy as NoticeContext['noShowBy']) ?? null,
    timezone: zones[row.requestedById] ?? null,
    zones,
    slots,
    state: row.state,
    below,
  }
}

/**
 * The firms that put the person forward below the supplier, nearest
 * first, walked up `parentSubmission` at most BELOW_TOLD rungs: each
 * firm, the firm it sold to, and its staff seats.
 */
async function belowOf(parentId: string | null): Promise<BelowFirm[]> {
  const out: BelowFirm[] = []
  let next = parentId
  while (next && out.length < BELOW_TOLD) {
    const sub = await prisma.submission.findUnique({
      where: { id: next },
      select: {
        parentSubmissionId: true,
        toCompany: { select: { name: true } },
        fromCompany: {
          select: {
            id: true, name: true,
            contexts: { where: { revokedAt: null, suspendedAt: null, type: { in: ['EMPLOYEE', 'PARTNER'] } }, select: { personId: true } },
          },
        },
      },
    })
    if (!sub) break
    out.push({
      id: sub.fromCompany.id, name: sub.fromCompany.name, soldTo: sub.toCompany.name,
      staffIds: Array.from(new Set(sub.fromCompany.contexts.map((x) => x.personId))),
    })
    next = sub.parentSubmissionId
  }
  return out
}

/**
 * Tell everybody who should hear about it. Fire-and-forget, like notify
 * itself: a slow bell must never hold up the decision that rang it.
 */
export function tell(
  event: InterviewEvent,
  interviewId: string,
  extra: Partial<Pick<NoticeContext, 'reason' | 'when' | 'noShowBy'>> = {}
): Promise<void> {
  return noticeContextFor(interviewId)
    .then((ctx) => {
      if (!ctx) return
      const notices = noticesFor(event, { ...ctx, ...extra })
      return notifyBulk(notices).then(() => undefined)
    })
    .catch((err) => {
      console.error(`[interview-notices] could not tell ${event} for ${interviewId}:`, err)
    })
}

// ── A candidate turned down: their open rounds come off the diaries ────

/** How a submission stopped. Each one leaves any round still open pointless. */
export type TurnedDown = 'NOT_SELECTED' | 'REJECTED' | 'WITHDRAWN'

/** The rounds that have not happened yet and can still be called off. */
const OPEN = ['PROPOSED', 'CONFIRMED'] as const

/**
 * Why the round is off, in one sentence the supplier, the candidate and
 * the client can all read.
 *
 * A rejection reaches the candidate through their supplier, so the
 * REJECTED sentence says the round is off and not why: the candidate
 * still has to know not to turn up, and the supplier is told the
 * outcome on its own.
 */
export function turnedDownReason(how: TurnedDown): string {
  switch (how) {
    case 'NOT_SELECTED':
      return 'The job went to someone else, so this interview is cancelled.'
    case 'WITHDRAWN':
      return 'The candidate was withdrawn, so this interview is cancelled.'
    case 'REJECTED':
      return 'This interview is cancelled.'
  }
}

/**
 * Which of a submission's rounds are called off — pure, so the rule can
 * be read as a test. Only a round not yet held: a round already done,
 * missed or called off is history and is never touched.
 */
export function openRounds<T extends { state: string }>(rounds: T[]): T[] {
  return rounds.filter((r) => (OPEN as readonly string[]).includes(r.state))
}

/**
 * Call off every open round for one submission, and tell everybody who
 * would have been in the room — the supplier's desks in the app, the
 * candidate by email, the client who asked for it — in the same words
 * the round now carries.
 *
 * The client tester placed somebody and the other candidates' rounds
 * stayed "In all three diaries". Whatever turns a candidate down calls
 * this after its own write; a second call finds nothing open and tells
 * nobody twice. Resolves to the rounds it called off.
 */
export async function cancelRoundsFor(
  submissionId: string,
  reason: string,
  now: Date = new Date()
): Promise<string[]> {
  const rounds = await prisma.interview.findMany({
    where: { submissionId, state: { in: [...OPEN] } },
    select: { id: true, state: true },
  })
  const open = openRounds(rounds)
  if (open.length === 0) return []

  // Guarded on the state again, so two callers racing call a round off
  // once and only the one that did tells anybody.
  const done: string[] = []
  for (const r of open) {
    const hit = await prisma.interview.updateMany({
      where: { id: r.id, state: { in: [...OPEN] } },
      data: { state: 'CANCELLED', cancelledAt: now, cancelledReason: reason },
    })
    if (hit.count > 0) done.push(r.id)
  }
  if (done.length === 0) return []

  // Called off because a person decided the submission, so it is
  // recorded on that decision's own log row, the way the award records
  // the rounds it calls off: the caller puts these ids in its payload.
  // Nothing here is the system acting on its own.
  await Promise.all(done.map((id) => tell('CANCELLED', id, { reason })))
  return done
}
