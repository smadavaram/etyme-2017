/**
 * The generated world's jobs (etyme-demand), planned without the database:
 * docs/seed-scale-brief.md sections 3.1, 3.3 and 3.4; CLAUDE.md, "Nine
 * decisions for the generated world" (2026-10-20). Planned against
 * supply's two thousand (`lib/seed-scale/people`).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { anchorSeed } from '@/lib/seed-days'
import { buildFrame } from '@/lib/seed-scale/frame'
import { INDUSTRIES, normalSkill, skillsOf } from '@/lib/seed-scale/industries'
import { bandFor } from '@/lib/seed-scale/rates'
import { planJobs, jobIdForLine, PER_CLIENT, HISTORY_SENT, type JobPlan } from '@/lib/seed-scale/jobs'
import { buildPeople } from '@/lib/seed-scale/people'
import type { PersonFacts, ScaleFrame } from '@/lib/seed-scale/types'

let frame: ScaleFrame
let people: PersonFacts[]
let plan: JobPlan

beforeAll(() => {
  anchorSeed(new Date('2026-10-20T00:00:00Z'))
  frame = buildFrame()
  people = buildPeople(frame)
  plan = planJobs(frame, people)
})

/** The firm that employed a person on the career line a filled job stands for, if it stands for one. */
const employedThenOf = (p: PersonFacts, jobId: string) => p.lineEnds.find((l) => jobIdForLine(p, l) === jobId)?.employerId

const clientJobs = () => plan.jobs.filter((j) => !j.mirroredFromId)

describe('the generated world’s jobs', () => {
  it('every job’s skills come from its industry’s list, and none is under four letters', () => {
    const vocabulary = new Set(INDUSTRIES.flatMap((i) => skillsOf(i.key)))
    expect(plan.jobs.length).toBeGreaterThan(0)
    for (const j of plan.jobs) {
      expect(j.skills.length, j.title).toBeGreaterThanOrEqual(2)
      for (const s of j.skills) {
        expect(vocabulary.has(s), `${j.title}: ${s}`).toBe(true)
        expect(normalSkill(s).length, s).toBeGreaterThanOrEqual(4)
      }
    }
    // A client's own jobs are in its own industry's words, unless a career line says it hired across.
    for (const c of frame.byPosition('CLIENT')) {
      const own = new Set(skillsOf(c.industries[0]))
      const planned = clientJobs().filter((j) => j.companyId === c.id && j.status !== 'FILLED')
      for (const j of planned) for (const s of j.skills) expect(own.has(s), `${c.name}: ${s}`).toBe(true)
    }
  })

  it('a supplier’s band is on its invitation, under the job’s ceiling, and never on the job', () => {
    const jobs = new Map(plan.jobs.map((j) => [j.id, j]))
    let differing = 0
    let several = 0
    const byJob = new Map<string, typeof plan.invitations>()
    for (const inv of plan.invitations) byJob.set(inv.requirementId, [...(byJob.get(inv.requirementId) ?? []), inv])
    for (const [id, invs] of byJob) {
      const j = jobs.get(id)!
      for (const inv of invs) {
        expect(inv.payMax, j.title).toBeLessThanOrEqual(j.billMax)
        expect(inv.payMin, j.title).toBeLessThan(inv.payMax)
        // The pair a supplier reads is never the pair the client holds.
        expect([inv.payMin, inv.payMax], j.title).not.toEqual([j.billMin, j.billMax])
      }
      if (invs.length > 1) {
        several++
        if (new Set(invs.map((i) => i.payMax)).size > 1) differing++
      }
    }
    expect(differing / several).toBeGreaterThan(0.9)
    // The client's ceiling is money's band for the role.
    for (const j of clientJobs()) {
      const ind = INDUSTRIES.find((i) => i.roles.some((r) => r.title === j.title))!
      const band = bandFor(ind.roles.find((r) => r.title === j.title)!, ind.key)
      expect([j.billMin, j.billMax], j.title).toEqual([band.minCents, band.maxCents])
    }
    // And the job row has nowhere to put a supplier's band.
    expect(Object.keys(plan.jobs[0])).not.toContain('payMin')
  })

  it('most jobs publish themselves, and the rest wait on HR, Procurement or the lead by name', () => {
    const jobs = clientJobs()
    const auto = jobs.filter((j) => j.approvalState === 'AUTO_APPROVED').length
    expect(auto / jobs.length).toBeGreaterThan(0.7)
    const waiting = jobs.filter((j) => j.approvalState === 'PENDING_APPROVAL')
    expect(waiting).toHaveLength(frame.byPosition('CLIENT').length * PER_CLIENT.waiting)
    for (const j of waiting) {
      expect(j.status, j.title).toBe('DRAFT')
      const client = frame.byId.get(j.companyId)!
      const pending = plan.approvals.filter((a) => a.requirementId === j.id && a.outcome === 'PENDING')
      expect(pending, j.title).toHaveLength(1)
      const who = client.seats.find((s) => s.personId === pending[0].approverId)
      expect(['HR Partner', 'Procurement Lead', 'Approver'], j.title).toContain(who?.role)
      expect(pending[0].reason.length).toBeGreaterThan(20)
    }
    // A job that published itself was cleared at every step by rule, and says so.
    for (const j of jobs.filter((x) => x.approvalState === 'AUTO_APPROVED')) {
      const rows = plan.approvals.filter((a) => a.requirementId === j.id)
      expect(rows.map((a) => a.stage).sort()).toEqual(['FINAL', 'ROLE', 'SOURCING'])
      for (const a of rows) expect([a.outcome, a.approverId]).toEqual(['AUTO_CLEARED', null])
    }
    // Only a published job reaches a supplier.
    const sentTo = new Set(plan.invitations.map((i) => i.requirementId))
    for (const j of waiting) expect(sentTo.has(j.id), j.title).toBe(false)
  })

  it('no job’s owner raised it, and nobody approves a job they own or raised', () => {
    for (const j of plan.jobs) expect(j.ownerId, j.title).not.toBe(j.raisedById)
    const jobs = new Map(plan.jobs.map((j) => [j.id, j]))
    for (const a of plan.approvals.filter((x) => x.approverId)) {
      const j = jobs.get(a.requirementId)!
      expect([j.ownerId, j.raisedById], j.title).not.toContain(a.approverId)
    }
    // The owner is a hiring manager at the client; the program manager raised it.
    for (const j of clientJobs()) {
      const c = frame.byId.get(j.companyId)!
      expect(c.seats.find((s) => s.personId === j.ownerId)?.role).toBe('Hiring Manager')
      expect(c.seats.find((s) => s.personId === j.raisedById)?.role).toBe('Program Manager')
    }
  })

  it('one person reaches one job once, and the first submission is the one kept', () => {
    const seen = new Set<string>()
    for (const s of plan.submissions) {
      const k = `${s.requirementId}|${s.personId}`
      expect(seen.has(k), k).toBe(false)
      seen.add(k)
    }
    expect(plan.submissions.length).toBeGreaterThan(100)
  })

  it('a submission comes from a firm that holds the person, or up the chain from it, and its kind is computed from that', () => {
    const who = new Map(people.map((p) => [p.id, p]))
    const subs = new Map(plan.submissions.map((s) => [s.id, s]))
    const jobs = new Map(plan.jobs.map((j) => [j.id, j]))
    let chained = 0
    for (const top of plan.submissions.filter((x) => !jobs.get(x.requirementId)!.mirroredFromId)) {
      const p = who.get(top.personId)!
      const holder = p.listing ? p.listing.firmId : p.firmId
      // Walk down the hops to the firm that holds the person.
      let hop = top
      let hops = 1
      while (hop.parentSubmissionId) {
        const below = subs.get(hop.parentSubmissionId)!
        expect(below.toCompanyId).toBe(hop.fromCompanyId)
        expect(below.personId).toBe(hop.personId)
        expect(frame.primesOf(below.fromCompanyId).map((f) => f.id), 'each hop is a firm selling to the one above').toContain(hop.fromCompanyId)
        // The record below copies the record above it, one hop up.
        expect(jobs.get(below.requirementId)!.mirroredFromId).toBe(hop.requirementId)
        // It is the receiving firm's own record, worked through the firm it submits to.
        expect(jobs.get(below.requirementId)!.companyId).toBe(hop.fromCompanyId)
        expect(jobs.get(below.requirementId)!.payerCompanyId).toBe(hop.toCompanyId)
        expect(below.rate, 'each firm keeps a margin').toBeLessThanOrEqual(hop.rate)
        expect(hop.kind, 'a firm forwarding somebody it does not hold buys them').toBe('NETWORK')
        hop = below
        hops++
      }
      expect(hops).toBeLessThanOrEqual(3)
      if (hops > 1) {
        chained++
        if (!employedThenOf(p, top.requirementId)) expect(p.listing?.tier, 'a retained person never goes up a chain').not.toBe('RETAINED')
      }
      // A line in the past was put forward by the firm that employed them on it; anything else by who holds them now.
      const employedThen = employedThenOf(p, top.requirementId)
      expect([holder, employedThen], p.name).toContain(hop.fromCompanyId)
      if (hop.fromCompanyId === holder) {
        const expected = !p.listing ? 'INTERNAL' : p.listing.tier === 'RETAINED' ? 'BENCH' : 'NETWORK'
        expect(hop.kind, p.name).toBe(expected)
      }
    }
    expect(chained).toBeGreaterThan(0)
    // The client never sees a firm it does not buy from.
    for (const s of plan.submissions.filter((x) => !jobs.get(x.requirementId)!.mirroredFromId)) {
      expect(frame.panelOf(s.toCompanyId).map((f) => f.id)).toContain(s.fromCompanyId)
    }
  })

  it('a supplier submits only to a job it was sent and did not turn down', () => {
    const inv = new Map(plan.invitations.map((i) => [`${i.requirementId}|${i.toCompanyId}`, i]))
    const jobs = new Map(plan.jobs.map((j) => [j.id, j]))
    for (const s of plan.submissions.filter((x) => !jobs.get(x.requirementId)!.mirroredFromId)) {
      const i = inv.get(`${s.requirementId}|${s.fromCompanyId}`)
      expect(i, s.id).toBeDefined()
      expect(i!.status).toBe('ACCEPTED')
      expect(s.rate).toBeGreaterThanOrEqual(i!.payMin)
      expect(s.rate).toBeLessThanOrEqual(i!.payMax)
    }
    // A supplier on probation is not sent today's jobs.
    for (const i of plan.invitations.filter((x) => jobs.get(x.requirementId)!.status === 'OPEN')) {
      const tie = frame.trades.find((t) => t.seller === i.toCompanyId && t.buyer === i.fromCompanyId && t.relationship === 'CLIENT')
      expect(tie?.tier).not.toBe('PROBATION')
    }
  })

  it('a job in the past went to three to six firms on the panel, always the ones whose people it placed', () => {
    const jobs = new Map(plan.jobs.map((j) => [j.id, j]))
    const sentFor = new Map<string, string[]>()
    for (const i of plan.invitations) sentFor.set(i.requirementId, [...(sentFor.get(i.requirementId) ?? []), i.toCompanyId])
    for (const j of clientJobs().filter((x) => ['FILLED', 'CLOSED', 'CANCELLED'].includes(x.status))) {
      const sent = sentFor.get(j.id) ?? []
      const placedBy = new Set(plan.submissions.filter((s) => s.requirementId === j.id && s.status === 'PLACED').map((s) => s.fromCompanyId))
      for (const f of placedBy) expect(sent, j.title).toContain(f)
      expect(sent.length, j.title).toBeLessThanOrEqual(Math.max(HISTORY_SENT.max, placedBy.size))
      expect(sent.length, j.title).toBeGreaterThanOrEqual(Math.min(HISTORY_SENT.min, frame.panelOf(j.companyId).length))
    }
    // Nobody is put forward by a firm the job did not go to.
    const pairs = new Set(plan.invitations.map((i) => `${i.requirementId}|${i.toCompanyId}`))
    for (const s of plan.submissions.filter((x) => !jobs.get(x.requirementId)!.mirroredFromId)) expect(pairs.has(`${s.requirementId}|${s.fromCompanyId}`)).toBe(true)
  })

  it('everybody turned down carries a reason code, and an award stands the others down', () => {
    const codes = ['RATE', 'SKILLS', 'WORK_AUTH', 'AVAILABILITY', 'INTERVIEW', 'TIMING', 'CANDIDATE_WITHDREW', 'NO_REPLY']
    for (const s of plan.submissions.filter((x) => x.status === 'REJECTED')) {
      expect(codes).toContain(s.rejectReason)
      expect(s.decidedAt).not.toBeNull()
    }
    const filled = plan.jobs.filter((j) => j.status === 'FILLED' && !j.mirroredFromId)
    expect(filled.length).toBeGreaterThan(0)
    for (const j of filled) {
      const subs = plan.submissions.filter((s) => s.requirementId === j.id)
      for (const s of subs) expect(['PLACED', 'REJECTED'], j.title).toContain(s.status)
      expect(subs.filter((s) => s.status === 'PLACED').length).toBeLessThanOrEqual(j.headcount)
    }
    // Nobody is left in the running on a job that is over.
    for (const j of plan.jobs.filter((x) => ['CLOSED', 'CANCELLED'].includes(x.status) && !x.mirroredFromId)) {
      for (const s of plan.submissions.filter((x) => x.requirementId === j.id)) expect(s.status).toBe('REJECTED')
      if (j.status === 'CANCELLED') expect(j.cancelReason).toBeTruthy()
    }
  })

  it('a filled job places the people its careers say worked there, after two rounds', () => {
    let lines = 0
    for (const p of people) {
      for (const line of p.lineEnds) {
        lines++
        const id = jobIdForLine(p, line)
        const job = plan.jobs.find((j) => j.id === id)
        expect(job, `${p.name} at ${line.clientId}`).toBeDefined()
        expect(job!.status).toBe('FILLED')
        const placed = plan.submissions.find((s) => s.requirementId === id && s.personId === p.id)
        if (!placed) { expect(plan.notes.join(' ')).toContain(p.name); continue }
        expect(placed.status).toBe('PLACED')
        const rounds = plan.interviews.filter((i) => i.submissionId === placed.id)
        expect(rounds.map((i) => [i.round, i.outcome])).toEqual([[1, 'ADVANCE'], [2, 'OFFER']])
      }
    }
    expect(lines).toBeGreaterThan(50)
  })

  it('a travel nurse is asked for a 13-week block, three twelve-hour shifts a week', () => {
    const nurses = clientJobs().filter((j) => /travel nurse/i.test(j.title) && j.status !== 'FILLED')
    expect(nurses.length).toBeGreaterThan(0)
    for (const j of nurses) {
      expect(j.months).toBe(3)
      expect(j.hoursPerWeek).toBe(36)
      expect(j.description).toContain('13-week block')
    }
  })

  it('every hiring manager has jobs to copy, with a ceiling, skills, a cost center and a team', () => {
    for (const c of frame.byPosition('CLIENT')) {
      const mine = clientJobs().filter((j) => j.companyId === c.id)
      expect(mine.filter((j) => j.status === 'OPEN').length, c.name).toBe(PER_CLIENT.open)
      for (const hm of c.seats.filter((s) => s.role === 'Hiring Manager')) {
        const own = mine.filter((j) => j.ownerId === hm.personId)
        expect(own.length, `${c.name}: ${hm.name}`).toBeGreaterThan(0)
      }
      for (const j of mine) {
        expect(j.billMax).toBeGreaterThan(0)
        expect(j.costCenterId && j.orgUnitId, j.title).toBeTruthy()
        expect(['ARBITRAGE', 'EXPERTISE']).toContain(j.marginClass)
      }
    }
  })

  it('a firm’s working record of a job points one hop up, names the firm above as who it is worked through, and keeps the client as the end client', () => {
    const mirrors = plan.jobs.filter((j) => j.mirroredFromId)
    expect(mirrors.length).toBeGreaterThan(0)
    const jobs = new Map(plan.jobs.map((j) => [j.id, j]))
    for (const m of mirrors) {
      const parent = jobs.get(m.mirroredFromId!)!
      expect(m.payerCompanyId).toBe(parent.companyId)
      let top = parent
      while (top.mirroredFromId) top = jobs.get(top.mirroredFromId)!
      expect(m.endClientCompanyId).toBe(top.companyId)
      expect(m.billMax, 'a firm pays below what it is paid').toBeLessThanOrEqual(parent.billMax)
      expect(m.skills).toEqual(parent.skills)
    }
  })

  it('the same world plans the same rows with the same ids, sorting after the base world’s', () => {
    const again = planJobs(buildFrame(), buildPeople(frame))
    expect(again.jobs.map((j) => j.id)).toEqual(plan.jobs.map((j) => j.id))
    expect(again.submissions.map((s) => [s.id, s.status, s.rate])).toEqual(plan.submissions.map((s) => [s.id, s.status, s.rate]))
    const ids = [...plan.jobs, ...plan.approvals, ...plan.invitations, ...plan.submissions, ...plan.interviews].map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id.startsWith('cz')).toBe(true)
  })
})
