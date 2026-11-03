import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { degreeReading, fileHash, sameName, sameSchool, type DegreeOnPaper } from '@/lib/document-stages/degree'

/**
 * A degree is read, not just held (the founder, 2026-11-03): what does not
 * look right is said to HR in a sentence beside the paper, HR decides, and
 * a provider's verification clears it. Nothing here blocks a start.
 */

const ON = new Date('2026-11-03T12:00:00Z')
const PRIYA = 'Priya Raman'
const RIGHT: DegreeOnPaper = {
  institution: 'University of Pune', qualification: 'Bachelor of Engineering', fieldOfStudy: 'Computer Science',
  nameOnDocument: 'Priya Raman', year: 2016,
}
const RESUME = [{ school: 'Pune University', qualification: 'B.E. Engineering', year: 2016 }]
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a degree is read against the record', () => {
  it('a degree with every field right raises nothing', () => {
    expect(degreeReading({ paper: RIGHT, personName: PRIYA, resume: RESUME, on: ON })).toEqual({ verified: null, findings: [] })
  })

  it('a graduation year that has not come yet is said to HR, with what HR can do', () => {
    const r = degreeReading({ paper: { ...RIGHT, year: 2028 }, personName: PRIYA, resume: [], on: ON })
    expect(r.findings.map((f) => f.code)).toEqual(['YEAR_AHEAD'])
    expect(r.findings[0].says).toBe('The certificate says 2028, which has not come yet (it is 2026). Ask for the transcript, send it to a verification provider, or send it back.')
  })

  it('a year the résumé contradicts for the same degree is said to HR', () => {
    const r = degreeReading({ paper: RIGHT, personName: PRIYA, resume: [{ ...RESUME[0], year: 2019 }], on: ON })
    expect(r.findings[0]).toEqual({ code: 'YEAR_DIFFERS', says: expect.stringContaining('The certificate says 2016; the résumé says 2019') })
  })

  it('a certificate in another person’s name is said, and a middle name left off is not another person', () => {
    expect(degreeReading({ paper: { ...RIGHT, nameOnDocument: 'Anita Desai' }, personName: PRIYA, resume: RESUME, on: ON }).findings.map((f) => f.code)).toEqual(['NAME_DIFFERS'])
    expect(sameName('Priya S. Raman', 'Priya Raman')).toBe(true)
    expect(sameName('Priyá Raman', 'priya raman')).toBe(true)
  })

  it('a school the résumé does not name for the same degree is said, and the same school written two ways is not', () => {
    expect(sameSchool('University of Pune', 'Pune University')).toBe(true)
    const r = degreeReading({ paper: { ...RIGHT, institution: 'Anna University' }, personName: PRIYA, resume: RESUME, on: ON })
    expect(r.findings.map((f) => f.code)).toEqual(['SCHOOL_DIFFERS'])
  })

  it('a qualification the job asks for that the paper does not show is said', () => {
    const r = degreeReading({ paper: RIGHT, personName: PRIYA, resume: RESUME, job: { title: 'ICU nurse', requires: 'Bachelor of Science in Nursing' }, on: ON })
    expect(r.findings[0].says).toBe('The ICU nurse job asks for Bachelor of Science in Nursing; this certificate is Bachelor of Engineering in Computer Science. Ask for the right certificate, or send it back.')
  })

  it('the same file already filed for somebody else is said to HR with the other name', () => {
    const r = degreeReading({ paper: RIGHT, personName: PRIYA, resume: RESUME, sameFileFor: ['Anita Desai'], on: ON })
    expect(r.findings).toEqual([{ code: 'SAME_FILE', says: 'This file was already filed by Anita Desai. Both records keep it; check which is right.' }])
  })

  it('a provider’s verification clears every warning on the degree', () => {
    const r = degreeReading({
      paper: { ...RIGHT, year: 2028, nameOnDocument: 'Anita Desai' }, personName: PRIYA, resume: RESUME, sameFileFor: ['Anita Desai'],
      verifiedBy: { provider: 'WES', reference: 'WES-7781', on: new Date('2026-10-30T00:00:00Z') }, on: ON,
    })
    expect(r.findings).toEqual([])
    expect(r.verified).toMatch(/^WES verified the degree on .*reference WES-7781\. Nothing more to do on it\.$/)
  })
})

describe('the file a degree came in', () => {
  it('every upload door names the file by the same hash, so the same file filed twice can be seen', () => {
    expect(fileHash(Buffer.from('degree'))).toBe(fileHash(new Uint8Array(Buffer.from('degree'))))
    expect(fileHash(Buffer.from('degree'))).toMatch(/^[0-9a-f]{64}$/)
    for (const door of ['src/app/api/me/papers/route.ts', 'src/app/api/documents/[id]/act.ts', 'src/app/api/packet/[token]/route.ts']) {
      expect(read(door), door).toContain('fileHash: fileHash(file.bytes)')
    }
  })
})
