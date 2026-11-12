import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as access, POST as grant } from '@/app/api/access/route'
import { POST as invite } from '@/app/api/access/invite/route'
import { POST as seatAct, DELETE as withdraw } from '@/app/api/access/[contextId]/route'
import { POST as sendAgain } from '@/app/api/access/[contextId]/resend/route'
import { POST as copied } from '@/app/api/access/[contextId]/copied/route'
import { randomBytes } from 'node:crypto'
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

  it('a Member reads "Member · give them a role" on Everyone with access', async () => {
    as(OWNER)
    const r = await json(await access(req('GET', '/api/access')))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = r.body.data.people.find((p: any) => p.contextId === it_.memberContext)
    expect(row.line).toBe('Member · give them a role')
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

  it('where an invitation email is tried and fails, its link is not kept on the notice', async () => {
    // The other half — no email provider at all, link kept for staff — is
    // unreachable until the password door opens without an email key
    // (doorOpen in lib/password-door, the architect's change). The route
    // records through recordedBody, so it holds the moment the door opens.
    process.env.RESEND_API_KEY = 're_test'
    process.env.NOTIFY_FROM_EMAIL = 'notices@etyme.example'
    process.env.NEXTAUTH_URL = 'https://app.etyme.example'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"down"}', { status: 500 })))
    as(OWNER)
    const email = 'kemi@nowhere-works-fixture.com'
    const r = await json(await invite(req('POST', '/api/access/invite', { name: 'Kemi Adeyemi', email, roleId: it_.roles['HR'] })))
    vi.unstubAllGlobals()
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email }, select: { id: true } })
    const stored = await prisma.notification.findFirstOrThrow({ where: { personId: person.id, channel: 'EMAIL' } })
    expect(stored.deliveryState).toBe('FAILED')
    expect(stored.body).toContain('[the one-time link was in the email and is not kept]')
    expect(stored.body).not.toMatch(/\/reset\//)
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

    const mail = sent.find((m) => m.to === email)!
    expect(mail.text).toContain('Set your password and you are signed in. You are in Brightmoor Staffing as HR.')
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
    expect(waiting.said).toBe('Invited today, not yet signed in · will have the HR role')
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
        where: { personId: meera.id, title: 'You now have the HR role' },
        orderBy: { createdAt: 'desc' },
      })
      if (!row) await new Promise((res) => setTimeout(res, 100))
    }
    expect(row, 'no notice written').not.toBeNull()
    expect(row.body).toMatch(/^You now have the HR role at Brightmoor Staffing\. Sign in to see it\./)
    expect(row.channel).not.toBe('IN_APP')
    expect((row.data as any).href).toMatch(/^\/dashboard/)
  })
})

/**
 * The founder on Tapin's Users & permissions, 2026-11-12, walked on the
 * same world: who is who by address, and a waiting row's Withdraw
 * invitation in place of Pause and End.
 */
describe('Users & permissions names everybody by address and withdraws an invitation', () => {
  const seatParams = (contextId: string) => ({ params: Promise.resolve({ contextId }) })
  const unusedLink = (personId: string) => prisma.emailToken.create({
    data: { personId, purpose: 'RESET', tokenHash: randomBytes(24).toString('hex'), expiresAt: new Date(Date.now() + 72 * 3_600_000), payload: { invitation: true } },
    select: { id: true },
  })
  const inviteOne = async (name: string, email: string, roleId?: string) => {
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/access/invite', { name, email, ...(roleId ? { roleId } : {}) })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const p = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email }, select: { id: true } })
    const c = await prisma.context.findFirstOrThrow({ where: { personId: p.id, companyId: it_.firm, revokedAt: null }, select: { id: true } })
    return { personId: p.id, contextId: c.id }
  }

  it('every person with access is listed with their sign-in email under their name', async () => {
    as(OWNER)
    const r = await json(await access(req('GET', '/api/access')))
    expect(r.status).toBe(200)
    const meera = r.body.data.people.find((p: any) => p.contextId === it_.memberContext)
    expect(meera.person.primaryEmail).toBe(MEMBER)
    for (const p of r.body.data.people) expect(p.person.primaryEmail).not.toBe('null')
  })

  it('the invitation form’s words come with the register to a reader who may invite', async () => {
    as(OWNER)
    const r = await json(await access(req('GET', '/api/access')))
    expect(r.body.data.canInvite).toBe(true)
    expect(typeof r.body.data.invite.emailLabel).toBe('string')
    expect(typeof r.body.data.invite.hint).toBe('string')
  })

  it('withdrawing an invitation removes the seat, the person and their unused set-password link', async () => {
    const { personId, contextId } = await inviteOne('Wren Ito', 'wren.ito@brightmoor-walk.example')
    await unusedLink(personId)
    as(OWNER)
    const r = await json(await withdraw(req('DELETE', `/api/access/${contextId}`), seatParams(contextId)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.message).toBe('The invitation to wren.ito@brightmoor-walk.example is withdrawn, and its link no longer opens a seat here. If they were meant to be here, use the Invite form above; it makes a new invitation.')
    expect(await prisma.context.count({ where: { id: contextId } })).toBe(0)
    expect(await prisma.person.count({ where: { id: personId } })).toBe(0)
    expect(await prisma.emailToken.count({ where: { personId } })).toBe(0)
  })

  it('inviting the same address again after a withdrawal makes one seat, not two', async () => {
    const email = 'wren.ito@brightmoor-walk.example'
    await inviteOne('Wren Ito', email)
    const p = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email }, select: { id: true } })
    expect(await prisma.context.count({ where: { personId: p.id, companyId: it_.firm } })).toBe(1)
  })

  it('a waiting seat of somebody who also holds a seat elsewhere is withdrawn here, and the person stays', async () => {
    const { personId, contextId } = await inviteOne('Noor Basri', 'noor.basri@brightmoor-walk.example')
    const other = await prisma.company.create({ data: { name: 'Harbor Row Works', slug: 'harbor-row-access-desk', kind: 'VENDOR', currency: 'USD' }, select: { id: true } })
    await prisma.context.create({ data: { personId, companyId: other.id, type: 'EMPLOYEE', invitedAt: new Date(), grantReason: 'Invited there too' } })
    as(OWNER)
    const r = await json(await withdraw(req('DELETE', `/api/access/${contextId}`), seatParams(contextId)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    // Never says the person holds a seat somewhere else.
    expect(r.body.data.message).not.toMatch(/another company|elsewhere/)
    expect(await prisma.context.count({ where: { id: contextId } })).toBe(0)
    expect(await prisma.person.count({ where: { id: personId } })).toBe(1)
  })

  it('withdrawing an invitation to somebody already on Etyme removes only this seat, and their profile and papers stay', async () => {
    const email = 'kofi.bench@brightmoor-walk.example'
    const known = await prisma.person.create({ data: { primaryEmail: email, name: 'Kofi Real-Name' }, select: { id: true } })
    await prisma.consultantProfile.create({ data: { personId: known.id } })
    const { contextId } = await inviteOne('Kofi', email)
    const link = await unusedLink(known.id)
    as(OWNER)
    const r = await json(await withdraw(req('DELETE', `/api/access/${contextId}`), seatParams(contextId)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.message).not.toContain('Kofi Real-Name')
    expect(await prisma.context.count({ where: { id: contextId } })).toBe(0)
    expect(await prisma.person.count({ where: { id: known.id } })).toBe(1)
    expect(await prisma.consultantProfile.count({ where: { personId: known.id } })).toBe(1)
    const after = await prisma.emailToken.findUniqueOrThrow({ where: { id: link.id }, select: { expiresAt: true } })
    expect(after.expiresAt.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('withdrawing an invitation never deletes a person this invitation did not make, even with nothing else on the record', async () => {
    const email = 'plain.known@brightmoor-walk.example'
    const known = await prisma.person.create({ data: { primaryEmail: email, name: 'Plain Known' }, select: { id: true } })
    const { contextId } = await inviteOne('Plain', email)
    as(OWNER)
    const r = await json(await withdraw(req('DELETE', `/api/access/${contextId}`), seatParams(contextId)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(await prisma.person.count({ where: { id: known.id } })).toBe(1)
  })

  it('an Admin cannot withdraw an Owner’s invitation, and the refusal is in the access log before it is sent', async () => {
    const admin = await prisma.person.create({ data: { primaryEmail: 'ines.admin@brightmoor.demo.etyme.local', name: 'Ines Vale' }, select: { id: true } })
    await prisma.context.create({
      data: { personId: admin.id, companyId: it_.firm, type: 'EMPLOYEE', roleId: it_.roles['Admin'], lastUsedAt: new Date(), grantReason: 'Runs people and settings' },
    })
    const owner = await prisma.person.create({ data: { primaryEmail: 'owen.next@brightmoor-walk.example', name: 'Owen Hart' }, select: { id: true } })
    const seat = await prisma.context.create({
      data: { personId: owner.id, companyId: it_.firm, type: 'EMPLOYEE', roleId: it_.roles['Owner'], invitedAt: new Date(), grantReason: 'Invited as a second Owner' },
      select: { id: true },
    })
    as('ines.admin@brightmoor.demo.etyme.local')
    const r = await json(await withdraw(req('DELETE', `/api/access/${seat.id}`), seatParams(seat.id)))
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.message).toBe('They are invited as an Owner. Only an Owner withdraws an Owner’s invitation. An Admin never can.')
    expect(await prisma.context.count({ where: { id: seat.id } })).toBe(1)
    const logged = await prisma.accessLog.findFirst({ where: { subjectId: owner.id, action: 'INVITATION_WITHDRAW', allowed: false } })
    expect(logged, 'the refusal was sent with no row behind it').not.toBeNull()
    it_.waitingOwner = seat.id
  })

  it('an Owner withdraws another Owner’s invitation while she stays an Owner herself', async () => {
    as(OWNER)
    const r = await json(await withdraw(req('DELETE', `/api/access/${it_.waitingOwner}`), seatParams(it_.waitingOwner)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
  })

  it('a withdrawal refused because the person has history says to end their access instead, and End is kept', async () => {
    // Somebody with a week on the record, never signed in, invited here.
    const worker = await prisma.person.findFirstOrThrow({
      where: { timesheets: { some: {} }, credentials: { none: { lastUsedAt: { not: null } } }, contexts: { none: { companyId: it_.firm } } },
      select: { id: true },
    })
    const seat = await prisma.context.create({
      data: { personId: worker.id, companyId: it_.firm, type: 'EMPLOYEE', invitedAt: new Date(), grantReason: 'Invited to the firm' },
      select: { id: true },
    })
    as(OWNER)
    const r = await json(await withdraw(req('DELETE', `/api/access/${seat.id}`), seatParams(seat.id)))
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body.error.code).toBe('HAS_HISTORY')
    expect(r.body.error.endInstead).toBe(true)
    expect(r.body.error.message).toContain('End their access instead')
    expect(await prisma.accessLog.count({ where: { subjectId: worker.id, action: 'INVITATION_WITHDRAW', allowed: false } })).toBeGreaterThan(0)
  })

  it('ending a seat that is still waiting cancels the person’s unused set-password link', async () => {
    const { personId, contextId } = await inviteOne('Lior Ben', 'lior.ben@brightmoor-walk.example')
    const link = await unusedLink(personId)
    as(OWNER)
    const r = await json(await seatAct(req('POST', `/api/access/${contextId}`, { action: 'revoke', reason: 'Not joining after all' }), seatParams(contextId)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const after = await prisma.emailToken.findUniqueOrThrow({ where: { id: link.id }, select: { expiresAt: true } })
    expect(after.expiresAt.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('the grant route refuses an end day that is not after today, in one sentence', async () => {
    as(OWNER)
    const r = await json(await grant(req('POST', '/api/access', {
      contextId: it_.memberContext, roleId: it_.roles['Recruiter'], days: 0, reason: 'Back on recruiting',
    })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Pick a day after today. Access cannot end on a day that has already begun.')
  })
})

/**
 * The founder's three invitations to Tapin, 2026-11-12, on the same world:
 * an email that did not go says why on the row; Copy invitation holds no
 * link that takes the seat; Send the invitation again is the same seat;
 * and several addresses go at once.
 */
describe('an invitation that did not go says why, and can be copied or sent again', () => {
  const seatParams = (contextId: string) => ({ params: Promise.resolve({ contextId }) })
  const mailOn = (answer: () => Response) => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.NOTIFY_FROM_EMAIL = 'notices@etyme.example'
    process.env.NEXTAUTH_URL = 'https://app.etyme.example'
    const out: { to: string; text: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
      if (String(url).includes('resend')) {
        const b = JSON.parse(init.body)
        out.push({ to: Array.isArray(b.to) ? b.to[0] : b.to, text: b.text ?? '' })
      }
      return answer()
    }))
    return out
  }
  const ok = () => new Response(JSON.stringify({ id: 'sent' }), { status: 200 })
  const refused = () => new Response(JSON.stringify({ name: 'validation_error', message: 'The notify.etyme.example domain is not verified.' }), { status: 403 })
  const waitingRow = async (contextId: string) => {
    const list = await json(await access(req('GET', '/api/access')))
    return list.body.data.waitingForAccess.find((w: any) => w.contextId === contextId)
  }

  afterAll(() => vi.unstubAllGlobals())

  it('an invitation the email sender refused tells the inviter why in a sentence, and the waiting row keeps it', async () => {
    mailOn(refused)
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/access/invite', { name: 'Vik Ippili', email: 'vik@partner-works-fixture.com', roleId: it_.roles['HR'] })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.mail.state).toBe('FAILED')
    expect(r.body.data.mail.why).toBe('Etyme’s email sender refused it, so nothing was sent. Etyme has been told.')
    expect(r.body.data.says).toContain('did not go. Etyme’s email sender refused it')
    expect(r.body.data.says).not.toMatch(/403|Resend|not verified|emailed/)
    const row = await waitingRow(r.body.data.contextId)
    expect(row.mail.state).toBe('FAILED')
    expect(row.mail.why).toBe(r.body.data.mail.why)
    expect(row.acts.resend && row.acts.copy).toBe(true)
    it_.vik = r.body.data.contextId
  })

  it('an invitation to a person who already has a password is not called emailed until the email has left', async () => {
    mailOn(() => new Response('{"message":"down"}', { status: 500 }))
    await prisma.person.create({ data: { primaryEmail: 'hana@has-password-fixture.com', name: 'Hana Sato', passwordHash: 'x' } })
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/access/invite', { email: 'hana@has-password-fixture.com' })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.mail.state).toBe('FAILED')
    expect(r.body.data.says).not.toContain('emailed')
  })

  it('inviting an address that already has a password and one Etyme has never seen gives the same reply, naming only what the inviter typed', async () => {
    mailOn(() => new Response('{"message":"down"}', { status: 500 }))
    await prisma.person.create({ data: { primaryEmail: 'rin@known-fixture.com', name: 'Rin Real-Name', passwordHash: 'x' } })
    as(OWNER)
    const known = await json(await invite(req('POST', '/api/access/invite', { email: 'rin@known-fixture.com' })))
    const fresh = await json(await invite(req('POST', '/api/access/invite', { email: 'rin@unknown-fixture.com' })))
    expect(known.status, JSON.stringify(known.body)).toBe(201)
    expect(fresh.status, JSON.stringify(fresh.body)).toBe(201)
    expect(Object.keys(known.body.data).sort()).toEqual(Object.keys(fresh.body.data).sort())
    expect(known.body.data.says.replace(/known-fixture/g, 'X')).toBe(fresh.body.data.says.replace(/unknown-fixture/g, 'X'))
    expect(JSON.stringify(known.body)).not.toContain('Rin Real-Name')
    expect(known.body.data.wayIn).toBeUndefined()
  })

  it('a waiting row carries a copied invitation with the sign-in page and the address, and no token and no seat id', async () => {
    as(OWNER)
    const row = await waitingRow(it_.vik)
    expect(row.copyText).toContain('https://app.etyme.example/login?email=vik%40partner-works-fixture.com')
    expect(row.copyText).not.toMatch(/\/reset\/|token/i)
    expect(row.copyText).not.toContain(it_.vik)
  })

  it('copying an invitation is written to the record with who copied it, and nothing secret', async () => {
    as(OWNER)
    const r = await json(await copied(req('POST', `/api/access/${it_.vik}/copied`), seatParams(it_.vik)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = await prisma.automationLog.findFirst({ where: { companyId: it_.firm, action: 'PERSON_INVITED', summary: { contains: 'copied the invitation' } }, orderBy: { at: 'desc' } })
    expect(row?.summary).toMatch(/copied the invitation for vik@partner-works-fixture\.com$/)
    expect(JSON.stringify(row)).not.toMatch(/\/reset\//)
  })

  it('pressing Send the invitation again sends the same invitation for the same seat, makes no second seat, and only the newest link works', async () => {
    const out = mailOn(ok)
    as(OWNER)
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'vik@partner-works-fixture.com' }, select: { id: true } })
    const r = await json(await sendAgain(req('POST', `/api/access/${it_.vik}/resend`, { email: 'someone.else@elsewhere.example' }), seatParams(it_.vik)))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toBe('Sent again to vik@partner-works-fixture.com. It is the same seat; nothing was duplicated.')
    // Only to the address on the record, never one from the request.
    expect(out.map((m) => m.to)).toEqual(['vik@partner-works-fixture.com'])
    expect(await prisma.context.count({ where: { personId: person.id, companyId: it_.firm } })).toBe(1)
    const live = await prisma.emailToken.count({ where: { personId: person.id, purpose: 'RESET', usedAt: null } })
    expect(live).toBe(1)
    expect((await waitingRow(it_.vik)).mail.state).toBe('SENT')
  })

  it('a third Send again in one hour is refused in one sentence that points to Copy invitation, and is logged before it is sent', async () => {
    mailOn(ok)
    as(OWNER)
    const third = await json(await sendAgain(req('POST', `/api/access/${it_.vik}/resend`), seatParams(it_.vik)))
    expect(third.status, JSON.stringify(third.body)).toBe(200)
    const fourth = await json(await sendAgain(req('POST', `/api/access/${it_.vik}/resend`), seatParams(it_.vik)))
    expect(fourth.status, JSON.stringify(fourth.body)).toBe(429)
    expect(fourth.body.error.message).toMatch(/^vik@partner-works-fixture\.com was emailed 3 times in the last hour\. Copy invitation and send it yourself, or send it again after /)
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'vik@partner-works-fixture.com' }, select: { id: true } })
    expect(await prisma.accessLog.count({ where: { subjectId: person.id, action: 'INVITATION_SEND_AGAIN', allowed: false } })).toBeGreaterThan(0)
  })

  it('Send again on a row whose person already signed in is refused in one sentence', async () => {
    mailOn(ok)
    as(OWNER)
    const r0 = await json(await invite(req('POST', '/api/access/invite', { email: 'lee.signed@partner-works-fixture.com' })))
    await prisma.context.update({ where: { id: r0.body.data.contextId }, data: { lastUsedAt: new Date() } })
    const r = await json(await sendAgain(req('POST', `/api/access/${r0.body.data.contextId}/resend`), seatParams(r0.body.data.contextId)))
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.message).toBe('They have already signed in, so there is no invitation left to send.')
  })

  it('an Admin cannot send an invitation again to an Owner’s seat', async () => {
    const admin = await prisma.person.create({ data: { primaryEmail: 'rae.admin@brightmoor.demo.etyme.local', name: 'Rae Admin' }, select: { id: true } })
    await prisma.context.create({ data: { personId: admin.id, companyId: it_.firm, type: 'EMPLOYEE', roleId: it_.roles['Admin'], lastUsedAt: new Date(), grantReason: 'People and settings' } })
    const owner = await prisma.person.create({ data: { primaryEmail: 'olu.owner@brightmoor-walk.example', name: 'Olu Next' }, select: { id: true } })
    const seat = await prisma.context.create({
      data: { personId: owner.id, companyId: it_.firm, type: 'EMPLOYEE', roleId: it_.roles['Owner'], invitedAt: new Date(), grantReason: 'A second Owner' },
      select: { id: true },
    })
    as('rae.admin@brightmoor.demo.etyme.local')
    const r = await json(await sendAgain(req('POST', `/api/access/${seat.id}/resend`), seatParams(seat.id)))
    expect(r.status, JSON.stringify(r.body)).toBe(422)
    expect(r.body.error.message).toBe('They are invited as an Owner. Only an Owner sends an Owner’s invitation. An Admin never can.')
    it_.raeEmail = 'rae.admin@brightmoor.demo.etyme.local'
  })

  it('the invite form tells the inviter an address is already invited and where to press Send again', async () => {
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/access/invite', { email: 'vik@partner-works-fixture.com' })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('vik@partner-works-fixture.com is already invited here. Press Send the invitation again on their row to email them once more, or Copy invitation.')
  })

  it('several addresses are invited at once with one role, each with its own line, and one refused does not stop the others', async () => {
    mailOn(ok)
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/access/invite', {
      emails: 'ana@batch-works-fixture.com, ben@batch-works-fixture.com\nvik@partner-works-fixture.com\nnot-an-address',
      roleId: it_.roles['Recruiter'],
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const lines = r.body.data.results
    expect(lines.map((l: any) => [l.email, l.ok])).toEqual([
      ['ana@batch-works-fixture.com', true], ['ben@batch-works-fixture.com', true],
      ['vik@partner-works-fixture.com', false], ['not-an-address', false],
    ])
    expect(lines[0].mail.state).toBe('SENT')
    expect(lines[0].copyText).toContain('as Recruiter')
    expect(lines[2].says).toContain('already invited here')
    for (const l of lines) expect(l.says).not.toMatch(/another company|elsewhere on Etyme|has an account/)
  })

  it('an address seated here already is said as "already has a seat here" and nothing about anywhere else', async () => {
    as(OWNER)
    const r = await json(await invite(req('POST', '/api/access/invite', { emails: [MEMBER] })))
    expect(r.body.data.results[0]).toMatchObject({ ok: false, says: 'They already have a seat here.' })
  })

  it('an Admin cannot invite an Owner in a batch', async () => {
    as(it_.raeEmail)
    const r = await json(await invite(req('POST', '/api/access/invite', { emails: 'x1@batch-works-fixture.com', roleId: it_.roles['Owner'] })))
    expect(r.status).toBe(422)
    expect(r.body.error.field).toBe('roleId')
    expect(await prisma.person.count({ where: { primaryEmail: 'x1@batch-works-fixture.com' } })).toBe(0)
  })

  it('a batch of more than twenty addresses is refused in one sentence and nobody is invited', async () => {
    as(OWNER)
    const many = Array.from({ length: 21 }, (_, i) => `many${i}@batch-works-fixture.com`)
    const r = await json(await invite(req('POST', '/api/access/invite', { emails: many })))
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('That is 21 addresses. Invite at most 20 at a time, then the rest.')
    expect(await prisma.person.count({ where: { primaryEmail: { startsWith: 'many' } } })).toBe(0)
  })

  // Fill the company's hour to exactly n invitation emails, with rows that
  // say they are fillers, a minute old.
  const fillHourTo = async (n: number) => {
    await prisma.automationLog.deleteMany({ where: { companyId: it_.firm, summary: 'hour filler' } })
    const real = await prisma.automationLog.count({ where: { companyId: it_.firm, action: { in: ['PERSON_INVITED', 'INVITATION_SENT_AGAIN'] }, at: { gte: new Date(Date.now() - 3_600_000) }, NOT: { payload: { path: ['act'], equals: 'COPIED' } } } })
    const rows = Array.from({ length: Math.max(0, n - real) }, () => ({
      companyId: it_.firm, action: 'PERSON_INVITED', summary: 'hour filler', reason: 'filler', payload: { act: 'INVITED' }, at: new Date(Date.now() - 60_000),
    }))
    if (rows.length) await prisma.automationLog.createMany({ data: rows })
  }

  it('a company that has sent its hour of invitations is refused a batch in one sentence that says when to try again', async () => {
    as(OWNER)
    await fillHourTo(60)
    const r = await json(await invite(req('POST', '/api/access/invite', { emails: 'late@batch-works-fixture.com' })))
    expect(r.status, JSON.stringify(r.body)).toBe(429)
    expect(r.body.error.message).toMatch(/^60 invitations have gone out from here in the last hour\. Try again after /)
  })

  it('one address at a time is held to the same hourly cap as several, and nobody is seated past it', async () => {
    as(OWNER)
    await fillHourTo(60)
    const r = await json(await invite(req('POST', '/api/access/invite', { name: 'Late One', email: 'late.one@batch-works-fixture.com' })))
    expect(r.status, JSON.stringify(r.body)).toBe(429)
    expect(r.body.error.cap).toBe('HOURLY')
    expect(await prisma.person.count({ where: { primaryEmail: 'late.one@batch-works-fixture.com' } })).toBe(0)
  })

  it('withdrawing an invitation never gives the hour back', async () => {
    as(OWNER)
    await fillHourTo(59)
    const first = await json(await invite(req('POST', '/api/access/invite', { email: 'take.back@batch-works-fixture.com' })))
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    const gone = await json(await withdraw(req('DELETE', `/api/access/${first.body.data.contextId}`), seatParams(first.body.data.contextId)))
    expect(gone.status, JSON.stringify(gone.body)).toBe(200)
    const again = await json(await invite(req('POST', '/api/access/invite', { email: 'take.back.two@batch-works-fixture.com' })))
    expect(again.status, JSON.stringify(again.body)).toBe(429)
  })

  it('two presses at once with room for one invite one person, never two', async () => {
    as(OWNER)
    await fillHourTo(59)
    const [ra, rb] = await Promise.all([
      invite(req('POST', '/api/access/invite', { emails: 'race.a@batch-works-fixture.com' })),
      invite(req('POST', '/api/access/invite', { email: 'race.b@batch-works-fixture.com' })),
    ])
    const [a, b] = [await json(ra), await json(rb)]
    expect([a.status, b.status].filter((x) => x === 429), JSON.stringify([a.body, b.body])).toHaveLength(1)
    expect(await prisma.person.count({ where: { primaryEmail: { in: ['race.a@batch-works-fixture.com', 'race.b@batch-works-fixture.com'] } } })).toBe(1)
  })

  it('Send the invitation again counts against the company’s hour, and is refused once the hour is spent', async () => {
    as(OWNER)
    await fillHourTo(0)
    const seat = await json(await invite(req('POST', '/api/access/invite', { email: 'again.cap@batch-works-fixture.com' })))
    expect(seat.status, JSON.stringify(seat.body)).toBe(201)
    await fillHourTo(60)
    const r = await json(await sendAgain(req('POST', `/api/access/${seat.body.data.contextId}/resend`), seatParams(seat.body.data.contextId)))
    expect(r.status, JSON.stringify(r.body)).toBe(429)
    expect(r.body.error.cap).toBe('HOURLY')
  })
})
