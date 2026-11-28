import { describe, it, expect } from 'vitest'
import { degreeCheckForYou, degreeYearDiffers, sameFileFiledBefore, DEGREE_DOORS } from '@/lib/notify/degree-and-start'
import { degreeReading } from '@/lib/document-stages/degree'

/**
 * The fourth screen walk, 2026-11-03: a degree whose year the résumé
 * contradicts showed HR the sentence and the three doors, and told the
 * worker nothing. The founder's rule ("A degree is read, not just held"):
 * the worker is told, in words, what is being checked and why, and never
 * what HR was told.
 */
const on = new Date('2026-11-03T00:00:00Z')
const rosa = (paper: { year: number; institution?: string; nameOnDocument?: string }, sameFileFor: string[] = []) =>
  degreeReading({
    paper: { institution: paper.institution ?? 'Oregon State University', qualification: 'B.S. Industrial Engineering', nameOnDocument: paper.nameOnDocument ?? 'Rosa Delgado', year: paper.year },
    personName: 'Rosa Delgado',
    resume: [{ school: 'Oregon State University', qualification: 'B.S. Industrial Engineering', year: 2014 }],
    sameFileFor,
    on,
  })

describe('a degree that does not look right is told to the worker in her own words', () => {
  it('a certificate year the résumé contradicts tells the worker which firm is checking it and why', () => {
    const says = degreeCheckForYou({ firmName: 'Brightmoor Staffing', findings: rosa({ year: 2016 }).findings })
    expect(says).toBe(
      'Brightmoor Staffing is checking your degree certificate: the year on it is not the year on your résumé. If your résumé is wrong, correct it on Your page; if the certificate is the wrong one, upload the right one from Your paperwork.'
    )
  })

  it('the worker is never told what HR was told: not the three doors, not the years as HR reads them', () => {
    const reading = rosa({ year: 2016 })
    const says = degreeCheckForYou({ firmName: 'Brightmoor Staffing', findings: reading.findings })!
    expect(says).not.toContain(DEGREE_DOORS)
    expect(says).not.toContain('transcript')
    expect(says).not.toContain('verification provider')
    expect(says).not.toContain(degreeYearDiffers({ certificateYear: 2016, resumeYear: 2014 }))
  })

  it('a file already filed for somebody else is said to HR only, so on its own the worker is told nothing and never the other name', () => {
    const reading = rosa({ year: 2014 }, ['Deepa Varma'])
    expect(reading.findings.map((f) => f.code)).toEqual(['SAME_FILE'])
    expect(degreeCheckForYou({ firmName: 'Brightmoor Staffing', findings: reading.findings })).toBeNull()
    const both = rosa({ year: 2016 }, ['Deepa Varma'])
    const says = degreeCheckForYou({ firmName: 'Brightmoor Staffing', findings: both.findings })!
    expect(says).not.toContain('Deepa Varma')
    expect(says).not.toContain(sameFileFiledBefore({ otherPersonName: 'Deepa Varma' }))
  })

  it('two things that do not look right are said in one sentence, each once', () => {
    const says = degreeCheckForYou({ firmName: 'Brightmoor Staffing', findings: rosa({ year: 2016, nameOnDocument: 'Rosa Martinez' }).findings })!
    expect(says).toContain('the year on it is not the year on your résumé; and the name on it is not the name on your record.')
    expect(says.match(/the year on it/g)).toHaveLength(1)
  })

  it('a degree with nothing wrong on it, or one a provider verified, tells the worker nothing', () => {
    expect(degreeCheckForYou({ firmName: 'Brightmoor Staffing', findings: rosa({ year: 2014 }).findings })).toBeNull()
    expect(degreeCheckForYou({ firmName: 'Brightmoor Staffing', findings: [{ code: 'YEAR_DIFFERS' }], verified: 'Sterling verified the degree on Oct 2, 2026, reference 4471. Nothing more to do on it.' })).toBeNull()
  })

  it('the sentence names the firm and never says fraud, never apologizes and never names a role', () => {
    const says = degreeCheckForYou({ firmName: 'Brightmoor Staffing', findings: [{ code: 'YEAR_AHEAD' }, { code: 'SCHOOL_DIFFERS' }, { code: 'NOT_WHAT_THE_JOB_ASKS' }] })!
    expect(says.startsWith('Brightmoor Staffing ')).toBe(true)
    expect(says).not.toMatch(/fraud|sorry|unfortunately|\bHR\b|desk/i)
  })
})
