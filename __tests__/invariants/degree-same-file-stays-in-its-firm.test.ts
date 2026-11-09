import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { degreeOnRecord, readAgainstJobs, withDoors } from '@/lib/document-stages/degree-check'
import { SAME_FILE_ELSEWHERE, noQualificationOnPaper } from '@/lib/document-stages/degree'
import { mayFileOwnPaper, ownPaperFields, ownPaperMenu } from '@/lib/document-stages/own-papers'

/**
 * Walk 8, item 7 (2026-11-09): Pinnacle Resourcing's HR read "This file
 * was already filed by Helena Marsh … by Samuel Adeyinka", two workers at
 * other firms (Techpeple under Computer Systems, and Halcyon), because
 * the duplicate-file check named everybody the same bytes were filed for.
 * Nothing read from one company reaches another: a person the reading
 * firm already holds on its own record (its employee, a person on its own
 * lines, a person on its own bench by consent) may be named; anybody else
 * is said as "another person", once, never named, counted or linked.
 *
 * The same walk read "this certificate is no qualification printed" on
 * HR's notice, and found the worker's own degree form had no field for
 * the qualification the job's rule reads.
 */

const ON = new Date('2026-11-09T12:00:00Z')
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const RIGHT = {
  institution: 'University of Copenhagen', qualification: 'Bachelor of Science in Computer Science',
  fieldOfStudy: null, nameOnDocument: 'Ingrid Sørensen', year: 2015,
}

interface Other { id: string; name: string }
interface Held { employee?: string[]; lines?: string[]; buy?: string[]; bench?: string[] }

/** A record where the same file was filed for `others`, and the reading firm holds `held`. */
function world(o: { others: Other[]; held?: Held; log?: Record<string, unknown>[] }) {
  const log = o.log ?? []
  const inIds = (where: any, key = 'personId'): string[] => where?.[key]?.in ?? []
  return {
    person: {
      findUnique: async () => ({ name: 'Ingrid Sørensen' }),
      findMany: async ({ where }: any) => o.others.filter((p) => inIds(where, 'id').includes(p.id)).map((p) => ({ name: p.name })),
    },
    consultantProfile: { findUnique: async () => null },
    verification: { findMany: async () => [], findFirst: async () => null },
    docFile: { findMany: async () => o.others.map((p) => ({ docInstance: { subjectType: 'PERSON', subjectId: p.id } })) },
    verificationDoc: { findMany: async () => [] },
    packetItem: { findMany: async () => [] },
    context: { findMany: async ({ where }: any) => (o.held?.employee ?? []).filter((id) => inIds(where).includes(id)).map((personId) => ({ personId })) },
    sellContract: { findMany: async ({ where }: any) => (where?.OR ? (o.held?.lines ?? []).filter((id) => inIds(where).includes(id)).map((personId) => ({ personId })) : []) },
    buyContractCandidate: { findMany: async ({ where }: any) => (o.held?.buy ?? []).filter((id) => inIds(where).includes(id)).map((personId) => ({ personId })) },
    benchListing: { findMany: async () => (o.held?.bench ?? []).map((personId) => ({ consultant: { personId } })) },
    accessLog: { createMany: async ({ data }: any) => { log.push(...data); return { count: data.length } } },
  }
}

const HELENA = { id: 'helena', name: 'Helena Marsh' }
const SAMUEL = { id: 'samuel', name: 'Samuel Adeyinka' }
const LUCIA = { id: 'lucia', name: 'Lucía Fernández' }

const atPinnacle = (others: Other[], held: Held = {}, log?: Record<string, unknown>[]) =>
  degreeOnRecord({ personId: 'ingrid', paper: RIGHT, fileHashes: ['abc'], firmId: 'pinnacle', job: null, on: ON }, world({ others, held, log }) as never)

describe('the same degree file, read by one firm', () => {
  it('a duplicate degree file filed for a worker at another firm is said to HR without naming them or their firm', async () => {
    const r = await atPinnacle([HELENA])
    expect(r.says).toContain(SAME_FILE_ELSEWHERE)
    expect(r.says).not.toContain('Helena')
    expect(r.says).not.toMatch(/Techpeple|Computer Systems|Halcyon/)
    expect(r.findings.map((f) => f.code)).toEqual(['SAME_FILE'])
    expect(r.doors.map((d) => d.kind)).toEqual(['TRANSCRIPT', 'PROVIDER', 'SEND_BACK'])
  })

  it('the door the sentence names is an education-verification provider', () => {
    expect(SAME_FILE_ELSEWHERE).toBe('The same file is already on the record for another person; an education-verification provider can confirm whose it is.')
  })

  it('a duplicate degree file filed for this firm’s own worker names that worker to this firm’s HR', async () => {
    for (const held of [{ lines: ['lucia'] }, { employee: ['lucia'] }, { buy: ['lucia'] }, { bench: ['lucia'] }] as Held[]) {
      const r = await atPinnacle([LUCIA], held)
      expect(r.says, JSON.stringify(held)).toContain('This file was already filed by Lucía Fernández.')
      expect(r.says, JSON.stringify(held)).not.toContain(SAME_FILE_ELSEWHERE)
    }
  })

  it('where the same file was filed for this firm’s own worker and for a stranger, only the firm’s own worker is named', async () => {
    const r = await atPinnacle([LUCIA, HELENA], { lines: ['lucia'] })
    expect(r.says).toContain('This file was already filed by Lucía Fernández.')
    expect(r.says).toContain(SAME_FILE_ELSEWHERE)
    expect(r.says).not.toContain('Helena')
  })

  it('the same file at other firms is one sentence however many people it was filed for, and never a count', async () => {
    const r = await atPinnacle([HELENA, SAMUEL])
    expect(r.findings.filter((f) => f.code === 'SAME_FILE')).toHaveLength(1)
    expect(r.says).not.toMatch(/Samuel|Helena|\btwo\b|\b2\b/)
  })

  it('a duplicate degree file read with no firm reading it names nobody', async () => {
    const r = await degreeOnRecord({ personId: 'ingrid', paper: RIGHT, fileHashes: ['abc'], job: null, on: ON }, world({ others: [HELENA], held: { lines: ['helena'] } }) as never)
    expect(r.says).toContain(SAME_FILE_ELSEWHERE)
    expect(r.says).not.toContain('Helena')
  })

  it('the reading firm’s own access log records the check, and nothing is written about the people at the other firm', async () => {
    const log: Record<string, unknown>[] = []
    await atPinnacle([HELENA, SAMUEL], {}, log)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ subjectId: 'ingrid', actorCompanyId: 'pinnacle', action: 'COMPLIANCE_CHECK', allowed: true })
    expect(String(log[0].reason)).toContain('same degree file')
    expect(log.some((row) => row.subjectId === 'helena' || row.subjectId === 'samuel')).toBe(false)
  })

  it('a degree read with no file behind it looks nobody up and writes nothing to the log', async () => {
    const log: Record<string, unknown>[] = []
    const r = await degreeOnRecord({ personId: 'ingrid', paper: RIGHT, fileHashes: [], firmId: 'pinnacle', job: null, on: ON }, world({ others: [HELENA], log }) as never)
    expect(r.findings).toEqual([])
    expect(log).toEqual([])
  })

  it('a worker’s own degree upload reads the file once for each firm that reads her papers, with that firm’s own record', () => {
    const route = read('src/app/api/me/papers/route.ts')
    expect(route).toMatch(/degreeOnRecord\(\{ personId: me, fileHashes: hashes, firmId: f\.id/)
    // The worker herself is told with a reading that names nobody.
    expect(route).toMatch(/tellTheWorkerAboutHerDegree\(\{ personId: me, firms: \[f\], reading: atFirm/)
  })

  it('every door that reads a degree says which firm is reading it', () => {
    for (const path of [
      'src/app/api/documents/route.ts',
      'src/app/api/documents/[id]/act.ts',
      'src/app/api/documents/[id]/examine/route.ts',
      'src/app/api/packets/[id]/review/route.ts',
    ]) {
      for (const call of read(path).match(/degreeOnRecord\(\{[^}]*\}/g) ?? []) expect(call, path).toContain('firmId:')
    }
  })
})

describe('a degree with no qualification on it', () => {
  const nurse = { title: 'ICU travel nurse', requires: 'Bachelor of Science in Nursing' }
  const base = { personName: 'Ingrid Sørensen', resume: [], sameFileFor: [], verifiedBy: null, on: ON }

  it('a degree with no qualification printed says so in its own sentence', () => {
    const r = withDoors(readAgainstJobs({ ...base, paper: { ...RIGHT, qualification: null } }, [nurse]))
    const said = noQualificationOnPaper({ jobTitle: 'ICU travel nurse', required: 'Bachelor of Science in Nursing' })
    expect(said).toBe('No qualification is recorded for this certificate, and the ICU travel nurse job asks for Bachelor of Science in Nursing. Ask for the right certificate, or send it back.')
    expect(r.says).toContain(said)
    expect(r.findings.map((f) => f.code)).toEqual(['NOT_WHAT_THE_JOB_ASKS'])
  })

  it('no sentence the job’s rule builds reads as a certificate that “is no qualification printed”', () => {
    for (const paper of [
      { ...RIGHT, qualification: null, fieldOfStudy: null },
      { ...RIGHT, qualification: '', fieldOfStudy: null },
      { ...RIGHT, qualification: null, fieldOfStudy: '' },
    ]) {
      const says = readAgainstJobs({ ...base, paper }, [nurse]).findings.map((f) => f.says).join(' ')
      expect(says).not.toMatch(/no qualification printed|certificate is \.|certificate is ;/)
      expect(says).toContain('No qualification is recorded for this certificate')
    }
  })

  it('a field of study with no qualification is read as what is on the paper, not as nothing', () => {
    const says = readAgainstJobs({ ...base, paper: { ...RIGHT, qualification: null, fieldOfStudy: 'History' } }, [nurse]).findings.map((f) => f.says).join(' ')
    expect(says).not.toContain('No qualification is recorded')
    expect(says).toContain('History')
  })
})

describe('the worker’s own degree form', () => {
  const degree = ownPaperMenu({ firm: false }).find((n) => n.key === 'DEGREE')!

  it('a worker’s own degree form asks for the qualification printed on it, because the job’s rule reads it', () => {
    expect(ownPaperFields(degree, true)).toEqual(['file', 'issuer', 'qualification', 'year'])
    const form = read('src/app/dashboard/documents/own-papers.tsx')
    expect(form).toContain("shows.has('qualification')")
  })

  it('a degree put on file without its qualification is refused in a sentence that names the field', () => {
    const r = mayFileOwnPaper({ key: 'DEGREE', about: 'ME', isOnePersonFirm: false, canKeepCopy: true, fileName: 'bsn.pdf', issuer: 'University of Copenhagen', year: '2015' }, ON)
    expect(r).toMatchObject({ ok: false, code: 'NEEDS_QUALIFICATION', field: 'qualification' })
    if (!r.ok) expect(r.message).toBe('Enter the qualification printed on the certificate, such as Bachelor of Science in Nursing.')
  })

  it('a license and a certification are not asked for a qualification', () => {
    for (const key of ['PROFESSIONAL_LICENSE', 'CERTIFICATION']) {
      const needs = ownPaperMenu({ firm: false }).find((n) => n.key === key)!
      expect(ownPaperFields(needs, true), key).not.toContain('qualification')
    }
  })
})
