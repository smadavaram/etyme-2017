import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { req, json, prisma, freshWorld } from './harness'

vi.mock('@/lib/senders', () => ({ emailSender: () => null }))

import { POST } from '@/app/api/market/course-door/route'
import { courseDoorBody, COURSE_DOOR_ENDPOINT, CONSENT_LINE, GUARDIAN_LINE } from '@/lib/public-site/course-door-page'

/**
 * The door page's own payload, pressed through the real route: the body
 * the form builds is the body the route reads, field for field.
 */
const press = (b: ReturnType<typeof courseDoorBody>) => POST(req('POST', COURSE_DOOR_ENDPOINT, b))
const lead = (email: string) => prisma.marketingLead.findUnique({ where: { email } })

beforeAll(async () => { await freshWorld() })
beforeEach(() => { delete process.env.NOTIFY_FROM_EMAIL; delete process.env.RESEND_API_KEY })
afterAll(() => { delete process.env.NOTIFY_FROM_EMAIL })

describe('the door page’s form, through the real course door route', () => {
  it('a worker who ticks the yes and says she works in IT is stored on the IT track', async () => {
    const r = await json(await press(courseDoorBody({ who: 'Worker', email: 'page-it@work.example', yes: true, inIT: true, trap: '', filledInMs: 5000 })))
    expect(r.status).toBe(200)
    expect(typeof r.body.data.says).toBe('string')
    const row = await lead('page-it@work.example')
    expect(row?.source).toBe('COURSE_DOOR')
    expect(row?.asked).toContain('Worker')
    expect(row?.asked).toContain('IT — Upgrade')
    expect(row?.asked).toContain('works in IT: yes')
  })

  it('a recruiter’s IT switch is ignored by the route and kept as no', async () => {
    const r = await json(await press(courseDoorBody({ who: 'Recruiter', email: 'page-rec@work.example', yes: true, inIT: true, trap: '', filledInMs: 5000 })))
    expect(r.status).toBe(200)
    expect((await lead('page-rec@work.example'))?.asked).toContain('works in IT: no')
  })

  it('a student’s page sends a guardian address with the guardian words ticked, and no child detail', async () => {
    const body = courseDoorBody({ who: 'Kid', email: 'page-parent@home.example', yes: true, inIT: false, trap: '', filledInMs: 5000 })
    expect(Object.keys(body)).not.toEqual(expect.arrayContaining(['name', 'age', 'school']))
    const r = await json(await press(body))
    expect(r.status).toBe(200)
    const row = await lead('page-parent@home.example')
    expect(row?.asked).toContain('Kids/student')
    expect(row?.asked).toContain('parent or guardian address')
  })

  it('a visitor who forgot the tick is told about the tick and nothing is saved', async () => {
    const r = await json(await press(courseDoorBody({ who: 'Fresher', email: 'page-notick@work.example', yes: false, inIT: false, trap: '', filledInMs: 5000 })))
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('CONSENT_NEEDED')
    expect(await lead('page-notick@work.example')).toBeNull()
  })

  it('a form filled in under a second and a half, or with the hidden box filled, is refused', async () => {
    const fast = await json(await press(courseDoorBody({ who: 'Fresher', email: 'page-fast@work.example', yes: true, inIT: false, trap: '', filledInMs: 300 })))
    expect(fast.body.error.code).toBe('SCRIPTED')
    const bot = await json(await press(courseDoorBody({ who: 'Fresher', email: 'page-bot@work.example', yes: true, inIT: false, trap: 'x.example', filledInMs: 5000 })))
    expect(bot.body.error.code).toBe('SCRIPTED')
    expect(await lead('page-fast@work.example')).toBeNull()
    expect(await lead('page-bot@work.example')).toBeNull()
  })

  it('the words beside the tick on the page are the words the ledger keeps as the visitor’s yes', async () => {
    await press(courseDoorBody({ who: 'Kid', email: 'page-words@home.example', yes: true, inIT: false, trap: '', filledInMs: 5000 }))
    const row = await lead('page-words@home.example')
    const logs = (await prisma.automationLog.findMany({ where: { action: 'COURSE_DOOR_LEAD' } })).filter((l: any) => l.payload?.leadId === row?.id)
    expect(logs).toHaveLength(1)
    expect((logs[0].payload as any).consentWords).toBe(CONSENT_LINE)
    expect(GUARDIAN_LINE).toContain('parent or guardian')
  })
})
