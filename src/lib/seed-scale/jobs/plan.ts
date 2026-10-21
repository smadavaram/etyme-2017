/**
 * The generated world's jobs, decided without the database (etyme-demand).
 *
 * Each client's year of job requests, in the trade's words: the ones it
 * filled (one for every line the people's careers say somebody worked
 * there, grouped by role and month), the ones it closed or called off,
 * the ones published and being worked today, and a few waiting on a
 * named person. Behind each: the approval chain one row per step, the
 * invitation to each supplier on the client's panel with that supplier's
 * own band, the people put forward and the interviews they sat.
 *
 * Pure, like the frame: the same frame and the same people give the same
 * rows with the same ids, so `index.ts` writes only what is missing and a
 * second seeding writes nothing (docs/seed-scale-brief.md, section 4.1).
 *
 * The rules this file holds, each read by a test:
 * - Every skill on a job is a string from its industry's closed list
 *   (`lib/seed-scale/industries`), so the three matchers find the
 *   generated people who hold it.
 * - A supplier's band is on its invitation (`payMin`, `payMax`), drawn
 *   from money's `bandFor`, and never on the job. The job carries the
 *   client's own ceiling, which no supplier is shown
 *   (`lib/invitation-visibility`).
 * - Most jobs publish themselves within plan; the rest wait on HR,
 *   Procurement or the lead, by name. Nobody signs their own: every
 *   client job is raised by the program manager for a hiring manager who
 *   owns it, and the approver is neither.
 * - A submission comes from a firm that holds the person: its own
 *   employee (INTERNAL), or a listing the person granted it. The kind is
 *   computed from that ownership (`app/api/submissions/kind`), never
 *   chosen. One person reaches one job once.
 * - Every outcome carries a reason code: a submission turned down says
 *   RATE, SKILLS, AVAILABILITY, INTERVIEW or TIMING, and an award stands
 *   the others down.
 */

import { submissionKind } from '@/app/api/submissions/kind'
import { day } from '@/lib/seed-days'
import { bandFor, chainFor, marginClassFor } from '../rates/pure'
import { industry } from '../industries'
import { between, idFor, keyed, weighted } from '../kit'
import type { Band, IndustryKey, LineEnd, PersonFacts, RoleTemplate, ScaleFirm, ScaleFrame, Trade } from '../types'

// ── Shapes of the rows ────────────────────────────────────────────────

export interface JobRow {
  id: string
  companyId: string
  title: string
  skills: string[]
  description: string
  justification: string
  responsibilities: string
  location: string
  workMode: string
  needKind: string
  billMin: number
  billMax: number
  months: number
  headcount: number
  hoursPerWeek: number | null
  overtimeAfterHours: number | null
  startDate: Date
  neededBy: Date
  status: 'DRAFT' | 'OPEN' | 'FILLED' | 'CLOSED' | 'CANCELLED'
  approvalState: 'AUTO_APPROVED' | 'APPROVED' | 'PENDING_APPROVAL'
  source: 'MANUAL' | 'NETWORK'
  marginClass: 'ARBITRAGE' | 'EXPERTISE'
  cancelReason: string | null
  raisedById: string
  ownerId: string
  reportsToId: string
  interviewers: string[]
  orgUnitId: string | null
  costCenterId: string | null
  msaId: string | null
  endClientCompanyId: string | null
  payerCompanyId: string | null
  mirroredFromId: string | null
  createdAt: Date
}

export interface ApprovalRow {
  id: string
  requirementId: string
  approverId: string | null
  rank: number
  stage: 'ROLE' | 'SOURCING' | 'FINAL'
  outcome: 'AUTO_CLEARED' | 'APPROVED' | 'PENDING'
  reason: string
  decidedAt: Date | null
  createdAt: Date
}

export interface InvitationRow {
  id: string
  requirementId: string
  fromCompanyId: string
  toCompanyId: string
  payMin: number
  payMax: number
  message: string
  expiresAt: Date
  status: 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'
  createdAt: Date
}

export type RejectReason = 'RATE' | 'SKILLS' | 'AVAILABILITY' | 'INTERVIEW' | 'TIMING'

export interface SubmissionRow {
  id: string
  requirementId: string
  personId: string
  fromCompanyId: string
  toCompanyId: string
  kind: 'INTERNAL' | 'BENCH' | 'NETWORK'
  rate: number
  contractType: 'W2' | 'C2C'
  status: 'SUBMITTED' | 'SHORTLISTED' | 'INTERVIEW' | 'PLACED' | 'REJECTED'
  checkState: 'SENT'
  screenState: 'READY'
  submittedAt: Date
  decidedAt: Date | null
  rejectReason: RejectReason | null
  rejectedAt: Date | null
  parentSubmissionId: string | null
  forwardedAt: Date | null
  forwardedVia: 'ONWARD' | null
}

export interface InterviewRow {
  id: string
  submissionId: string
  companyId: string
  vendorId: string
  round: number
  stage: 'SCREEN' | 'TECHNICAL' | 'FINAL'
  mode: 'PHONE' | 'VIDEO' | 'ONSITE'
  state: 'PROPOSED' | 'CONFIRMED' | 'DONE'
  proposedSlots: { start: string; end: string }[]
  proposedAt: Date
  scheduledAt: Date | null
  durationMins: number
  requestedById: string
  interviewers: string[]
  clientConfirmedAt: Date | null
  vendorConfirmedAt: Date | null
  consultantConfirmedAt: Date | null
  consultantConfirmedVia: 'VENDOR_ASSERTED' | null
  outcome: 'ADVANCE' | 'OFFER' | 'REJECT' | null
  feedback: string | null
  decidedAt: Date | null
  decidedById: string | null
  createdAt: Date
}

export interface JobPlan {
  /** Client jobs first, then the primes' working records of them (each after its parent). */
  jobs: JobRow[]
  approvals: ApprovalRow[]
  invitations: InvitationRow[]
  /** The hops to a prime before the hops onward that point at them. */
  submissions: SubmissionRow[]
  interviews: InterviewRow[]
  /** What could not be planned, in sentences: a line with no firm on the client's panel above it. */
  notes: string[]
}

// ── Per client: what a year looks like ────────────────────────────────

/** Jobs a client has on the go beside the ones its people's careers filled. */
export const PER_CLIENT = { open: 10, waiting: 3, closed: 4, cancelled: 2 } as const

/** Of the jobs that went through a person rather than clearing by rule, this share. */
const BY_A_PERSON = 0.12

const DAY = 86_400_000

const HEALTH_SHIFT = /nurse|therapist/i

/** Where a role sits in the client's program: the department its work belongs to. */
function departmentOf(role: RoleTemplate, ind: IndustryKey): number {
  const t = role.title.toLowerCase()
  switch (ind) {
    case 'IT': return /security|network/.test(t) ? 2 : /data|machine learning/.test(t) ? 1 : 0
    case 'HEALTHCARE': return /nurse|therapist|pharmacist/.test(t) ? 0 : /research/.test(t) ? 2 : 1
    case 'MANUFACTURING': return /quality|validation/.test(t) ? 2 : /engineer/.test(t) ? 1 : 0
    case 'FINANCE': return /trading|platform/.test(t) ? 0 : /risk|kyc/.test(t) ? 1 : 2
  }
}

/** How long a job runs: a travel nurse's thirteen-week block, a plant role's six months, a program's year. */
function monthsFor(role: RoleTemplate, ind: IndustryKey, r: () => number): number {
  if (/travel nurse/i.test(role.title)) return 3
  if (ind === 'HEALTHCARE' && role.licensed) return weighted(r, [[3, 5], [6, 3]]) as number
  if (ind === 'MANUFACTURING') return weighted(r, [[6, 5], [9, 2], [12, 3]]) as number
  return weighted(r, [[6, 3], [9, 2], [12, 4], [18, 1]]) as number
}

const NEEDS: readonly [string, string][] = [
  ['NEW_PROJECT', 'New project: the work starts this quarter and the team has no one with these skills.'],
  ['BACKFILL', 'Backfill: the person in this seat left, and the work cannot wait for a permanent hire.'],
  ['EXTRA_HANDS', 'Extra hands: the team is behind on a deadline and needs one more person for a few months.'],
]

function words(role: RoleTemplate, ind: IndustryKey, unit: string, months: number, r: () => number) {
  const [needKind, justification] = NEEDS[Math.floor(r() * NEEDS.length)]
  const block = /travel nurse/i.test(role.title) ? 'a 13-week block' : `${months} months`
  const shift = ind === 'HEALTHCARE' && HEALTH_SHIFT.test(role.title)
    ? ' Three 12-hour shifts a week, nights and weekends shared across the unit.'
    : ind === 'MANUFACTURING' && !/engineer/i.test(role.title) ? ' Day shift on the plant floor, with overtime past forty hours.' : ''
  const an = /^(hr\b|[aeiou])/i.test(role.title) ? 'An' : 'A'
  const needs = role.skills.length > 1 ? `${role.skills.slice(0, -1).join(', ')} and ${role.skills[role.skills.length - 1]}` : role.skills[0]
  const description = `${an} ${role.title} for the ${unit} team, for ${block}.${shift} The work needs ${needs}.`
  const responsibilities = role.skills.map((s) => `Hands-on ${s} from the first week.`).join('\n')
  return { needKind, justification, description, responsibilities }
}

// ── Who can put whom forward ──────────────────────────────────────────

interface Reach {
  /**
   * The firms between the person and the client, top first: the panel
   * firm that submits to the client, then each firm below it down to the
   * one that holds the person. One firm where the holder is on the panel.
   */
  path: ScaleFirm[]
}

/** The most firms between a person and a client: a bench firm, a sub-vendor and a prime. */
const MAX_PATH = 3

/** Whether a firm holds this person, and how: its own employee, or a listing the person granted it. */
function holds(firm: ScaleFirm, p: PersonFacts): { employedByUs: boolean; listingTier: string | null } | null {
  if (p.listing && p.listing.firmId === firm.id) return { employedByUs: false, listingTier: p.listing.tier }
  if (!p.listing && p.firmId === firm.id) return { employedByUs: true, listingTier: null }
  return null
}

/** The firm that holds a person: their listing's, or their employer's where nobody lists them. */
function holderOf(p: PersonFacts): string {
  return p.listing ? p.listing.firmId : p.firmId
}

/**
 * How a person reaches a client: straight from a panel firm that holds
 * them (or, for a line in their past, the firm that employed them on it), or up the register through the firms the holder sells to, at most
 * three firms deep, the top one on the client's panel. A retained person
 * is the holder's alone and never goes up a chain, and a bench firm sells
 * its own people and forwards nobody else's.
 */
function reachOf(frame: ScaleFrame, panelIds: Set<string>, p: PersonFacts, past: string | null = null): Reach | null {
  const holder = frame.byId.get(past ?? holderOf(p))
  if (!holder) return null
  if (panelIds.has(holder.id)) return { path: [holder] }
  // Retained today keeps a person off every chain from today on; a line in their past already happened.
  if (!past && p.listing?.tier === 'RETAINED') return null
  // Breadth first, so the shortest chain wins; the draw only breaks ties.
  let level: ScaleFirm[][] = [[holder]]
  for (let depth = 2; depth <= MAX_PATH; depth++) {
    const next: ScaleFirm[][] = []
    for (const chain of level) {
      const above = frame.primesOf(chain[0].id).filter((x) => x.position !== 'BENCH' && !chain.includes(x))
      for (const x of above) next.push([x, ...chain])
    }
    const done = next.filter((c) => panelIds.has(c[0].id))
    if (done.length) return { path: done[Math.floor(keyed(`reach/${p.id}/${holder.id}`)() * done.length)] }
    level = next
  }
  return null
}

const overlap = (a: readonly string[], b: readonly string[]) => a.filter((s) => b.includes(s)).length

// ── The plan ──────────────────────────────────────────────────────────

export function planJobs(frame: ScaleFrame, people: readonly PersonFacts[]): JobPlan {
  const plan: JobPlan = { jobs: [], approvals: [], invitations: [], submissions: [], interviews: [], notes: [] }
  const peopleOf = new Map<string, PersonFacts>(people.map((p) => [p.id, p]))
  const tieOf = new Map<string, Trade>(frame.trades.map((t) => [`${t.seller}|${t.buyer}|${t.relationship}`, t]))
  const mirrors = new Map<string, JobRow>()
  const taken = new Set<string>()

  for (const client of frame.byPosition('CLIENT')) {
    const ind = client.industries[0]
    const vocabulary = industry(ind)
    const program = client.program!
    const seat = (role: string) => client.seats.find((s) => s.role === role)!
    const managers = client.seats.filter((s) => s.role === 'Hiring Manager')
    const pm = seat('Program Manager')
    const hr = seat('HR Partner')
    const procurement = seat('Procurement Lead')
    const lead = seat('Approver')
    const units = Object.keys(program.orgUnitIds)
    const departments = units.slice(1)
    const topUnit = units[0]
    const panel = frame.panelOf(client.id)
    const panelIds = new Set(panel.map((f) => f.id))
    const invited = panel.filter((f) => tieOf.get(`${f.id}|${client.id}|CLIENT`)?.tier !== 'PROBATION')
    const place = client.sites[0].city

    // Who this client can be sent: every person a panel firm reaches. A job's skills decide who fits it.
    const reachable = people
      .map((p) => ({ p, reach: reachOf(frame, panelIds, p) }))
      .filter((x): x is { p: PersonFacts; reach: Reach } => x.reach !== null)

    const jobFor = (key: string, role: RoleTemplate, shape: {
      status: JobRow['status']; approvalState: JobRow['approvalState']; start: Date; created: Date; months: number; headcount: number;
      cancelReason?: string
    }, roleIndustry: IndustryKey = ind): JobRow => {
      const r = keyed(`job/${key}`)
      const dept = departmentOf(role, roleIndustry)
      const owner = managers[dept % managers.length] ?? managers[0]
      // Priced as the work is paid in its own trade: a nurse a bank hires is paid as a nurse.
      const band = bandFor(role, roleIndustry)
      const w = words(role, roleIndustry, departments[dept] ?? topUnit, shape.months, r)
      const remote = roleIndustry === 'IT' && r() < 0.2
      const nursing = roleIndustry === 'HEALTHCARE' && HEALTH_SHIFT.test(role.title)
      const floor = roleIndustry === 'MANUFACTURING' && !/engineer/i.test(role.title)
      const job: JobRow = {
        id: idFor(`job/${key}`),
        companyId: client.id,
        title: role.title,
        skills: [...role.skills],
        description: w.description,
        justification: w.justification,
        responsibilities: w.responsibilities,
        location: remote ? 'Remote' : place,
        workMode: remote ? 'REMOTE' : nursing || floor ? 'ONSITE' : 'HYBRID',
        needKind: w.needKind,
        // The client's own ceiling: what it will pay at most, never shown to a supplier.
        billMin: band.minCents,
        billMax: band.maxCents,
        months: shape.months,
        headcount: shape.headcount,
        hoursPerWeek: nursing ? 36 : null,
        overtimeAfterHours: nursing || floor ? 40 : null,
        startDate: shape.start,
        neededBy: shape.start,
        status: shape.status,
        approvalState: shape.approvalState,
        source: 'MANUAL',
        marginClass: marginClassFor(role),
        cancelReason: shape.cancelReason ?? null,
        // The program manager raises it; the hiring manager whose need it is owns it.
        raisedById: pm.personId,
        ownerId: owner.personId,
        reportsToId: owner.personId,
        interviewers: [owner.name, lead.name],
        orgUnitId: program.orgUnitIds[departments[dept]] ?? program.orgUnitIds[topUnit],
        costCenterId: program.costCenterIds[dept] ?? program.costCenterIds[0],
        msaId: null,
        endClientCompanyId: null,
        payerCompanyId: null,
        mirroredFromId: null,
        createdAt: shape.created,
      }
      plan.jobs.push(job)
      approvalsFor(job, key, r, client, { hr, procurement, lead }, departments[dept] ?? topUnit, dept)
      return job
    }

    // ── The jobs the careers say were filled here ──
    const groups = new Map<string, { role: RoleTemplate; industry: IndustryKey; start: Date; lines: { p: PersonFacts; line: LineEnd }[] }>()
    for (const p of people) {
      for (const line of p.lineEnds) {
        if (line.clientId !== client.id) continue
        const k = `${p.role.title}|${line.start.toISOString().slice(0, 7)}`
        const g = groups.get(k) ?? { role: p.role, industry: p.industry, start: line.start, lines: [] }
        if (line.start < g.start) g.start = line.start
        g.lines.push({ p, line })
        groups.set(k, g)
      }
    }
    for (const [k, g] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const end = Math.max(...g.lines.map((x) => x.line.end.getTime()))
      const months = Math.max(1, Math.round((end - g.start.getTime()) / (30.4 * DAY)))
      const key = `${client.id}/filled/${k}`
      const job = jobFor(key, g.role, {
        status: 'FILLED', approvalState: keyed(`job/${key}/who`)() < BY_A_PERSON ? 'APPROVED' : 'AUTO_APPROVED',
        start: g.start, created: new Date(g.start.getTime() - 35 * DAY), months, headcount: g.lines.length,
      }, g.industry)
      const winners = g.lines.map(({ p }) => p)
      const sent = sendTo(job, key, client, panel, 'history')
      let placed = 0
      for (const { p, line } of g.lines) {
        // Put forward then by the firm that employed them on that line, not whoever holds them today.
        const reach = reachOf(frame, panelIds, p, line.employerId)
        if (!reach) {
          plan.notes.push(`${p.name} worked at ${client.name} as a ${g.role.title} through a firm with no chain to its panel on the register; the job is filled with no submission for them.`)
          continue
        }
        put(job, key, p, reach, sent, { outcome: 'PLACED', at: job.createdAt })
        placed++
      }
      // Those who were put forward and not chosen: stood down with a reason.
      if (placed > 0) {
        const others = pickCandidates(reachable, job, key, 3, winners.map((w) => w.id), false)
        others.forEach(({ p, reach }, i) => {
          const why = weighted(keyed(`why/${key}/${p.id}`), [['INTERVIEW', 3], ['RATE', 3], ['AVAILABILITY', 2], ['TIMING', 1]]) as RejectReason
          put(job, key, p, reach, sent, { outcome: 'REJECTED', reason: why, at: new Date(job.createdAt.getTime() + (3 + i) * DAY) })
        })
      }
    }

    // ── The rest of the year: closed, called off, open, waiting ──
    const roles = vocabulary.roles
    const roleAt = (n: number) => roles[(client.index + n) % roles.length]
    for (let i = 0; i < PER_CLIENT.closed; i++) {
      const key = `${client.id}/closed/${i}`
      const created = day(-300 + i * 55)
      const job = jobFor(key, roleAt(i), {
        status: 'CLOSED', approvalState: 'AUTO_APPROVED', start: new Date(created.getTime() + 30 * DAY), created,
        months: monthsFor(roleAt(i), ind, keyed(`job/${key}/m`)), headcount: 1,
      })
      const sent = sendTo(job, key, client, panel, 'history')
      for (const { p, reach } of pickCandidates(reachable, job, key, 3, [], false)) {
        const why = weighted(keyed(`why/${key}/${p.id}`), [['RATE', 3], ['SKILLS', 2], ['TIMING', 2]]) as RejectReason
        put(job, key, p, reach, sent, { outcome: 'REJECTED', reason: why, at: new Date(created.getTime() + 6 * DAY) })
      }
    }
    for (let i = 0; i < PER_CLIENT.cancelled; i++) {
      const key = `${client.id}/cancelled/${i}`
      const created = day(-200 + i * 70)
      const job = jobFor(key, roleAt(PER_CLIENT.closed + i), {
        status: 'CANCELLED', approvalState: 'AUTO_APPROVED', start: new Date(created.getTime() + 30 * DAY), created,
        months: monthsFor(roleAt(PER_CLIENT.closed + i), ind, keyed(`job/${key}/m`)), headcount: 1,
        cancelReason: i % 2 === 0 ? 'The project was moved to next year’s budget.' : 'Filled by an internal transfer before any supplier submitted.',
      })
      const sent = sendTo(job, key, client, panel, 'history')
      for (const { p, reach } of pickCandidates(reachable, job, key, 1, [], false)) {
        put(job, key, p, reach, sent, { outcome: 'REJECTED', reason: 'TIMING', at: new Date(created.getTime() + 9 * DAY) })
      }
    }
    for (let i = 0; i < PER_CLIENT.open; i++) {
      const key = `${client.id}/open/${i}`
      const role = roleAt(PER_CLIENT.closed + PER_CLIENT.cancelled + i)
      const created = day(-(3 + ((i * 5) % 30)))
      const job = jobFor(key, role, {
        status: 'OPEN', approvalState: i % 5 === 4 ? 'APPROVED' : 'AUTO_APPROVED',
        start: day(14 + (i % 4) * 7), created, months: monthsFor(role, ind, keyed(`job/${key}/m`)), headcount: i % 7 === 3 ? 2 : 1,
      })
      const sent = sendTo(job, key, client, invited, 'open')
      const free = pickCandidates(reachable, job, key, 5, [], true)
      free.forEach(({ p, reach }, n) => {
        const outcome = weighted(keyed(`stage/${key}/${p.id}`), [['SUBMITTED', 4], ['SHORTLISTED', 3], ['INTERVIEW', 2], ['REJECTED', 1]]) as SubmissionRow['status']
        put(job, key, p, reach, sent, {
          outcome, reason: outcome === 'REJECTED' ? 'SKILLS' : undefined,
          at: new Date(created.getTime() + Math.min(n + 1, 2) * DAY + n * 3_600_000),
        })
      })
    }
    for (let i = 0; i < PER_CLIENT.waiting; i++) {
      const key = `${client.id}/waiting/${i}`
      const role = roleAt(PER_CLIENT.closed + PER_CLIENT.cancelled + PER_CLIENT.open + i)
      jobFor(key, role, {
        status: 'DRAFT', approvalState: 'PENDING_APPROVAL', start: day(30 + i * 7), created: day(-(1 + i)),
        months: monthsFor(role, ind, keyed(`job/${key}/m`)), headcount: 1,
      })
    }
  }

  return plan

  // ── Steps inside the plan ──

  /**
   * The chain, one row per step, the way the requisition route records it:
   * HR reads the role and Procurement the suppliers alongside at rank one,
   * the lead's money after both. A waiting job is held at exactly one of
   * the three, by name.
   */
  function approvalsFor(
    job: JobRow, key: string, r: () => number, _client: ScaleFirm,
    who: { hr: { personId: string; name: string }; procurement: { personId: string; name: string }; lead: { personId: string; name: string } },
    unit: string, dept: number,
  ): void {
    const cleared = new Date(job.createdAt.getTime() + 60_000)
    const row = (stage: ApprovalRow['stage'], rank: number, outcome: ApprovalRow['outcome'], reason: string, approverId: string | null, decidedAt: Date | null): void => {
      plan.approvals.push({ id: idFor(`approval/${key}/${stage}`), requirementId: job.id, approverId, rank, stage, outcome, reason, decidedAt, createdAt: job.createdAt })
    }
    // What the job is worth over its length, the figure the value rules read.
    const value = Math.round((job.billMax * (job.hoursPerWeek ?? 40) * (job.months * 52) / 12 * job.headcount) / 100)
    const worth = `about $${value.toLocaleString('en-US')} over ${job.months} month${job.months === 1 ? '' : 's'}`
    const owns = /s$/.test(unit) ? `${unit}’` : `${unit}’s`
    if (job.approvalState === 'AUTO_APPROVED') {
      row('ROLE', 1, 'AUTO_CLEARED', `Within the plan — the head fits ${owns} approved count. HR (${who.hr.name}) not needed.`, null, cleared)
      row('SOURCING', 1, 'AUTO_CLEARED', `Within the going rate — the ceiling is in line with what you already pay. Procurement (${who.procurement.name}) not needed.`, null, cleared)
      row('FINAL', 2, 'AUTO_CLEARED', `Within plan, budget and rate — ${worth}. ${who.lead.name}’s yes not needed.`, null, cleared)
      return
    }
    // One of the three held it, by name, and only for a reason that is true:
    // the lead's money only where the job is over the $400,000 limit.
    const may = value > 400_000 ? (['ROLE', 'SOURCING', 'FINAL'] as const) : (['ROLE', 'SOURCING'] as const)
    const held = may[Math.floor(r() * may.length)]
    const decided = job.approvalState === 'APPROVED' ? new Date(job.createdAt.getTime() + 2 * DAY) : null
    const outcome: ApprovalRow['outcome'] = decided ? 'APPROVED' : 'PENDING'
    const heads = dept === 0 ? 6 : 4
    row('ROLE', 1, held === 'ROLE' ? outcome : 'AUTO_CLEARED',
      held === 'ROLE'
        ? `Takes ${unit} to ${heads + 1} of ${heads} approved heads`
        : `Within the plan — the head fits ${owns} approved count. HR (${who.hr.name}) not needed.`,
      held === 'ROLE' ? who.hr.personId : null, held === 'ROLE' ? decided : cleared)
    row('SOURCING', 1, held === 'SOURCING' ? outcome : 'AUTO_CLEARED',
      held === 'SOURCING'
        ? `$${Math.round(job.billMax / 100)}/hr is ${between(r, 12, 30)}% above the $${Math.round((job.billMax * 0.82) / 100)}/hr you already pay for this skill`
        : `Within the going rate — the ceiling is in line with what you already pay. Procurement (${who.procurement.name}) not needed.`,
      held === 'SOURCING' ? who.procurement.personId : null, held === 'SOURCING' ? decided : cleared)
    row('FINAL', 2, held === 'FINAL' ? outcome : 'AUTO_CLEARED',
      held === 'FINAL'
        ? `The final word on ${owns} spend — ${worth} is over the $400,000 limit, so ${who.lead.name} signs it`
        : `Within plan, budget and rate — ${worth}. ${who.lead.name}’s yes not needed.`,
      held === 'FINAL' ? who.lead.personId : null, held === 'FINAL' ? decided : cleared)
  }

  /**
   * The job sent to every supplier on the panel not on probation, each with
   * a band of its own: money's band for the role, the top shaded per firm
   * so no two suppliers can read one figure off the job and know the other's.
   */
  function sendTo(job: JobRow, key: string, client: ScaleFirm, to: ScaleFirm[], era: 'history' | 'open'): Map<string, InvitationRow> {
    const out = new Map<string, InvitationRow>()
    to.forEach((f, i) => {
      const r = keyed(`invite/${key}/${f.id}`)
      const inv: InvitationRow = {
        id: idFor(`invite/${key}/${f.id}`),
        requirementId: job.id,
        fromCompanyId: client.id,
        toCompanyId: f.id,
        ...supplierBand({ minCents: job.billMin, maxCents: job.billMax, currency: 'USD' }, i, r),
        message: `${job.title} for ${client.name}, ${job.months} month${job.months === 1 ? '' : 's'}, starting ${job.startDate.toISOString().slice(0, 10)}.`,
        expiresAt: new Date(job.createdAt.getTime() + 21 * DAY),
        status: era === 'open' ? (r() < 0.1 ? 'DECLINED' : 'SENT') : 'EXPIRED',
        createdAt: new Date(job.createdAt.getTime() + 2 * 60_000),
      }
      out.set(f.id, inv)
      plan.invitations.push(inv)
    })
    return out
  }

  /** The most `n` people a job may still take: fit on its skills, free where it is open, never one already on it. */
  function pickCandidates(
    pool: { p: PersonFacts; reach: Reach }[], job: JobRow, key: string, n: number, skip: string[], open: boolean,
  ): { p: PersonFacts; reach: Reach }[] {
    const r = keyed(`pick/${key}`)
    const fit = pool.filter(({ p }) =>
      !skip.includes(p.id) &&
      !taken.has(`${job.id}|${p.id}`) &&
      overlap(job.skills, p.skills) >= Math.min(2, job.skills.length) &&
      (!open || (p.career !== 'PLACED' && !p.lineEnds.some((l) => l.live))))
    const want = Math.min(fit.length, between(r, Math.min(1, n), n))
    const from = fit.length ? Math.floor(r() * fit.length) : 0
    const out: { p: PersonFacts; reach: Reach }[] = []
    for (let i = 0; i < fit.length && out.length < want; i++) out.push(fit[(from + i * 7) % fit.length])
    return [...new Map(out.map((x) => [x.p.id, x])).values()]
  }

  /**
   * A person put forward to a client job: from the panel firm that holds
   * them, or up the chain from the firm that does, one hop per firm, each
   * hop to the next firm's working record of the job and the last to the
   * client, each with its own rate. The interviews follow the outcome.
   */
  function put(
    job: JobRow, key: string, p: PersonFacts, reach: Reach, sent: Map<string, InvitationRow>,
    o: { outcome: SubmissionRow['status']; reason?: RejectReason; at: Date },
  ): void {
    const k = `${job.id}|${p.id}`
    if (taken.has(k)) return // first submission wins
    const top = reach.path[0]
    // A supplier submits only to a job it was sent and did not turn down.
    const inv = sent.get(top.id)
    if (!inv || inv.status === 'DECLINED') return
    taken.add(k)
    inv.status = 'ACCEPTED'
    const band: Band = { minCents: inv.payMin, maxCents: inv.payMax, currency: 'USD' }
    const depth = reach.path.length
    const chain = chainFor(band, depth, `submit/${job.id}/${p.id}`, { marginClass: job.marginClass })
    const topRate = Math.max(band.minCents, Math.min(band.maxCents, chain[0]))
    const decided = o.outcome === 'PLACED' || o.outcome === 'REJECTED'
    const decidedAt = decided ? new Date(o.at.getTime() + 9 * DAY) : null
    const contractType = (who: ScaleFirm) => (holds(who, p)?.employedByUs ? 'W2' : weighted(keyed(`ct/${p.id}`), [['W2', 5], ['C2C', 4]])) as 'W2' | 'C2C'
    const kindFrom = (who: ScaleFirm) => {
      const own = holds(who, p)
      // A firm forwarding somebody another firm holds buys them: a network submission.
      return own ? submissionKind(own) : 'NETWORK'
    }

    // Each firm in the middle keeps a working record of the job, copied
    // from the record of the firm it submits to: the client's job at the top.
    const records: JobRow[] = [job]
    for (let i = 1; i < depth; i++) records.push(mirrorOf(job, key, reach.path[i - 1], records[i - 1]))

    // From the holder up, each hop to the firm above's working record of the job.
    let parent: string | null = null
    for (let i = depth - 1; i >= 1; i--) {
      const from = reach.path[i]
      const to = reach.path[i - 1]
      const mirror = records[i]
      const id = idFor(`submission/${mirror.id}/${p.id}`)
      const at = new Date(o.at.getTime() - i * DAY)
      plan.submissions.push({
        id, requirementId: mirror.id, personId: p.id, fromCompanyId: from.id, toCompanyId: to.id,
        kind: kindFrom(from), rate: Math.min(chain[i], topRate), contractType: contractType(from),
        status: o.outcome === 'REJECTED' ? 'REJECTED' : o.outcome === 'PLACED' ? 'PLACED' : 'SHORTLISTED',
        checkState: 'SENT', screenState: 'READY',
        submittedAt: at, decidedAt, rejectReason: o.outcome === 'REJECTED' ? o.reason ?? 'TIMING' : null,
        rejectedAt: o.outcome === 'REJECTED' ? decidedAt : null, parentSubmissionId: parent,
        forwardedAt: new Date(at.getTime() + DAY), forwardedVia: 'ONWARD',
      })
      parent = id
    }
    const id = idFor(`submission/${job.id}/${p.id}`)
    plan.submissions.push({
      id, requirementId: job.id, personId: p.id, fromCompanyId: top.id, toCompanyId: job.companyId,
      kind: kindFrom(top), rate: topRate, contractType: contractType(top), status: o.outcome,
      checkState: 'SENT', screenState: 'READY', submittedAt: o.at, decidedAt,
      rejectReason: o.outcome === 'REJECTED' ? o.reason ?? 'TIMING' : null, rejectedAt: o.outcome === 'REJECTED' ? decidedAt : null,
      parentSubmissionId: parent, forwardedAt: null, forwardedVia: null,
    })
    interviewsFor(job, id, top.id, o)
  }

  /**
   * A firm's working record of a client job, made once per firm and per
   * firm it submits to: what a firm in the middle of a chain submits
   * against. It points one hop up, to the record it copies, and names the
   * firm above as who it is worked through; the client stays the end
   * client, and is not named to the firm below (`endClientVisible` off).
   */
  function mirrorOf(job: JobRow, key: string, firm: ScaleFirm, above: JobRow): JobRow {
    const mk = `${job.id}|${firm.id}|${above.companyId}`
    let m = mirrors.get(mk)
    if (!m) {
      const account = firm.seats.find((s) => s.role === 'Account Manager') ?? firm.seats[0]
      const recruiter = firm.seats.find((s) => s.role === 'Recruiter' && s.personId !== account.personId)
        ?? firm.seats.find((s) => s.personId !== account.personId) ?? firm.seats[0]
      const chain = chainFor({ minCents: above.billMin, maxCents: above.billMax, currency: 'USD' }, 2, `mirror/${job.id}/${firm.id}`, { marginClass: job.marginClass })
      const tie = above.companyId === job.companyId ? 'CLIENT' : 'PRIME'
      m = {
        ...job,
        id: idFor(`mirror/${key}/${firm.id}/${above.companyId}`),
        companyId: firm.id,
        // A firm's ceiling is what it will pay below, not what it is paid.
        billMin: Math.min(above.billMin, chain[1]),
        billMax: Math.min(above.billMax, chain[1] + 1500),
        approvalState: 'AUTO_APPROVED',
        status: job.status === 'DRAFT' ? 'OPEN' : job.status,
        source: 'NETWORK',
        raisedById: account.personId,
        ownerId: recruiter.personId,
        reportsToId: recruiter.personId,
        interviewers: [],
        orgUnitId: null,
        costCenterId: null,
        msaId: tieOf.get(`${firm.id}|${above.companyId}|${tie}`)?.agreementId ?? null,
        endClientCompanyId: job.companyId,
        payerCompanyId: above.companyId,
        mirroredFromId: above.id,
        createdAt: new Date(above.createdAt.getTime() + DAY),
      }
      mirrors.set(mk, m)
      plan.jobs.push(m)
      plan.approvals.push({
        id: idFor(`approval/mirror/${key}/${firm.id}/${above.companyId}`), requirementId: m.id, approverId: null, rank: 0, stage: 'FINAL',
        outcome: 'AUTO_CLEARED', reason: 'A working record of a client’s job request: nothing to approve here.', decidedAt: m.createdAt, createdAt: m.createdAt,
      })
    }
    return m
  }

  /** Interviews the outcome implies: a screen and a final for the person placed, a screen for one turned down at interview. */
  function interviewsFor(job: JobRow, submissionId: string, vendorId: string, o: { outcome: SubmissionRow['status']; reason?: RejectReason; at: Date }): void {
    const owner = job.ownerId
    const names = job.interviewers
    const slot = (at: Date) => [{ start: at.toISOString(), end: new Date(at.getTime() + 3_600_000).toISOString() }]
    const done = (round: number, stage: InterviewRow['stage'], at: Date, outcome: InterviewRow['outcome'], feedback: string): InterviewRow => ({
      id: idFor(`interview/${submissionId}/${round}`), submissionId, companyId: job.companyId, vendorId, round, stage,
      mode: stage === 'FINAL' && job.workMode === 'ONSITE' ? 'ONSITE' : 'VIDEO', state: 'DONE', proposedSlots: slot(at),
      proposedAt: new Date(at.getTime() - 2 * DAY), scheduledAt: at, durationMins: stage === 'SCREEN' ? 30 : 60,
      requestedById: owner, interviewers: stage === 'SCREEN' ? names.slice(0, 1) : names,
      clientConfirmedAt: new Date(at.getTime() - 2 * DAY), vendorConfirmedAt: new Date(at.getTime() - 2 * DAY + 3_600_000),
      consultantConfirmedAt: new Date(at.getTime() - DAY), consultantConfirmedVia: 'VENDOR_ASSERTED',
      outcome, feedback, decidedAt: new Date(at.getTime() + 3_600_000), decidedById: owner, createdAt: new Date(at.getTime() - 2 * DAY),
    })
    if (o.outcome === 'PLACED') {
      plan.interviews.push(
        done(1, 'SCREEN', new Date(o.at.getTime() + 2 * DAY), 'ADVANCE', 'Clear on the basics; move to the final round.'),
        done(2, 'FINAL', new Date(o.at.getTime() + 5 * DAY), 'OFFER', 'Strongest of the candidates. Make the offer.'),
      )
    } else if (o.outcome === 'REJECTED' && o.reason === 'INTERVIEW') {
      plan.interviews.push(done(1, 'SCREEN', new Date(o.at.getTime() + 2 * DAY), 'REJECT', 'Not enough depth on the core skills for this team.'))
    } else if (o.outcome === 'INTERVIEW') {
      // On the calendar this week, confirmed by all three.
      const at = new Date(day(2 + (submissionId.charCodeAt(4) % 4)).getTime() + 15 * 3_600_000)
      plan.interviews.push({
        id: idFor(`interview/${submissionId}/1`), submissionId, companyId: job.companyId, vendorId, round: 1, stage: 'TECHNICAL',
        mode: 'VIDEO', state: 'CONFIRMED', proposedSlots: slot(at), proposedAt: o.at, scheduledAt: at, durationMins: 60,
        requestedById: owner, interviewers: names, clientConfirmedAt: o.at, vendorConfirmedAt: new Date(o.at.getTime() + 3_600_000),
        consultantConfirmedAt: new Date(o.at.getTime() + 7_200_000), consultantConfirmedVia: 'VENDOR_ASSERTED',
        outcome: null, feedback: null, decidedAt: null, decidedById: null, createdAt: o.at,
      })
    }
  }
}

/**
 * One supplier's band on one job: money's band for the role, its floor
 * $10 under the client's and its top shaded $0, $5, $10 or $15 per
 * firm, never above the client's ceiling. Two suppliers on one job read
 * two different bands, and neither reads the other's.
 */
export function supplierBand(ceiling: Band, nth: number, r: () => number): { payMin: number; payMax: number } {
  const shade = ((nth + Math.floor(r() * 4)) % 4) * 500
  const payMax = Math.max(ceiling.minCents, ceiling.maxCents - shade)
  return { payMin: Math.max(0, ceiling.minCents - 1000), payMax }
}

/** The id of the client job a career line was filled through, so a line written elsewhere can point at it. */
export function jobIdForLine(person: Pick<PersonFacts, 'role'>, line: Pick<LineEnd, 'clientId' | 'start'>): string {
  return idFor(`job/${line.clientId}/filled/${person.role.title}|${line.start.toISOString().slice(0, 7)}`)
}
