/**
 * The generated world's papers (lib/seed-scale/papers, regulatory),
 * decided without the database: who holds which paper, in which state,
 * recorded by whom. The integration file (`__integration__/seed-scale.test.ts`)
 * reads the same rules off the written rows.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'

/**
 * A database that has nothing yet: it counts every question the papers'
 * steps ask, keeps the ids each step writes, answers "already there" for
 * what an earlier step wrote, and notes any row written before the row it
 * points at. The pure tests below never touch it.
 */
const fake = vi.hoisted(() => {
  const state = {
    asked: 0,
    written: new Map<string, Set<string>>(),
    orphans: [] as string[],
    orders: [] as { id: string; issuedById: string; startDate: Date | null }[],
    lines: [] as { id: string; workOrderId: string | null }[],
  }
  const has = (table: string, id: unknown) => typeof id === 'string' && !!state.written.get(table)?.has(id)
  const pointsAt: Record<string, (r: Record<string, unknown>) => [string, unknown][]> = {
    documentBacking: (r) => [['verification', r.formId], ['verification', r.evidenceId]],
    adverseAction: (r) => [['verification', r.verificationId]],
    visaEvent: (r) => [['visaPetition', r.petitionId]],
    visaDocument: (r) => [['visaPetition', r.petitionId]],
    documentRequirement: (r) => (r.inheritedFromId ? [['documentRequirement', r.inheritedFromId]] : []),
  }
  const model = (table: string) => ({
    findMany: async (a: { where?: { id?: { in?: string[] } } }) => {
      state.asked++
      if (table === 'workOrder') return state.orders
      if (table === 'sellContract') return state.lines.filter((l) => a.where?.id?.in?.includes(l.id))
      return (a.where?.id?.in ?? []).filter((id) => has(table, id)).map((id) => ({ id }))
    },
    createMany: async (a: { data: Record<string, unknown>[] }) => {
      state.asked++
      for (const r of a.data) {
        for (const [to, id] of pointsAt[table]?.(r) ?? []) if (!has(to, id)) state.orphans.push(`${table} ${String(r.id)} → ${to} ${String(id)}`)
      }
      const ids = state.written.get(table) ?? new Set<string>()
      for (const r of a.data) ids.add(String(r.id))
      state.written.set(table, ids)
      return { count: a.data.length }
    },
  })
  const prisma = new Proxy({}, { get: (_t, name) => (typeof name === 'string' && !name.startsWith('$') && name !== 'then' ? model(name) : undefined) })
  return { state, prisma }
})
vi.mock('@/lib/db', () => ({ prisma: fake.prisma }))

import { anchorSeed, day } from '@/lib/seed-days'
import { I9_EVIDENCE, readVerdict } from '@/lib/attestation'
import { CANNOT_BE_WAIVED } from '@/lib/document-requirements'
import { byCalendar } from '@/lib/visa-petition'
import { buildFrame } from '@/lib/seed-scale/frame'
import { buildPeople, planPeople } from '@/lib/seed-scale/people'
import { planPapers, paperCounts, paperStepNames, paperSteps, paperAfterRatesSteps, asksFor, waiversFor, editionOn, handfulPer, PAPER_SHARES, type PaperPlan } from '@/lib/seed-scale/papers'
import { sharesFor } from '@/lib/seed-scale/index'
import { idFor } from '@/lib/seed-scale/kit'
import { STEP_QUERY_BUDGET, sizeFor, type ScaleFrame } from '@/lib/seed-scale/types'

let frame: ScaleFrame
let plan: PaperPlan
const byId = new Map<string, any>()

beforeAll(() => {
  anchorSeed(new Date('2026-10-21T00:00:00Z'))
  frame = buildFrame()
  plan = planPapers(frame, buildPeople(frame))
  for (const r of [...plan.person, ...plan.evidence, ...plan.cover]) byId.set(r.id, r)
})

describe('the generated world’s papers, before anything is written', () => {
  it('every placed person at a US site holds an I-9, completed by their employer on a named edition, backed by a named document on the list that was in date the day it was shown', () => {
    const live = planPeople(frame).filter((p) => p.facts.country === 'US' && p.lines.some((l) => l.live && !l.ownCompany))
    expect(live.length).toBeGreaterThan(200)
    expect(new Set(plan.placedUs)).toEqual(new Set(live.map((p) => p.facts.id)))
    for (const p of live) {
      const employer = p.lines.find((l) => l.live)!.chain.at(-1)!
      const form = plan.person.find((v) => v.type === 'I9_EVERIFY' && v.personId === p.facts.id && frame.byId.get(employer)!.seats.some((s) => s.personId === v.uploadedById))
      expect(form, `${p.facts.name} has an I-9 from ${frame.byId.get(employer)!.name}`).toBeTruthy()
      expect(form!.formEdition, p.facts.name).toBeTruthy()
      const backed = plan.backings.filter((b) => b.formId === form!.id)
      expect(backed.length, p.facts.name).toBeGreaterThan(0)
      for (const b of backed) {
        const ev = byId.get(b.evidenceId)
        expect(I9_EVIDENCE as readonly string[]).toContain(ev.type)
        expect(b.satisfiedKey).toBe(ev.type)
        expect(ev.provider, 'the document names who issued it').toBeTruthy()
        expect(ev.expiresAt.getTime()).toBeGreaterThanOrEqual((form!.issuedAt as Date).getTime())
      }
      // Nobody working today is on an I-9 that has already lapsed under them.
      if (form!.expiresAt) expect((form!.expiresAt as Date).getTime(), p.facts.name).toBeGreaterThan(day(0).getTime())
    }
  })

  it('an I-9 is completed on the edition in force that day, except a handful on a retired edition and a few old rows with none, which are the audit findings', () => {
    const c = paperCounts(plan).I9_EVERIFY
    expect(c.RETIRED_EDITION).toBeGreaterThan(0)
    expect(c.RETIRED_EDITION).toBeLessThan(30)
    expect(c.NO_EDITION).toBeGreaterThan(0)
    expect(c.NO_EDITION).toBeLessThan(30)
    const i9 = plan.person.filter((v) => v.type === 'I9_EVERIFY')
    const onTheDay = i9.filter((v) => v.formEdition === editionOn(v.issuedAt as Date)).length
    expect(onTheDay / i9.length).toBeGreaterThan(0.9)
    // A missing edition is only ever an old row from a past employer, never the I-9 somebody is working on today.
    const working = new Map(planPeople(frame).flatMap((p) => {
      const l = p.lines.find((x) => x.live && !x.ownCompany)
      return l ? [[p.facts.id, l.chain.at(-1)!] as const] : []
    }))
    for (const v of i9.filter((x) => !x.formEdition)) {
      const employer = working.get(v.personId!)
      if (employer) expect(frame.byId.get(employer)!.seats.some((s) => s.personId === v.uploadedById), v.id).toBe(false)
    }
  })

  it('every background verdict names its screening company, its reference, its date and the firm that ordered it, in the company’s own words', () => {
    const checks = plan.person.filter((v) => v.type === 'BACKGROUND_CHECK' || v.type === 'DRUG_SCREENING')
    expect(checks.length).toBeGreaterThan(1000)
    for (const v of checks) {
      expect(v.provider, v.id).toBeTruthy()
      expect(v.referenceId, v.id).toBeTruthy()
      expect(v.verifiedAt, v.id).toBeTruthy()
      expect(v.orderedByCompanyId, `${v.id} names the firm that ordered it`).toBeTruthy()
      if (v.status !== 'IN_PROGRESS') {
        expect((v.result as any).providerSays, v.id).toBeTruthy()
        const reading = readVerdict({ key: v.type as string, status: v.status === 'FLAGGED' ? 'FAILED' : (v.status as string), provider: v.provider, reference: v.referenceId, on: v.issuedAt as Date })
        expect(reading.rendered, v.id).toBe(true)
      } else {
        expect(v.orderedAt, `${v.id} sent out says when`).toBeTruthy()
      }
    }
  })

  it('a flagged report on somebody working today carries the firm’s decision not to act on it and the reason, beside the report and never over it', () => {
    const flagged = plan.person.filter((v) => v.status === 'FLAGGED')
    expect(flagged.length).toBeGreaterThan(0)
    const working = new Set(plan.placedUs)
    for (const v of flagged) {
      const r = v.result as any
      expect(r.outcome).toBe('FLAGGED')
      expect(r.providerSays).toBeTruthy()
      // The provider's words are left as they wrote them: the firm's steps are rows of their own.
      expect(r.adverse).toBeUndefined()
    }
    for (const a of plan.adverse) {
      const report = flagged.find((v) => v.id === a.verificationId)
      expect(report, 'a step is only ever taken on a flagged report').toBeTruthy()
      expect(a.step).toBe('NOT_TAKEN')
      expect((a.reason ?? '').length).toBeGreaterThan(20)
      expect(a.companyId, 'by the firm that ordered it').toBe(report!.orderedByCompanyId)
      expect(frame.byId.get(a.companyId)!.seats.some((s) => s.personId === a.byId)).toBe(true)
      expect(a.sellContractId).toBeTruthy()
      // No notice is claimed as given without the paper behind it.
      expect(a.noticeDocumentId ?? null).toBeNull()
    }
    expect(plan.adverse.some((a) => working.has(flagged.find((v) => v.id === a.verificationId)!.personId!))).toBe(true)
  })

  it('a handful of supplier covers have lapsed, each naming its supplier, and every supplier has cover in date or a gap the start refuses', () => {
    const lapsed = plan.cover.filter((v) => (v.expiresAt as Date).getTime() < day(0).getTime())
    expect(lapsed.length).toBeGreaterThanOrEqual(3)
    expect(lapsed.length).toBeLessThanOrEqual(10)
    for (const v of lapsed) {
      const firm = frame.byId.get(v.companyId!)
      expect(firm, 'a lapsed cover names its supplier').toBeTruthy()
      expect(['SUB_VENDOR', 'BENCH']).toContain(firm!.position)
      expect(v.provider, 'and the insurer or state that issued it').toBeTruthy()
    }
    const suppliers = frame.firms.filter((f) => ['PRIME', 'SUB_VENDOR', 'BENCH', 'GSI'].includes(f.position))
    for (const f of suppliers) {
      for (const kind of ['INSURANCE_GL', 'GOOD_STANDING']) {
        expect(plan.cover.some((v) => v.companyId === f.id && v.type === kind), `${f.name} ${kind}`).toBe(true)
      }
    }
    // Recorded by the firm that buys from it, never by the supplier itself.
    for (const v of plan.cover) {
      const recorder = frame.firms.find((f) => f.seats.some((s) => s.personId === v.uploadedById))!
      expect(recorder.id).not.toBe(v.companyId)
    }
    expect(plan.missingCover.length).toBeGreaterThan(0)
  })

  it('every paper the rules read appears in every state: current, running out inside thirty days, lapsed, not yet started, missing, and waived with a reason', () => {
    const c = paperCounts(plan)
    for (const kind of ['BACKGROUND_CHECK', 'PROFESSIONAL_LICENSE', 'I9_EVERIFY']) {
      for (const state of ['CURRENT', 'EXPIRING', 'LAPSED']) expect(c[kind][state], `${kind} ${state}`).toBeGreaterThan(0)
    }
    expect(c.INSURANCE_GL.NOT_STARTED).toBeGreaterThan(0)
    expect(c.BACKGROUND_CHECK.ORDERED).toBeGreaterThan(0)
    expect(c.BACKGROUND_CHECK.CONDITIONAL).toBeGreaterThan(0)
    expect(c.MISSING.BACKGROUND_CHECK_NOT_ON_FILE).toBeGreaterThan(0)
    expect(c.MISSING.BACKGROUND_CHECK_WAIVED).toBeGreaterThan(0)
    for (const w of plan.waived) {
      expect(w.reason.length).toBeGreaterThan(40)
      // A waived line's person carries no background report: the waiver is why.
      expect(plan.person.some((v) => v.personId === w.personId && v.type === 'BACKGROUND_CHECK')).toBe(false)
    }
  })

  it('nobody’s work authorization is waived: the only waiver the papers write is a background check, with a reason and a name', () => {
    const orders = [{ id: 'o1', issuedById: frame.byPosition('CLIENT')[0].id, startDate: day(-30) }]
    const asks = asksFor(orders, frame)
    expect(asks.map((a) => a.documentTypeKey)).toContain('I9_EVERIFY')
    for (const a of asks) expect(a.waivedReason ?? null).toBeNull()
    expect(asks.find((a) => a.documentTypeKey === 'BACKGROUND_CHECK')!.owedBy).toBe('US')
    const lineOrder = new Map(plan.waived.map((w) => [w.sellId, w.orderId]))
    const waivers = waiversFor(plan, new Set(plan.waived.map((w) => w.orderId)), lineOrder)
    expect(waivers.length).toBe(plan.waived.length)
    for (const w of waivers) {
      expect(CANNOT_BE_WAIVED).not.toContain(w.documentTypeKey)
      expect(w.documentTypeKey).toBe('BACKGROUND_CHECK')
      expect(w.waivedReason).toBeTruthy()
      expect(w.waivedById).toBeTruthy()
      expect(w.owedBy).toBe('US')
    }
  })

  it('every H-1B person has a petition whose status, trail and papers agree, and a few run out inside the assignment', () => {
    const h1b = planPeople(frame).filter((p) => p.facts.workAuth === 'H1B')
    // A transfer petition is a second H-1B for one person; students' status records sit beside them.
    expect(new Set(plan.petitions.filter((p) => p.type === 'H1B').map((p) => p.personId)).size).toBe(h1b.length)
    for (const pet of plan.petitions) {
      const trail = plan.visaEvents.filter((e) => e.petitionId === pet.id).sort((a, b) => (a.occurredAt as Date).getTime() - (b.occurredAt as Date).getTime())
      expect(trail[0].eventType).toBe('FILED')
      for (const e of trail) expect((e.occurredAt as Date).getTime(), pet.id).toBeLessThanOrEqual(day(0).getTime())
      // The nightly watch would not move it: what the calendar says is what the row says.
      if (['ACTIVE', 'EXPIRING'].includes(pet.status)) {
        const moved = byCalendar(pet.status, pet.expiresAt as Date, day(0))
        expect(moved === null || moved === pet.status, `${pet.id} ${pet.status}`).toBe(true)
      }
      if (pet.approvedAt && pet.type === 'H1B') expect(plan.visaDocuments.some((d) => d.petitionId === pet.id && d.docType === 'I797')).toBe(true)
    }
    const working = new Set(plan.placedUs)
    expect(plan.petitions.filter((p) => working.has(p.personId) && p.status === 'EXPIRING').length).toBeGreaterThan(0)
    for (const s of ['FILED', 'RFE', 'APPROVED', 'STAMPED', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'DENIED']) {
      expect(plan.petitions.some((p) => p.type === 'H1B' && p.status === s), s).toBe(true)
    }
  })

  it('the employer, and only the employer, says whether a placed W2 is exempt from overtime, and nonexempt is the default', () => {
    expect(plan.exempt.length).toBe(plan.placedUs.length)
    const nonexempt = plan.exempt.filter((e) => e.status === 'NONEXEMPT').length
    expect(nonexempt / plan.exempt.length).toBeGreaterThan(0.8)
    for (const e of plan.exempt) {
      const firm = frame.byId.get(e.assertedByCompanyId)!
      expect(firm.seats.some((s) => s.personId === e.assertedById)).toBe(true)
      if (e.status === 'EXEMPT') {
        expect(e.basis).toBe('COMPUTER')
        expect((e.note ?? '').length).toBeGreaterThanOrEqual(40)
      } else expect(e.basis).toBeNull()
    }
  })

  it('every paper is the same on every plan, ids sort after the base world’s, and no id is used twice', () => {
    const all = [...plan.person, ...plan.evidence, ...plan.backings, ...plan.petitions, ...plan.visaEvents, ...plan.visaDocuments, ...plan.exempt, ...plan.cover]
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length)
    for (const r of all) expect(r.id.startsWith('cz'), r.id).toBe(true)
    const again = planPapers(buildFrame(), buildPeople(frame))
    expect(again.person.map((r) => [r.id, r.status, r.expiresAt])).toEqual(plan.person.map((r) => [r.id, r.status, r.expiresAt]))
    expect(paperStepNames()).toEqual(['scale:papers:people', 'scale:papers:visas', 'scale:papers:overtime', 'scale:papers:cover', 'scale:papers:asks'])
  })
})

describe('the generated world’s papers at any size', () => {
  it('a world of any size gets every person’s papers in every state, in steps that stay under the line', async () => {
    for (const people of [2000, 17_000]) {
      const size = sizeFor(people)
      const world = buildFrame(size)
      const theirs = buildPeople(world)
      const want = planPapers(world, theirs)
      const at = `at ${people} people`

      // Every person's papers: an I-9 for everybody placed on a W2 line at a US site, a petition behind every H-1B.
      const placed = planPeople(world).filter((p) => theirs.some((t) => t.id === p.facts.id) && p.facts.country === 'US' && p.lines.some((l) => l.live && !l.ownCompany))
      expect(new Set(want.placedUs), at).toEqual(new Set(placed.map((p) => p.facts.id)))
      for (const id of want.placedUs) expect(want.person.some((v) => v.personId === id && v.type === 'I9_EVERIFY'), `${id} ${at}`).toBe(true)
      for (const p of theirs.filter((t) => t.workAuth === 'H1B')) expect(want.petitions.some((v) => v.personId === p.id), `${p.name} ${at}`).toBe(true)
      for (const f of world.firms.filter((x) => ['PRIME', 'SUB_VENDOR', 'BENCH', 'GSI'].includes(x.position))) {
        expect(want.cover.some((v) => v.companyId === f.id && v.type === 'GOOD_STANDING'), `${f.name} ${at}`).toBe(true)
      }
      // In every state, the way the base size has them, the lapses a handful per hundred suppliers.
      const c = paperCounts(want)
      for (const kind of ['BACKGROUND_CHECK', 'PROFESSIONAL_LICENSE', 'I9_EVERIFY']) {
        for (const state of ['CURRENT', 'EXPIRING', 'LAPSED']) expect(c[kind][state], `${kind} ${state} ${at}`).toBeGreaterThan(0)
      }
      for (const [kind, state] of [['INSURANCE_GL', 'NOT_STARTED'], ['INSURANCE_GL', 'LAPSED'], ['GOOD_STANDING', 'LAPSED'], ['BACKGROUND_CHECK', 'ORDERED'], ['BACKGROUND_CHECK', 'CONDITIONAL'], ['BACKGROUND_CHECK', 'FLAGGED'], ['I9_EVERIFY', 'RETIRED_EDITION']]) {
        expect(c[kind]?.[state], `${kind} ${state} ${at}`).toBeGreaterThan(0)
      }
      expect(c.MISSING.COVER, at).toBeGreaterThanOrEqual(handfulPer(world))
      expect(c.MISSING.BACKGROUND_CHECK_WAIVED, at).toBeGreaterThan(0)

      // Written in shares that grow with the world, each under the line, nothing before what it points at.
      fake.state.asked = 0
      fake.state.written.clear()
      fake.state.orphans = []
      fake.state.orders = world.trades.filter((t) => t.relationship !== 'RUNS').map((t) => ({ id: idFor(`order/${t.buyer}/${t.seller}`), issuedById: t.buyer, startDate: day(-200) }))
      fake.state.lines = want.waived.map((w) => ({ id: w.sellId, workOrderId: w.orderId }))
      const shares = sharesFor(PAPER_SHARES, size)
      const steps = [...paperSteps(world, () => theirs, size), ...paperAfterRatesSteps(() => theirs, size)]
      expect(steps.length, at).toBe(5 * shares)
      expect(paperStepNames(size), at).toEqual(steps.map((x) => x.name))
      for (const walk of ['fresh', 'walked again']) {
        const before = fake.state.written.get('verification')?.size ?? 0
        for (const step of steps) {
          const asked = fake.state.asked
          await step.run(world)
          expect(fake.state.asked - asked, `${step.name} ${walk} ${at}`).toBeLessThanOrEqual(STEP_QUERY_BUDGET)
        }
        if (walk === 'walked again') expect(fake.state.written.get('verification')?.size, `a second seeding writes nothing ${at}`).toBe(before)
      }
      expect(fake.state.orphans, at).toEqual([])
      // Every row the plan holds is written, in exactly one share.
      const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id))
      expect(fake.state.written.get('verification'), at).toEqual(ids([...want.evidence, ...want.person, ...want.cover]))
      expect(fake.state.written.get('documentBacking'), at).toEqual(ids(want.backings))
      expect(fake.state.written.get('adverseAction'), at).toEqual(ids(want.adverse))
      expect(fake.state.written.get('visaPetition'), at).toEqual(ids(want.petitions))
      expect(fake.state.written.get('visaEvent'), at).toEqual(ids(want.visaEvents))
      expect(fake.state.written.get('visaDocument'), at).toEqual(ids(want.visaDocuments))
      expect(fake.state.written.get('exemptAssertion'), at).toEqual(ids(want.exempt))
      expect(fake.state.written.get('documentRequirement')?.size, at).toBeGreaterThan(fake.state.orders.length * 4)
    }
    // Two thousand is one step each under its old name; seventeen thousand is nine of each.
    expect(paperStepNames(sizeFor(2000))).toEqual(['scale:papers:people', 'scale:papers:visas', 'scale:papers:overtime', 'scale:papers:cover', 'scale:papers:asks'])
    expect(paperStepNames(sizeFor(17_000)).slice(0, 2)).toEqual(['scale:papers:people:1-of-9', 'scale:papers:people:2-of-9'])
    expect(handfulPer(buildFrame(sizeFor(2000)))).toBe(1)
    expect(handfulPer(buildFrame(sizeFor(17_000)))).toBe(9)
  }, 120_000)
})
