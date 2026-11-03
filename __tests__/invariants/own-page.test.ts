import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  ownPage, startingPage, whoHasYouNote, joinNames,
  type WorkingLife,
} from '@/lib/consultant-portfolio'
import { mayUpload, mayRead } from '@/lib/resumes'

/**
 * A page of your own is for the person the work is about.
 *
 * The founder opened the Karthik Menon door and said "Candidate Karthik
 * is all buggy". One cause: a `ConsultantProfile` was only ever created
 * by joining somebody's bench, and every consultant-facing surface read
 * that row or refused. Karthik is a systems integrator's own W2 — placed,
 * billed, four weeks signed — and on nobody's bench by design, so his own
 * page told him to go and join one.
 *
 * Wrong answer, and worse advice: for an employee, joining a bench means
 * consenting to be marketed by a firm that is not his employer, which is
 * the one thing his situation says he should not do.
 */

const NOBODY: WorkingLife = {
  benches: [], employers: [], placements: 0, submissions: 0, paidEngagements: 0, hasProfile: false,
}

describe('a page of your own is for the person the work is about, not only for somebody on a bench', () => {
  it('a prime’s own employee has a page of their own, without joining anybody’s bench', () => {
    const karthik = {
      ...NOBODY,
      employers: ['Teleworld Solutions'],
      placements: 1,
      submissions: 1,
      paidEngagements: 1,
    }
    const verdict = ownPage(karthik)

    expect(verdict.ok).toBe(true)
    expect(verdict.because).toBe('EMPLOYED')
    expect(verdict.says).toContain('Teleworld Solutions employs you')
  })

  it('tells an employee that their employer needs no listing, rather than asking them for one', () => {
    const verdict = ownPage({ ...NOBODY, employers: ['Teleworld Solutions'], placements: 1 })

    expect(verdict.says).toContain('need no listing')
    expect(verdict.says.toLowerCase()).not.toContain('join a bench')
  })

  it('a consultant on a bench is unaffected', () => {
    const helena = {
      ...NOBODY,
      benches: ['Brightmoor Staffing'],
      placements: 2,
      submissions: 1,
      hasProfile: true,
    }
    const verdict = ownPage(helena)

    expect(verdict.ok).toBe(true)
    expect(verdict.because).toBe('BENCH')
    expect(verdict.says).toContain('Brightmoor Staffing markets you')
  })

  it('names every agency that markets somebody, because a consultant on three benches has three answers', () => {
    const verdict = ownPage({
      ...NOBODY,
      benches: ['Brightmoor Staffing', 'Veritan Talent', 'Halcyon Health'],
      hasProfile: true,
    })

    expect(verdict.says).toContain('Brightmoor Staffing, Veritan Talent and Halcyon Health market you')
  })

  it('a listing is the louder fact where somebody is both listed and employed', () => {
    const nurseThroughHerOwnCompany = {
      ...NOBODY,
      benches: ['Halcyon Health'],
      employers: ['Byrne Nursing LLC'],
      placements: 1,
      hasProfile: true,
    }

    expect(ownPage(nurseThroughHerOwnCompany).because).toBe('BENCH')
  })

  it('somebody placed with no agency and no employer behind them still has a page, because the work is on the record', () => {
    const verdict = ownPage({ ...NOBODY, placements: 1, submissions: 1 })

    expect(verdict.ok).toBe(true)
    expect(verdict.because).toBe('PLACED')
    expect(verdict.says).toContain('Your work is on the record here')
  })

  it('being on a payroll is not on its own a page, because a client’s own bookkeeper is not a contractor', () => {
    const apClerk = { ...NOBODY, employers: ['Northbend Athletic'] }

    expect(ownPage(apClerk).ok).toBe(false)
    expect(ownPage(apClerk).because).toBe('NOBODY')
  })

  it('somebody nobody has put forward is told what the page is for and when it turns up', () => {
    const verdict = ownPage(NOBODY)

    expect(verdict.says).toContain('the person the work is about')
    expect(verdict.says).toContain('the first time somebody puts you forward or places you')
  })

  it('opens the page the moment a firm first puts somebody forward, before any placement exists', () => {
    expect(ownPage({ ...NOBODY, submissions: 1, employers: ['Teleworld Solutions'] }).ok).toBe(true)
  })

  it('a profile that already exists is never taken away from somebody who has stopped working', () => {
    expect(ownPage({ ...NOBODY, hasProfile: true }).ok).toBe(true)
  })
})

describe('nothing about an employee becomes public until they turn it on themselves', () => {
  it('a page made for somebody starts private and turned off', () => {
    expect(startingPage()).toEqual({ visibility: 'INTERNAL', pageLiveAt: null })
  })

  it('says so out loud to every person it is offered to, whichever way they got here', () => {
    const employed = ownPage({ ...NOBODY, employers: ['Teleworld Solutions'], placements: 1 })
    const listed = ownPage({ ...NOBODY, benches: ['Brightmoor Staffing'], hasProfile: true })
    const placed = ownPage({ ...NOBODY, placements: 1 })

    for (const v of [employed, listed, placed]) {
      expect(v.says).toContain('public until you turn it on')
    }
  })
})

describe('who has you names the firm that employs somebody instead of saying nobody does', () => {
  it('an employee on no bench is told which firm staffs them', () => {
    const said = whoHasYouNote({ benches: 0, employers: ['Teleworld Solutions'] })

    expect(said).toContain('Teleworld Solutions employs and staffs you directly')
    expect(said).toContain('tells you rather than asks')
  })

  it('a consultant on two benches is still told how many agencies market them, and nothing about them', () => {
    const said = whoHasYouNote({ benches: 2, employers: [] })

    expect(said).toContain('2 agencies market you')
    expect(said).toContain('They cannot see each other')
  })

  it('somebody with neither a bench nor an employer is told a listing is theirs to give', () => {
    const said = whoHasYouNote({ benches: 0, employers: [] })

    expect(said).toContain('No agency is marketing you')
    expect(said).toContain('yours to give and to take back')
  })

  it('reads a list of firms the way a person would say it out loud', () => {
    expect(joinNames(['Teleworld Solutions'])).toBe('Teleworld Solutions')
    expect(joinNames(['A', 'B'])).toBe('A and B')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C')
    expect(joinNames([])).toBe('')
  })
})

describe('the firm that employs somebody may hold their CV, because the employment is the consent', () => {
  const owner = { personId: 'karthik', listedTo: [], employedBy: ['teleworld'] }

  it('an integrator may add a CV for its own W2, who is on no bench to be listed on', () => {
    expect(mayUpload({ personId: 'recruiter', companyId: 'teleworld' }, owner).ok).toBe(true)
  })

  it('an integrator may open its own W2’s CV, so it has something to submit him with', () => {
    expect(mayRead({ personId: 'recruiter', companyId: 'teleworld' }, owner, []).ok).toBe(true)
  })

  it('a firm that neither employs them nor holds a listing is refused in a sentence', () => {
    const verdict = mayUpload({ personId: 'stranger', companyId: 'someone-else' }, owner)

    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toContain('the firm that employs them')
  })

  it('leaves the person themselves in charge of their own CV, as before', () => {
    expect(mayUpload({ personId: 'karthik', companyId: null }, owner).ok).toBe(true)
  })

  it('leaves an agency holding a listing exactly where it was', () => {
    const listed = { personId: 'helena', listedTo: ['brightmoor'] }

    expect(mayUpload({ personId: 'recruiter', companyId: 'brightmoor' }, listed).ok).toBe(true)
    expect(mayUpload({ personId: 'recruiter', companyId: 'teleworld' }, listed).ok).toBe(false)
  })
})

// ── The guard, on the source itself ───────────────────────────────────

/**
 * The bug was one sentence in two files, and a sentence cannot be caught
 * by a type. So the surface is read.
 *
 * Anything a person opens as themselves — their work, their page, their
 * benches, their papers, their CV — may not refuse somebody for the
 * absence of a consultant profile, and may not tell anybody to go and
 * join a bench to get one.
 */
const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

const SURFACE = [
  join(ROOT, 'src/app/api/me'),
  join(ROOT, 'src/app/dashboard/my-page'),
  join(ROOT, 'src/app/dashboard/my-work'),
  join(ROOT, 'src/app/dashboard/my-benches'),
  join(ROOT, 'src/app/dashboard/my-standing'),
].flatMap((d) => walk(d))

describe('no consultant-facing screen refuses somebody for not being on a bench', () => {
  it('finds the surface it is meant to be reading', () => {
    expect(SURFACE.length).toBeGreaterThan(8)
  })

  it('no route a person opens as themselves tells them to go and join a bench', () => {
    const hits = SURFACE.filter((f) => /join a bench/i.test(readFileSync(f, 'utf8')))

    expect(
      hits.map((f) => f.replace(ROOT + '/', '')),
      'a person’s own page may not send them to a bench to get one — an employer needs no listing'
    ).toEqual([])
  })

  it('no route a person opens as themselves refuses them for having no consultant profile', () => {
    const hits = SURFACE.filter((f) => /NO_PROFILE/.test(readFileSync(f, 'utf8')))

    expect(
      hits.map((f) => f.replace(ROOT + '/', '')),
      'a missing profile row is not a refusal — the page is built from the work'
    ).toEqual([])
  })

  it('every refusal on the surface is a sentence, never a bare code', () => {
    // A code is what the machine reads; the message is the product. Any
    // `code:` on this surface must have a `message:` beside it.
    for (const f of SURFACE) {
      const text = readFileSync(f, 'utf8')
      const codes = text.match(/code: '[A-Z_]+'/g) ?? []
      const messages = text.match(/message:/g) ?? []
      expect(messages.length, `${f.replace(ROOT + '/', '')} has a code with no sentence`)
        .toBeGreaterThanOrEqual(codes.length)
    }
  })
})

// ── Education, from the résumé (founder, 2026-11-03) ───────────────────

import {
  mayCorrectEducation, correctEducation, educationShown, readEducationCorrection,
} from '@/lib/consultant-portfolio/education'

const EDU_NOW = new Date('2026-11-03T12:00:00Z')
const FROM_RESUME = [
  { institution: 'University of Texas at Austin', qualification: 'B.S.', fieldOfStudy: 'Nursing', year: 2012,
    quote: 'B.S. in Nursing, University of Texas at Austin, 2012', source: 'RESUME' },
]
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('education, from the résumé, on the person’s page and the firm’s', () => {
  it('a firm reads the person’s education lines and never edits them', () => {
    // The firm reads them, from both of its views of the person.
    expect(src('src/app/api/consultants/route.ts')).toContain("education: educationShown(p.education, 'FIRM')")
    expect(src('src/app/api/consultants/[id]/route.ts')).toContain("education: educationShown(profile.education, 'FIRM')")
    expect(educationShown(FROM_RESUME, 'FIRM')![0]).toMatchObject({
      says: 'B.S. in Nursing, University of Texas at Austin, 2012',
      from: 'From the résumé',
      quote: 'B.S. in Nursing, University of Texas at Austin, 2012',
    })
    // And nothing a firm sends can change them: only the person may.
    expect(mayCorrectEducation({ callerPersonId: 'recruiter', profilePersonId: 'priya' }).ok).toBe(false)
    expect(mayCorrectEducation({ callerPersonId: 'priya', profilePersonId: 'priya' }).ok).toBe(true)
    for (const f of ['src/app/api/consultants/[id]/route.ts', 'src/lib/consultant-portfolio/forms.ts', 'src/lib/consultant-portfolio/firm-view.ts']) {
      expect(src(f)).not.toMatch(/\beducation\s*[:=](?!\s*educationShown)/)
    }
    // The one door that corrects them is the person's own session.
    expect(src('src/app/api/me/portfolio/route.ts')).toContain('correctEducation(p.education, read.correction, new Date())')
  })

  it('a person’s correction is kept as their own words, with the sentence as the quote', () => {
    const done = correctEducation(FROM_RESUME, { index: 0, year: 2013, sentence: 'I finished in 2013, not 2012.' }, EDU_NOW)
    if (!done.ok) throw new Error(done.says)
    expect(done.education[0]).toMatchObject({
      year: 2013, institution: 'University of Texas at Austin', source: 'PERSON',
      quote: 'I finished in 2013, not 2012.', corrects: 'B.S. in Nursing, University of Texas at Austin, 2012', saidOn: '2026-11-03',
    })
    expect(educationShown(done.education, 'PERSON')![0].from).toBe('You said')
  })

  it('a correction says nothing without the person’s own sentence, and a year after this year is refused', () => {
    expect(readEducationCorrection({ index: 0, year: 2013 }).ok).toBe(false)
    const late = correctEducation(FROM_RESUME, { index: 0, year: 2030, sentence: 'I finish in 2030.' }, EDU_NOW)
    expect(late).toEqual({ ok: false, says: 'A year of graduation reads between 1940 and 2026.', field: 'year' })
  })

  it('the person’s page shows the lines under “Education, from the résumé”, each quote on tap', () => {
    const page = src('src/app/dashboard/my-page/page.tsx')
    expect(page).toContain('title="Education, from the résumé"')
    expect(page).toContain('<details>')
    expect(src('src/app/dashboard/consultants/page.tsx')).toContain('Education, from the résumé')
  })

  it('a plain-text résumé uploaded is read for education onto a profile that already exists', () => {
    const route = src('src/app/api/me/resumes/route.ts')
    expect(route).toContain('recordResumeEducation(profile.id, readEducation(bytes.toString(\'utf8\')))')
  })
})
