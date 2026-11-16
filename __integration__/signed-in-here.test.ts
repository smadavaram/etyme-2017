import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as access } from '@/app/api/access/route'
import { POST as invite } from '@/app/api/access/invite/route'
import { DELETE as withdraw } from '@/app/api/access/[contextId]/route'
import { recordSignInLedger } from '@/lib/identity/sign-in'

/**
 * Whether a seat has signed in is read from this firm's own record only
 * (2026-11-16).
 *
 * Two people are invited to seats at Brightmoor, both as Recruiter. One
 * already signs in at another firm: a seat there she uses, a Google
 * sign-in and a password of her own. The other has never been on Etyme.
 * Users & permissions, the invite answer and Withdraw read the two the
 * same, because neither has signed in here; then the first signs in, and
 * only then does her row move to Everyone with access.
 */

const OWNER = 'world-brightmoor@demo.etyme.local'
const ELSEWHERE = 'dana.okafor@harborline-tech.example'
const NEW = 'ravi.menon@northwind-staffing.example'

const it_: Record<string, string> = {}

const register = async () => {
  as(OWNER)
  const r = await json(await access(req('GET', '/api/access')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}
/** The figures in the headline, "6 people: 3 with access · 3 invited", as numbers. */
const figures = (data: any) => {
  const said = String(data.summary.peopleSays)
  const n = (re: RegExp) => Number(said.match(re)?.[1] ?? 0)
  const words = { withAccess: n(/(\d+) with access/), invited: n(/(\d+) invited/) }
  // The words and the numbers beside them are one count.
  expect(words).toEqual({ withAccess: data.summary.withAccess, invited: data.summary.invited })
  return words
}
const rowOf = (data: any, contextId: string) => ({
  waiting: data.waitingForAccess.find((w: any) => w.contextId === contextId) ?? null,
  withAccess: data.people.find((p: any) => p.contextId === contextId) ?? null,
})
/**
 * A waiting row with what differs by person and not by account taken out:
 * the seat and person ids, the name and the address the firm typed, the
 * moment each seat was made (a few milliseconds apart). And
 * Rename, which follows a separate rule (a company renames only a person
 * it alone knows) and is reported, not changed, here.
 */
const neutral = (w: any) => {
  const { contextId: _c, person: _p, acts, copyText: _t, joinedAt: _j, ...rest } = w
  const { rename: _r, ...otherActs } = acts
  return { ...rest, acts: otherActs }
}

beforeAll(async () => {
  await freshWorld()
  const brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
  const other = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-kestrel' }, select: { id: true } })
  it_.firm = brightmoor.id
  it_.other = other.id
  it_.recruiter = (await prisma.role.findFirstOrThrow({ where: { companyId: brightmoor.id, name: 'Recruiter' }, select: { id: true } })).id

  // She already signs in at another firm: a password, a Google sign-in,
  // a seat there and her own acts on its log.
  const her = await prisma.person.create({
    data: { primaryEmail: ELSEWHERE, name: 'Dana Okafor', passwordHash: 'a-hash-she-set-at-another-firm' },
    select: { id: true },
  })
  it_.her = her.id
  await prisma.credential.create({ data: { personId: her.id, provider: 'GOOGLE', providerId: `g-${her.id}`, email: ELSEWHERE, lastUsedAt: new Date() } })
  await prisma.context.create({ data: { personId: her.id, companyId: other.id, type: 'EMPLOYEE', grantReason: 'Works there' } })
  await prisma.accessLog.create({ data: { subjectId: her.id, actorPersonId: her.id, actorCompanyId: other.id, action: 'CONTEXT_SWITCH', reason: 'Switched to her seat there' } })

  as(OWNER)
  for (const [email, name] of [[ELSEWHERE, 'Dana Okafor'], [NEW, 'Ravi Menon']]) {
    await inviteAs(email, name)
  }
  it_.herSeat = await seatOf(ELSEWHERE)
  it_.newSeat = await seatOf(NEW)
}, 300_000)

async function inviteAs(email: string, name?: string) {
  as(OWNER)
  const r = await json(await invite(req('POST', '/api/access/invite', { email, name, roleId: it_.recruiter })))
  expect([200, 201], JSON.stringify(r.body)).toContain(r.status)
}
const seatOf = async (email: string) => (await prisma.context.findFirstOrThrow({
  where: { companyId: it_.firm, revokedAt: null, person: { primaryEmail: email } }, select: { id: true },
})).id

describe('Users & permissions reads only this firm’s own record', () => {
  it('a seat invited at an address that signs in elsewhere reads Invited until she signs in here', async () => {
    const data = await register()
    const her = rowOf(data, it_.herSeat)
    expect(her.withAccess).toBeNull()
    expect(her.waiting).toMatchObject({
      invited: true, signedIn: false, figure: 'invited', role: 'Recruiter',
      said: 'Invited today, not yet signed in · will have the Recruiter role',
    })
    // Withdraw and Send again, never End: there is an invitation to take back.
    expect(her.waiting.acts).toMatchObject({ withdraw: true, resend: true, copy: true, end: false, pause: false })
  })

  it('nothing on Users & permissions about signing in differs by whether the address has an account elsewhere: the place, the line, the figure, the acts and the counts', async () => {
    const data = await register()
    const her = rowOf(data, it_.herSeat)
    const fresh = rowOf(data, it_.newSeat)
    expect(her.withAccess).toBeNull()
    expect(fresh.withAccess).toBeNull()
    expect(neutral(her.waiting)).toEqual(neutral(fresh.waiting))
    // Both are counted as invited, under the same figure.
    expect(data.waitingForAccess.filter((w: any) => [it_.herSeat, it_.newSeat].includes(w.contextId)).map((w: any) => w.figure))
      .toEqual(['invited', 'invited'])
  })

  it('inviting either address again gets the same answer: already invited here', async () => {
    as(OWNER)
    const a = await json(await invite(req('POST', '/api/access/invite', { email: ELSEWHERE, roleId: it_.recruiter })))
    const b = await json(await invite(req('POST', '/api/access/invite', { email: NEW, roleId: it_.recruiter })))
    expect(a.status).toBe(b.status)
    const words = (r: any, email: string) => JSON.stringify(r.body).split(email).join('<address>')
    expect(words(a, ELSEWHERE)).toBe(words(b, NEW))
    expect(JSON.stringify(a.body)).toMatch(/already invited|invitation/i)
    expect(JSON.stringify(a.body)).not.toMatch(/already has a seat|signed in/i)
  })

  it('the Invited figure counts her, the same as the address Etyme has never seen, and every row it counts is on the waiting list', async () => {
    const data = await register()
    const invitedRows = data.waitingForAccess.filter((w: any) => w.figure === 'invited' && !w.consultant)
    expect(figures(data).invited).toBe(invitedRows.length)
    expect(invitedRows.map((w: any) => w.contextId)).toEqual(expect.arrayContaining([it_.herSeat, it_.newSeat]))
    expect(data.people.some((p: any) => p.figure === 'invited')).toBe(false)
  })

  it('an invitation to an address that signs in elsewhere is withdrawn like any other, and she keeps her seat at the other firm', async () => {
    as(OWNER)
    const r = await json(await withdraw(req('DELETE', `/api/access/${it_.herSeat}`), { params: Promise.resolve({ contextId: it_.herSeat }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.message).toBe(`The invitation to ${ELSEWHERE} is withdrawn, and its link no longer opens a seat here. If they were meant to be here, use the Invite form above; it makes a new invitation.`)
    expect(await prisma.context.count({ where: { id: it_.herSeat } })).toBe(0)
    expect(await prisma.person.count({ where: { id: it_.her } })).toBe(1)
    expect(await prisma.context.count({ where: { personId: it_.her, companyId: it_.other, revokedAt: null } })).toBe(1)

    // Invited again, for the rest of the walk.
    await inviteAs(ELSEWHERE)
    it_.herSeat = await seatOf(ELSEWHERE)
  })

  it('once she signs in, her first sign-in on the invitation writes a row here, and her row moves to Everyone with access', async () => {
    const countsBefore = figures(await register())
    await recordSignInLedger({ email: ELSEWHERE, door: 'PASSWORD' })
    expect(await prisma.accessLog.count({ where: { actorPersonId: it_.her, actorCompanyId: it_.firm, action: 'INVITE_ACCEPTED' } })).toBe(1)

    const data = await register()
    const her = rowOf(data, it_.herSeat)
    expect(her.waiting).toBeNull()
    expect(her.withAccess).toMatchObject({ role: 'Recruiter', figure: 'with-access' })
    expect(her.withAccess.acts).toMatchObject({ end: true, withdraw: false })
    // The figures moved with the row: one fewer invited, one more with access.
    expect(figures(data)).toEqual({ withAccess: countsBefore.withAccess + 1, invited: countsBefore.invited - 1 })
    // The address that has not signed in here still reads Invited.
    expect(rowOf(data, it_.newSeat).waiting).toMatchObject({ signedIn: false, figure: 'invited' })
  })

})
