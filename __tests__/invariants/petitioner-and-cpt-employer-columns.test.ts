/**
 * The two columns the start rule waited for (bea9b231f): the firm that
 * petitioned an H-1B, by id (`VisaPetition.petitionerCompanyId`), and the
 * employer an I-20's CPT page names, as the school spelled it
 * (`VisaPetition.employerNamed`). Until they existed both were read out of
 * the words on the petition's FILED event. Unit only.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: () => undefined }) }))

import { employerNamedNote, workerClassStart, type WorkerClassFacts } from '@/lib/document-stages/worker-class'
import { factsFrom } from '@/lib/document-stages/worker-class-facts'
import { anchorSeed } from '@/lib/seed-days'
import { buildFrame } from '@/lib/seed-scale/frame'
import { buildPeople } from '@/lib/seed-scale/people'
import { planPapers, type PaperPlan } from '@/lib/seed-scale/papers'

const src = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')
const ON = new Date('2026-11-08T00:00:00Z')
const D = (n: number) => new Date(ON.getTime() + n * 86_400_000)
const US = { country: 'US', offshore: false }
const base = (over: Partial<WorkerClassFacts>): WorkerClassFacts => ({
  personName: 'Priya Raman', cls: 'H1B', workCountry: US, on: ON, employerName: 'Brightmoor Staffing', employerCompanyId: 'co-brightmoor', ...over,
})

describe('the H-1B rule reads the firm that petitioned by id', () => {
  it('an H-1B petitioned by the employer, recorded by id, lets the start go ahead whatever the firm is called', () => {
    const d = workerClassStart(base({ petitions: [{ petitionerCompanyId: 'co-brightmoor', petitionerName: 'Brightmoor Staffing LLC', status: 'ACTIVE', filedAt: D(-300) }] }))
    expect(d.verdict).toBe('PASS')
  })

  it('an H-1B petitioned by another firm, recorded by id, warns in today’s sentence even where the two names read alike', () => {
    const d = workerClassStart(base({ petitions: [{ petitionerCompanyId: 'co-other', petitionerName: 'Brightmoor Staffing', status: 'ACTIVE', filedAt: D(-300) }] }))
    expect(d.findings.map((f) => f.rule)).toEqual(['H1B_OTHER_PETITIONER'])
    expect(d.says).toContain('filed by Brightmoor Staffing, not Brightmoor Staffing')
  })

  it('a petition recorded before the column is read by the name its filing wrote, as before', () => {
    const f = factsFrom({
      personName: 'Priya Raman', workAuth: 'H1B', employerName: 'Brightmoor Staffing', employerCompanyId: 'co-brightmoor', permits: [], i94: [],
      petitions: [{ type: 'H1B', status: 'ACTIVE', filedAt: D(-300), approvedAt: D(-200), expiresAt: D(700), events: [{ eventType: 'FILED', notes: employerNamedNote('Techpeple Inc') }] }],
    })
    expect(f.petitions).toEqual([{ petitionerCompanyId: null, petitionerName: 'Techpeple Inc', status: 'ACTIVE', filedAt: D(-300), expiresAt: D(700) }])
    expect(workerClassStart({ ...f, workCountry: US, on: ON }).findings.map((x) => x.rule)).toEqual(['H1B_OTHER_PETITIONER'])
  })

  it('a petition with neither the column nor a name on its filing says the record does not know who petitioned', () => {
    const d = workerClassStart(base({ petitions: [{ petitionerCompanyId: null, petitionerName: null, status: 'ACTIVE', filedAt: D(-300) }] }))
    expect(d.findings.map((f) => f.rule)).toEqual(['H1B_PETITIONER_UNKNOWN'])
  })

  it('the petitions route records the firm that filed an H-1B in the column, and the facts read the column and the employer by id', () => {
    expect(src('app/api/compliance/petitions/route.ts')).toContain("petitionerCompanyId: caller.company!.id")
    const facts = src('lib/document-stages/worker-class-facts.ts')
    expect(facts).toContain('petitionerCompanyId: true, employerNamed: true, petitioner: { select: { name: true } }')
    expect(facts).toContain('employerCompanyId: employerOf.get(p.id)?.id ?? null')
  })
})

describe('the CPT rule reads the employer the I-20 names from its column', () => {
  it('a CPT page whose column names the employer lets the start go ahead, and the column wins over the words on the filing', () => {
    const f = factsFrom({
      personName: 'Wei Chen', workAuth: 'F1_CPT', employerName: 'Brightmoor Staffing', permits: [], i94: [],
      petitions: [{ type: 'F1_CPT', status: 'ACTIVE', filedAt: D(-5), approvedAt: D(-5), expiresAt: D(90), employerNamed: 'Brightmoor Staffing', events: [{ eventType: 'FILED', notes: employerNamedNote('Somewhere Else') }] }],
    })
    expect(f.cpt).toEqual([{ employerNamed: 'Brightmoor Staffing', from: D(-5), to: D(90) }])
    expect(workerClassStart({ ...f, workCountry: US, on: ON }).verdict).toBe('PASS')
  })

  it('the petitions route writes the employer as the school spelled it into the column', () => {
    expect(src('app/api/compliance/petitions/route.ts')).toMatch(/expiresAt: to,[\s\S]{0,140}employerNamed,/)
  })
})

describe('the generated world writes both columns', () => {
  let plan: PaperPlan
  beforeAll(() => {
    anchorSeed(new Date('2026-10-21T00:00:00Z'))
    const frame = buildFrame()
    plan = planPapers(frame, buildPeople(frame))
  })

  it('every generated H-1B names the firm that petitioned in the column, and every CPT page the employer it names', () => {
    const h1b = plan.petitions.filter((p) => p.type === 'H1B')
    const cpt = plan.petitions.filter((p) => p.type === 'F1_CPT')
    expect(h1b.length).toBeGreaterThan(0)
    expect(cpt.length).toBeGreaterThan(0)
    for (const p of h1b) expect(p.petitionerCompanyId, p.id).toBeTruthy()
    for (const p of cpt) expect(p.employerNamed, p.id).toBeTruthy()
  })
})
