import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { seedScaleWorld } from '@/lib/seed-scale'
import { buildFrame, seedFrame, namedFirms } from '@/lib/seed-scale/frame'
import { INDUSTRIES, vocabularyFaults, skillsOf } from '@/lib/seed-scale/industries'
import { sharedTails } from '@/lib/seed-scale/kit'
import { SCALE, SCALE_EMAIL_SUFFIX, SCALE_SLUG_PREFIX, type ScaleFrame } from '@/lib/seed-scale/types'
import { readCatalog } from '../scripts/simulate/actors'

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
  s.seated = await prisma.context.findMany({
    where: { company: { slug: { startsWith: SCALE_SLUG_PREFIX } }, revokedAt: null },
    select: { companyId: true, grantedAt: true, person: { select: { name: true, primaryEmail: true } }, role: { select: { name: true } } },
    orderBy: { grantedAt: 'asc' },
  })
}, 600_000)

describe('the generated world at the founder’s scale', () => {
  it('every generated firm holds the roles the simulation looks for', async () => {
    expect(s.first.done, JSON.stringify(s.first)).toBe(true)
    expect(s.firms).toHaveLength(SCALE.clients + SCALE.gsis + SCALE.msps + SCALE.suppliers)
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
})
