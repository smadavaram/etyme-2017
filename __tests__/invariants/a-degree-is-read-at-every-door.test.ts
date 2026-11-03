import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { degreeOnRecord, degreeFromBody, isDegreePaper, resumeEducationFrom } from '@/lib/document-stages/degree-check'

/**
 * A degree is read, not just held (the founder, 2026-11-03), at every door
 * where one is accepted or uploaded: a sentence to HR beside the paper,
 * HR's three doors, and nothing that blocks a start.
 */

const ON = new Date('2026-11-03T12:00:00Z')
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

function world(over: { resume?: unknown; evaluation?: unknown; others?: { name: string }[]; degree?: unknown } = {}) {
  return {
    person: {
      findUnique: async () => ({ name: 'Priya Raman' }),
      findMany: async () => over.others ?? [],
    },
    consultantProfile: { findUnique: async () => ({ education: over.resume ?? [{ institution: 'Pune University', qualification: 'B.E. Engineering', year: 2016 }] }) },
    verification: {
      findMany: async () => (over.degree ? [over.degree] : []),
      findFirst: async () => over.evaluation ?? null,
    },
    docFile: { findMany: async () => (over.others?.length ? [{ docInstance: { subjectType: 'PERSON', subjectId: 'anita' } }] : []) },
    verificationDoc: { findMany: async () => [] },
    packetItem: { findMany: async () => [] },
  }
}
const RIGHT = { institution: 'University of Pune', qualification: 'Bachelor of Engineering', fieldOfStudy: 'Computer Science', nameOnDocument: 'Priya Raman', year: 2016 }

describe('a degree read where it is accepted', () => {
  it('a degree with every field right says nothing beside the paper and offers no door', async () => {
    const r = await degreeOnRecord({ personId: 'priya', paper: RIGHT, on: ON }, world() as never)
    expect(r).toMatchObject({ says: null, doors: [], findings: [] })
  })

  it('a year the résumé contradicts is said to HR beside the paper, with the three doors', async () => {
    const r = await degreeOnRecord({ personId: 'priya', paper: { ...RIGHT, year: 2019 }, on: ON }, world() as never)
    expect(r.says).toBe('The certificate says 2019; the résumé says 2016 for the same degree. Ask for the transcript, send it to a verification provider, or send it back.')
    expect(r.doors.map((d) => d.kind)).toEqual(['TRANSCRIPT', 'PROVIDER', 'SEND_BACK'])
  })

  it('a file already filed for somebody else names the other person to HR', async () => {
    const r = await degreeOnRecord({ personId: 'priya', paper: RIGHT, fileHashes: ['abc'], on: ON }, world({ others: [{ name: 'Anita Desai' }] }) as never)
    expect(r.says).toContain('This file was already filed by Anita Desai.')
  })

  it('where nothing is posted, the degree on the person’s own record is read', async () => {
    const r = await degreeOnRecord({ personId: 'priya', on: ON }, world({ degree: { provider: 'University of Pune', qualification: 'Bachelor of Engineering', fieldOfStudy: null, nameOnDocument: 'Priya Raman', issuedAt: new Date('2028-01-01'), documents: [] } }) as never)
    expect(r.findings.map((f) => f.code)).toEqual(['YEAR_AHEAD', 'YEAR_DIFFERS'])
  })

  it('a provider’s verification with its name, reference and date clears every warning', async () => {
    const r = await degreeOnRecord(
      { personId: 'priya', paper: { ...RIGHT, year: 2028 }, on: ON },
      world({ evaluation: { provider: 'WES', referenceId: 'WES-7781', verifiedAt: new Date('2026-10-30T00:00:00Z'), issuedAt: null } }) as never
    )
    expect(r.findings).toEqual([])
    expect(r.doors).toEqual([])
    expect(r.says).toMatch(/^WES verified the degree on .*reference WES-7781\. Nothing more to do on it\.$/)
  })

  it('a degree is told apart from a credential evaluation, and its printed facts are read from what was posted', () => {
    expect(isDegreePaper('DEGREE')).toBe(true)
    expect(isDegreePaper(null, 'Degree certificate and transcripts')).toBe(true)
    expect(isDegreePaper(null, 'Credential evaluation of a degree')).toBe(false)
    expect(degreeFromBody({ institution: 'Pune', year: '2016' })).toMatchObject({ institution: 'Pune', year: 2016 })
    expect(degreeFromBody({})).toBeNull()
    expect(resumeEducationFrom([{ institution: 'Pune', qualification: 'BE', year: '2016', quote: 'BE, Pune, 2016' }, 'junk'])).toEqual([{ school: 'Pune', qualification: 'BE', year: 2016 }])
  })
})

describe('the degree reaches every door, and stops nothing', () => {
  const doors = {
    paperwork: 'src/app/api/documents/[id]/examine/route.ts',
    requests: 'src/app/api/packets/[id]/review/route.ts',
    upload: 'src/app/api/documents/[id]/act.ts',
    list: 'src/app/api/documents/route.ts',
  }

  it('Paperwork’s accept, Document requests’ accept, the person’s upload and the Paperwork list each read the degree against the record', () => {
    for (const [name, path] of Object.entries(doors)) expect(read(path), name).toContain('degreeOnRecord(')
  })

  it('nothing about a degree refuses an accept or a start: the reading is said, never returned as a refusal', () => {
    for (const path of [doors.paperwork, doors.requests]) {
      const src = read(path)
      expect(src).not.toMatch(/degree[^\n]*refuse\(/i)
      expect(src).not.toMatch(/if \(degree[^\n]*\) return/)
    }
  })

  it('the worker is told in words what was asked and why, and why a degree was sent back, and never what HR was told', () => {
    expect(read(doors.upload)).toContain('degreeAskedOfYou({ firmName: issuer.name })')
    expect(read(doors.paperwork)).toContain('degreeSentBack({ firmName: issuer.name')
    // The findings go to the roles who examine papers, never to the person.
    expect(read(doors.paperwork)).toMatch(/verdict\.verdict === 'ACCEPT' \? degree\?\.says : null/)
    expect(read(doors.list)).toContain('const readsDegrees = !isConsultantSeat(caller) && holdsPaperworkDesk(')
  })

  it('a degree she puts on her own record keeps what is printed on it and the file’s hash', () => {
    const src = read('src/app/api/me/papers/route.ts')
    expect(src).toContain("row.key === 'DEGREE'")
    expect(src).toContain('nameOnDocument: fields.nameOnDocument ?? null')
    expect(src).toMatch(/uploadedById: me, fileHash: fileHash\(file\.bytes\)/)
  })
})
