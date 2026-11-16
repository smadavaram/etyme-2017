import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { as, json, prisma, resetDatabase } from './harness'
import { SoftwarePasskey } from './software-passkey'

import { GET as list, POST as add, DELETE as remove } from '@/app/api/settings/second-check/route'
import { POST as verify } from '@/app/api/settings/second-check/verify/route'
import { GET as resettable, POST as reset } from '@/app/api/settings/second-check/reset/route'
import { GET as ready } from '@/app/api/ready/route'
import { ensureDefaultRoles } from '@/lib/company-roles'
import { SAYS, FIRST_FACTOR_MINUTES } from '@/lib/identity/second-check-rules'
import { codeAt, stepAt, base32Decode } from '@/lib/identity/totp'

/**
 * Layer 7, slices S1 and S6 (record 86, answers 2 and 5): the second
 * check, walked through its real routes against a real database. A
 * software passkey answers the browser's part, and the authenticator
 * app's codes are computed from the key the screen shows once. A made-up
 * supplier on a reserved domain, and made-up people.
 *
 * Nothing that moves money asks for the check yet (slice S2); the acts
 * here are the second check's own: adding, removing and resetting.
 */

const ORIGIN = 'http://localhost:3000'
const DANA = 'dana.okafor@harborline-tech.example'
const LEE = 'lee.marsh@harborline-tech.example'
const ANA = 'ana.ruiz@harborline-tech.example'
const RAVI = 'ravi.kohli@harborline-tech.example'
const COMPANY = 'Harborline Tech'

const KEY = randomBytes(32).toString('base64')
const saved: Record<string, string | undefined> = {}
const ENV = ['ETYME_SECOND_CHECK_KEY', 'RESEND_API_KEY', 'SENDGRID_API_KEY', 'NOTIFY_FROM_EMAIL'] as const

/** Every code, key, ticket and proof the test typed or was handed; none may reach the security log. */
const secrets: string[] = []
/** How many times a check was made (step 'check'), to count its rows. */
let checksMade = 0

const ids: Record<string, string> = {}

/** A NextAuth session cookie for the person, signed in `minutesAgo` minutes ago. */
async function signedIn(email: string, minutesAgo: number): Promise<Record<string, string>> {
  const token = await encode({ token: { email, authAt: Date.now() - minutesAgo * 60_000, sv: 0 }, secret: process.env.NEXTAUTH_SECRET! })
  return { cookie: `next-auth.session-token=${token}` }
}

function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, origin = ORIGIN): NextRequest {
  return new NextRequest(`${origin}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function call(email: string, handler: (r: NextRequest) => Promise<Response>, method: string, path: string, body?: unknown, headers: Record<string, string> = {}, origin = ORIGIN) {
  as(email)
  return json(await handler(request(method, path, body, headers, origin)))
}

/** Begin and make a check with the passkey, for one act and subject. Answers the route's reply. */
async function passkeyCheck(email: string, device: SoftwarePasskey, act: string, subjectId: string, checkOrigin = ORIGIN) {
  const begun = await call(email, verify, 'POST', '/api/settings/second-check/verify', { step: 'begin', act, subjectId })
  expect(begun.status, JSON.stringify(begun.body)).toBe(200)
  const { options, ticket } = begun.body.data.passkey
  secrets.push(ticket, options.challenge)
  const response = device.get(options, checkOrigin)
  checksMade += 1
  const r = await call(email, verify, 'POST', '/api/settings/second-check/verify', { step: 'check', act, subjectId, ticket, response }, {}, checkOrigin)
  if (r.body?.data?.proof) secrets.push(r.body.data.proof)
  return r
}

async function codeCheck(email: string, code: string, act: string, subjectId: string) {
  secrets.push(code)
  checksMade += 1
  const r = await call(email, verify, 'POST', '/api/settings/second-check/verify', { step: 'check', act, subjectId, code })
  if (r.body?.data?.proof) secrets.push(r.body.data.proof)
  return r
}

/** Add a passkey on a fresh sign-in (the first) or with a proof (a later one). */
async function addPasskey(email: string, device: SoftwarePasskey, proof?: string) {
  const headers = await signedIn(email, 1)
  const started = await call(email, add, 'POST', '/api/settings/second-check', { step: 'start', kind: 'PASSKEY', proof }, headers)
  if (started.status !== 200) return started
  secrets.push(started.body.data.ticket)
  const response = device.create(started.body.data.options, ORIGIN)
  return call(email, add, 'POST', '/api/settings/second-check', { step: 'finish', ticket: started.body.data.ticket, response, label: 'Work laptop' }, headers)
}

const appKeys: Record<string, Buffer> = {}
/** The code an app shows `ahead` steps from now. */
const appCode = (email: string, ahead = 0) => codeAt(appKeys[email], stepAt(new Date()) + ahead)

describe('the second check, before an act, through its routes', () => {
  const dana = new SoftwarePasskey()
  const lee = new SoftwarePasskey()

  beforeAll(async () => {
    await resetDatabase()
    for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k] }
    const company = await prisma.company.create({ data: { name: COMPANY, slug: 'harborline-tech', kind: 'VENDOR', currency: 'USD', claimedAt: new Date('2026-01-04') } })
    ids.company = company.id
    await ensureDefaultRoles(company.id, 'VENDOR')
    const roles = await prisma.role.findMany({ where: { companyId: company.id }, select: { id: true, name: true } })
    const role = (n: string) => roles.find((r) => r.name === n)!.id
    const other = roles.find((r) => r.name !== 'Owner' && r.name !== 'Admin')!
    for (const [email, name, roleId] of [
      [DANA, 'Dana Okafor', role('Owner')], [LEE, 'Lee Marsh', role('Owner')],
      [ANA, 'Ana Ruiz', role('Admin')], [RAVI, 'Ravi Kohli', other.id],
    ] as const) {
      const p = await prisma.person.create({ data: { name, primaryEmail: email } })
      await prisma.context.create({ data: { personId: p.id, type: 'EMPLOYEE', companyId: company.id, roleId } })
      ids[email] = p.id
    }
  }, 900_000)

  afterAll(() => {
    vi.useRealTimers()
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
  })

  it('without the sealing key, enrollment refuses in a sentence, and /ready shows the second check as missing', async () => {
    const r = await call(DANA, add, 'POST', '/api/settings/second-check', { step: 'start', kind: 'PASSKEY' }, await signedIn(DANA, 1))
    expect(r.status).toBe(503)
    expect(r.body.error.message).toBe(SAYS.notReady)
    const app = await call(DANA, add, 'POST', '/api/settings/second-check', { step: 'start', kind: 'AUTHENTICATOR_APP' }, await signedIn(DANA, 1))
    expect(app.body.error.message).toBe(SAYS.notReady)
    expect(await prisma.authenticatorApp.count()).toBe(0)
    const edges = ((await (await ready()).json()) as { data: { edges: { key: string; state: string; says: string }[] } }).data.edges
    expect(edges.find((e) => e.key === 'second-check')).toMatchObject({ state: 'MISSING' })
    process.env.ETYME_SECOND_CHECK_KEY = KEY
    expect(((await (await ready()).json()) as { data: { edges: { key: string; state: string }[] } }).data.edges.find((e) => e.key === 'second-check')).toMatchObject({ state: 'SET' })
  })

  it(`a first passkey needs a sign-in within the last ${FIRST_FACTOR_MINUTES} minutes`, async () => {
    const none = await call(DANA, add, 'POST', '/api/settings/second-check', { step: 'start', kind: 'PASSKEY' })
    expect(none.status).toBe(403)
    expect(none.body.error.message).toBe(SAYS.signInAgain)
    const stale = await call(DANA, add, 'POST', '/api/settings/second-check', { step: 'start', kind: 'PASSKEY' }, await signedIn(DANA, FIRST_FACTOR_MINUTES + 1))
    expect(stale.body.error.message).toBe(SAYS.signInAgain)
    const added = await addPasskey(DANA, dana)
    expect(added.status, JSON.stringify(added.body)).toBe(200)
    expect(await prisma.passkey.count({ where: { personId: ids[DANA], revokedAt: null } })).toBe(1)
    const page = await call(DANA, list, 'GET', '/api/settings/second-check')
    expect(page.body.data.passkeys).toHaveLength(1)
    expect(JSON.stringify(page.body)).not.toContain('publicKey')
  })

  it('a second passkey or app needs a check with the first, and an app is confirmed by its first code', async () => {
    const refused = await call(DANA, add, 'POST', '/api/settings/second-check', { step: 'start', kind: 'AUTHENTICATOR_APP' }, await signedIn(DANA, 1))
    expect(refused.status).toBe(403)
    expect(refused.body.error).toMatchObject({ code: 'SECOND_CHECK', message: SAYS.checkFirst, act: 'second_check.add', subjectId: ids[DANA] })

    const checked = await passkeyCheck(DANA, dana, 'second_check.add', ids[DANA])
    expect(checked.status, JSON.stringify(checked.body)).toBe(200)
    const started = await call(DANA, add, 'POST', '/api/settings/second-check', { step: 'start', kind: 'AUTHENTICATOR_APP', proof: checked.body.data.proof })
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    const { key, link, ticket } = started.body.data
    secrets.push(key, ticket)
    expect(link).toMatch(/^otpauth:\/\/totp\/Etyme:/)
    appKeys[DANA] = base32Decode(key)!
    const confirm = appCode(DANA)
    secrets.push(confirm)
    const done = await call(DANA, add, 'POST', '/api/settings/second-check', { step: 'finish', ticket, code: confirm })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    const row = await prisma.authenticatorApp.findFirstOrThrow({ where: { personId: ids[DANA], revokedAt: null } })
    expect(row.confirmedAt).not.toBeNull()
    expect(row.secretSealed).not.toContain(key)
    ids.danaApp = row.id
  })

  it('a passkey or app code proves one act once, and the same proof never proves a second act', async () => {
    const checked = await passkeyCheck(DANA, dana, 'second_check.add', ids[DANA])
    expect(checked.status).toBe(200)
    const proof = checked.body.data.proof as string

    // The proof was made for adding: it does not reset a colleague, and nothing is reset.
    const elsewhere = await call(DANA, reset, 'POST', '/api/settings/second-check/reset', { personId: ids[RAVI], proof })
    expect(elsewhere.status).toBe(403)
    expect(elsewhere.body.error.message).toBe(SAYS.proofElsewhere)

    // Spent once on the act it was made for.
    const first = await call(DANA, add, 'POST', '/api/settings/second-check', { step: 'start', kind: 'PASSKEY', proof })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    // And never again, even on the same act.
    const again = await call(DANA, add, 'POST', '/api/settings/second-check', { step: 'start', kind: 'PASSKEY', proof })
    expect(again.status).toBe(403)
    expect(again.body.error.message).toBe(SAYS.proofUsed)
    expect(await prisma.securityEvent.count({ where: { event: 'SECOND_CHECK_USED', actorPersonId: ids[DANA] } })).toBe(2)

    // An app code proves one act the same way.
    const byApp = await codeCheck(DANA, appCode(DANA, 1), 'second_check.remove', ids.danaApp)
    expect(byApp.status, JSON.stringify(byApp.body)).toBe(200)
    expect(byApp.body.data.method).toBe('AUTHENTICATOR_APP')
    const wrongAct = await call(DANA, add, 'POST', '/api/settings/second-check', { step: 'start', kind: 'PASSKEY', proof: byApp.body.data.proof })
    expect(wrongAct.body.error.message).toBe(SAYS.proofElsewhere)
  })

  it('a code used once is refused the second time', async () => {
    // A minute and a half on, so the code is one no check has spent yet.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 90_000 })
    try {
      const code = appCode(DANA)
      const first = await codeCheck(DANA, code, 'second_check.remove', ids.danaApp)
      expect(first.status, JSON.stringify(first.body)).toBe(200)
      const second = await codeCheck(DANA, code, 'second_check.remove', ids.danaApp)
      expect(second.status).toBe(403)
      expect(second.body.error.message).toBe(SAYS.codeUsed)
      const row = await prisma.authenticatorApp.findUniqueOrThrow({ where: { id: ids.danaApp } })
      expect(row.lastUsedStep).toBe(stepAt(new Date()))
    } finally {
      vi.useRealTimers()
    }
  })

  it('a proof more than two minutes old is refused, and a wrong code is refused in a sentence', async () => {
    const wrong = await codeCheck(DANA, '000000' === appCode(DANA) ? '111111' : '000000', 'second_check.remove', ids.danaApp)
    expect(wrong.status).toBe(403)
    expect([SAYS.codeWrong, SAYS.codeUsed]).toContain(wrong.body.error.message)

    const checked = await passkeyCheck(DANA, dana, 'second_check.remove', ids.danaApp)
    expect(checked.status).toBe(200)
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 3 * 60_000 })
    try {
      const late = await call(DANA, remove, 'DELETE', '/api/settings/second-check', { id: ids.danaApp, proof: checked.body.data.proof })
      expect(late.status).toBe(403)
      expect(late.body.error.message).toBe(SAYS.proofLapsed)
    } finally {
      vi.useRealTimers()
    }
    expect(await prisma.authenticatorApp.count({ where: { id: ids.danaApp, revokedAt: null } })).toBe(1)
  })

  it('a passkey check made at another address is refused', async () => {
    const r = await passkeyCheck(DANA, dana, 'second_check.add', ids[DANA], 'https://preview.harborline-tech.example')
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe(SAYS.passkeyElsewhere)
  })

  it('nobody resets their own second check, and the refusal names the other Owner', async () => {
    const r = await call(DANA, reset, 'POST', '/api/settings/second-check/reset', { personId: ids[DANA] })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe(`Nobody resets their own second check. Ask another Owner at ${COMPANY}: Lee Marsh.`)
    expect(await prisma.passkey.count({ where: { personId: ids[DANA], revokedAt: null } })).toBeGreaterThan(0)
    expect(await prisma.securityEvent.count({ where: { event: 'SECOND_CHECK_RESET_REFUSED', actorPersonId: ids[DANA], subjectPersonId: ids[DANA] } })).toBe(1)
  })

  it('an Admin never resets an Owner’s second check', async () => {
    const r = await call(ANA, reset, 'POST', '/api/settings/second-check/reset', { personId: ids[DANA] })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('Only an Owner resets an Owner’s second check. An Admin never can.')
    const page = await call(ANA, resettable, 'GET', '/api/settings/second-check/reset')
    expect(page.body.data).toMatchObject({ mayReset: false, people: [] })
    expect(await prisma.passkey.count({ where: { personId: ids[DANA], revokedAt: null } })).toBeGreaterThan(0)
    expect(await prisma.securityEvent.count({ where: { event: 'SECOND_CHECK_RESET_REFUSED', actorPersonId: ids[ANA] } })).toBe(1)
  })

  it('another Owner resets a colleague’s second check after her own, and every Owner and the person are told', async () => {
    // Lee has nothing to check with yet: she is asked for a check, not let through.
    const unchecked = await call(LEE, reset, 'POST', '/api/settings/second-check/reset', { personId: ids[DANA] })
    expect(unchecked.status).toBe(403)
    expect(unchecked.body.error).toMatchObject({ code: 'SECOND_CHECK', message: SAYS.noProof, act: 'second_check.reset', subjectId: ids[DANA] })
    const page = await call(LEE, resettable, 'GET', '/api/settings/second-check/reset')
    expect(page.body.data.mayReset).toBe(true)
    expect(page.body.data.people.map((p: { name: string }) => p.name).sort()).toEqual(['Ana Ruiz', 'Dana Okafor', 'Ravi Kohli'])
    expect(JSON.stringify(page.body)).not.toMatch(/passkey|app/i)

    expect((await addPasskey(LEE, lee)).status).toBe(200)
    const checked = await passkeyCheck(LEE, lee, 'second_check.reset', ids[DANA])
    expect(checked.status).toBe(200)
    const done = await call(LEE, reset, 'POST', '/api/settings/second-check/reset', { personId: ids[DANA], proof: checked.body.data.proof })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body.data.says).toBe(`Dana Okafor’s second check is reset. Every Owner at ${COMPANY} and Dana Okafor are told.`)

    expect(await prisma.passkey.count({ where: { personId: ids[DANA], revokedAt: null } })).toBe(0)
    expect(await prisma.authenticatorApp.count({ where: { personId: ids[DANA], revokedAt: null } })).toBe(0)
    const row = await prisma.securityEvent.findFirstOrThrow({ where: { event: 'SECOND_CHECK_RESET', subjectPersonId: ids[DANA] } })
    expect(row).toMatchObject({ actorPersonId: ids[LEE], companyId: ids.company, method: 'PASSKEY' })
    const told = await prisma.notification.findMany({ where: { title: { in: ['A second check was reset', 'Your second check was reset'] } }, select: { personId: true, title: true, body: true } })
    expect(told.find((n) => n.personId === ids[LEE])?.title).toBe('A second check was reset')
    expect(told.find((n) => n.personId === ids[DANA])?.title).toBe('Your second check was reset')
    expect(told.every((n) => !/two-step/i.test(n.body))).toBe(true)

    // Her old passkey no longer checks anything.
    const begun = await call(DANA, verify, 'POST', '/api/settings/second-check/verify', { step: 'begin', act: 'second_check.add', subjectId: ids[DANA] })
    expect(begun.status).toBe(409)
    expect(begun.body.error.message).toBe(SAYS.noneYet)
  })

  it('five failed checks make the person wait, even for the right code', async () => {
    const headers = await signedIn(RAVI, 1)
    const started = await call(RAVI, add, 'POST', '/api/settings/second-check', { step: 'start', kind: 'AUTHENTICATOR_APP' }, headers)
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    secrets.push(started.body.data.key, started.body.data.ticket)
    appKeys[RAVI] = base32Decode(started.body.data.key)!
    const confirm = appCode(RAVI)
    secrets.push(confirm)
    expect((await call(RAVI, add, 'POST', '/api/settings/second-check', { step: 'finish', ticket: started.body.data.ticket, code: confirm })).status).toBe(200)
    const right = appCode(RAVI, 1)
    const wrong = right === '123456' ? '654321' : '123456'
    for (let i = 0; i < 5; i++) expect((await codeCheck(RAVI, wrong, 'second_check.remove', 'any')).status).toBe(403)
    const waits = await codeCheck(RAVI, right, 'second_check.remove', 'any')
    expect(waits.status).toBe(429)
    expect(waits.body.error.message).toBe(SAYS.wait)
  })

  it('every check writes a security log row with no code or secret in it', async () => {
    const rows = await prisma.securityEvent.findMany()
    const checks = rows.filter((r) =>
      r.event === 'SECOND_CHECK_PASSED' ||
      (r.event === 'SECOND_CHECK_FAILED' && ['CHECK', 'WAIT'].includes((r.facts as { stage?: string } | null)?.stage ?? '')))
    expect(checks).toHaveLength(checksMade)
    const text = JSON.stringify(rows)
    for (const s of secrets) expect(text, 'a code, key, ticket or proof reached the security log').not.toContain(s)
    expect(rows.filter((r) => r.event === 'SECOND_CHECK_ENROLLED')).toHaveLength(4)
    const edges = ((await (await ready()).json()) as { data: { edges: { key: string; state: string }[] } }).data.edges
    expect(edges.find((e) => e.key === 'second-check')).toMatchObject({ state: 'PROVEN' })
  })
})
