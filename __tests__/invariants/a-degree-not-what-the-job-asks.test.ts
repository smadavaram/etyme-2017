import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/db', () => ({ prisma: {} }))

import { jobsAskingOf, readAgainstJobs, withDoors } from '@/lib/document-stages/degree-check'
import { degreeCheckForYou } from '@/lib/notify/degree-and-start'

/**
 * "Not what the job asks" (CLAUDE.md, "A degree is read, not just held"),
 * turned on by Requirement.requiredQualification (b2ddfb4fb): where the
 * job a line was awarded from names a qualification and the degree on the
 * paper is not it, HR reads a sentence beside the paper and the worker is
 * told in words. A provider's verification clears it; it never blocks a
 * start; a job that asks none says nothing.
 */
const src = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')
const ON = new Date('2026-11-08T00:00:00Z')
const read = {
  paper: { institution: 'University of Wisconsin', qualification: 'Bachelor of Arts', fieldOfStudy: 'History', nameOnDocument: 'Colleen Byrne', year: 2015 },
  personName: 'Colleen Byrne',
  resume: [],
  sameFileFor: [],
  verifiedBy: null,
  on: ON,
}
const icu = { title: 'ICU travel nurse', requires: 'Bachelor of Science in Nursing' }

describe('a degree that is not what the job asks for', () => {
  it('a degree that is not the qualification the job names is said to HR beside the paper, with the three doors', () => {
    const r = withDoors(readAgainstJobs(read, [icu]))
    expect(r.findings.map((f) => f.code)).toEqual(['NOT_WHAT_THE_JOB_ASKS'])
    expect(r.says).toContain('The ICU travel nurse job asks for Bachelor of Science in Nursing; this certificate is Bachelor of Arts in History.')
    expect(r.doors.length).toBeGreaterThan(0)
  })

  it('the worker is told in words that it does not show the qualification the job asks for, never HR’s sentence', () => {
    const r = readAgainstJobs(read, [icu])
    const said = degreeCheckForYou({ firmName: 'Halcyon Talent', findings: r.findings, verified: r.verified })
    expect(said).toContain('it does not show the qualification the job asks for')
    expect(said).not.toContain('Bachelor of Science in Nursing; this certificate')
  })

  it('a degree that is the qualification the job names says nothing', () => {
    const nurse = { ...read, paper: { ...read.paper, qualification: 'Bachelor of Science', fieldOfStudy: 'Nursing' } }
    expect(readAgainstJobs(nurse, [icu]).findings).toEqual([])
  })

  it('a job that asks for no qualification says nothing about the degree', () => {
    expect(readAgainstJobs(read, [{ title: 'ICU travel nurse', requires: null }]).findings).toEqual([])
    expect(readAgainstJobs(read, []).findings).toEqual([])
  })

  it('a provider’s verification of the degree clears it', () => {
    const r = readAgainstJobs({ ...read, verifiedBy: { provider: 'WES', reference: 'WES-4471', on: ON } }, [icu])
    expect(r.findings).toEqual([])
    expect(r.verified).toContain('WES')
  })

  it('two jobs on her lines that each ask for something else are each said once', () => {
    const r = readAgainstJobs(read, [icu, icu, { title: 'Charge nurse', requires: 'Master of Science in Nursing' }])
    expect(r.findings.filter((f) => f.code === 'NOT_WHAT_THE_JOB_ASKS')).toHaveLength(2)
  })

  it('it never blocks a start: the start’s clearance does not read the degree reading', () => {
    expect(src('lib/contract-clearance.ts')).not.toMatch(/degreeOnRecord|readAgainstJobs|NOT_WHAT_THE_JOB_ASKS/)
  })
})

describe('the job is read on the line, through the job it was awarded from', () => {
  const lines = [
    { companyId: 'co-halcyon', clientCompanyId: 'co-cavanaugh', endClientCompanyId: 'co-cavanaugh', requirement: { title: 'ICU travel nurse', requiredQualification: 'Bachelor of Science in Nursing' } },
    { companyId: 'co-other', clientCompanyId: 'co-talvern', endClientCompanyId: 'co-talvern', requirement: { title: 'Charge nurse', requiredQualification: 'Master of Science in Nursing' } },
    { companyId: 'co-halcyon', clientCompanyId: 'co-cavanaugh', endClientCompanyId: 'co-cavanaugh', requirement: { title: 'Controls engineer', requiredQualification: null } },
  ]
  const db = { sellContract: { findMany: vi.fn(async () => lines) } } as never

  it('a firm reading the paper reads only the jobs on its own chain for the person, never another client’s', async () => {
    expect(await jobsAskingOf({ personId: 'p', firmId: 'co-halcyon' }, db)).toEqual([{ title: 'ICU travel nurse', requires: 'Bachelor of Science in Nursing' }])
  })

  it('the worker’s own upload reads every job on her live lines that names a qualification', async () => {
    expect((await jobsAskingOf({ personId: 'p', firmId: null }, db)).map((j) => j.title)).toEqual(['ICU travel nurse', 'Charge nurse'])
  })

  it('every door that reads a degree for a firm says which firm, so the jobs read are that firm’s', () => {
    expect(src('app/api/documents/[id]/examine/route.ts')).toContain('firmId: issuer.id')
    expect(src('app/api/documents/[id]/act.ts')).toContain('firmId: issuer.id')
    expect(src('app/api/packets/[id]/review/route.ts')).toContain('firmId: caller.company.id')
    expect(src('app/api/documents/route.ts')).toContain('firmId: companyId')
  })

  it('the documents matrix tries a degree that is not what the job asks, where the job names one', () => {
    expect(readFileSync(join(__dirname, '../../scripts/simulate/stages/regulatory/education.ts'), 'utf8')).toContain('requiredQualification')
  })
})
