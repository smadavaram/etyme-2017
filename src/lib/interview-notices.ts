import { prisma } from '@/lib/db'
import { notifyBulk, type NotifyParams } from '@/lib/notify'

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
 * (the integration walk pins "CloudEPA can see she is interviewing
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
  /** The reader's timezone is unknown here; the route can pass the requester's. */
  timezone?: string
}

function whenSaid(when: Date | null, tz?: string): string {
  if (!when) return ''
  try {
    return when.toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      ...(tz ? { timeZone: tz } : {}),
    })
  } catch {
    return when.toISOString()
  }
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
  const toVendorStaff = (title: string, body: string) =>
    c.vendorStaffIds.forEach((personId) => add({ personId, companyId: c.vendor.id, type: 'INTERVIEW', title, body }))
  const toRequester = (title: string, body: string) =>
    add({ personId: c.requesterId, companyId: c.client.id, type: 'INTERVIEW', title, body })
  const toConsultant = (title: string, body: string) =>
    add({ personId: c.consultant.id, companyId: c.vendor.id, type: 'INTERVIEW', title, body, channel: 'EMAIL' })

  const round = `round ${c.round}`
  const at = whenSaid(c.when, c.timezone)

  switch (event) {
    case 'PROPOSED':
      toVendorStaff(
        `${c.client.name} wants to interview ${c.consultant.name}`,
        `${c.stage}, ${round}, for ${c.role}. ${c.slotCount === 1 ? 'One time' : `${c.slotCount} times`} offered — confirm one, or confirm for ${c.consultant.name.split(' ')[0]} if they have told you.`
      )
      toConsultant(
        `${c.client.name} would like to interview you`,
        `${c.stage}, ${round}, for ${c.role}. ${c.slotCount === 1 ? 'One time' : `${c.slotCount} times`} offered — pick one on your page, or tell ${c.vendor.name}.`
      )
      break
    case 'CONFIRMED':
      toRequester(
        `${c.vendor.name} confirmed ${c.consultant.name}`,
        `${c.stage}, ${round}, for ${c.role}${at ? ` — ${at}` : ''}.`
      )
      break
    case 'ANSWERED_YES':
      toRequester(`${c.consultant.name} accepted ${round}`, `For ${c.role}${at ? ` — ${at}` : ''}.`)
      toVendorStaff(`${c.consultant.name} accepted ${round} at ${c.client.name}`, `For ${c.role}${at ? ` — ${at}` : ''}. They answered it themselves.`)
      break
    case 'ANSWERED_NO':
      toRequester(`${c.consultant.name} cannot make ${round}`, `For ${c.role}.${c.reason ? ` They said: ${c.reason}` : ''} Offer other times, or ask ${c.vendor.name}.`)
      toVendorStaff(`${c.consultant.name} cannot make ${round} at ${c.client.name}`, `For ${c.role}.${c.reason ? ` They said: ${c.reason}` : ''}`)
      break
    case 'CANCELLED':
      toVendorStaff(`${round} for ${c.consultant.name} at ${c.client.name} is off`, `For ${c.role}.${c.reason ? ` ${c.reason}` : ''}`)
      toConsultant(`Your ${round} with ${c.client.name} is off`, `For ${c.role}.${c.reason ? ` ${c.reason}` : ''} ${c.vendor.name} will be in touch.`)
      toRequester(`${round} for ${c.consultant.name} is off`, `For ${c.role}.${c.reason ? ` ${c.reason}` : ''}`)
      break
    case 'ADVANCED':
      toVendorStaff(`${c.consultant.name} goes through to round ${c.round + 1} at ${c.client.name}`, `For ${c.role}. ${c.client.name} will propose times.`)
      toConsultant(`You are through to round ${c.round + 1} with ${c.client.name}`, `For ${c.role}. They will propose times; ${c.vendor.name} will let you know.`)
      break
    case 'OFFERED':
      toVendorStaff(`${c.client.name} is making ${c.consultant.name} an offer`, `After ${round} for ${c.role}. The award follows from the submission.`)
      break
    case 'REJECTED':
      // The outcome, never the notes. The supplier tells the candidate.
      toVendorStaff(`${c.consultant.name} is not going forward at ${c.client.name}`, `After ${round} for ${c.role}. Please let ${c.consultant.name.split(' ')[0]} know.`)
      break
    case 'NO_SHOW': {
      const who = c.noShowBy === 'CONSULTANT' ? c.consultant.name : c.noShowBy === 'VENDOR' ? c.vendor.name : c.client.name
      if (c.noShowBy !== 'CLIENT') toRequester(`Nobody came to ${round} for ${c.consultant.name}`, `${who} did not turn up for ${c.role}.`)
      if (c.noShowBy !== 'VENDOR') toVendorStaff(`${round} for ${c.consultant.name} at ${c.client.name}: no show`, `${who} did not turn up for ${c.role}.`)
      break
    }
  }
  return out
}

/** The context, read once from the round and its submission. */
export async function noticeContextFor(interviewId: string): Promise<NoticeContext | null> {
  const row = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      id: true, round: true, stage: true, scheduledAt: true, proposedSlots: true,
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
          person: { select: { id: true, name: true } },
          requirement: { select: { title: true } },
        },
      },
    },
  })
  if (!row) return null
  const requester = await prisma.person.findUnique({ where: { id: row.requestedById }, select: { timezone: true } })
  return {
    interviewId: row.id,
    submissionId: row.submission.id,
    round: row.round,
    stage: row.stage,
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
    timezone: requester?.timezone ?? undefined,
  }
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
