import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'

import { GET as readPage, PATCH as editPage } from '@/app/api/me/portfolio/route'
import { GET as myBenches } from '@/app/api/me/benches/route'
import { GET as myResumes } from '@/app/api/me/resumes/route'
import { GET as myWork } from '@/app/api/me/work/route'
import { GET as myPipeline } from '@/app/api/me/pipeline/route'
import { portfolioOf } from '@/lib/portfolio-data'

/**
 * Karthik Menon opens his own page.
 *
 * He is Teleworld Solutions' own W2 — an integrator's employee, staffed
 * by the firm that employs him, on nobody's bench because nobody asks an
 * employee's permission to be assigned. The demo door was seeded that way
 * on purpose, and the whole consultant surface assumed a bench, so the
 * one person the door exists to demonstrate opened his page and was told
 * to go and get himself listed by an agency.
 *
 * Walked here as him, through the real routes, on the seeded world.
 */

const KARTHIK = 'karthik.menon@seed.etyme.invalid'
const RUBEN = 'ruben.ortega@seed.etyme.invalid'
const HELENA = 'helena.marsh@seed.etyme.invalid'
/** The fifth demo door: a profile, a page, and nothing else at all. */
const MARISOL = 'marisol.quintero@seed.etyme.invalid'

async function page(email: string) {
  as(email)
  return json(await readPage(req('GET', '/api/me/portfolio')))
}

describe('a prime’s own employee has a page of their own', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
  }, 300_000)

  it('Karthik Menon, on an integrator’s own payroll, opens his page and is not refused', async () => {
    const res = await page(KARTHIK)

    expect(res.status).toBe(200)
    expect(res.body.data.yours).toBe(true)
    expect(res.body.data.because).toBe('EMPLOYED')
  })

  it('is told his employer staffs him directly, instead of being sent to find an agency', async () => {
    const res = await page(KARTHIK)

    expect(res.body.data.standing).toContain('Teleworld Solutions employs you')
    expect(res.body.data.standing).toContain('need no listing')
  })

  it('reads the avionics work his employer placed him on, with the client named nowhere', async () => {
    const res = await page(KARTHIK)
    const preview = res.body.data.preview

    expect(preview.engagements.length).toBeGreaterThan(0)
    expect(preview.engagements[0].role).toBe('Avionics software assurance engineer')
    // The sector, never the client. Corveldt Aerospace agreed to nothing.
    expect(JSON.stringify(preview)).not.toContain('Corveldt')
    expect(preview.engagements[0].sector).toBe('Enterprise')
  })

  it('has nothing public about him before he has touched anything', async () => {
    const res = await page(KARTHIK)

    expect(res.body.data.on).toBe(false)
    expect(res.body.data.address).toBe(null)

    // And no row has been created by the reading of it.
    const person = await prisma.person.findUnique({
      where: { primaryEmail: KARTHIK },
      select: { consultant: { select: { id: true } } },
    })
    expect(person!.consultant).toBe(null)
  })

  it('claims an address, and the page comes into being by his own hand — private, and off', async () => {
    as(KARTHIK)
    const res = await json(
      await editPage(req('PATCH', '/api/me/portfolio', { address: 'karthik-menon' }))
    )

    expect(res.status).toBe(200)
    expect(res.body.data.address).toBe('karthik-menon')

    const profile = await prisma.consultantProfile.findFirst({
      where: { person: { primaryEmail: KARTHIK } },
      select: { visibility: true, pageLiveAt: true },
    })
    expect(profile!.visibility).toBe('INTERNAL')
    expect(profile!.pageLiveAt).toBe(null)
  })

  it('nothing about him is public until he turns it on himself', async () => {
    expect(await portfolioOf('karthik-menon')).toBe(null)

    as(KARTHIK)
    await editPage(req('PATCH', '/api/me/portfolio', { on: true }))

    const live = await portfolioOf('karthik-menon')
    expect(live).not.toBe(null)
    expect(live!.name).toBe('Karthik Menon')
  })

  it('turns it off again, and the page answers to nobody', async () => {
    as(KARTHIK)
    await editPage(req('PATCH', '/api/me/portfolio', { on: false }))

    expect(await portfolioOf('karthik-menon')).toBe(null)
  })

  it('who has you names the firm that employs him rather than telling him nobody does', async () => {
    as(KARTHIK)
    const res = await json(await myBenches(req('GET', '/api/me/benches')))

    expect(res.status).toBe(200)
    expect(res.body.data.benches).toEqual([])
    expect(res.body.data.employers).toEqual(['Teleworld Solutions'])
    expect(res.body.data.note).toContain('Teleworld Solutions employs and staffs you directly')
  })

  it('the rest of his own surface answers him too — his work, his pipeline, his CV list', async () => {
    as(KARTHIK)

    const work = await json(await myWork(req('GET', '/api/me/work')))
    expect(work.status).toBe(200)
    expect(work.body.data.placements.length).toBe(1)

    const pipeline = await json(await myPipeline(req('GET', '/api/me/pipeline')))
    expect(pipeline.status).toBe(200)
    expect(pipeline.body.data.submissions.length).toBe(1)

    const cvs = await json(await myResumes(req('GET', '/api/me/resumes')))
    expect(cvs.status).toBe(200)
    expect(cvs.body.data.versions).toEqual([])
  })

  it('Ruben Ortega, a program office’s own analyst, has the same page for the same reason', async () => {
    const res = await page(RUBEN)

    expect(res.status).toBe(200)
    expect(res.body.data.yours).toBe(true)
    expect(res.body.data.because).toBe('EMPLOYED')
    expect(res.body.data.standing).toContain('Aptiva Workforce employs you')
  })

  it('a consultant on a bench is unaffected', async () => {
    const res = await page(HELENA)

    expect(res.status).toBe(200)
    expect(res.body.data.yours).toBe(true)
    expect(res.body.data.because).toBe('BENCH')
    expect(res.body.data.standing).toContain('markets you')
    expect(res.body.data.preview.engagements.length).toBeGreaterThan(0)

    as(HELENA)
    const benches = await json(await myBenches(req('GET', '/api/me/benches')))
    expect(benches.body.data.benches.length).toBeGreaterThan(0)
    expect(benches.body.data.note).toContain('They cannot see each other')
  })

  it('the firm that employs him may hold his CV, because the employment is the consent', async () => {
    const [employer, stranger] = await Promise.all([
      prisma.context.findFirst({
        where: { revokedAt: null, company: { name: 'Teleworld Solutions' }, person: { primaryEmail: { not: KARTHIK } } },
        select: { id: true, person: { select: { primaryEmail: true } } },
      }),
      prisma.context.findFirst({
        where: { revokedAt: null, company: { kind: 'VENDOR', name: { not: 'Teleworld Solutions' } } },
        select: { id: true, person: { select: { primaryEmail: true } } },
      }),
    ])
    expect(employer, 'Teleworld should have a desk of its own').not.toBe(null)

    const karthik = await prisma.person.findUnique({ where: { primaryEmail: KARTHIK }, select: { id: true } })

    as(employer!.person.primaryEmail)
    const mine = await json(
      await myResumes(req('GET', `/api/me/resumes?personId=${karthik!.id}`, undefined, { 'x-context-id': employer!.id }))
    )
    expect(mine.status).toBe(200)

    // A firm that neither employs him nor holds a listing is refused, in
    // a sentence that says what would have made it allowed.
    as(stranger!.person.primaryEmail)
    const theirs = await json(
      await myResumes(req('GET', `/api/me/resumes?personId=${karthik!.id}`, undefined, { 'x-context-id': stranger!.id }))
    )
    expect(theirs.status).toBe(403)
    expect(theirs.body.error.message).toContain('the firm that employs them')
  })

  /**
   * The person with a page and nothing behind it.
   *
   * Marisol Quintero is party 8B in the lane drawings and the fifth
   * demo door: a profile, a page she turned on herself, and not one
   * other fact — no bench listing, no employer, no submission, nobody
   * paying her. `ownPage` gained OWN_MAKING for her; these two walk it
   * through the routes she would actually open, on the seeded world she
   * was added to.
   *
   * Left out of the verdict's own commit on purpose: the seed that
   * writes her had not landed, and a test that seeds nothing to assert
   * against is a test that passes for the wrong reason.
   */
  it('Marisol Quintero, with a profile and nothing else, opens her work and is not told it is on the record', async () => {
    as(MARISOL)
    const work = await json(await myWork(req('GET', '/api/me/work')))

    expect(work.status).toBe(200)
    expect(work.body.data.standing.because).toBe('OWN_MAKING')

    // Nothing, and nothing is the answer. The sentence PLACED would
    // have given her opens on her work being on the record, and there
    // is none.
    expect(work.body.data.placements, 'she has a placement, so she is no longer party 8B').toHaveLength(0)
    expect(work.body.data.timesheets).toHaveLength(0)
    expect(work.body.data.standing.says).not.toMatch(/on the record/i)
    expect(work.body.data.standing.says).toMatch(/nobody has put you forward/i)
  })

  it('is offered her page and her data, and nothing Etyme cannot honor', async () => {
    as(MARISOL)
    const work = await json(await myWork(req('GET', '/api/me/work')))
    const says: string = work.body.data.standing.says

    // The two moves that are real, both hers, and said as hers.
    expect(says).toMatch(/invites you onto its bench|grant it a listing/i)
    expect(says).toMatch(/company of your own|sell yourself/i)

    // And nothing that would need Etyme to place somebody, which it
    // never does. She is the one reader who cannot tell the difference
    // between a button that works and one with nothing behind it.
    expect(says).not.toMatch(/we (will |'ll )?(find|place|submit)|apply now|get placed/i)

    // Her page is hers to read and hers to edit, which is the thing she
    // actually has today.
    const res = await page(MARISOL)
    expect(res.status).toBe(200)
    expect(res.body.data.yours).toBe(true)
  })

  it('a client’s own approver, who does no contract work, is told what the page is for', async () => {
    const approver = await prisma.person.findFirst({
      where: {
        contexts: { some: { revokedAt: null, company: { kind: 'CLIENT' } } },
        sellContracts: { none: {} },
        submissions: { none: {} },
        consultant: null,
      },
      select: { primaryEmail: true },
    })
    expect(approver, 'the seeded world should have a client-side desk worker').not.toBe(null)

    const res = await page(approver!.primaryEmail)

    expect(res.status).toBe(200)
    expect(res.body.data.yours).toBe(false)
    expect(res.body.data.standing).toContain('the person the work is about')

    // And no permanent address was quietly taken for somebody who will
    // never use one.
    as(approver!.primaryEmail)
    const tried = await json(
      await editPage(req('PATCH', '/api/me/portfolio', { address: 'not-a-contractor' }))
    )
    expect(tried.status).toBe(403)
    expect(tried.body.error.message).toContain('the person the work is about')
  })
})
