import { describe, it, expect, beforeAll } from 'vitest'
import { req, json, resetDatabase, prisma } from './harness'
import { POST as answerLink } from '@/app/api/bench-invite/[token]/route'
import { signInvite } from '@/lib/bench-invite'
import { publicSite } from '@/lib/public-site'

/**
 * A firm's public page and the yes of the people on its bench
 * (walk tpc, 2026-11-14).
 *
 * The page counted the skills of everybody on the bench whose listing
 * was not revoked, so a candidate who had only been asked put her
 * skills on the open internet. A company page shows only people who
 * said yes to being shown, and never a name or a rate.
 *
 * The world is made here, on an empty database: one firm with a live
 * page and a seat, one person asked and not answered.
 */

const SLUG = 'consent-walk-firm'
const SKILLS = ['Fieldbus tuning', 'Batch records']
let listingId = ''

const skillsOnPage = async () => {
  const site = await publicSite(SLUG)
  expect(site).not.toBeNull()
  return site!.skills.map((s) => s.skill)
}

const answer = async (body: unknown) => {
  // The link is signed in memory and sent straight to the route; it is
  // never printed or kept.
  const t = signInvite(listingId)
  return json(await answerLink(req('POST', `/api/bench-invite/${t}`, body), { params: Promise.resolve({ token: t }) }))
}

beforeAll(async () => {
  await resetDatabase()
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'integration-test-secret'
  const firm = await prisma.company.create({
    data: { name: 'Consent Walk Staffing', slug: SLUG, kind: 'VENDOR', currency: 'USD', claimedAt: new Date(), siteLiveAt: new Date() },
  })
  const person = await prisma.person.create({ data: { name: 'Asked Only', primaryEmail: 'asked-only@consent.example' } })
  const profile = await prisma.consultantProfile.create({ data: { personId: person.id, skills: SKILLS } })
  listingId = (await prisma.benchListing.create({
    data: { consultantId: profile.id, companyId: firm.id, tier: 'MARKETING', state: 'INVITED', invitedAt: new Date() },
  })).id
}, 180_000)

describe("a firm's public page shows only people who said yes", () => {
  it('a person asked onto the bench and not answered adds nothing to the firm’s public page', async () => {
    expect(await skillsOnPage()).toEqual([])
    const site = await publicSite(SLUG)
    for (const skill of SKILLS) expect(site!.intro ?? '').not.toContain(skill)
  })

  it('her skills appear on the page the moment she says yes to being shown beyond the firm', async () => {
    const r = await answer({ said: 'ACCEPT', termsSeen: null, showInMatches: true })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect((await skillsOnPage()).sort()).toEqual([...SKILLS].sort())
    const site = await publicSite(SLUG)
    expect(JSON.stringify(site)).not.toContain('Asked Only')
  })
})
