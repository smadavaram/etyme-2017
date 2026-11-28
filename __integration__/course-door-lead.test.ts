import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { req, json, prisma, freshWorld } from './harness'

const sent: { to: string; subject: string; body: string }[] = []
vi.mock('@/lib/senders', () => ({
  emailSender: () =>
    process.env.NOTIFY_FROM_EMAIL
      ? { channel: 'EMAIL', async send(to: string, subject: string, body: string) { sent.push({ to, subject, body }) } }
      : null,
}))

import { POST } from '@/app/api/market/course-door/route'
import { GET as unsubGet, POST as unsubPost } from '@/app/api/market/course-door/unsubscribe/route'
import { unsubscribeToken } from '@/lib/public-site/course-door'

/**
 * The free course door's lead capture, through the real routes on the
 * seeded world. The home page's /start page calls this; the course is
 * paused and only the door is built.
 */

const YES = "Email me when the course opens and about Etyme's free training. I can stop anytime."
const ask = (body: object) => POST(req('POST', '/api/market/course-door', body))
const leadFor = (email: string) => prisma.marketingLead.findUnique({ where: { email } })
const ledger = async (action: string, leadId: string) =>
  (await prisma.automationLog.findMany({ where: { action } })).filter((r: any) => r.payload?.leadId === leadId)

beforeAll(async () => {
  await freshWorld()
  process.env.NEXTAUTH_SECRET = 'door-test-secret'
})
beforeEach(() => {
  sent.length = 0
  process.env.NOTIFY_FROM_EMAIL = 'hello@etyme.example'
  process.env.RESEND_API_KEY = 'key'
})
afterAll(() => {
  delete process.env.NOTIFY_FROM_EMAIL
  delete process.env.RESEND_API_KEY
})

describe('the course door lead route', () => {
  it('without the yes nothing is stored, nothing is logged and nothing is emailed', async () => {
    const before = await prisma.automationLog.count()
    const r = await json(await ask({ leadType: 'Worker', email: 'noyes@work.example' }))
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('CONSENT_NEEDED')
    expect(await leadFor('noyes@work.example')).toBeNull()
    expect(await prisma.automationLog.count()).toBe(before)
    expect(sent).toHaveLength(0)
  })

  it('a yes stores a lead from COURSE_DOOR with its type, track and the time of the yes', async () => {
    const t0 = Date.now()
    const r = await json(await ask({ leadType: 'Fresher', email: 'Fresh@Work.Example', consent: true }))
    expect(r.status).toBe(200)
    const row = await leadFor('fresh@work.example')
    expect(row?.source).toBe('COURSE_DOOR')
    expect(row?.asked).toContain('Fresher')
    expect(row?.asked).toContain('Entry Level')
    expect(row!.consentAt.getTime()).toBeGreaterThanOrEqual(t0 - 1000)
  })

  it('a Worker with the "I work in IT" switch on is routed to IT — Upgrade and the switch is on the lead', async () => {
    await ask({ leadType: 'Worker', email: 'it@work.example', consent: true, worksInIT: true })
    const row = await leadFor('it@work.example')
    expect(row?.asked).toContain('IT — Upgrade')
    expect(row?.asked).toMatch(/works in IT: yes/)
    const [l] = await ledger('COURSE_DOOR_LEAD', row!.id)
    expect((l.payload as any).worksInIT).toBe(true)
  })

  it('a Worker with the switch off is routed to Non-IT', async () => {
    await ask({ leadType: 'Worker', email: 'nonit@work.example', consent: true })
    const row = await leadFor('nonit@work.example')
    expect(row?.asked).toContain('Non-IT')
    expect(row?.asked).toMatch(/works in IT: no/)
  })

  it('a lead writes one ledger row with the reason, the yes words and no address in it', async () => {
    await ask({ leadType: 'Recruiter', email: 'rec@work.example', consent: true })
    const row = await leadFor('rec@work.example')
    const [l] = await ledger('COURSE_DOOR_LEAD', row!.id)
    expect(l.reason).toMatch(/ticked/i)
    expect((l.payload as any).consentWords).toBe(YES)
    expect((l.payload as any).track).toBe('Entry Level')
    expect(JSON.stringify(l)).not.toContain('rec@work.example')
  })

  it('a Kid entry stores a guardian\'s address and no name or age', async () => {
    const r = await json(await ask({ leadType: 'Kid', email: 'parent@home.example', consent: true, guardianEmail: true }))
    expect(r.status).toBe(200)
    const row = await leadFor('parent@home.example')
    expect(row?.name).toBeNull()
    expect(row?.asked).toContain('Kids/student')
    expect(row?.asked).toContain('guardian')
  })

  it('a Kid entry carrying a child\'s name or age is refused and stores nothing', async () => {
    const r = await json(await ask({ leadType: 'Kid', email: 'p2@home.example', consent: true, guardianEmail: true, name: 'Mira', age: 9 }))
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('NO_CHILD_DETAILS')
    expect(await leadFor('p2@home.example')).toBeNull()
  })

  it('a Kid entry that does not say the address is a guardian\'s is refused', async () => {
    const r = await json(await ask({ leadType: 'Kid', email: 'p3@home.example', consent: true }))
    expect(r.body.error.code).toBe('GUARDIAN_NEEDED')
    expect(await leadFor('p3@home.example')).toBeNull()
  })

  it('junk is refused: a filled hidden field, a too-fast form and a throwaway address', async () => {
    expect((await json(await ask({ leadType: 'Worker', email: 'bot@work.example', consent: true, company_website: 'x' }))).status).toBe(400)
    expect((await json(await ask({ leadType: 'Worker', email: 'bot@work.example', consent: true, filledInMs: 100 }))).status).toBe(400)
    expect((await json(await ask({ leadType: 'Worker', email: 'a@a.aa', consent: true }))).status).toBe(400)
    expect(await leadFor('bot@work.example')).toBeNull()
  })

  it('one confirmation goes where mail can leave, and asking again sends no second', async () => {
    await ask({ leadType: 'Worker', email: 'once@work.example', consent: true })
    await ask({ leadType: 'Worker', email: 'once@work.example', consent: true })
    await ask({ leadType: 'Recruiter', email: 'once@work.example', consent: true })
    expect(sent.filter((m) => m.to === 'once@work.example')).toHaveLength(1)
    const row = await leadFor('once@work.example')
    expect(await ledger('COURSE_DOOR_CONFIRMATION', row!.id)).toHaveLength(1)
    expect(await prisma.marketingLead.count({ where: { email: 'once@work.example' } })).toBe(1)
  })

  it('where no email can leave the lead is kept, nothing is sent, and the reply says so', async () => {
    delete process.env.NOTIFY_FROM_EMAIL
    const r = await json(await ask({ leadType: 'Worker', email: 'nomail@work.example', consent: true }))
    expect(r.status).toBe(200)
    expect(r.body.data.says).toMatch(/No email can be sent from here yet/)
    expect(sent).toHaveLength(0)
    const row = await leadFor('nomail@work.example')
    expect(row).not.toBeNull()
    expect(await ledger('COURSE_DOOR_CONFIRMATION', row!.id)).toHaveLength(0)
  })

  it('the reply is the same sentence for a new address and one already on file', async () => {
    const a = await json(await ask({ leadType: 'Worker', email: 'same@work.example', consent: true }))
    const b = await json(await ask({ leadType: 'Worker', email: 'same@work.example', consent: true }))
    expect(b.body).toEqual(a.body)
  })

  it('the confirmation carries a link that unsubscribes that address and no other', async () => {
    await ask({ leadType: 'Worker', email: 'stop@work.example', consent: true })
    const link = sent[0].body.match(/https?:\/\/\S+/)![0]
    const u = new URL(link)
    expect(u.pathname).toBe('/api/market/course-door/unsubscribe')
    const row = await leadFor('stop@work.example')

    const forged = await json(await unsubPost(req('POST', '/api/market/course-door/unsubscribe', { email: 'stop@work.example', token: 'nope' })))
    expect(forged.status).toBe(400)
    expect(await ledger('COURSE_DOOR_UNSUBSCRIBED', row!.id)).toHaveLength(0)

    const res = await unsubGet(req('GET', `${u.pathname}${u.search}`))
    expect(res.status).toBe(200)
    expect(await res.text()).toMatch(/unsubscribed/i)
    expect(await ledger('COURSE_DOOR_UNSUBSCRIBED', row!.id)).toHaveLength(1)
  })

  it('unsubscribing twice writes one row, and a valid link for an address nobody knows changes nothing', async () => {
    await ask({ leadType: 'Worker', email: 'twice@work.example', consent: true })
    const row = await leadFor('twice@work.example')
    const token = unsubscribeToken('twice@work.example', 'door-test-secret')
    const body = { email: 'twice@work.example', token }
    await unsubPost(req('POST', '/api/market/course-door/unsubscribe', body))
    await unsubPost(req('POST', '/api/market/course-door/unsubscribe', body))
    expect(await ledger('COURSE_DOOR_UNSUBSCRIBED', row!.id)).toHaveLength(1)
    const ghost = await json(await unsubPost(req('POST', '/api/market/course-door/unsubscribe', { email: 'ghost@work.example', token: unsubscribeToken('ghost@work.example', 'door-test-secret') })))
    expect(ghost.status).toBe(200)
  })

  it('after unsubscribing, a fresh yes is a new yes but earns no second confirmation', async () => {
    await ask({ leadType: 'Worker', email: 'back@work.example', consent: true })
    await unsubPost(req('POST', '/api/market/course-door/unsubscribe', { email: 'back@work.example', token: unsubscribeToken('back@work.example', 'door-test-secret') }))
    await ask({ leadType: 'Worker', email: 'back@work.example', consent: true })
    expect(sent.filter((m) => m.to === 'back@work.example')).toHaveLength(1)
    const row = await leadFor('back@work.example')
    expect(await ledger('COURSE_DOOR_LEAD', row!.id)).toHaveLength(2)
  })

  it('an unsubscribed address never gets a confirmation that had not yet gone', async () => {
    delete process.env.NOTIFY_FROM_EMAIL
    await ask({ leadType: 'Worker', email: 'early@work.example', consent: true })
    await unsubPost(req('POST', '/api/market/course-door/unsubscribe', { email: 'early@work.example', token: unsubscribeToken('early@work.example', 'door-test-secret') }))
    process.env.NOTIFY_FROM_EMAIL = 'hello@etyme.example'
    await ask({ leadType: 'Worker', email: 'early@work.example', consent: true })
    expect(sent.filter((m) => m.to === 'early@work.example')).toHaveLength(0)
  })

  it('an existing lead from another door keeps its own source', async () => {
    await prisma.marketingLead.create({ data: { email: 'old@work.example', source: 'HOME_PAGE', asked: 'a demo' } })
    await ask({ leadType: 'Worker', email: 'old@work.example', consent: true })
    const row = await leadFor('old@work.example')
    expect(row?.source).toBe('HOME_PAGE')
    expect(row?.asked).toBe('a demo')
    expect(await ledger('COURSE_DOOR_LEAD', row!.id)).toHaveLength(1)
  })
})
