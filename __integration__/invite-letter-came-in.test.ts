import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { as, req, json, prisma, freshWorld } from './harness'
import { POST as invite } from '@/app/api/access/invite/route'
import { POST as sendAgain } from '@/app/api/access/[contextId]/resend/route'
import { INVITE_TITLE_MARK } from '@/app/api/access/invite/one'

/**
 * An invitation never carries a link that sets a password on an account
 * somebody has used, by any door (2026-11-16).
 *
 * Brightmoor invites five people as Recruiter. Four have used Etyme, each
 * by one door the old check missed: LinkedIn only, a company directory
 * only, a first email link only, and a one-time link answered and nothing
 * else. None holds a password or a sign-in method on record. The fifth was
 * put on the record by a firm and has never used Etyme at all.
 *
 * No email can leave in this run, so the notice keeps whatever link the
 * letter carried for staff to pass on: the strictest place to look.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'
const it_: Record<string, string> = {}

const USED = {
  'LinkedIn': 'amara.osei@harborline-tech.example',
  'a company directory': 'jonas.lindqvist@harborline-tech.example',
  'a first email link': 'priya.ramesh@northwind-staffing.example',
  'answering a one-time link': 'tomas.alvarez@northwind-staffing.example',
} as const
const NEVER = 'lena.kowalski@northwind-staffing.example'

const person = (email: string, name: string) =>
  prisma.person.create({ data: { primaryEmail: email, name }, select: { id: true } })

beforeAll(async () => {
  await freshWorld()
  const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
  const other = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-kestrel' }, select: { id: true } })
  it_.firm = brightmoor.id
  it_.recruiter = (await prisma.role.findFirstOrThrow({ where: { companyId: brightmoor.id, name: 'Recruiter' }, select: { id: true } })).id

  // LinkedIn only: her sign-in is on the log with her as the actor, and no
  // sign-in method is on record.
  const a = await person(USED['LinkedIn'], 'Amara Osei')
  await prisma.accessLog.create({ data: { subjectId: a.id, actorPersonId: a.id, actorCompanyId: other.id, action: 'LOGIN_SUCCEEDED', reason: 'policy OPEN · surface WEB · Signed in with LinkedIn.' } })
  // A company directory only.
  const d = await person(USED['a company directory'], 'Jonas Lindqvist')
  await prisma.externalIdentity.create({ data: { personId: d.id, companyId: other.id, issuer: 'https://login.harborline-tech.example', subject: `sub-${d.id}`, email: USED['a company directory'] } })
  // A first email link only: the mailbox is proved.
  await prisma.person.create({ data: { primaryEmail: USED['a first email link'], name: 'Priya Ramesh', emailVerifiedAt: new Date() } })
  // A one-time link answered, and nothing else.
  const t = await person(USED['answering a one-time link'], 'Tomas Alvarez')
  await prisma.emailToken.create({ data: { personId: t.id, purpose: 'VERIFY', tokenHash: randomBytes(16).toString('hex'), expiresAt: new Date(Date.now() + 3_600_000), usedAt: new Date() } })
  // Put on the record by a firm, and never used.
  await person(NEVER, 'Lena Kowalski')

  as(OWNER)
  for (const email of [...Object.values(USED), NEVER]) {
    const r = await json(await invite(req('POST', '/api/access/invite', { email, roleId: it_.recruiter })))
    expect([200, 201], JSON.stringify(r.body)).toContain(r.status)
  }
}, 300_000)

/** Every invitation letter kept for this address at Brightmoor, newest first. */
const lettersTo = async (email: string) => {
  const p = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email }, select: { id: true } })
  const rows = await prisma.notification.findMany({
    where: { personId: p.id, companyId: it_.firm, channel: 'EMAIL', title: { contains: INVITE_TITLE_MARK } },
    orderBy: { createdAt: 'desc' }, select: { body: true },
  })
  return { personId: p.id, bodies: rows.map((r) => r.body) }
}
const liveInvitationLinks = (personId: string) =>
  prisma.emailToken.count({ where: { personId, purpose: 'RESET', usedAt: null, expiresAt: { gt: new Date() } } })

describe('an invitation never carries a link that sets a password on an account somebody has used, by any door', () => {
  for (const [door, email] of Object.entries(USED)) {
    it(`a person who came in only by ${door} is told to sign in the way she usually does, and no link that sets a password is made for her`, async () => {
      const { personId, bodies } = await lettersTo(email)
      expect(bodies.length).toBeGreaterThan(0)
      for (const body of bodies) {
        expect(body).toContain('the way you usually do, then choose Brightmoor Staffing in the account menu. You are in Brightmoor')
        expect(body).not.toContain('/reset/')
        expect(body).not.toMatch(/Set your password/)
      }
      expect(await liveInvitationLinks(personId)).toBe(0)
    })
  }

  it('Send the invitation again to a person who has come in carries no link that sets a password either', async () => {
    const seat = await prisma.context.findFirstOrThrow({
      where: { companyId: it_.firm, revokedAt: null, person: { primaryEmail: USED['a company directory'] } }, select: { id: true },
    })
    as(OWNER)
    const r = await json(await sendAgain(req('POST', `/api/access/${seat.id}/resend`), { params: Promise.resolve({ contextId: seat.id }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const { personId, bodies } = await lettersTo(USED['a company directory'])
    expect(bodies.length).toBe(2)
    for (const body of bodies) expect(body).not.toContain('/reset/')
    expect(await liveInvitationLinks(personId)).toBe(0)
    expect(JSON.stringify(r.body)).not.toContain('/reset/')
  })

  it('a person a firm put on the record who has never used Etyme is still sent a link to choose a first password', async () => {
    const { personId, bodies } = await lettersTo(NEVER)
    expect(bodies[0]).toMatch(/^Set your password and you are signed in\. You are in Brightmoor/)
    expect(bodies[0]).toContain('/reset/')
    expect(await liveInvitationLinks(personId)).toBe(1)
  })

  it('the reply to the firm reads the same for every address, whether or not she has come in', async () => {
    as(OWNER)
    const a = await json(await invite(req('POST', '/api/access/invite', { email: 'kofi.mensah@harborline-tech.example', roleId: it_.recruiter })))
    const usedBefore = await person('noor.haddad@harborline-tech.example', 'Noor Haddad')
    await prisma.person.update({ where: { id: usedBefore.id }, data: { emailVerifiedAt: new Date() } })
    const b = await json(await invite(req('POST', '/api/access/invite', { email: 'noor.haddad@harborline-tech.example', roleId: it_.recruiter })))
    expect(a.status).toBe(b.status)
    const words = (r: any, email: string) => {
      const { contextId: _c, ...rest } = r.body.data
      return JSON.stringify(rest).split(email).join('<address>').split(email.split('@')[0]).join('<name>')
    }
    expect(words(a, 'kofi.mensah@harborline-tech.example')).toBe(words(b, 'noor.haddad@harborline-tech.example'))
  })
})
