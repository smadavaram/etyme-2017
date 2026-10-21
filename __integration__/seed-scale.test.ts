import { describe, it, expect, beforeAll, vi } from 'vitest'

// Every question the seed asks the database, counted, so the people's
// steps can be held under the line a step may ask (seed-step-size.test.ts
// does the same for the base world's steps).
const counter = vi.hoisted(() => ({ asked: 0 }))
vi.mock('@/lib/db', async () => {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] })
  prisma.$on('query', () => { counter.asked++ })
  return { prisma }
})

import { prisma, freshWorld } from './harness'
import { seedScaleWorld } from '@/lib/seed-scale'
import { buildFrame, seedFrame, namedFirms } from '@/lib/seed-scale/frame'
import { INDUSTRIES, vocabularyFaults, skillsOf } from '@/lib/seed-scale/industries'
import { sharedTails } from '@/lib/seed-scale/kit'
import { CAREER_MIX, GSI_STAFF, NEAR_TIME_LIMIT_SHARE, SCALE, SCALE_EMAIL_SUFFIX, SCALE_SLUG_PREFIX, STEP_QUERY_BUDGET, type ScaleFrame } from '@/lib/seed-scale/types'
import { peopleSteps, planPeople, careerCounts, soloIdOf, buildPeople } from '@/lib/seed-scale/people'
import { STAY_CHOICES } from '@/lib/bench-stay'
import { daysFor, daysOnSite } from '@/lib/tenure-days'
import { day } from '@/lib/seed-days'
import { readCatalog } from '../scripts/simulate/actors'
import { jobSteps, planJobs, type JobPlan } from '@/lib/seed-scale/jobs'
import type { PersonFacts } from '@/lib/seed-scale/types'
import { projectInvitationForVendor } from '@/lib/invitation-visibility'

/**
 * The generated world at the founder's scale (lib/seed-scale), seeded on
 * a copy of the base world the way its sealed template is built.
 *
 * The one test file the generator may have (CLAUDE.md, "Nine decisions
 * for the generated world", 2026-10-20): it is the simulation's own
 * world, and the simulation's tests are admitted. Its six sentences are
 * that paragraph's. Today the frame is seeded (firms, seats, sites,
 * calendars, programs, the register); the people, papers, jobs and rates
 * join as their folders land, and the sentences about them read whatever
 * is there.
 */

let frame: ScaleFrame
const s: Record<string, any> = {}
/** The people the jobs are planned against: supply's two thousand. */
let people: PersonFacts[]
let jobPlan: JobPlan

const COUNTED = ['company', 'person', 'context', 'role', 'companyLocation', 'holiday', 'orgUnit', 'costCenter', 'headcountPlan',
  'approvalRule', 'governancePolicy', 'governanceRule', 'counterparty', 'masterAgreement', 'engagement', 'programSeat'] as const
async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const t of COUNTED) out[t] = await (prisma as any)[t].count()
  return out
}

beforeAll(async () => {
  await freshWorld()
  s.first = await seedScaleWorld()
  frame = buildFrame()
  s.firms = await prisma.company.findMany({
    where: { slug: { startsWith: SCALE_SLUG_PREFIX } },
    select: { id: true, slug: true, kind: true, supplierPosture: true, claimedAt: true },
  })
  // The people (supply), step by step, each step's questions counted.
  s.peopleSteps = []
  for (const step of peopleSteps(frame)) {
    const before = counter.asked
    await step.run(frame)
    s.peopleSteps.push({ step: step.name, asked: counter.asked - before })
  }
  // The jobs (etyme-demand), on supply's people, each step's questions
  // counted. Until lib/seed-scale/index wires the job steps after the
  // people's, they run here; when the wiring lands `seedScaleWorld` does it.
  people = buildPeople(frame)
  jobPlan = planJobs(frame, people)
  s.jobSteps = []
  for (const step of jobSteps(() => people)) {
    const before = counter.asked
    await step.run(frame)
    s.jobSteps.push({ step: step.name, asked: counter.asked - before })
  }
  s.seated = await prisma.context.findMany({
    where: { company: { slug: { startsWith: SCALE_SLUG_PREFIX } }, revokedAt: null },
    select: { companyId: true, grantedAt: true, person: { select: { name: true, primaryEmail: true } }, role: { select: { name: true } } },
    orderBy: { grantedAt: 'asc' },
  })
}, 600_000)

describe('the generated world at the founder’s scale', () => {
  it('every generated firm holds the roles the simulation looks for', async () => {
    expect(s.first.done, JSON.stringify(s.first)).toBe(true)
    // The frame's firms; the people's one-person companies are counted in their own sentences.
    expect(s.firms.filter((f: any) => f.kind !== 'CONSULTANT_CORP')).toHaveLength(SCALE.clients + SCALE.gsis + SCALE.msps + SCALE.suppliers)
    const rolesAt = new Map<string, string[]>()
    for (const c of s.seated as any[]) rolesAt.set(c.companyId, [...(rolesAt.get(c.companyId) ?? []), c.role?.name])
    const needs: Record<string, string[]> = {
      CLIENT: ['Owner', 'Program Manager', 'Hiring Manager', 'Approver', 'HR Partner', 'Procurement Lead', 'AP Clerk', 'Compliance Officer'],
      MSP: ['Owner', 'Program Manager', 'Supplier Manager', 'Coordinator', 'AP Clerk', 'Compliance Officer'],
      GSI: ['Owner', 'Delivery Manager', 'AP & Payroll', 'Recruiter', 'Resource Manager'],
      PRIME: ['Owner', 'Recruiter', 'Resource Manager', 'Account Manager', 'AP & Payroll', 'Finance', 'Contract Manager', 'Accounts Receivable', 'Compliance Officer'],
      SUB_VENDOR: ['Owner', 'Recruiter', 'AP & Payroll'],
      BENCH: ['Owner', 'Recruiter', 'AP & Payroll'],
    }
    for (const f of frame.firms) {
      const held = rolesAt.get(f.id) ?? []
      for (const r of needs[f.position]) expect(held, `${f.name} (${f.position}) holds ${r}`).toContain(r)
      // The Owner is the first grant, which is the seat `<slug>/owner` opens.
      const first = (s.seated as any[]).find((c) => c.companyId === f.id)
      expect(first.role.name, f.name).toBe('Owner')
    }
    expect((rolesAt.get(frame.byPosition('GSI')[0].id) ?? []).filter((r) => r === 'Delivery Manager')).toHaveLength(2)

    // Made the way sign-up makes a firm, on Etyme, and every supplier says where it sits in the chain.
    for (const c of s.firms as any[]) {
      expect(c.claimedAt, c.slug).not.toBeNull()
      if (c.kind === 'VENDOR' || c.kind === 'GSI') expect(['PRIME', 'BENCH'], c.slug).toContain(c.supplierPosture)
    }
    // Each client's panel holds six to twelve suppliers, and an MSP is seated in five of the ten programs.
    for (const c of frame.byPosition('CLIENT')) {
      const panel = await prisma.counterparty.count({ where: { companyId: c.id, relationship: 'SUPPLIER' } })
      expect(panel, c.name).toBeGreaterThanOrEqual(SCALE.panelSize.min)
      expect(panel, c.name).toBeLessThanOrEqual(SCALE.panelSize.max)
    }
    expect(await prisma.programSeat.count({ where: { clientCompany: { slug: { startsWith: SCALE_SLUG_PREFIX } } } })).toBe(SCALE.mspRuns)
    // Every supplier reaches a client, directly or through a firm above it.
    const onPanel = new Set(frame.byPosition('CLIENT').flatMap((c) => frame.panelOf(c.id).map((x) => x.id)))
    const reaches = (id: string, depth = 0): boolean =>
      onPanel.has(id) || (depth < 4 && frame.trades.some((t) => t.seller === id && t.relationship === 'PRIME' && reaches(t.buyer, depth + 1)))
    for (const f of frame.firms.filter((x) => !['CLIENT', 'MSP'].includes(x.position))) expect(reaches(f.id), f.name).toBe(true)
    // Invented names, ids that sort after the base world's, and no two ids sharing the tail an invoice number is cut from.
    expect(namedFirms(frame)).toEqual([])
    const base = await prisma.company.findFirstOrThrow({ where: { slug: 'world-nike' }, select: { id: true } })
    for (const f of frame.firms) expect(f.id > base.id, f.name).toBe(true)
    expect(sharedTails(frame.firms.flatMap((f) => [f.id, ...f.seats.map((x) => x.personId)]))).toEqual([])
  })

  it('a second seeding writes nothing', async () => {
    const before = await counts()
    // Past the step markers too: every step walked again finds its rows and writes none.
    await seedFrame(frame)
    const again = await seedScaleWorld()
    expect(again.ran).toEqual([])
    expect(await counts()).toEqual(before)
  })

  it('no two people at one firm share a name', () => {
    const byFirm = new Map<string, string[]>()
    for (const c of s.seated as any[]) byFirm.set(c.companyId, [...(byFirm.get(c.companyId) ?? []), c.person.name])
    for (const [firm, names] of byFirm) {
      const first = names.map((n) => n.split(' ')[0].toLowerCase())
      const last = names.map((n) => n.split(' ').slice(1).join(' ').toLowerCase())
      const prefix = last.map((l) => l.replace(/[^a-z]/g, '').slice(0, 4))
      expect(new Set(first).size, `${firm}: ${names.join(', ')}`).toBe(names.length)
      expect(new Set(last).size, `${firm}: ${names.join(', ')}`).toBe(names.length)
      expect(new Set(prefix).size, `${firm}: ${names.join(', ')}`).toBe(names.length)
    }
    // And no two generated people anywhere share a full name.
    const all = (s.seated as any[]).map((c) => c.person.name)
    expect(new Set(all).size).toBe(all.length)
  })

  it('no skill is under four letters', async () => {
    expect(vocabularyFaults()).toEqual([])
    const profiles = await prisma.consultantProfile.findMany({
      where: { person: { primaryEmail: { endsWith: SCALE_EMAIL_SUFFIX } } }, select: { skills: true },
    })
    for (const p of profiles) for (const k of p.skills) expect(k.replace(/[^a-z0-9+#/.]/gi, '').length, k).toBeGreaterThanOrEqual(4)
  })

  it('every job’s skills come from its industry’s list', async () => {
    const vocabulary = new Set(INDUSTRIES.flatMap((i) => skillsOf(i.key)))
    const jobs = await prisma.requirement.findMany({
      where: { company: { slug: { startsWith: SCALE_SLUG_PREFIX } } }, select: { title: true, skills: true },
    })
    expect(jobs.length).toBeGreaterThan(frame.byPosition('CLIENT').length * 10)
    for (const j of jobs) for (const k of j.skills) expect(vocabulary.has(k), `${j.title}: ${k}`).toBe(true)
    // Before the jobs land, the vocabulary they will draw from is each industry's own and non-empty.
    for (const i of INDUSTRIES) expect(skillsOf(i.key).length, i.key).toBeGreaterThan(10)
  })

  it('every person opens as a seat', async () => {
    const catalog = await readCatalog(prisma as any)
    const open = new Set(catalog.seats.map((x) => x.email))
    const people = await prisma.person.findMany({
      where: { primaryEmail: { endsWith: SCALE_EMAIL_SUFFIX }, contexts: { some: { revokedAt: null } } },
      select: { primaryEmail: true },
    })
    expect(people.length).toBeGreaterThanOrEqual(frame.firms.reduce((n, f) => n + f.seats.length, 0))
    for (const p of people) expect(open.has(p.primaryEmail), p.primaryEmail).toBe(true)
    // Every firm opens at `<slug>/owner`.
    const keys = new Set(catalog.seats.map((x) => x.key))
    for (const f of frame.firms) expect(keys.has(`${f.slug}/owner`), f.slug).toBe(true)
  })

  // ── The jobs (etyme-demand) ─────────────────────────────────────────

  it('the band is on the invitation and never on the job', async () => {
    const invitations = await prisma.requirementInvitation.findMany({
      where: { requirement: { company: { slug: { startsWith: SCALE_SLUG_PREFIX } } } },
      select: { requirementId: true, toCompanyId: true, payMin: true, payMax: true, requirement: { select: { title: true, billMin: true, billMax: true } } },
    })
    expect(invitations.length).toBeGreaterThan(1000)
    const bands = new Map<string, Set<number>>()
    for (const i of invitations) {
      // Every supplier reads a band of its own, under the client's ceiling, and never the ceiling itself.
      expect(i.payMin, i.requirement.title).not.toBeNull()
      expect(i.payMax!, i.requirement.title).toBeLessThanOrEqual(i.requirement.billMax!)
      expect([i.payMin, i.payMax]).not.toEqual([i.requirement.billMin, i.requirement.billMax])
      bands.set(i.requirementId, (bands.get(i.requirementId) ?? new Set()).add(i.payMax!))
    }
    const shared = [...bands.values()].filter((b) => b.size > 1).length
    expect(shared / bands.size).toBeGreaterThan(0.9)
    // What a supplier is shown of one is its band, and not the job's ceiling.
    const one = await prisma.requirementInvitation.findFirstOrThrow({
      where: { requirement: { company: { slug: { startsWith: SCALE_SLUG_PREFIX } } } },
      include: { fromCompany: { select: { id: true, name: true, slug: true } }, requirement: { include: { _count: { select: { invitations: true } } } } },
    })
    const view = projectInvitationForVendor({ ...one, requirement: { ...one.requirement, invitationCount: one.requirement._count.invitations } }, 0, new Date())
    expect(view.band).toEqual({ payMin: one.payMin, payMax: one.payMax })
    expect(JSON.stringify(view)).not.toContain('billMax')
  })

  it('most jobs publish themselves, and the rest wait on a named person', async () => {
    const jobs = await prisma.requirement.findMany({
      where: { company: { kind: 'CLIENT', slug: { startsWith: SCALE_SLUG_PREFIX } } },
      select: { id: true, title: true, companyId: true, status: true, approvalState: true },
    })
    const auto = jobs.filter((j) => j.approvalState === 'AUTO_APPROVED').length
    expect(auto / jobs.length).toBeGreaterThan(0.7)
    const waiting = jobs.filter((j) => j.approvalState === 'PENDING_APPROVAL')
    expect(waiting.length).toBeGreaterThanOrEqual(frame.byPosition('CLIENT').length)
    for (const j of waiting) {
      expect(j.status, j.title).toBe('DRAFT')
      const held = await prisma.requirementApproval.findMany({
        where: { requirementId: j.id, outcome: 'PENDING' },
        select: { approver: { select: { name: true, contexts: { where: { companyId: j.companyId }, select: { role: { select: { name: true } } } } } } },
      })
      expect(held, j.title).toHaveLength(1)
      expect(held[0].approver?.name, j.title).toBeTruthy()
      expect(['HR Partner', 'Procurement Lead', 'Approver']).toContain(held[0].approver!.contexts[0]?.role?.name)
    }
  })

  it('no job’s owner raised it', async () => {
    const jobs = await prisma.requirement.findMany({
      where: { company: { slug: { startsWith: SCALE_SLUG_PREFIX } } },
      select: { title: true, ownerId: true, raisedById: true },
    })
    for (const j of jobs) {
      expect(j.ownerId, j.title).not.toBeNull()
      expect(j.ownerId, j.title).not.toBe(j.raisedById)
    }
    // And nobody approves a job they own or raised.
    const decided = await prisma.requirementApproval.findMany({
      where: { approverId: { not: null }, requirement: { company: { slug: { startsWith: SCALE_SLUG_PREFIX } } } },
      select: { approverId: true, requirement: { select: { ownerId: true, raisedById: true } } },
    })
    for (const a of decided) expect([a.requirement.ownerId, a.requirement.raisedById]).not.toContain(a.approverId)
  })

  it('the people put forward, and the interviews they sat, are a year of work', async () => {
    const counted = {
      requirement: await prisma.requirement.count({ where: { company: { slug: { startsWith: SCALE_SLUG_PREFIX } } } }),
      submission: await prisma.submission.count({ where: { toCompany: { slug: { startsWith: SCALE_SLUG_PREFIX } } } }),
      interview: await prisma.interview.count({ where: { company: { slug: { startsWith: SCALE_SLUG_PREFIX } } } }),
    }
    expect(counted.requirement).toBe(jobPlan.jobs.length)
    expect(counted.submission).toBe(jobPlan.submissions.length)
    expect(counted.interview).toBe(jobPlan.interviews.length)
    // Filled, closed, called off and open, across the year; a placed person sat two rounds.
    const statuses = new Set((await prisma.requirement.findMany({
      where: { company: { kind: 'CLIENT', slug: { startsWith: SCALE_SLUG_PREFIX } } }, select: { status: true }, distinct: ['status'],
    })).map((r) => r.status))
    expect([...statuses].sort()).toEqual(['CANCELLED', 'CLOSED', 'DRAFT', 'FILLED', 'OPEN'])
    const placed = await prisma.submission.findFirstOrThrow({
      where: { status: 'PLACED', toCompany: { kind: 'CLIENT', slug: { startsWith: SCALE_SLUG_PREFIX } } }, select: { interviews: { select: { round: true, outcome: true }, orderBy: { round: 'asc' } } },
    })
    expect(placed.interviews).toEqual([{ round: 1, outcome: 'ADVANCE' }, { round: 2, outcome: 'OFFER' }])
  })

  it('a second seeding of the jobs writes nothing, and every job step fits one function call', async () => {
    for (const x of s.jobSteps as { step: string; asked: number }[]) expect(x.asked, x.step).toBeLessThanOrEqual(STEP_QUERY_BUDGET)
    const tables = ['requirement', 'requirementApproval', 'requirementInvitation', 'submission', 'interview'] as const
    const read = async () => Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await (prisma as any)[t].count()])))
    const before = await read()
    const again = buildFrame()
    const everyone = buildPeople(again)
    for (const step of jobSteps(() => everyone)) {
      const asked = counter.asked
      await step.run(again)
      expect(counter.asked - asked, `${step.name}, walked again`).toBeLessThanOrEqual(STEP_QUERY_BUDGET)
    }
    expect(await read()).toEqual(before)
  })

})

/**
 * The people (lib/seed-scale/people, supply): two thousand, freshers to
 * very experienced, in four industries, every bench by their own yes.
 */
describe('the generated world’s people', () => {
  const scalePeople = { primaryEmail: { endsWith: SCALE_EMAIL_SUFFIX } }

  it('the career mix holds: two thousand people, each career its share, four hundred of them an integrator’s own staff', async () => {
    const plan = planPeople(frame)
    const want = careerCounts()
    expect(plan).toHaveLength(SCALE.people)
    for (const [career, share] of Object.entries(CAREER_MIX)) {
      expect(plan.filter((p) => p.facts.career === career).length, career).toBe(want[career as keyof typeof want])
      expect(Math.abs(want[career as keyof typeof want] - share * SCALE.people), career).toBeLessThanOrEqual(1)
    }
    // On the record, the way each career shows itself.
    expect(await prisma.consultantProfile.count({ where: { person: scalePeople } })).toBe(SCALE.people)
    expect(await prisma.enrollment.count({ where: { status: 'COMPLETED', person: scalePeople } })).toBe(want.FRESHER)
    expect(await prisma.consultantProfile.count({ where: { person: scalePeople, ownCompany: { kind: 'CONSULTANT_CORP' } } })).toBe(want.OWN_COMPANY)
    const gsiStaff = await prisma.context.count({
      where: { type: 'EMPLOYEE', revokedAt: null, company: { kind: 'GSI', slug: { startsWith: SCALE_SLUG_PREFIX } }, person: { ...scalePeople, consultant: { listings: { none: {} } } } },
    })
    expect(gsiStaff).toBe(GSI_STAFF)
    const looking = await prisma.person.count({
      where: { ...scalePeople, contexts: { some: { type: 'EMPLOYEE', revokedAt: null } }, consultant: { listings: { some: { state: 'GRANTED', askFirst: true, revokedAt: null } } } },
    })
    expect(looking).toBe(want.LOOKING_WHILE_EMPLOYED)
    const onALine = await prisma.sellContract.findMany({ where: { state: 'IN_PROGRESS', person: scalePeople }, select: { personId: true }, distinct: ['personId'] })
    const ownLive = plan.filter((p) => p.facts.career === 'OWN_COMPANY' && p.lines.some((l) => l.live)).length
    expect(onALine.length).toBe(want.PLACED + ownLive)
    // Horizontal, never vertical: healthcare, manufacturing and finance beside IT, each a real share.
    for (const ind of ['IT', 'HEALTHCARE', 'MANUFACTURING', 'FINANCE']) {
      expect(plan.filter((p) => p.facts.industry === ind).length, ind).toBeGreaterThan(SCALE.people * 0.1)
    }
  })

  it('every skill a person holds comes from the closed vocabulary', async () => {
    const vocabulary = new Set(INDUSTRIES.flatMap((i) => skillsOf(i.key)))
    const profiles = await prisma.consultantProfile.findMany({ where: { person: scalePeople }, select: { skills: true, person: { select: { name: true } } } })
    for (const p of profiles) {
      expect(p.skills.length, p.person.name).toBeGreaterThanOrEqual(3)
      expect(p.skills.length, p.person.name).toBeLessThanOrEqual(7)
      for (const k of p.skills) expect(vocabulary.has(k), `${p.person.name}: ${k}`).toBe(true)
    }
  })

  it('no person is on a bench they did not consent to', async () => {
    const plan = new Map(planPeople(frame).map((p) => [p.facts.id, p]))
    const listings = await prisma.benchListing.findMany({
      where: { consultant: { person: scalePeople } },
      select: { companyId: true, state: true, invitedAt: true, respondedAt: true, grantedAt: true, revokedAt: true, stayDays: true, staysUntil: true, consultant: { select: { personId: true } } },
    })
    const ties = await prisma.counterparty.findMany({ where: { company: { slug: { startsWith: SCALE_SLUG_PREFIX } } }, select: { companyId: true, otherCompanyId: true } })
    const trades = new Set(ties.map((t) => `${t.companyId}|${t.otherCompanyId}`))
    let live = 0
    for (const l of listings) {
      const p = plan.get(l.consultant.personId)!
      expect(p, l.consultant.personId).toBeTruthy()
      // An integrator's own staff are on its payroll, not on anybody's bench.
      expect(p.gsiStaff, p.facts.name).toBe(false)
      if (l.state !== 'GRANTED' || l.revokedAt) continue
      live++
      // Their yes, after they were asked, for a stay they chose or until they cancel.
      expect(l.respondedAt, p.facts.name).not.toBeNull()
      expect(l.grantedAt.getTime(), p.facts.name).toBeGreaterThanOrEqual(l.invitedAt!.getTime())
      if (l.stayDays != null) expect(STAY_CHOICES as readonly number[], p.facts.name).toContain(l.stayDays)
      if (l.staysUntil) expect(l.staysUntil.getTime(), p.facts.name).toBeGreaterThan(day(0).getTime())
      // At their own firm, or a firm their firm already trades with.
      const home = p.facts.listing?.firmId ?? p.facts.firmId
      const ok = l.companyId === home || l.companyId === p.facts.firmId || trades.has(`${home}|${l.companyId}`)
      expect(ok, `${p.facts.name} is listed at a firm their own firm does not trade with`).toBe(true)
    }
    expect(live).toBeGreaterThan(SCALE.people / 2)
    // "Until cancelled" is the default, so most never chose a number.
    const live2 = listings.filter((l) => l.state === 'GRANTED' && !l.revokedAt)
    expect(live2.filter((l) => l.stayDays == null).length).toBeGreaterThan(live2.length / 2)
  })

  it('every placed person has a pay pair at or under the bill', async () => {
    const links = await prisma.contractLink.findMany({
      where: { sellContract: { person: scalePeople } },
      select: { sellContract: { select: { billRate: true, personId: true } }, buyContract: { select: { candidates: { select: { personId: true, payRate: true } } } } },
    })
    expect(links.length).toBeGreaterThan(SCALE.people)
    for (const l of links) {
      const pay = l.buyContract.candidates.find((c) => c.personId === l.sellContract.personId)
      expect(pay, l.sellContract.personId).toBeTruthy()
      expect(pay!.payRate).toBeGreaterThan(0)
      expect(pay!.payRate).toBeLessThanOrEqual(l.sellContract.billRate)
    }
    // A live line with no pay line under it is a one-person company's own: the prime above pays it corp-to-corp.
    const unpaid = await prisma.sellContract.findMany({
      where: { state: 'IN_PROGRESS', person: scalePeople, buyLinks: { none: {} } }, select: { company: { select: { kind: true } } },
    })
    for (const u of unpaid) expect(u.company.kind).toBe('CONSULTANT_CORP')
    expect(unpaid.length).toBeGreaterThan(0)
  })

  it('tenure near a time limit is a minority, and nobody is past one', async () => {
    const lines = await prisma.sellContract.findMany({
      where: { person: scalePeople, state: { in: ['ENDED', 'IN_PROGRESS'] } },
      select: { personId: true, endClientCompanyId: true, clientCompanyId: true, startDate: true, endDate: true },
    })
    const rules = await prisma.governanceRule.findMany({
      where: { ruleType: 'TENURE_CAP', policy: { company: { slug: { startsWith: SCALE_SLUG_PREFIX } } } },
      select: { parameters: true, policy: { select: { companyId: true } } },
    })
    const cap = new Map(rules.map((r) => [r.policy.companyId, Number((r.parameters as any).maxMonths)]))
    const at = new Map<string, { startDate: Date; endDate: Date | null }[]>()
    for (const l of lines) {
      const k = `${l.personId}|${l.endClientCompanyId ?? l.clientCompanyId}`
      at.set(k, [...(at.get(k) ?? []), { startDate: l.startDate, endDate: l.endDate }])
    }
    const near = new Set<string>()
    for (const [k, periods] of at) {
      const months = cap.get(k.split('|')[1])!
      expect(months, k).toBeGreaterThan(0)
      const days = daysOnSite(periods, day(0))
      expect(days, `${k} is past the client's limit`).toBeLessThan(daysFor(months))
      if (days >= daysFor(months) - 61) near.add(k.split('|')[0])
    }
    expect(near.size).toBeGreaterThan(0)
    expect(near.size).toBeLessThanOrEqual(NEAR_TIME_LIMIT_SHARE * SCALE.people)
  })

  it('somebody who left a bench for their own company owns it, and the prime above pays it corp-to-corp', async () => {
    const solos = planPeople(frame).filter((p) => p.facts.career === 'OWN_COMPANY')
    const owners = await prisma.context.findMany({
      where: { companyId: { in: solos.map((p) => soloIdOf(p.facts.id)) }, role: { name: 'Owner' }, revokedAt: null },
      select: { personId: true, companyId: true },
    })
    expect(owners).toHaveLength(solos.length)
    for (const o of owners) expect(o.companyId).toBe(soloIdOf(o.personId))
    const buys = await prisma.buyContract.findMany({ where: { vendorCompanyId: { in: solos.map((p) => soloIdOf(p.facts.id)) } }, select: { contractType: true } })
    expect(buys.length).toBeGreaterThan(0)
    for (const b of buys) expect(b.contractType).toBe('C2C')
    // The bench they left still shows their yes, taken back.
    const left = await prisma.benchListing.count({ where: { consultant: { person: { id: { in: solos.map((p) => p.facts.id) } } }, revokedAt: { not: null }, lapsedAt: null } })
    expect(left).toBe(solos.length)
  })

  it('every step of the people fits one function call, and a second seeding writes nothing', async () => {
    const over = (s.peopleSteps as { step: string; asked: number }[]).filter((x) => x.asked > STEP_QUERY_BUDGET)
    expect(over, 'These steps would not finish in one call against production. Cut them into shares.').toEqual([])
    const TABLES = ['person', 'consultantProfile', 'resume', 'context', 'role', 'company', 'course', 'enrollment', 'benchListing', 'doNotSubmit',
      'sellContract', 'buyContract', 'buyContractCandidate', 'contractLink', 'counterparty', 'masterAgreement', 'engagement', 'projectRelease'] as const
    const count = async () => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await (prisma as any)[t].count()])))
    const before = await count()
    for (const step of peopleSteps(frame)) {
      const asked = counter.asked
      await step.run(frame)
      expect(counter.asked - asked, `${step.name}, walked again`).toBeLessThanOrEqual(STEP_QUERY_BUDGET)
    }
    expect(await count()).toEqual(before)
  })

  it('no two contracts share the tail an invoice number is cut from', async () => {
    const ids = (await prisma.sellContract.findMany({ select: { id: true } })).map((x) => x.id)
    expect(sharedTails(ids)).toEqual([])
  })

  it('every one of the two thousand opens as a seat', async () => {
    const catalog = await readCatalog(prisma as any)
    const open = new Set(catalog.seats.map((x) => x.email))
    const missing = planPeople(frame).filter((p) => !open.has(p.facts.email)).map((p) => p.facts.email)
    expect(missing).toEqual([])
  })
})

