import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as access, POST as grant } from '@/app/api/access/route'
import { POST as invite } from '@/app/api/access/invite/route'
import { getCallerContext } from '@/lib/api-context'
import { resetPassword } from '@/lib/password-door'

/**
 * Users & permissions, walked as Brightmoor's owner after round one of
 * the sign-up walk: a Member is given a desk, an invitation reads as an
 * invitation, and the invitation email carries a way in.
 */
const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`
const MEMBER = 'meera@brightmoor.demo.etyme.local'
const sent: { to: string; subject: string; text: string }[] = []
const saved = {
  resend: process.env.RESEND_API_KEY, from: process.env.NOTIFY_FROM_EMAIL, url: process.env.NEXTAUTH_URL,
}
const it_: Record<string, any> = {}

describe('Users & permissions gives, changes and explains a desk', () => {
  beforeAll(async () => {
    await freshWorld()
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    it_.firm = firm.id
    const roles = await prisma.role.findMany({ where: { companyId: firm.id }, select: { id: true, name: true } })
    it_.roles = Object.fromEntries(roles.map((r) => [r.name, r.id]))
    // A colleague who arrived on the domain and was seated as Member.
    const p = await prisma.person.create({ data: { primaryEmail: MEMBER, name: 'Meera Iyer' }, select: { id: true } })
    const c = await prisma.context.create({
      data: { personId: p.id, companyId: firm.id, type: 'EMPLOYEE', roleId: it_.roles['Member'], grantReason: 'Joined on the domain' },
      select: { id: true },
    })
    it_.memberContext = c.id
  }, 240_000)

  afterAll(() => {
    vi.unstubAllGlobals()
    for (const [k, v] of [['RESEND_API_KEY', saved.resend], ['NOTIFY_FROM_EMAIL', saved.from], ['NEXTAUTH_URL', saved.url]] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('a Member reads "Member · give them a desk" on Everyone with access', async () => {
    as(OWNER)
    const r = await json(await access(req('GET', '/api/access')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = r.body.data.people.find((p: any) => p.contextId === it_.memberContext)
    expect(row.line).toBe('Member · give them a desk')
    expect(r.body.data.actorIsOwner).toBe(true)
  })

  it('an owner gives a Member a desk from Users & permissions, and the person’s next page load shows it', async () => {
    as(OWNER)
    const r = await json(await grant(req('POST', '/api/access', {
      contextId: it_.memberContext, roleId: it_.roles['Recruiter'], days: null, reason: 'Takes the Talvern Medical roles from Monday',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.role).toBe('Recruiter')

    // The next page load, as Meera: the seat now carries the Recruiter's permissions.
    as(MEMBER)
    const { caller } = await getCallerContext(req('GET', '/api/me'))
    const recruiter = await prisma.role.findUniqueOrThrow({ where: { id: it_.roles['Recruiter'] }, select: { permissions: true } })
    expect(caller!.context.roleId).toBe(it_.roles['Recruiter'])
    expect([...caller!.permissions].sort()).toEqual([...recruiter.permissions].sort())

    as(OWNER)
    const after = await json(await access(req('GET', '/api/access')))
    expect(after.body.data.people.find((p: any) => p.contextId === it_.memberContext).line).toBe('Recruiter')
  })

  it('a desk change to Owner by somebody who is not an Owner is refused in a sentence', async () => {
    // Meera is made Admin by the owner, then tries to make a colleague Owner.
    as(OWNER)
    const up = await json(await grant(req('POST', '/api/access', {
      contextId: it_.memberContext, roleId: it_.roles['Admin'], days: 30, reason: 'Covers the owner while they travel',
    })))
    expect(up.status, JSON.stringify(up.body)).toBe(201)

    as(MEMBER)
    const seen = await json(await access(req('GET', '/api/access')))
    expect(seen.body.data.actorIsOwner).toBe(false)
    const someone = seen.body.data.people.find((p: any) => p.contextId !== it_.memberContext && p.role !== 'Owner')
    const r = await json(await grant(req('POST', '/api/access', {
      contextId: someone.contextId, roleId: it_.roles['Owner'], days: 30, reason: 'Wants to run the firm',
    })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Only an Owner can make somebody an Owner.')
  })

  it('an invited teammate who never signed in reads "Invited today, not yet signed in", never "joined today"', async () => {
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/access/invite', { name: 'Sam Okafor', email: 'sam@elsewhere.example' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const list = await json(await access(req('GET', '/api/access')))
    const row = list.body.data.waitingForAccess.find((w: any) => w.person.primaryEmail === 'sam@elsewhere.example')
    expect(row.said).toBe('Invited today, not yet signed in')
  })

  it('an invited teammate’s email carries a way in, never only an instruction', async () => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.NOTIFY_FROM_EMAIL = 'notices@etyme.example'
    process.env.NEXTAUTH_URL = 'https://app.etyme.example'
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body)
      sent.push({ to: Array.isArray(b.to) ? b.to[0] : b.to, subject: b.subject, text: b.text ?? '' })
      return new Response(JSON.stringify({ id: 'sent' }), { status: 200 })
    }))

    as(OWNER)
    // Not a reserved name: a reserved address is kept and never sent
    // (round two, item 30), and this sentence is about a mail that leaves.
    // Nothing reaches the network; fetch is stubbed above.
    const email = 'tara@elsewhere-works-fixture.com'
    const r = await json(await invite(req('POST', '/api/access/invite', { name: 'Tara Quinn', email, roleId: it_.roles['HR'] })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.wayIn).toBe('PASSWORD')

    const mail = sent.find((m) => m.to === email)!
    expect(mail.text).toContain('Set your password to sign in. You are in Brightmoor Staffing as HR.')
    const token = mail.text.match(/https:\/\/app\.etyme\.example\/reset\/([A-Za-z0-9_-]+)/)![1]

    // The stored copy holds no link: the token lives in the mailbox only.
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email }, select: { id: true } })
    const stored = await prisma.notification.findFirstOrThrow({ where: { personId: person.id, channel: 'EMAIL' } })
    expect(stored.body).not.toContain(token)

    // And the link works: the password door's own reset page sets it.
    // Brightmoor is a seeded demo firm, and a seat only in the demo never
    // takes a password — so Tara also works at a real firm, as an invited
    // teammate outside the demo would.
    const real = await prisma.company.create({
      data: { name: 'Elsewhere Works', slug: 'elsewhere-works-access-desk', kind: 'VENDOR', currency: 'USD' },
    })
    await prisma.context.create({
      data: { personId: person.id, companyId: real.id, type: 'EMPLOYEE', grantReason: 'Works at a real firm too' },
    })
    const set = await resetPassword(token, 'a long walk through the harbor')
    expect(set.ok, JSON.stringify(set)).toBe(true)
  })
  it('an invited person who never signed in is listed as invited with the desk they will have, never as somebody with access', async () => {
    as(OWNER)
    const email = 'pat.kim@brightmoor-walk.example'
    const r = await json(await invite(req('POST', '/api/access/invite', { name: 'Pat Kim', email, roleId: it_.roles['HR'] })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const list = await json(await access(req('GET', '/api/access')))
    const waiting = list.body.data.waitingForAccess.find((w: any) => w.person.primaryEmail === email)
    expect(waiting.said).toBe('Invited today, not yet signed in · will have the HR desk')
    expect(waiting.role).toBe('HR')
    expect(list.body.data.people.find((p: any) => p.person.primaryEmail === email)).toBeUndefined()
    it_.patContext = waiting.contextId
  })

  it('a person whose desk changed is told by email as well as in the app', async () => {
    as(OWNER)
    const r = await json(await grant(req('POST', '/api/access', {
      contextId: it_.memberContext, roleId: it_.roles['HR'], days: 30, reason: 'Runs the firm’s own paperwork now',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const meera = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: MEMBER }, select: { id: true } })
    // The notice is written in the background; wait for it.
    let row: any = null
    for (let i = 0; i < 50 && !row; i++) {
      row = await prisma.notification.findFirst({
        where: { personId: meera.id, title: 'You now have the HR desk' },
        orderBy: { createdAt: 'desc' },
      })
      if (!row) await new Promise((res) => setTimeout(res, 100))
    }
    expect(row, 'no notice written').not.toBeNull()
    expect(row.body).toMatch(/^You now have the HR desk at Brightmoor Staffing\. Sign in to see it\./)
    expect(row.channel).not.toBe('IN_APP')
    expect((row.data as any).href).toMatch(/^\/dashboard/)
  })
})
