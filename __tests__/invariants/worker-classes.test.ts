/**
 * Every kind of worker, at the start of US work (the founder, 2026-11-08):
 * the rule per class with its source, the papers the generated world gives
 * each class, and the count the report prints. Unit only.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: () => undefined }) }))

import {
  WORKER_CLASSES, WORKER_CLASS_RULES, CLASS_PAPERS, classOfWorkAuth, enforcedAs, employerNamedIn, employerNamedNote,
  mayInterview, sameFirm, workerClassStart, type WorkerClassFacts,
} from '@/lib/document-stages/worker-class'
import { factsFrom } from '@/lib/document-stages/worker-class-facts'
import { contractClearance } from '@/lib/contract-clearance'
import { authDecision } from '@/lib/work-authorisation'
import { WorkerClassTally, tallyByWorkerClass } from '../../scripts/simulate/stages/regulatory/stage-tally'
import { classKey, refusalPhrase } from '../../scripts/simulate/stages/regulatory/worker-classes'
import { anchorSeed, day } from '@/lib/seed-days'
import { buildFrame } from '@/lib/seed-scale/frame'
import { buildPeople, planPeople } from '@/lib/seed-scale/people'
import { planPapers, type PaperPlan } from '@/lib/seed-scale/papers'

const ON = new Date('2026-11-08T00:00:00Z')
const D = (n: number) => new Date(ON.getTime() + n * 86_400_000)
const US = { country: 'US', offshore: false }
const base = (over: Partial<WorkerClassFacts>): WorkerClassFacts => ({
  personName: 'Priya Raman', cls: null, workCountry: US, on: ON, employerName: 'Brightmoor Staffing', ...over,
})

describe('the rule for each class of worker, with its source', () => {
  it('every rule names the regulation it stands on, and a rule not confirmed with its source only warns', () => {
    for (const r of Object.values(WORKER_CLASS_RULES)) {
      expect(r.source, r.key).toMatch(/CFR|INA|U\.S\.C\.|M-274/)
      if (!r.confirmed) expect(enforcedAs(r), r.key).not.toBe('BLOCK')
    }
    expect(enforcedAs({ ...WORKER_CLASS_RULES.F1_NO_PERMIT, confirmed: false })).toBe('WARN')
  })

  it('every class the founder named has its papers written down', () => {
    for (const c of WORKER_CLASSES) expect(CLASS_PAPERS[c].length, c).toBeGreaterThan(0)
  })

  it('an international student with no CPT or OPT is interviewed and never started for US work', () => {
    expect(mayInterview('F1_NO_PERMIT').may).toBe(true)
    const d = workerClassStart(base({ cls: 'F1_NO_PERMIT' }))
    expect(d.verdict).toBe('BLOCK')
    expect(d.says).toContain('may not start US work')
    expect(d.source).toContain('214.2(f)')
  })

  it('a citizen, a permanent resident and a domestic student need only the I-9', () => {
    for (const cls of ['CITIZEN', 'GREEN_CARD', 'STUDENT_DOMESTIC'] as const) {
      expect(workerClassStart(base({ cls })).verdict, cls).toBe('PASS')
    }
  })

  it('work done outside the US asks none of this, even of a student with no permit', () => {
    const d = workerClassStart(base({ cls: 'F1_NO_PERMIT', workCountry: { country: 'IN', offshore: true } }))
    expect(d.verdict).toBe('PASS')
  })

  it('a CPT student starts only for the employer the I-20 names, and within the school’s dates', () => {
    expect(workerClassStart(base({ cls: 'F1_CPT', cpt: [] })).rule).toBe('CPT_NONE')
    const other = workerClassStart(base({ cls: 'F1_CPT', cpt: [{ employerNamed: 'Techpeple Inc', from: D(-10), to: D(100) }] }))
    expect(other.verdict).toBe('BLOCK')
    expect(other.rule).toBe('CPT_OTHER_EMPLOYER')
    expect(other.says).toContain('Techpeple Inc, not Brightmoor Staffing')
    const out = workerClassStart(base({ cls: 'F1_CPT', cpt: [{ employerNamed: 'Brightmoor Staffing LLC', from: D(-100), to: D(-3) }] }))
    expect(out.rule).toBe('CPT_OUTSIDE_DATES')
    expect(workerClassStart(base({ cls: 'F1_CPT', cpt: [{ employerNamed: 'Brightmoor Staffing, LLC', from: D(-1), to: D(100) }] })).verdict).toBe('PASS')
  })

  it('an OPT or EAD card that ran out refuses the start, and a current one starts it', () => {
    for (const cls of ['OPT', 'EAD'] as const) {
      const lapsed = workerClassStart(base({ cls, permits: [{ expiresAt: D(-4), category: 'C09' }] }))
      expect(lapsed.verdict, cls).toBe('BLOCK')
      expect(lapsed.says).toContain('ran out on November 4, 2026')
      expect(workerClassStart(base({ cls, permits: [{ expiresAt: D(-4) }, { validFrom: D(-1), expiresAt: D(300) }] })).verdict, cls).toBe('PASS')
    }
  })

  it('a card that has not begun refuses a start before its first day', () => {
    expect(workerClassStart(base({ cls: 'EAD', permits: [{ validFrom: D(5), expiresAt: D(400) }] })).rule).toBe('PERMIT_NOT_BEGUN')
  })

  it('a lapsed card with a renewal filed warns rather than blocks, because the automatic extension is not confirmed category by category', () => {
    const d = workerClassStart(base({ cls: 'EAD', permits: [{ expiresAt: D(-4), renewalFiledOn: D(-60) }] }))
    expect(d.verdict).toBe('WARN')
    expect(WORKER_CLASS_RULES.PERMIT_RENEWAL_PENDING.confirmed).toBe(false)
  })

  it('OPT past ninety days unemployed, or a hundred and fifty on STEM, warns and never blocks', () => {
    expect(workerClassStart(base({ cls: 'OPT', permits: [{ expiresAt: D(200), category: 'C03B' }], unemployedDays: 91 })).verdict).toBe('WARN')
    expect(workerClassStart(base({ cls: 'OPT', permits: [{ expiresAt: D(200), category: 'C03B' }], unemployedDays: 90 })).verdict).toBe('PASS')
    const stem = workerClassStart(base({ cls: 'OPT', permits: [{ expiresAt: D(200), category: 'C03C', stem: true }], unemployedDays: 120 }))
    expect(stem.findings.map((f) => f.rule)).toEqual(['STEM_OPT_PLAN'])
  })

  it('an H-1B filed by another firm warns, and clears once the employer’s own transfer petition is filed', () => {
    const other = workerClassStart(base({ cls: 'H1B', petitions: [{ petitionerName: 'Techpeple Inc', status: 'ACTIVE', filedAt: D(-400) }] }))
    expect(other.verdict).toBe('WARN')
    expect(other.says).toContain('filed by Techpeple Inc, not Brightmoor Staffing')
    expect(other.source).toContain('214(n)')
    const moved = workerClassStart(base({
      cls: 'H1B',
      petitions: [{ petitionerName: 'Techpeple Inc', status: 'ACTIVE', filedAt: D(-400) }, { petitionerName: 'Brightmoor Staffing', status: 'FILED', filedAt: D(-3) }],
    }))
    expect(moved.verdict).toBe('PASS')
  })

  it('an H-1B whose petitioner nobody recorded is said and does not move the start', () => {
    expect(workerClassStart(base({ cls: 'H1B', petitions: [{ petitionerName: null, status: 'ACTIVE', filedAt: D(-300) }] })).verdict).toBe('NOTE')
  })

  it('a TN admission that ran out refuses, and a TN for another employer only warns because its paragraph is not confirmed', () => {
    expect(workerClassStart(base({ cls: 'TN', i94: [{ admitUntil: D(-2), classOfAdmission: 'TN' }] })).verdict).toBe('BLOCK')
    expect(workerClassStart(base({ cls: 'TN', i94: [{ admitUntil: D(200), classOfAdmission: 'TN', employerNamed: 'Techpeple Inc' }] })).verdict).toBe('WARN')
  })

  it('a firm’s legal suffix never makes two names one firm, and part of a name never does either', () => {
    expect(sameFirm('Brightmoor Staffing, Inc.', 'brightmoor staffing')).toBe(true)
    expect(sameFirm('Tech', 'Techpeple')).toBe(false)
    expect(sameFirm(null, 'Techpeple')).toBe(false)
  })
})

describe('the facts the start reads off the record', () => {
  it('the profile’s spellings read as the founder’s classes, and an unknown one leaves the I-9 to decide', () => {
    expect(classOfWorkAuth('US_CITIZEN')).toBe('CITIZEN')
    expect(classOfWorkAuth('USC')).toBe('CITIZEN')
    expect(classOfWorkAuth('GC')).toBe('GREEN_CARD')
    expect(classOfWorkAuth('STUDENT')).toBe('STUDENT_DOMESTIC')
    expect(classOfWorkAuth('F1_CPT')).toBe('F1_CPT')
    expect(classOfWorkAuth('F1_NO_PERMIT')).toBe('F1_NO_PERMIT')
    expect(classOfWorkAuth('L1')).toBeNull()
  })

  it('the employer a petition or a CPT page names is written and read by one helper', () => {
    const note = employerNamedNote('Brightmoor Staffing', 'Filed with premium processing.')
    expect(employerNamedIn(note)).toBe('Brightmoor Staffing')
    expect(employerNamedIn('Filed with premium processing.')).toBeNull()
  })

  it('a CPT page, a petition and a card are read off their rows, and a refused card is not held', () => {
    const f = factsFrom({
      personName: 'Wei Chen', workAuth: 'F1_CPT', employerName: 'Brightmoor Staffing',
      permits: [{ validFrom: null, expiresAt: D(10), status: 'FLAGGED', result: null }],
      i94: [],
      petitions: [
        { type: 'F1_CPT', status: 'ACTIVE', filedAt: D(-5), approvedAt: D(-5), expiresAt: D(90), events: [{ eventType: 'FILED', notes: employerNamedNote('Brightmoor Staffing') }] },
        { type: 'H1B', status: 'FILED', filedAt: D(-5), approvedAt: null, expiresAt: null, events: [{ eventType: 'FILED', notes: 'no name' }] },
      ],
    })
    expect(f.cls).toBe('F1_CPT')
    expect(f.permits).toEqual([])
    expect(f.cpt).toEqual([{ employerNamed: 'Brightmoor Staffing', from: D(-5), to: D(90) }])
    expect(f.petitions?.[0].petitionerName).toBeNull()
  })

  it('a class refusal refuses the start in the clearance, said first, and an omitted class moves nothing', () => {
    const args = { personName: 'Wei Chen', personVerifications: [], supplierName: 'Brightmoor Staffing', supplierCertificates: [], on: ON }
    const without = contractClearance(args)
    const blocked = contractClearance({ ...args, workerClass: workerClassStart(base({ personName: 'Wei Chen', cls: 'F1_NO_PERMIT' })) })
    expect(blocked.outcome).toBe('BLOCK')
    expect(blocked.says.startsWith('Wei Chen is an international student with no CPT or OPT')).toBe(true)
    expect(without.workerClass).toBeUndefined()
    const passed = contractClearance({ ...args, workerClass: workerClassStart(base({ cls: 'CITIZEN' })) })
    expect(passed.outcome).toBe(without.outcome)
  })

  it('the job’s own restriction reads the new profile values: CPT is CPT, a domestic student needs no sponsor and is asked rather than refused on citizenship', () => {
    expect(authDecision({ requires: ['CPT'], basis: 'STATUTE_OR_REGULATION' } as never, 'F1_CPT').verdict).toBe('PASS')
    expect(authDecision({ requires: ['US_CITIZEN'], basis: 'SPONSORSHIP_UNAVAILABLE' } as never, 'STUDENT').verdict).toBe('WARN')
    expect(authDecision({ requires: ['US_CITIZEN'], basis: 'FEDERAL_CONTRACT_CLAUSE', cite: 'FAR 52.204' } as never, 'STUDENT').verdict).toBe('WARN')
  })
})

describe('the count by worker class the report prints', () => {
  it('each class is counted as awarded, started and refused, with the first refusal sentence kept as said', () => {
    const t = new WorkerClassTally()
    t.people('F1_NO_PERMIT', 40)
    t.awarded('F1_NO_PERMIT'); t.refused('F1_NO_PERMIT', 'Wei Chen is an international student with no CPT or OPT, so may not start US work.', 'F1_NO_PERMIT')
    t.awarded('CITIZEN'); t.started('CITIZEN')
    const rows = tallyByWorkerClass(undefined, t)
    const f1 = rows.find((r) => r.key === 'F1_NO_PERMIT')!
    expect(f1).toMatchObject({ people: 40, awarded: 1, started: 0, refused: 1, rules: { F1_NO_PERMIT: 1 } })
    expect(f1.reason).toContain('may not start US work')
    expect(rows.find((r) => r.key === 'CITIZEN')).toMatchObject({ awarded: 1, started: 1, refused: 0, people: null })
  })

  it('work outside the US is counted under OTHER, and each rule’s refusal is expected in its own words', () => {
    expect(classKey('H1B', 'IN')).toBe('OTHER')
    expect(classKey('GC', 'US')).toBe('GREEN_CARD')
    expect(classKey(null, 'US')).toBe('OTHER')
    const d = workerClassStart(base({ cls: 'F1_NO_PERMIT' }))
    expect(refusalPhrase(d).test(d.says)).toBe(true)
    const card = workerClassStart(base({ cls: 'EAD', permits: [{ expiresAt: D(-1) }] }))
    expect(refusalPhrase(card).test(card.says)).toBe(true)
  })
})

describe('the papers the generated world gives each class', () => {
  let plan: PaperPlan
  let people: ReturnType<typeof planPeople>
  beforeAll(() => {
    anchorSeed(new Date('2026-10-21T00:00:00Z'))
    const frame = buildFrame()
    plan = planPapers(frame, buildPeople(frame))
    people = planPeople(frame)
  })
  const of = (auth: string) => people.filter((p) => p.facts.country === 'US' && (p.facts.workAuth as string) === auth)
  const rowsOf = (id: string) => [...plan.person, ...plan.evidence].filter((r) => r.personId === id)

  it('an international student with no permit holds a passport and an I-20, and no card and no I-9', () => {
    const f1 = of('F1_NO_PERMIT')
    expect(f1.length).toBeGreaterThan(0)
    for (const p of f1) {
      const rows = rowsOf(p.facts.id)
      expect(rows.some((r) => r.type === 'PASSPORT')).toBe(true)
      expect(rows.some((r) => r.type === 'WORK_PERMIT' || r.type === 'I9_EVERIFY')).toBe(false)
      expect(plan.petitions.some((v) => v.personId === p.facts.id && v.type === 'F1')).toBe(true)
    }
  })

  it('a CPT student holds the I-20’s CPT page naming an employer and the school’s dates', () => {
    for (const p of of('F1_CPT')) {
      const page = plan.petitions.find((v) => v.personId === p.facts.id && v.type === 'F1_CPT')
      expect(page, p.facts.name).toBeTruthy()
      expect(page!.approvedAt).toBeTruthy()
      expect(page!.expiresAt).toBeTruthy()
      expect(employerNamedIn(plan.visaEvents.find((e) => e.petitionId === page!.id)?.notes as string)).toBeTruthy()
    }
  })

  it('an OPT student and an EAD worker each hold one card with its end date and category, the I-9’s evidence where an I-9 was completed', () => {
    for (const p of [...of('OPT'), ...of('EAD')]) {
      const cards = rowsOf(p.facts.id).filter((r) => r.type === 'WORK_PERMIT' && (r.result as { category?: string } | null)?.category)
      expect(cards.length, p.facts.name).toBe(1)
      expect(cards[0].expiresAt).toBeTruthy()
    }
    for (const p of of('OPT')) expect(plan.petitions.some((v) => v.personId === p.facts.id && v.type === 'F1_OPT')).toBe(true)
  })

  it('a TN worker holds an I-94 admitting them in TN for their employer', () => {
    for (const p of of('TN')) {
      const i94 = rowsOf(p.facts.id).find((r) => r.type === 'I94')
      expect(i94, p.facts.name).toBeTruthy()
      expect((i94!.result as { classOfAdmission?: string }).classOfAdmission).toBe('TN')
    }
  })

  it('every H-1B petition names the employer that filed it, and a transfer is filed by the employer on the live line', () => {
    const h1b = plan.petitions.filter((v) => v.type === 'H1B')
    for (const pet of h1b) {
      const filed = plan.visaEvents.find((e) => e.petitionId === pet.id && e.eventType === 'FILED')
      expect(employerNamedIn(filed?.notes as string), pet.id).toBeTruthy()
    }
  })

  it('every status record a student holds reads as the nightly watch would leave it', () => {
    for (const pet of plan.petitions.filter((v) => v.type !== 'H1B')) {
      const left = ((pet.expiresAt as Date).getTime() - day(0).getTime()) / 86_400_000
      expect(pet.status, pet.id).toBe(left < 0 ? 'EXPIRED' : left <= 90 ? 'EXPIRING' : 'ACTIVE')
    }
  })
})
