import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { mailLeaves } from '@/lib/notify/mail-leaves'
import { formatDay } from '@/lib/format-date'
import { seatsAt } from '@/lib/owner-asks'
import { liveOwners, type Seat } from '@/lib/owner-rules'
import { sealBlob, openBlob, randomToken } from '@/lib/identity/oidc'
import { seal, unseal, TOKEN_KEY_ENV } from '@/lib/team-structure/directory/sealed'
import { secondCheckKey } from '@/lib/identity/second-check-key'
import { recordSecurityEvent, recordSecurityEventOnce, type SecuritySurface } from '@/lib/identity/security-ledger'
import { checkTotp, newTotpSecret, otpauthUri, base32Decode } from '@/lib/identity/totp'
import {
  SAYS, CHECK_ACTS, PROOF_SECONDS, CHALLENGE_SECONDS, ADDING_SECONDS, FAILURE_WINDOW_MINUTES, SECOND_CHECK_PLACE,
  isCheckAct, mayAddFactor, mayResetSecondCheck, mustWait, relyingParty, type CheckAct,
} from '@/lib/identity/second-check-rules'

/**
 * The second check, on the record (Layer 7, slices S1 and S6; record 86).
 *
 * One server function proves a check for one act (`proveCheck`), and one
 * spends the proof it hands back (`spendCheck`). A proof names the person,
 * the act and its subject, stands for two minutes, and is spent once: the
 * row that spends it takes an id made from the proof's own, so the
 * database's primary key refuses a second spend.
 *
 * Every check, passed or failed, writes a row to the security log. No row
 * holds a code, a secret, a challenge or a passkey's signature.
 *
 * The authenticator app's secret, and every ticket and proof, are sealed
 * under ETYME_SECOND_CHECK_KEY. Where it is not set nothing is added and
 * no check is made, in a sentence, never a crash.
 */

type Env = Record<string, string | undefined>
export type Method = 'PASSKEY' | 'AUTHENTICATOR_APP'
export type Refused = { ok: false; says: string; status: number; code: string }

const CHALLENGE_LABEL = 'second-check challenge'
const ADDING_LABEL = 'second-check adding'
const PROOF_LABEL = 'second-check proof'

const refused = (says: string, status = 403, code = 'SECOND_CHECK'): Refused => ({ ok: false, says, status, code })

// ── The key ──────────────────────────────────────────────────────────

export { secondCheckKey }

function sealSecret(plain: string, key: string): string {
  return seal(plain, { [TOKEN_KEY_ENV]: key })
}

function openSecret(sealed: string, key: string): string | null {
  return unseal(sealed, { [TOKEN_KEY_ENV]: key })
}

/** Open a sealed blob whatever its age, so a lapsed one is told apart from one that was never ours. */
function openAnyAge<T extends Record<string, unknown>>(sealed: unknown, label: string, key: string): (T & { exp: number }) | null {
  return typeof sealed === 'string' ? openBlob<T>(sealed, label, key, 0) : null
}

// ── What a person holds ──────────────────────────────────────────────

export interface Factors {
  passkeys: { id: string; label: string | null; createdAt: Date; lastUsedAt: Date | null; credentialId: string; transports: string[] }[]
  /** The confirmed app, where there is one. */
  app: { id: string; label: string | null; createdAt: Date; lastUsedAt: Date | null } | null
}

export async function factorsOf(personId: string): Promise<Factors> {
  const [passkeys, app] = await Promise.all([
    prisma.passkey.findMany({
      where: { personId, revokedAt: null },
      select: { id: true, label: true, createdAt: true, lastUsedAt: true, credentialId: true, transports: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.authenticatorApp.findFirst({
      where: { personId, revokedAt: null, confirmedAt: { not: null } },
      select: { id: true, label: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  return { passkeys, app }
}

export const factorCount = (f: Factors) => f.passkeys.length + (f.app ? 1 : 0)

/** The methods a person may check with, passkey first. */
export function methodsOf(f: Factors): Method[] {
  return [...(f.passkeys.length ? (['PASSKEY'] as const) : []), ...(f.app ? (['AUTHENTICATOR_APP'] as const) : [])]
}

function platformHost(env: Env = process.env): string {
  return env.NEXT_PUBLIC_PLATFORM_HOST || 'etyme.com'
}

// ── The check ────────────────────────────────────────────────────────

export interface CheckAsk {
  personId: string
  companyId: string | null
  act: unknown
  subjectId: unknown
  /** The address the page was opened at (`request.nextUrl.origin`). */
  origin: string
  surface?: SecuritySurface
}

function actAndSubject(a: CheckAsk): { act: CheckAct; subjectId: string } | null {
  if (!isCheckAct(a.act)) return null
  const subjectId = typeof a.subjectId === 'string' ? a.subjectId.trim() : ''
  return subjectId && subjectId.length <= 200 ? { act: a.act, subjectId } : null
}

/**
 * Begin a check: the methods the person holds, and for a passkey the
 * options the browser needs with a sealed ticket carrying the challenge.
 * Writes nothing.
 */
export async function beginCheck(a: CheckAsk): Promise<
  | { ok: true; methods: Method[]; passkey: { options: unknown; ticket: string } | null }
  | Refused
> {
  const key = secondCheckKey()
  if (!key) return refused(SAYS.notReady, 503, 'NOT_READY')
  const what = actAndSubject(a)
  if (!what) return refused(SAYS.unknownAct, 422, 'VALIDATION')
  const f = await factorsOf(a.personId)
  const methods = methodsOf(f)
  if (methods.length === 0) return refused(SAYS.noneYet, 409, 'NO_SECOND_CHECK')
  if (!f.passkeys.length) return { ok: true, methods, passkey: null }
  const rp = relyingParty(a.origin, platformHost())
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: 'required',
    allowCredentials: f.passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })),
  })
  const ticket = sealBlob(
    { p: a.personId, a: what.act, s: what.subjectId, c: options.challenge, r: rp.rpID, n: randomToken(18) },
    CHALLENGE_LABEL, CHALLENGE_SECONDS, key
  )
  return { ok: true, methods, passkey: { options, ticket } }
}

/** Failed checks in the window, not counting refusals for waiting or for a spent proof. */
async function failuresInWindow(personId: string, now: Date): Promise<number> {
  const rows = await prisma.securityEvent.findMany({
    where: { event: 'SECOND_CHECK_FAILED', actorPersonId: personId, at: { gte: new Date(now.getTime() - FAILURE_WINDOW_MINUTES * 60_000) } },
    select: { facts: true },
  })
  return rows.filter((r) => (r.facts as { stage?: string } | null)?.stage === 'CHECK').length
}

async function failed(a: CheckAsk, what: { act: string; subjectId: string } | null, method: Method | null, why: string, stage: 'CHECK' | 'WAIT' | 'SPEND'): Promise<void> {
  const doing = what && isCheckAct(what.act) ? CHECK_ACTS[what.act] : 'an act'
  await recordSecurityEvent({
    event: 'SECOND_CHECK_FAILED', surface: a.surface ?? 'WEB',
    says: `A second check to ${doing} did not pass.`,
    companyId: a.companyId, actorPersonId: a.personId, subjectPersonId: a.personId,
    method, targetKind: what?.act ?? null, targetId: what?.subjectId ?? null,
    facts: { stage, why },
  })
}

/**
 * Prove a check for one act: a passkey's answer to the ticket's challenge,
 * or a code from the authenticator app. On a pass, writes the passed row
 * and hands back a sealed proof naming the person, the act and the
 * subject, good for two minutes. On a fail, writes the failed row and
 * says why in a sentence.
 */
export async function proveCheck(
  a: CheckAsk & { ticket?: unknown; response?: unknown; code?: unknown },
  now: Date = new Date()
): Promise<{ ok: true; proof: string; method: Method } | Refused> {
  const key = secondCheckKey()
  if (!key) return refused(SAYS.notReady, 503, 'NOT_READY')
  const what = actAndSubject(a)
  if (!what) return refused(SAYS.unknownAct, 422, 'VALIDATION')

  if (mustWait(await failuresInWindow(a.personId, now))) {
    await failed(a, what, null, 'too many failed checks', 'WAIT')
    return refused(SAYS.wait, 429, 'WAIT')
  }

  const usingPasskey = a.response !== undefined && a.response !== null
  const method: Method = usingPasskey ? 'PASSKEY' : 'AUTHENTICATOR_APP'
  let passedId: string

  if (usingPasskey) {
    const t = openAnyAge<{ p: string; a: string; s: string; c: string; r: string; n: string }>(a.ticket, CHALLENGE_LABEL, key)
    if (!t || t.p !== a.personId || t.a !== what.act || t.s !== what.subjectId) {
      await failed(a, what, method, 'the ticket was not for this', 'CHECK')
      return refused(SAYS.proofElsewhere)
    }
    if (t.exp * 1000 < now.getTime()) {
      await failed(a, what, method, 'the challenge lapsed', 'CHECK')
      return refused(SAYS.proofLapsed)
    }
    const credentialId = String((a.response as { id?: unknown })?.id ?? '')
    const pk = credentialId
      ? await prisma.passkey.findFirst({ where: { credentialId, personId: a.personId, revokedAt: null } })
      : null
    if (!pk) {
      await failed(a, what, method, 'a passkey not held here', 'CHECK')
      return refused(SAYS.passkeyUnknown)
    }
    const rp = relyingParty(a.origin, platformHost())
    if (rp.rpID !== t.r) {
      await failed(a, what, method, 'another address', 'CHECK')
      return refused(SAYS.passkeyElsewhere)
    }
    let verified = false
    let newCounter = 0
    try {
      const v = await verifyAuthenticationResponse({
        response: a.response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
        expectedChallenge: t.c,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
        credential: { id: pk.credentialId, publicKey: new Uint8Array(pk.publicKey), counter: Number(pk.counter), transports: pk.transports as never },
      })
      verified = v.verified
      newCounter = v.authenticationInfo?.newCounter ?? 0
    } catch {
      verified = false
    }
    if (!verified) {
      await failed(a, what, method, 'the passkey did not confirm', 'CHECK')
      return refused(SAYS.passkeyFailed)
    }
    // The counter moves only from the value just read, so two answers
    // racing with one counter cannot both stand.
    const moved = await prisma.passkey.updateMany({
      where: { id: pk.id, counter: pk.counter },
      data: { counter: BigInt(newCounter), lastUsedAt: now },
    })
    if (moved.count !== 1) {
      await failed(a, what, method, 'the passkey was used twice at once', 'CHECK')
      return refused(SAYS.proofUsed)
    }
    // The challenge is used once: the passed row's id is made from it.
    passedId = `chk_${t.n}`
    const once = await recordSecurityEventOnce(passedId, passedRow(a, what, method))
    if (once === 'ALREADY') {
      await failed(a, what, method, 'the challenge was answered twice', 'CHECK')
      return refused(SAYS.proofUsed)
    }
    if (once === 'FAILED') return refused('The check could not be recorded, so it does not count. Try again.', 503, 'NOT_RECORDED')
  } else {
    const app = await prisma.authenticatorApp.findFirst({
      where: { personId: a.personId, revokedAt: null, confirmedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
    })
    if (!app) {
      await failed(a, what, method, 'no authenticator app here', 'CHECK')
      return refused(SAYS.noneYet, 409, 'NO_SECOND_CHECK')
    }
    const plain = openSecret(app.secretSealed, key)
    const secret = plain ? base32Decode(plain) : null
    if (!secret) {
      await failed(a, what, method, 'the app could not be read with this key', 'CHECK')
      return refused('Your authenticator app cannot be read here any more. Ask an Owner to reset your second check.', 409, 'NO_SECOND_CHECK')
    }
    const v = checkTotp({ secret, code: a.code, now, lastUsedStep: app.lastUsedStep })
    if (!v.ok) {
      await failed(a, what, method, v.why === 'USED' ? 'a code already used' : v.why === 'SHAPE' ? 'not six digits' : 'a wrong code', 'CHECK')
      return refused(v.why === 'USED' ? SAYS.codeUsed : v.why === 'SHAPE' ? SAYS.codeShape : SAYS.codeWrong)
    }
    // Spent at the database, from the step just read: two presses of one
    // code cannot both pass.
    const spent = await prisma.authenticatorApp.updateMany({
      where: { id: app.id, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: v.step } }] },
      data: { lastUsedStep: v.step, lastUsedAt: now },
    })
    if (spent.count !== 1) {
      await failed(a, what, method, 'a code already used', 'CHECK')
      return refused(SAYS.codeUsed)
    }
    passedId = `chk_${randomToken(18)}`
    const once = await recordSecurityEventOnce(passedId, passedRow(a, what, method))
    if (once !== 'WRITTEN') return refused('The check could not be recorded, so it does not count. Try again.', 503, 'NOT_RECORDED')
  }

  const proof = sealBlob({ e: passedId, p: a.personId, a: what.act, s: what.subjectId, m: method }, PROOF_LABEL, PROOF_SECONDS, key, now.getTime())
  return { ok: true, proof, method }
}

function passedRow(a: CheckAsk, what: { act: CheckAct; subjectId: string }, method: Method) {
  return {
    event: 'SECOND_CHECK_PASSED' as const, surface: a.surface ?? 'WEB',
    says: `A second check by ${method === 'PASSKEY' ? 'passkey' : 'authenticator app'} passed, to ${CHECK_ACTS[what.act]}.`,
    companyId: a.companyId, actorPersonId: a.personId, subjectPersonId: a.personId,
    method, targetKind: what.act, targetId: what.subjectId,
  }
}

/**
 * A proof, spent. Only `spendCheck` makes one, so a function that takes
 * it as a parameter cannot be called without a check spent on its act.
 */
declare const spentBrand: unique symbol
export type SpentCheck = { readonly passedId: string; readonly act: CheckAct; readonly subjectId: string; readonly method: Method; readonly [spentBrand]: true }

/**
 * Spend a proof on the one act and subject it was made for. Refused where
 * there is none, where it was made for another person, act or subject,
 * where it is more than two minutes old, and where it was spent before.
 * A refused spend writes a failed row; a spent one writes the used row.
 */
export async function spendCheck(
  i: { proof: unknown; personId: string; companyId: string | null; act: CheckAct; subjectId: string; surface?: SecuritySurface },
  now: Date = new Date()
): Promise<{ ok: true; check: SpentCheck } | Refused> {
  const key = secondCheckKey()
  if (!key) return refused(SAYS.notReady, 503, 'NOT_READY')
  const ask: CheckAsk = { personId: i.personId, companyId: i.companyId, act: i.act, subjectId: i.subjectId, origin: 'http://localhost', surface: i.surface }
  const what = { act: i.act, subjectId: i.subjectId }
  if (i.proof === undefined || i.proof === null || i.proof === '') return refused(SAYS.noProof)
  const p = openAnyAge<{ e: string; p: string; a: string; s: string; m: Method }>(i.proof, PROOF_LABEL, key)
  if (!p || p.p !== i.personId || p.a !== i.act || p.s !== i.subjectId) {
    await failed(ask, what, null, 'a proof made for something else', 'SPEND')
    return refused(SAYS.proofElsewhere)
  }
  if (p.exp * 1000 < now.getTime()) {
    await failed(ask, what, p.m, 'a proof more than two minutes old', 'SPEND')
    return refused(SAYS.proofLapsed)
  }
  const passed = await prisma.securityEvent.findUnique({
    where: { id: p.e },
    select: { event: true, actorPersonId: true, targetKind: true, targetId: true },
  })
  if (!passed || passed.event !== 'SECOND_CHECK_PASSED' || passed.actorPersonId !== i.personId || passed.targetKind !== i.act || passed.targetId !== i.subjectId) {
    await failed(ask, what, p.m, 'a proof with no passed check behind it', 'SPEND')
    return refused(SAYS.proofElsewhere)
  }
  const once = await recordSecurityEventOnce(`used_${p.e}`, {
    event: 'SECOND_CHECK_USED', surface: i.surface ?? 'WEB',
    says: `A second check was used to ${CHECK_ACTS[i.act]}.`,
    companyId: i.companyId, actorPersonId: i.personId, subjectPersonId: i.personId,
    method: p.m, targetKind: i.act, targetId: i.subjectId,
    facts: { passedEventId: p.e },
  })
  if (once === 'ALREADY') {
    await failed(ask, what, p.m, 'a proof already used', 'SPEND')
    return refused(SAYS.proofUsed)
  }
  if (once === 'FAILED') return refused('The check could not be recorded, so it does not count. Try again.', 503, 'NOT_RECORDED')
  return { ok: true, check: { passedId: p.e, act: i.act, subjectId: i.subjectId, method: p.m } as SpentCheck }
}

// ── Adding a passkey or an app ───────────────────────────────────────

export interface Adder {
  personId: string
  companyId: string | null
  email: string
  name: string
  /** When this session signed in, in milliseconds; null where it does not say. */
  authAt: number | null
  origin: string
}

/**
 * Start adding one: the first needs a sign-in within the last 15
 * minutes, each later one a proof spent on `second_check.add`. Hands back
 * a sealed ticket for the finish, and for a passkey the browser's options,
 * for an app its key and link, shown once.
 */
export async function startAdding(
  a: Adder & { kind: unknown; proof?: unknown; label?: unknown },
  now: Date = new Date()
): Promise<
  | { ok: true; kind: 'PASSKEY'; options: unknown; ticket: string }
  | { ok: true; kind: 'AUTHENTICATOR_APP'; key: string; link: string; ticket: string }
  | Refused
> {
  const key = secondCheckKey()
  if (!key) return refused(SAYS.notReady, 503, 'NOT_READY')
  if (a.kind !== 'PASSKEY' && a.kind !== 'AUTHENTICATOR_APP') return refused('Choose a passkey or an authenticator app.', 422, 'VALIDATION')
  const f = await factorsOf(a.personId)
  const live = factorCount(f)
  if (a.kind === 'AUTHENTICATOR_APP' && f.app) return refused(SAYS.oneAppOnly, 409, 'VALIDATION')
  let spentProof = false
  if (live > 0) {
    if (a.proof === undefined || a.proof === null || a.proof === '') return refused(SAYS.checkFirst)
    const s = await spendCheck({ proof: a.proof, personId: a.personId, companyId: a.companyId, act: 'second_check.add', subjectId: a.personId }, now)
    if (!s.ok) return s
    spentProof = true
  }
  const may = mayAddFactor({ keySet: true, liveFactors: live, authAt: a.authAt, spentProof, now })
  if (!may.ok) return refused(may.says, 403, live > 0 ? 'SECOND_CHECK' : 'SIGN_IN_AGAIN')

  if (a.kind === 'PASSKEY') {
    const rp = relyingParty(a.origin, platformHost())
    const options = await generateRegistrationOptions({
      rpName: 'Etyme',
      rpID: rp.rpID,
      userName: a.email,
      userDisplayName: a.name || a.email,
      userID: new TextEncoder().encode(a.personId),
      attestationType: 'none',
      excludeCredentials: f.passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    })
    const ticket = sealBlob({ p: a.personId, k: 'PASSKEY', c: options.challenge, r: rp.rpID }, ADDING_LABEL, ADDING_SECONDS, key, now.getTime())
    return { ok: true, kind: 'PASSKEY', options, ticket }
  }

  // An app started and never confirmed is no check; a new start replaces it.
  await prisma.authenticatorApp.deleteMany({ where: { personId: a.personId, confirmedAt: null } })
  const secret = newTotpSecret()
  const row = await prisma.authenticatorApp.create({
    data: { personId: a.personId, secretSealed: sealSecret(secret, key), label: labelOf(a.label) },
    select: { id: true },
  })
  const ticket = sealBlob({ p: a.personId, k: 'APP', i: row.id }, ADDING_LABEL, ADDING_SECONDS, key, now.getTime())
  return { ok: true, kind: 'AUTHENTICATOR_APP', key: secret, link: otpauthUri(secret, a.email), ticket }
}

function labelOf(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().slice(0, 60) : ''
  return s || null
}

/**
 * Finish adding one: the passkey's registration, or the app's first code.
 * Writes the row, the security log's row, and tells the person.
 */
export async function finishAdding(
  a: Adder & { ticket: unknown; response?: unknown; code?: unknown; label?: unknown },
  now: Date = new Date()
): Promise<{ ok: true; says: string } | Refused> {
  const key = secondCheckKey()
  if (!key) return refused(SAYS.notReady, 503, 'NOT_READY')
  const t = openBlob<{ p: string; k: 'PASSKEY' | 'APP'; c?: string; r?: string; i?: string }>(typeof a.ticket === 'string' ? a.ticket : null, ADDING_LABEL, key, now.getTime())
  if (!t || t.p !== a.personId) return refused(SAYS.addingLapsed, 409, 'VALIDATION')

  let method: Method
  if (t.k === 'PASSKEY') {
    method = 'PASSKEY'
    const rp = relyingParty(a.origin, platformHost())
    if (rp.rpID !== t.r) return refused(SAYS.passkeyElsewhere, 409, 'VALIDATION')
    let info: Awaited<ReturnType<typeof verifyRegistrationResponse>>['registrationInfo'] | undefined
    try {
      const v = await verifyRegistrationResponse({
        response: a.response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
        expectedChallenge: String(t.c),
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
      })
      info = v.verified ? v.registrationInfo : undefined
    } catch {
      info = undefined
    }
    if (!info) return refused('Your device did not make the passkey. Try again.', 422, 'VALIDATION')
    const taken = await prisma.passkey.findUnique({ where: { credentialId: info.credential.id }, select: { id: true } })
    if (taken) return refused('That passkey is already added.', 409, 'VALIDATION')
    await prisma.passkey.create({
      data: {
        personId: a.personId,
        credentialId: info.credential.id,
        publicKey: Buffer.from(info.credential.publicKey),
        counter: BigInt(info.credential.counter),
        transports: (info.credential.transports ?? []).map(String),
        backedUp: info.credentialBackedUp,
        deviceType: info.credentialDeviceType,
        label: labelOf(a.label),
      },
    })
  } else {
    method = 'AUTHENTICATOR_APP'
    const app = await prisma.authenticatorApp.findFirst({ where: { id: t.i, personId: a.personId, confirmedAt: null, revokedAt: null } })
    const plain = app ? openSecret(app.secretSealed, key) : null
    const secret = plain ? base32Decode(plain) : null
    if (!app || !secret) return refused(SAYS.addingLapsed, 409, 'VALIDATION')
    const v = checkTotp({ secret, code: a.code, now, lastUsedStep: null })
    if (!v.ok) return refused(v.why === 'SHAPE' ? SAYS.codeShape : SAYS.codeWrong, 422, 'VALIDATION')
    const set = await prisma.authenticatorApp.updateMany({
      where: { id: app.id, confirmedAt: null },
      data: { confirmedAt: now, lastUsedStep: v.step, lastUsedAt: now, ...(labelOf(a.label) ? { label: labelOf(a.label) } : {}) },
    })
    if (set.count !== 1) return refused(SAYS.addingLapsed, 409, 'VALIDATION')
  }

  const what = method === 'PASSKEY' ? 'A passkey' : 'An authenticator app'
  await recordSecurityEvent({
    event: 'SECOND_CHECK_ENROLLED', surface: 'WEB',
    says: `${what} was added for the second check.`,
    companyId: a.companyId, actorPersonId: a.personId, subjectPersonId: a.personId, method,
  })
  await tell(a.personId, a.companyId, 'A passkey or app was added', `${what} was added to your Etyme account on ${formatDay(now)}. ${IF_NOT_YOU}`)
  return { ok: true, says: `${what} is added. Etyme will ask for it before an act that needs a second check.` }
}

const IF_NOT_YOU = 'If this was not you, ask an Owner at your company to reset your second check, and write to support@etyme.com.'

/** Remove one of her own, after a check spent on removing that one. */
export async function removeFactor(
  a: { personId: string; companyId: string | null; factorId: unknown; proof: unknown },
  now: Date = new Date()
): Promise<{ ok: true; says: string } | Refused> {
  const id = typeof a.factorId === 'string' ? a.factorId : ''
  const [pk, app] = id
    ? await Promise.all([
        prisma.passkey.findFirst({ where: { id, personId: a.personId, revokedAt: null }, select: { id: true } }),
        prisma.authenticatorApp.findFirst({ where: { id, personId: a.personId, revokedAt: null }, select: { id: true } }),
      ])
    : [null, null]
  if (!pk && !app) return refused('That passkey or app is not one of yours, or it was already removed.', 404, 'NOT_FOUND')
  const s = await spendCheck({ proof: a.proof, personId: a.personId, companyId: a.companyId, act: 'second_check.remove', subjectId: id }, now)
  if (!s.ok) return s
  const method: Method = pk ? 'PASSKEY' : 'AUTHENTICATOR_APP'
  if (pk) await prisma.passkey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now, revokedById: a.personId } })
  else await prisma.authenticatorApp.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now, revokedById: a.personId } })
  const what = pk ? 'A passkey' : 'An authenticator app'
  await recordSecurityEvent({
    event: 'SECOND_CHECK_REMOVED', surface: 'WEB', says: `${what} was removed by its owner.`,
    companyId: a.companyId, actorPersonId: a.personId, subjectPersonId: a.personId, method, targetKind: method, targetId: id,
  })
  await tell(a.personId, a.companyId, 'A passkey or app was removed', `${what} was removed from your Etyme account on ${formatDay(now)}. ${IF_NOT_YOU}`)
  return { ok: true, says: `${what} is removed.` }
}

// ── A lost device ────────────────────────────────────────────────────

/** The seats at the company the reset form names: names and roles only, never what anybody holds. */
export async function resettableSeats(companyId: string, actorPersonId: string): Promise<{ personId: string; name: string; role: string | null }[]> {
  const seats = await seatsAt(companyId)
  const seen = new Set<string>()
  return seats
    .filter((s) => s.live && s.personId !== actorPersonId && !seen.has(s.personId) && seen.add(s.personId))
    .map((s) => ({ personId: s.personId, name: s.name, role: s.roleName }))
}

function seatOf(seats: readonly Seat[], personId: string, preferContextId?: string): Seat | null {
  const mine = seats.filter((s) => s.personId === personId)
  return mine.find((s) => s.contextId === preferContextId) ?? mine.find((s) => s.roleName === 'Owner' && s.live) ?? mine[0] ?? null
}

/**
 * Another Owner resets a person's second check: every passkey and app she
 * holds stops working, the reset is written to the security log, and
 * every Owner at the company and the person are told. Needs the resetter's
 * own check, spent on resetting this person. A refused reset is written
 * to the security log too.
 */
export async function resetSecondCheck(
  a: { actorPersonId: string; actorContextId: string; actorName: string; companyId: string; companyName: string; subjectPersonId: unknown; proof: unknown },
  now: Date = new Date()
): Promise<{ ok: true; says: string } | Refused> {
  const subjectId = typeof a.subjectPersonId === 'string' ? a.subjectPersonId : ''
  const seats = await seatsAt(a.companyId)
  const actor = seatOf(seats, a.actorPersonId, a.actorContextId)
  const subject = subjectId ? seatOf(seats, subjectId) : null
  const may = mayResetSecondCheck({ actor, subject, seats, companyName: a.companyName })
  if (!may.ok) {
    await recordSecurityEvent({
      event: 'SECOND_CHECK_RESET_REFUSED', surface: 'WEB', says: `A reset of a second check was refused: ${may.says}`,
      companyId: a.companyId, actorPersonId: a.actorPersonId, subjectPersonId: subject?.personId ?? null,
      facts: { actorRole: actor?.roleName ?? null, subjectRole: subject?.roleName ?? null },
    })
    return refused(may.says, subject ? 403 : 404, subject ? 'FORBIDDEN' : 'NOT_FOUND')
  }
  const s = await spendCheck({ proof: a.proof, personId: a.actorPersonId, companyId: a.companyId, act: 'second_check.reset', subjectId }, now)
  if (!s.ok) return s

  const [passkeys, apps] = await Promise.all([
    prisma.passkey.updateMany({ where: { personId: subjectId, revokedAt: null }, data: { revokedAt: now, revokedById: a.actorPersonId } }),
    prisma.authenticatorApp.updateMany({ where: { personId: subjectId, revokedAt: null }, data: { revokedAt: now, revokedById: a.actorPersonId } }),
  ])
  const subjectName = subject!.name
  await recordSecurityEvent({
    event: 'SECOND_CHECK_RESET', surface: 'WEB',
    says: `An Owner reset a colleague’s second check at ${a.companyName}.`,
    companyId: a.companyId, actorPersonId: a.actorPersonId, subjectPersonId: subjectId, method: s.check.method,
    facts: { passkeysRemoved: passkeys.count, appsRemoved: apps.count, passedEventId: s.check.passedId },
  })

  const day = formatDay(now)
  const owners = liveOwners(seats).filter((o) => o.personId !== subjectId)
  const told = new Set<string>()
  for (const o of owners) {
    if (told.has(o.personId)) continue
    told.add(o.personId)
    await tell(o.personId, a.companyId, 'A second check was reset',
      `${a.actorName} reset ${subjectName}’s second check at ${a.companyName} on ${day}. ` +
      `${subjectName} adds a new passkey or authenticator app under ${SECOND_CHECK_PLACE}.`)
  }
  await tell(subjectId, a.companyId, 'Your second check was reset',
    `${a.actorName} reset your second check at ${a.companyName} on ${day}. Your passkeys and authenticator app no longer work on Etyme. ` +
    `Add a new one under ${SECOND_CHECK_PLACE}. If you did not ask for this, tell another Owner and write to support@etyme.com.`)
  return { ok: true, says: `${subjectName}’s second check is reset. Every Owner at ${a.companyName} and ${subjectName} are told.` }
}

/** A notice in the app, and by email where email leaves. Never a code, never a link that acts. */
async function tell(personId: string, companyId: string | null, title: string, body: string): Promise<void> {
  try {
    await notify({ personId, ...(companyId ? { companyId } : {}), type: 'SYSTEM', title, body, channel: mailLeaves() ? 'EMAIL' : 'IN_APP' })
  } catch {
    // The act stands; a notice that could not be written does not undo it.
  }
}
