import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as readMatches, POST as runMatches } from '@/app/api/requirements/[id]/matches/route'
import { POST as askForThem } from '@/app/api/requirements/[id]/matches/ask/route'
import { GET as addFirmChoices, POST as addFirm } from '@/app/api/requirements/[id]/matches/add-firm/route'
import { PATCH as review } from '@/app/api/supplier-requests/[id]/route'
import { POST as submit } from '@/app/api/submissions/route'
import { GET as myBenches, PATCH as changeMyBench } from '@/app/api/me/benches/route'
import { GET as inviteGet, POST as invitePost } from '@/app/api/bench-invite/[token]/route'
import { GET as benchStays } from '@/app/api/cron/bench-stays/route'

/**
 * The bench reaches a job request through matching — decided 2026-09-30.
 *
 * Walked on the seeded world: Northbend Athletic's open HCM integration
 * lead, matched with a supplier's bench, a trading firm's and one
 * suggestion; a supplier the job was sent to matching its own pool; an
 * integrator's own employee; the one action a suggestion has; and the
 * stay a person chooses when they say yes.
 */

const D = '@demo.etyme.local'
const HIRING = `world-nike-hiring${D}`
const AP = `world-nike-ap${D}`
const LEAD = `world-nike-vp${D}`
const HR = `world-nike-hr${D}`
const PROCUREMENT = `world-nike-procurement${D}`
const CS = `world-computer-systems${D}`
const PINNACLE = `world-pinnacle${D}`
const BRIGHTMOOR = `world-brightmoor${D}`
const TELEWORLD = `world-teleworld${D}`
const SEED = '@seed.etyme.invalid'
const MATEO = `mateo.villanueva${SEED}`
const TAMSIN = `tamsin.okoro${SEED}`
const PRISCILLA = `priscilla.adeyemi${SEED}`
const CRON = 'bench-matching-cron'

const withId = (id: string) => ({ params: Promise.resolve({ id }) })
const withToken = (token: string) => ({ params: Promise.resolve({ token }) })
const iso = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const HOUR = 3_600_000

const s: Record<string, any> = {}

async function matchesAs(email: string, requirementId: string) {
  as(email)
  const r = await json(await readMatches(req('GET', `/api/requirements/${requirementId}/matches`), withId(requirementId)))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}
async function rematch(email: string, requirementId: string) {
  as(email)
  const r = await json(await runMatches(req('POST', `/api/requirements/${requirementId}/matches`, { forceRefresh: true }), withId(requirementId)))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}
const rowFor = (data: any, name: string) => data.matches.find((m: any) => m.consultant.name === name)
const listingOf = (email: string, slug: string) =>
  prisma.benchListing.findFirstOrThrow({ where: { consultant: { person: { primaryEmail: email } }, company: { slug } } })
const cron = async () => {
  process.env.CRON_SECRET = CRON
  const r = await json(await benchStays(req('GET', '/api/cron/bench-stays', undefined, { authorization: `Bearer ${CRON}` })))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}

beforeAll(async () => {
  await freshWorld()
  process.env.NEXTAUTH_SECRET = 'integration-test-secret'
  const job = await prisma.requirement.findFirstOrThrow({
    where: { title: 'HCM integration lead', company: { slug: 'world-nike' } },
    select: { id: true, companyId: true },
  })
  s.job = job.id
  s.northbend = job.companyId
  s.orchid = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-orchid' } })).id
  s.cs = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-computer-systems' } })).id
  s.cloudepa = (await prisma.company.findFirstOrThrow({ where: { slug: 'world-cloudepa' } })).id
}, 240_000)

describe('a client’s job request is matched with bench, suppliers first', () => {
  it('a client’s job request is matched with bench from the suppliers it already uses, ranked first', async () => {
    const data = await matchesAs(HIRING, s.job)
    expect(data.viewer.buyer).toBe(true)
    const reaches = data.matches.map((m: any) => m.reach)
    const order = { OWN: 0, PANEL: 1, TRADING: 2, SUGGESTION: 3 } as Record<string, number>
    for (let i = 1; i < reaches.length; i++) expect(order[reaches[i]]).toBeGreaterThanOrEqual(order[reaches[i - 1]])
    expect(reaches[0]).toBe('PANEL')
    expect(rowFor(data, 'Tamsin Okoro')).toMatchObject({ reach: 'PANEL', firm: { name: 'Pinnacle Resourcing' } })
    expect(rowFor(data, 'Jonas Whitaker')).toMatchObject({ reach: 'PANEL', firm: { name: 'Brightmoor Staffing' } })
    // Every match carries its reasons. A bare number is a bug.
    for (const m of data.matches) {
      expect(m.factors.length).toBeGreaterThan(0)
      expect(m.basis.length).toBeGreaterThan(0)
      expect(['HIGH', 'MODERATE', 'LOW']).toContain(m.confidence)
      expect(m).toHaveProperty('unknowns')
    }
  })

  it('a firm the client works with but does not buy from brings its bench, below its suppliers', async () => {
    const data = await matchesAs(HIRING, s.job)
    expect(rowFor(data, 'Priscilla Adeyemi')).toMatchObject({ reach: 'TRADING', firm: { name: 'Halcyon Talent' } })
  })

  it('a person from a firm the client does not use appears only as a suggestion, without their name or rate, and only if they agreed to be shown in matches', async () => {
    const data = await matchesAs(HIRING, s.job)
    const suggested = data.matches.filter((m: any) => m.reach === 'SUGGESTION')
    expect(suggested).toHaveLength(1)
    const m = suggested[0]
    s.suggestion = m.id
    expect(m.firm.name).toBe('Orchid Systems')
    expect(m.consultant).toMatchObject({ name: null, personId: null, id: null, headline: null, location: null, workAuth: null })
    expect(m.rate).toBeNull()
    expect(m.consultant.skills).toContain('HCM integration')
    const said = JSON.stringify(m)
    expect(said).not.toContain('Mateo')
    expect(said).not.toContain('Villanueva')
    expect(said).not.toMatch(/\$\d/)

    // He takes the yes back: he is not suggested to anybody.
    const mine = await listingOf(MATEO, 'world-orchid')
    as(MATEO)
    const off = await json(await changeMyBench(req('PATCH', '/api/me/benches', { listingId: mine.id, showInMatches: false })))
    expect(off.status, JSON.stringify(off.body)).toBe(200)
    expect((await matchesAs(HIRING, s.job)).matches.some((x: any) => x.reach === 'SUGGESTION')).toBe(false)

    // And gives it again, from his own page, in a sentence.
    as(MATEO)
    const on = await json(await changeMyBench(req('PATCH', '/api/me/benches', { listingId: mine.id, showInMatches: true })))
    expect(on.body.data.message).toContain('never your name, contact or rate')
    expect((await matchesAs(HIRING, s.job)).matches.some((x: any) => x.reach === 'SUGGESTION')).toBe(true)
  })

  it('a client never reads a rate off a match, not even from its own supplier', async () => {
    const data = await matchesAs(HIRING, s.job)
    for (const m of data.matches) {
      expect(m.rate).toBeNull()
      for (const f of m.factors) expect(f.detail ?? '').not.toMatch(/\$\d/)
    }
  })

  it('every match shown leaves a trail, including suggestions', async () => {
    const mateo = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: MATEO } })
    const tamsin = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: TAMSIN } })
    const count = (id: string) => prisma.accessLog.count({ where: { subjectId: id, action: 'MATCH_VIEW', actorCompanyId: s.northbend } })
    const [m0, t0] = [await count(mateo.id), await count(tamsin.id)]
    await matchesAs(HIRING, s.job)
    expect(await count(mateo.id)).toBe(m0 + 1)
    expect(await count(tamsin.id)).toBe(t0 + 1)
    const row = await prisma.accessLog.findFirstOrThrow({ where: { subjectId: mateo.id, action: 'MATCH_VIEW' }, orderBy: { at: 'desc' } })
    expect(row.reason).toContain('without their name')
  })

  it('a suggestion cannot be submitted or messaged; its one action is asking to add the firm', async () => {
    const data = await matchesAs(HIRING, s.job)
    const m = data.matches.find((x: any) => x.id === s.suggestion)
    expect(m.action.kind).toBe('ASK_TO_ADD')
    as(HIRING)
    const asked = await json(await askForThem(req('POST', `/api/requirements/${s.job}/matches/ask`, { matchId: s.suggestion }), withId(s.job)))
    expect(asked.status).toBe(409)
    expect(asked.body.error.code).toBe('NOT_YOUR_SUPPLIER')
    expect(asked.body.error.message).toContain('Ask to add it')
    expect(JSON.stringify(asked.body)).not.toContain('Mateo')
  })

  it('a client asks its supplier to put a matched person forward, on the supplier’s thread for this job', async () => {
    const data = await matchesAs(HIRING, s.job)
    const m = rowFor(data, 'Tamsin Okoro')
    expect(m.action).toMatchObject({ kind: 'ASK', toName: 'Pinnacle Resourcing' })
    as(HIRING)
    const r = await json(await askForThem(req('POST', `/api/requirements/${s.job}/matches/ask`, { matchId: m.id }), withId(s.job)))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.says).toContain('Pinnacle Resourcing has been asked to put Tamsin Okoro forward')
    const msg = await prisma.message.findFirstOrThrow({ where: { conversationId: r.body.data.threadId }, orderBy: { createdAt: 'desc' } })
    expect(msg.type).toBe('ASK')
    expect((msg.metadata as any).via).toBe('MATCH')
  })

  it('a sub-vendor below the client’s prime is never suggested to the client, even when the person agreed', async () => {
    // A CloudEPA consultant — CloudEPA supplies Northbend only through
    // Computer Systems — who fits the job and said yes to being shown.
    const l = await prisma.benchListing.findFirstOrThrow({
      where: { companyId: s.cloudepa, tier: 'MARKETING', state: 'GRANTED', revokedAt: null },
      select: { id: true, consultantId: true, consultant: { select: { person: { select: { name: true } } } } },
    })
    await prisma.consultantProfile.update({ where: { id: l.consultantId }, data: { skills: ['HCM integration', 'Payroll interfaces'], rateFloor: 9_000 } })
    await prisma.benchListing.update({ where: { id: l.id }, data: { showInMatches: true, rateMin: 10_500, rateMax: 11_200 } })
    s.cloudepaPerson = l.consultant.person.name
    await rematch(HIRING, s.job)
    const data = await matchesAs(HIRING, s.job)
    expect(data.matches.some((m: any) => m.firm.name === 'CloudEPA')).toBe(false)
    expect(JSON.stringify(data)).not.toContain(s.cloudepaPerson)
  })
})

describe('a supplier the job was sent to matches its own pool', () => {
  it('an invited supplier matches its own bench against the job request it received', async () => {
    const run = await rematch(CS, s.job)
    expect(run.matchCount).toBeGreaterThan(0)
    const data = await matchesAs(CS, s.job)
    expect(data.viewer).toMatchObject({ buyer: false, raiser: false, suggests: false })
    const m = rowFor(data, s.cloudepaPerson)
    expect(m).toMatchObject({ reach: 'PANEL', firm: { name: 'CloudEPA' } })
    expect(m.action).toMatchObject({ kind: 'SUBMIT', fromCompanyId: s.cs, offeredBy: s.cloudepa, payRate: 11_200, rate: null })
    // Its own supplier's rate is its own deal.
    expect(m.rate).toEqual({ min: 10_500, max: 11_200 })
    // Nothing from a firm Computer Systems does not trade with.
    expect(data.matches.some((x: any) => x.reach === 'SUGGESTION')).toBe(false)
    s.csRow = m
    // And the client's own view is untouched by the supplier's run.
    expect(rowFor(await matchesAs(HIRING, s.job), 'Tamsin Okoro')).toBeTruthy()
  })

  it('adding a match to the application sends the supplier’s real rate, never a placeholder', async () => {
    // Computer Systems puts CloudEPA's person forward in its own name, at
    // its own rate, buying them from CloudEPA at what CloudEPA asked.
    const person = await prisma.person.findFirstOrThrow({ where: { name: s.cloudepaPerson } })
    as(CS)
    const r = await json(await submit(req('POST', '/api/submissions', {
      requirementId: s.job, personIds: [person.id], rate: 13_000,
      fromCompanyId: s.csRow.action.fromCompanyId, offeredBy: s.csRow.action.offeredBy, payRate: s.csRow.action.payRate,
    })))
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300)
    expect(r.body.data.results[0].status, JSON.stringify(r.body.data.results[0])).toBe('created')
    const top = await prisma.submission.findUniqueOrThrow({ where: { requirementId_personId: { requirementId: s.job, personId: person.id } } })
    expect(top.fromCompanyId).toBe(s.cs)
    expect(top.rate).toBe(13_000)
    const below = await prisma.submission.findUniqueOrThrow({ where: { id: top.parentSubmissionId! } })
    expect(below.fromCompanyId).toBe(s.cloudepa)
    expect(below.rate).toBe(11_200)

    // Pinnacle, asked a moment ago, answers from its own matches: its own
    // listing's rate, its own firm.
    const own = rowFor(await matchesAs(PINNACLE, s.job), 'Tamsin Okoro')
    expect(own.action).toMatchObject({ kind: 'SUBMIT', as: 'OWN_BENCH', rate: 12_900 })
    const tamsin = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: TAMSIN } })
    as(PINNACLE)
    const p = await json(await submit(req('POST', '/api/submissions', {
      requirementId: s.job, personIds: [tamsin.id], rate: own.action.rate, fromCompanyId: own.action.fromCompanyId,
    })))
    expect(p.body.data.results[0].status, JSON.stringify(p.body.data.results[0])).toBe('created')
    const sub = await prisma.submission.findUniqueOrThrow({ where: { requirementId_personId: { requirementId: s.job, personId: tamsin.id } } })
    expect(sub.rate).toBe(12_900)
    s.tamsinSubmission = sub.id
  })

  it('an integrator’s own employee between projects is matched and goes forward as its own employee', async () => {
    // His skills on record — the roster refuses to guess them, and
    // matching cannot weigh somebody it knows nothing about.
    const karthik = await prisma.person.findFirstOrThrow({ where: { name: 'Karthik Menon' } })
    await prisma.consultantProfile.create({
      data: { personId: karthik.id, skills: ['DO-178C', 'Embedded C', 'LDRA', 'Software verification'], location: 'Wichita, KS' },
    })
    const avionics = await prisma.requirement.findFirstOrThrow({
      where: { title: 'DO-178C verification engineer', company: { slug: 'world-corveldt' } },
      select: { id: true },
    })
    await rematch(TELEWORLD, avionics.id)
    const m = rowFor(await matchesAs(TELEWORLD, avionics.id), 'Karthik Menon')
    expect(m).toMatchObject({ reach: 'OWN', employee: true })
    expect(m.standing).toContain('between projects')
    expect(m.action).toMatchObject({ kind: 'SUBMIT', as: 'INTERNAL' })
    as(TELEWORLD)
    const r = await json(await submit(req('POST', '/api/submissions', {
      requirementId: avionics.id, personIds: [karthik.id], rate: m.action.rate ?? 14_100, fromCompanyId: m.action.fromCompanyId,
    })))
    expect(r.body.data.results[0].status, JSON.stringify(r.body.data.results[0])).toBe('created')
    const sub = await prisma.submission.findUniqueOrThrow({ where: { requirementId_personId: { requirementId: avionics.id, personId: karthik.id } } })
    expect(sub.kind).toBe('INTERNAL')
  })

  it('a firm the job was never sent to is told the job request is not there', async () => {
    as(`world-arcadia${D}`)
    const r = await json(await readMatches(req('GET', `/api/requirements/${s.job}/matches`), withId(s.job)))
    expect(r.status).toBe(404)
  })
})

describe('asking to add the firm behind a suggestion', () => {
  it('asking to add a firm opens supplier onboarding linked to the job request, as prime, or as sub-vendor under the MSP or a prime', async () => {
    as(HIRING)
    const choices = await json(await addFirmChoices(req('GET', `/api/requirements/${s.job}/matches/add-firm?matchId=${s.suggestion}`), withId(s.job)))
    expect(choices.status, JSON.stringify(choices.body)).toBe(200)
    const ways = choices.body.data.ways
    expect(ways.map((w: any) => w.comesInAs)).toEqual(['PRIME_VENDOR', 'SUB_UNDER_MSP', 'SUB_UNDER_PRIME'])
    expect(ways[1].under).toContainEqual({ id: null, name: 'Etyme’s program office' })
    expect(ways[2].under.map((u: any) => u.name)).toContain('Computer Systems Inc')
    expect(choices.body.data.says).toContain('Etyme is never a prime vendor')

    const wrong = await json(await addFirm(req('POST', `/api/requirements/${s.job}/matches/add-firm`, {
      matchId: s.suggestion, comesInAs: 'SUB_UNDER_PRIME', underCompanyId: s.orchid,
    }), withId(s.job)))
    expect(wrong.status).toBe(422)
    expect(wrong.body.error.message).toContain('your own prime vendors')

    const r = await json(await addFirm(req('POST', `/api/requirements/${s.job}/matches/add-firm`, {
      matchId: s.suggestion, comesInAs: 'PRIME_VENDOR',
    }), withId(s.job)))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.says).toContain('walks four desks')
    const row = await prisma.supplierRequest.findUniqueOrThrow({ where: { id: r.body.data.request.id } })
    expect(row).toMatchObject({
      requirementId: s.job, matchId: s.suggestion, firmCompanyId: s.orchid, comesInAs: 'PRIME_VENDOR',
      underCompanyId: null, stage: 'LEAD', state: 'RECOMMENDED', name: 'Orchid Systems',
    })
    // The person is nowhere on the request the client's desks read.
    expect(JSON.stringify(row)).not.toContain('Mateo')
    s.request = row.id

    const again = await json(await addFirm(req('POST', `/api/requirements/${s.job}/matches/add-firm`, {
      matchId: s.suggestion, comesInAs: 'PRIME_VENDOR',
    }), withId(s.job)))
    expect(again.status).toBe(409)
    const m = (await matchesAs(HIRING, s.job)).matches.find((x: any) => x.id === s.suggestion)
    expect(m.asked).toMatchObject({ stage: 'LEAD' })
  })

  it('a desk that does not recommend suppliers is refused in a sentence', async () => {
    as(AP)
    const r = await json(await addFirm(req('POST', `/api/requirements/${s.job}/matches/add-firm`, {
      matchId: s.suggestion, comesInAs: 'PRIME_VENDOR',
    }), withId(s.job)))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toContain('the hiring manager or the program office')
  })

  it('once the firm is approved, the suggestion is an ordinary match and the person can be asked for', async () => {
    const call = async (body: unknown) => json(await review(req('PATCH', `/api/supplier-requests/${s.request}`, body), withId(s.request)))
    // Each desk verifies the items that are its own, and no other's, then
    // says yes — the walk every firm takes, unchanged for one that came
    // from a match.
    const walk = async (desk: string) => {
      as(desk)
      const row = await prisma.supplierRequest.findUniqueOrThrow({ where: { id: s.request } })
      for (const item of row.checklist as any[]) {
        if (item.state === 'HELD' || item.state === 'WAIVED') continue
        const m = await call({ action: 'mark', key: item.key, state: 'HELD', validFrom: iso(-30), validUntil: iso(300) })
        expect([200, 403, 409, 422], JSON.stringify(m.body)).toContain(m.status)
      }
      const r = await call({ action: 'approve' })
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      return r
    }
    as(LEAD)
    expect((await call({ action: 'approve' })).status).toBe(200)
    await walk(PROCUREMENT)
    await walk(HR)
    await walk(AP)

    // Orchid joined as itself — no second company made from its name.
    expect(await prisma.company.count({ where: { name: 'Orchid Systems' } })).toBe(1)
    expect(await prisma.masterAgreement.count({ where: { vendorId: s.orchid, clientId: s.northbend } })).toBe(1)

    const m = rowFor(await matchesAs(HIRING, s.job), 'Mateo Villanueva')
    expect(m).toMatchObject({ reach: 'PANEL', firm: { name: 'Orchid Systems' } })
    expect(m.action).toMatchObject({ kind: 'ASK', toName: 'Orchid Systems' })
  }, 120_000)
})

describe('a person chooses how long they stay on a bench', () => {
  it('until cancelled is the default and asks nothing more', async () => {
    // Brightmoor asks Priscilla too; she says yes and nothing else.
    const profile = await prisma.consultantProfile.findFirstOrThrow({ where: { person: { primaryEmail: PRISCILLA } } })
    const brightmoor = await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' } })
    const asked = await prisma.benchListing.create({
      data: { consultantId: profile.id, companyId: brightmoor.id, tier: 'MARKETING', state: 'INVITED', invitedAt: new Date() },
    })
    const { signInvite } = await import('@/lib/bench-invite')
    const token = signInvite(asked.id)
    const r = await json(await invitePost(req('POST', `/api/bench-invite/${token}`, { said: 'ACCEPT' }), withToken(token)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toContain("You stay on Brightmoor Staffing's bench until you cancel.")
    const after = await prisma.benchListing.findUniqueOrThrow({ where: { id: asked.id } })
    expect(after).toMatchObject({ state: 'GRANTED', stayDays: null, staysUntil: null, showInMatches: false })
  })

  it('a person chooses the stay in the same step as the yes', async () => {
    const profile = await prisma.consultantProfile.findFirstOrThrow({ where: { person: { primaryEmail: TAMSIN } } })
    const nimbus = await prisma.company.findFirstOrThrow({ where: { slug: 'world-nimbus' } })
    const asked = await prisma.benchListing.create({
      data: { consultantId: profile.id, companyId: nimbus.id, tier: 'MARKETING', state: 'INVITED', invitedAt: new Date() },
    })
    const { signInvite } = await import('@/lib/bench-invite')
    const token = signInvite(asked.id)
    const page = await json(await inviteGet(req('GET', `/api/bench-invite/${token}`), withToken(token)))
    expect(page.body.data.stayChoices).toEqual([5, 7, 15, 25, 50, 60, 500])
    const bad = await json(await invitePost(req('POST', `/api/bench-invite/${token}`, { said: 'ACCEPT', stayDays: 9 }), withToken(token)))
    expect(bad.status).toBe(422)
    const before = Date.now()
    const r = await json(await invitePost(req('POST', `/api/bench-invite/${token}`, { said: 'ACCEPT', stayDays: 7, showInMatches: true }), withToken(token)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toContain('(7 days)')
    const after = await prisma.benchListing.findUniqueOrThrow({ where: { id: asked.id } })
    expect(after.stayDays).toBe(7)
    expect(after.showInMatches).toBe(true)
    expect(Math.abs(after.staysUntil!.getTime() - (before + 7 * 86_400_000))).toBeLessThan(60_000)
  })

  it('a person who chose seven days is out of every match on the eighth', async () => {
    const jonas = await listingOf(`jonas.whitaker${SEED}`, 'world-brightmoor')
    expect(rowFor(await matchesAs(HIRING, s.job), 'Jonas Whitaker')).toBeTruthy()
    // The eighth day: the stay ran out an hour ago, and the nightly job
    // has not run yet.
    await prisma.benchListing.update({ where: { id: jonas.id }, data: { stayDays: 7, staysUntil: new Date(Date.now() - HOUR) } })
    expect(rowFor(await matchesAs(HIRING, s.job), 'Jonas Whitaker')).toBeUndefined()
    expect(rowFor(await matchesAs(BRIGHTMOOR, s.job), 'Jonas Whitaker')).toBeUndefined()
    // And nobody can put him forward through it, in a sentence.
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: `jonas.whitaker${SEED}` } })
    const brightmoor = await prisma.company.findFirstOrThrow({ where: { slug: 'world-brightmoor' } })
    as(BRIGHTMOOR)
    const r = await json(await submit(req('POST', '/api/submissions', {
      requirementId: s.job, personIds: [person.id], rate: 12_500, fromCompanyId: brightmoor.id,
    })))
    expect(r.body.data.results[0]).toMatchObject({ status: 'error', code: 'STAY_ENDED' })
    expect(r.body.data.results[0].error).toContain("stay on Brightmoor Staffing's bench ended")
  })

  it('a submission made before a bench stay ended still stands', async () => {
    const tamsin = await listingOf(TAMSIN, 'world-pinnacle')
    await prisma.benchListing.update({ where: { id: tamsin.id }, data: { stayDays: 15, staysUntil: new Date(Date.now() - HOUR) } })
    const ran = await cron()
    expect(ran.ended).toBeGreaterThanOrEqual(1)
    const ended = await prisma.benchListing.findUniqueOrThrow({ where: { id: tamsin.id } })
    expect(ended.revokedAt).not.toBeNull()
    expect(ended.lapsedAt).not.toBeNull()
    // The submission Pinnacle made before stands, as it was.
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: s.tamsinSubmission } })
    expect(sub.status).toBe('SUBMITTED')
    // Written down, reversible, and the firm is told.
    const log = await prisma.automationLog.findFirstOrThrow({ where: { action: 'BENCH_STAY_ENDED', payload: { path: ['listingId'], equals: tamsin.id } } })
    expect(log.reversible).toBe(true)
    const told = await prisma.notification.count({ where: { entityId: tamsin.id, title: { contains: 'is off your bench' } } })
    expect(told).toBeGreaterThan(0)
  })

  it('a person is reminded before their bench stay ends and can renew in one step', async () => {
    const priscilla = await listingOf(PRISCILLA, 'world-halcyon')
    await prisma.benchListing.update({
      where: { id: priscilla.id },
      data: { stayDays: 15, staysUntil: new Date(Date.now() + 36 * HOUR), stayRemindedAt: null },
    })
    const ran = await cron()
    expect(ran.remindedList.map((x: any) => x.person)).toContain('Priscilla Adeyemi')
    const letter = await prisma.textMessage.findFirstOrThrow({ where: { aboutId: priscilla.id, kind: 'LINK' }, orderBy: { id: 'desc' } })
    expect(letter.body).toContain('/bench-invite/')
    expect(letter.body).toContain('Anything already sent stays as it is.')
    // Once per stay.
    expect((await cron()).remindedList.map((x: any) => x.person)).not.toContain('Priscilla Adeyemi')

    // One tap, from the letter.
    const { signInvite } = await import('@/lib/bench-invite')
    const token = signInvite(priscilla.id)
    const r = await json(await invitePost(req('POST', `/api/bench-invite/${token}`, { said: 'RENEW' }), withToken(token)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toContain('Renewed.')
    const renewed = await prisma.benchListing.findUniqueOrThrow({ where: { id: priscilla.id } })
    expect(renewed.staysUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 86_400_000)
    expect(renewed.stayRemindedAt).toBeNull()

    // A stay that already ended comes back from the person's own page.
    const tamsin = await listingOf(TAMSIN, 'world-pinnacle')
    as(TAMSIN)
    const page = await json(await myBenches(req('GET', '/api/me/benches')))
    expect(page.body.data.ended.map((e: any) => e.company)).toContain('Pinnacle Resourcing')
    const back = await json(await changeMyBench(req('PATCH', '/api/me/benches', { renew: tamsin.id })))
    expect(back.status, JSON.stringify(back.body)).toBe(200)
    const after = await prisma.benchListing.findUniqueOrThrow({ where: { id: tamsin.id } })
    expect(after.revokedAt).toBeNull()
    expect(after.lapsedAt).toBeNull()
  })
})
