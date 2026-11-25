import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { trainable, mayFinishCourse, cohortFullSays } from '@/lib/training'
import { buildProof, proofLines, ALREADY_ON_BENCH } from '@/lib/training/proof'

/** Record 120, faults found walking the Training screens in a browser. */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const D = (s: string) => new Date(`${s}T00:00:00Z`)
const now = D('2026-12-01')
const row = (personId: string, name: string, consent: string | null) => ({ personId, name, skills: ['SQL'], consent, free: null })

describe('the enroll pickers list every consultant the firm keeps', () => {
  it('a person asked as a consultant and not yet answered is offered for a course', () => {
    const out = trainable([row('a', 'Ada', 'GRANTED')], [row('b', 'Bram', 'INVITED')], [], now)
    expect(out.map((p) => p.name)).toEqual(['Ada', 'Bram'])
  })
  it('a person who said no is not offered for a course', () => {
    expect(trainable([], [row('c', 'Cleo', 'DECLINED')], [], now)).toEqual([])
  })
  it('the firm’s own employee with work on the record is still offered, and staff with none are not', () => {
    const roster = [
      { personId: 'd', name: 'Dara', skills: [], standing: 'ON_PROJECT' },
      { personId: 'o', name: 'Owner', skills: [], standing: 'NOT_ON_THE_RECORD' },
    ]
    expect(trainable([], [], roster, now).map((p) => p.name)).toEqual(['Dara'])
  })
  it('a person on both lists is offered once', () => {
    expect(trainable([row('a', 'Ada', 'GRANTED')], [row('a', 'Ada', 'INVITED')], [], now)).toHaveLength(1)
  })
})

describe('a course is finished only once its cohort has started', () => {
  it('finishing her course is refused while the cohort is only planned, in the lead’s sentence', () => {
    const r = mayFinishCourse({ cohortState: 'PLANNED' })
    expect(r).toEqual({ ok: false, message: 'Start the cohort first.' })
  })
  it('finishing her course is allowed in a running cohort and with no cohort at all', () => {
    expect(mayFinishCourse({ cohortState: 'RUNNING' }).ok).toBe(true)
    expect(mayFinishCourse({ cohortState: null }).ok).toBe(true)
  })
})

describe('a full cohort says so instead of offering a seat', () => {
  it('a cohort with every seat taken reads "<name> is full (2 of 2)."', () => {
    expect(cohortFullSays({ name: 'Spring data cohort', capacity: 2, enrolled: 2 })).toBe('Spring data cohort is full (2 of 2).')
  })
  it('a cohort with a seat free, or with no limit, says nothing', () => {
    expect(cohortFullSays({ name: 'x', capacity: 2, enrolled: 1 })).toBeNull()
    expect(cohortFullSays({ name: 'x', capacity: null, enrolled: 40 })).toBeNull()
  })
})

describe('the Training block on a bench row and a consultant page says it in plain words', () => {
  const proof = buildProof({
    cohort: { name: 'Spring data cohort', courseTitle: 'Python for data' },
    assessments: [
      { skill: 'SQL', score: 62, attempt: 1, assessedAt: D('2026-11-10') },
      { skill: 'SQL', score: 88, attempt: 2, assessedAt: D('2026-11-20') },
    ],
    certifications: [{ title: 'Data engineer', issuedAt: D('2026-11-25'), expiresAt: D('2028-11-25') }],
    listing: { state: 'GRANTED', grantedAt: D('2026-11-28'), respondedAt: D('2026-11-28') },
    ask: { answeredVia: 'OWN_PAGE' },
  }, now)!
  const lines = proofLines(proof)
  it('the cohort and course are named', () => {
    expect(lines).toContain('Spring data cohort, on Python for data')
  })
  it('every attempt at a skill is shown, earliest first, as "SQL: 62, then 88"', () => {
    expect(lines).toContain('SQL: 62, then 88')
  })
  it('a certification shows its title, issued and expires dates', () => {
    expect(lines).toContain('Certified: Data engineer, issued 2026-11-25, expires 2028-11-25')
  })
  it('her yes shows its date and the door she used, in words', () => {
    expect(lines).toContain('Said yes on 2026-11-28, on her own page')
  })
  it('before her yes there is no yes line at all', () => {
    const asked = buildProof({ cohort: { name: 'c', courseTitle: 't' }, assessments: [], certifications: [], listing: { state: 'INVITED', grantedAt: null, respondedAt: null }, ask: { answeredVia: null } }, now)!
    expect(proofLines(asked).some((l) => l.startsWith('Said yes'))).toBe(false)
  })
  it('somebody already on the bench when asked reads as that, with the date', () => {
    const p = buildProof({ cohort: { name: 'c', courseTitle: 't' }, assessments: [], certifications: [], listing: { state: 'GRANTED', grantedAt: D('2026-10-01'), respondedAt: D('2026-10-01') }, ask: { answeredVia: ALREADY_ON_BENCH } }, now)!
    expect(proofLines(p)).toContain('Said yes on 2026-10-01, already on the bench when asked')
  })
})

describe('the screens draw only what their routes will take', () => {
  const cohorts = read('src/app/dashboard/training/cohorts.tsx')
  it('Record score, Certify and Ask her onto the bench are drawn from the per-row flags the cohort read sends', () => {
    expect(cohorts).toMatch(/t\.can\.assess/)
    expect(cohorts).toMatch(/t\.can\.certify/)
    expect(cohorts).toMatch(/t\.can\.ask/)
  })
  it('Finish her course is drawn only from the flag, which is false while the cohort is planned', () => {
    expect(cohorts).toMatch(/t\.can\.finish/)
  })
  it('a full cohort does not draw the Put somebody in form', () => {
    expect(cohorts).toMatch(/c\.fullSays/)
    expect(cohorts).toMatch(/!c\.fullSays/)
  })
  it('adding a course refreshes the cohort form’s course list', () => {
    const page = read('src/app/dashboard/training/page.tsx')
    expect(page).toMatch(/training:courses-changed/)
    expect(cohorts).toMatch(/training:courses-changed/)
  })
})

describe('a client seat reads no training word before the refusal', () => {
  const page = require('fs').readFileSync(require('path').join(process.cwd(), 'src/app/dashboard/training/page.tsx'), 'utf8')
  it('the loading text, the fallback refusal and the error heading name no training', () => {
    expect(page).not.toContain('Opening training')
    expect(page).not.toContain('Training is not part of your seat')
    expect(page).not.toContain('Unable to load training data')
  })
  it('the courses list offers no Finish for an enrollment inside a planned cohort', () => {
    const route = require('fs').readFileSync(require('path').join(process.cwd(), 'src/app/api/training/route.ts'), 'utf8')
    expect(route).toContain("m !== 'complete' || mayFinishCourse({ cohortState: e.cohort?.state ?? null }).ok")
  })
})
