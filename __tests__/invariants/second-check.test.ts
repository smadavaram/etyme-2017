import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { codeAt, checkTotp, base32Encode, base32Decode, stepAt, otpauthUri, STEP_SECONDS } from '@/lib/identity/totp'
import {
  SAYS, FIRST_FACTOR_MINUTES, CHECK_ACTS, mayAddFactor, mayResetSecondCheck, ownResetSays, relyingParty, mustWait, isCheckAct,
} from '@/lib/identity/second-check-rules'
import { secondCheckKey } from '@/lib/identity/second-check-key'
import { askedFor } from '@/components/step-up/second-check-dialog'
import { assess, type ReadinessFacts } from '@/lib/readiness'
import type { Seat } from '@/lib/owner-rules'

/**
 * Layer 7, slices S1 and S6 (record 86, answers 2 and 5): the second
 * check's rules, with no database. Walked through the real routes in
 * __integration__/the-second-check.test.ts.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const RFC = Buffer.from('12345678901234567890', 'ascii')

describe('the authenticator app’s code', () => {
  it('computes the codes RFC 6238 publishes for SHA-1', () => {
    // The RFC's eight-digit values, last six digits.
    expect(codeAt(RFC, Math.floor(59 / STEP_SECONDS))).toBe('287082')
    expect(codeAt(RFC, Math.floor(1111111109 / STEP_SECONDS))).toBe('081804')
    expect(codeAt(RFC, Math.floor(1234567890 / STEP_SECONDS))).toBe('005924')
    expect(codeAt(RFC, Math.floor(2000000000 / STEP_SECONDS))).toBe('279037')
  })

  it('an authenticator code is accepted once and never again', () => {
    const now = new Date('2026-11-16T15:00:10Z')
    const code = codeAt(RFC, stepAt(now))
    const first = checkTotp({ secret: RFC, code, now, lastUsedStep: null })
    expect(first).toEqual({ ok: true, step: stepAt(now) })
    expect(checkTotp({ secret: RFC, code, now, lastUsedStep: stepAt(now) })).toEqual({ ok: false, why: 'USED' })
    // An older code typed after a newer one is used up too.
    const older = codeAt(RFC, stepAt(now) - 1)
    expect(checkTotp({ secret: RFC, code: older, now, lastUsedStep: stepAt(now) })).toEqual({ ok: false, why: 'USED' })
  })

  it('an authenticator code from two minutes ago is refused, and one step of clock drift is allowed', () => {
    const now = new Date('2026-11-16T15:00:10Z')
    expect(checkTotp({ secret: RFC, code: codeAt(RFC, stepAt(now) - 4), now, lastUsedStep: null }).ok).toBe(false)
    expect(checkTotp({ secret: RFC, code: codeAt(RFC, stepAt(now) - 1), now, lastUsedStep: null }).ok).toBe(true)
    expect(checkTotp({ secret: RFC, code: codeAt(RFC, stepAt(now) + 1), now, lastUsedStep: null }).ok).toBe(true)
    expect(checkTotp({ secret: RFC, code: codeAt(RFC, stepAt(now) + 2), now, lastUsedStep: null }).ok).toBe(false)
  })

  it('a code that is not six digits is refused for its shape', () => {
    const now = new Date('2026-11-16T15:00:10Z')
    for (const code of ['', '12345', '1234567', 'abcdef', null, 123456]) {
      expect(checkTotp({ secret: RFC, code, now, lastUsedStep: null })).toEqual({ ok: false, why: 'SHAPE' })
    }
  })

  it('the key reads the same after base32 and back, and the link carries it for the app', () => {
    const key = base32Encode(RFC)
    expect(key).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
    expect(base32Decode(key)!.equals(RFC)).toBe(true)
    expect(base32Decode('not base32!')).toBeNull()
    expect(otpauthUri(key, 'dana@harborline-tech.example')).toBe(
      'otpauth://totp/Etyme:dana%40harborline-tech.example?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Etyme&algorithm=SHA1&digits=6&period=30'
    )
  })
})

describe('who may add a passkey or an app', () => {
  const now = new Date('2026-11-16T15:00:00Z')
  const ago = (m: number) => now.getTime() - m * 60_000

  it('without the sealing key, adding one refuses in a sentence', () => {
    expect(mayAddFactor({ keySet: false, liveFactors: 0, authAt: ago(1), spentProof: false, now })).toEqual({ ok: false, says: SAYS.notReady })
    expect(secondCheckKey({})).toBeNull()
    expect(secondCheckKey({ ETYME_SECOND_CHECK_KEY: 'too short' })).toBeNull()
    expect(secondCheckKey({ ETYME_SECOND_CHECK_KEY: Buffer.alloc(32, 7).toString('base64') })).not.toBeNull()
  })

  it(`a first passkey or app needs a sign-in within the last ${FIRST_FACTOR_MINUTES} minutes`, () => {
    expect(mayAddFactor({ keySet: true, liveFactors: 0, authAt: ago(FIRST_FACTOR_MINUTES - 1), spentProof: false, now }).ok).toBe(true)
    expect(mayAddFactor({ keySet: true, liveFactors: 0, authAt: ago(FIRST_FACTOR_MINUTES + 1), spentProof: false, now })).toEqual({ ok: false, says: SAYS.signInAgain })
    expect(mayAddFactor({ keySet: true, liveFactors: 0, authAt: null, spentProof: false, now })).toEqual({ ok: false, says: SAYS.signInAgain })
  })

  it('a later one needs a check with one already held, however recent the sign-in', () => {
    expect(mayAddFactor({ keySet: true, liveFactors: 1, authAt: ago(1), spentProof: false, now })).toEqual({ ok: false, says: SAYS.checkFirst })
    expect(mayAddFactor({ keySet: true, liveFactors: 1, authAt: null, spentProof: true, now }).ok).toBe(true)
  })

  it('five failed checks make the person wait', () => {
    expect(mustWait(4)).toBe(false)
    expect(mustWait(5)).toBe(true)
  })

  it('a check is asked only for an act the list names', () => {
    expect(Object.keys(CHECK_ACTS).sort()).toEqual(['second_check.add', 'second_check.remove', 'second_check.reset'])
    expect(isCheckAct('second_check.reset')).toBe(true)
    expect(isCheckAct('payment_run.approve')).toBe(false)
    expect(isCheckAct('toString')).toBe(false)
  })
})

describe('a lost device', () => {
  const seat = (personId: string, name: string, roleName: string, live = true): Seat => ({ contextId: `c-${personId}`, personId, name, roleName, live })
  const dana = seat('dana', 'Dana Okafor', 'Owner')
  const lee = seat('lee', 'Lee Marsh', 'Owner')
  const ana = seat('ana', 'Ana Ruiz', 'Admin')
  const ravi = seat('ravi', 'Ravi Kohli', 'HR')
  const seats = [dana, lee, ana, ravi]
  const companyName = 'Harborline Tech'

  it('nobody resets their own second check, and is told which Owner can', () => {
    expect(mayResetSecondCheck({ actor: dana, subject: dana, seats, companyName })).toEqual({
      ok: false, says: 'Nobody resets their own second check. Ask another Owner at Harborline Tech: Lee Marsh.',
    })
  })

  it('an Admin never resets an Owner’s, nor anybody’s', () => {
    expect(mayResetSecondCheck({ actor: ana, subject: dana, seats, companyName })).toEqual({ ok: false, says: 'Only an Owner resets an Owner’s second check. An Admin never can.' })
    expect(mayResetSecondCheck({ actor: ana, subject: ravi, seats, companyName })).toEqual({ ok: false, says: 'Only an Owner resets a second check. An Admin never can.' })
  })

  it('an Owner resets another Owner’s, or a colleague’s; a paused Owner does not', () => {
    expect(mayResetSecondCheck({ actor: lee, subject: dana, seats, companyName }).ok).toBe(true)
    expect(mayResetSecondCheck({ actor: lee, subject: ravi, seats, companyName }).ok).toBe(true)
    expect(mayResetSecondCheck({ actor: { ...lee, live: false }, subject: ravi, seats, companyName }).ok).toBe(false)
  })

  it('the only Owner is told her own reset is Etyme’s recovery act, and that it is not built yet', () => {
    const alone = [dana, ana]
    expect(ownResetSays(alone, dana, companyName)).toBe(
      'Nobody resets their own second check, and you are the only Owner at Harborline Tech. Then it is Etyme’s recovery act, which is not built yet. Write to support@etyme.com.'
    )
  })
})

describe('where a passkey belongs', () => {
  it('every tenant address under the platform shares one, and any other address keeps its own', () => {
    expect(relyingParty('https://tapin.etyme.com', 'etyme.com')).toEqual({ rpID: 'etyme.com', origin: 'https://tapin.etyme.com' })
    expect(relyingParty('https://etyme.com', 'etyme.com').rpID).toBe('etyme.com')
    expect(relyingParty('https://preview-abc.vercel.app', 'etyme.com').rpID).toBe('preview-abc.vercel.app')
    expect(relyingParty('https://notetyme.com', 'etyme.com').rpID).toBe('notetyme.com')
    expect(relyingParty('http://localhost:3000', 'etyme.com')).toEqual({ rpID: 'localhost', origin: 'http://localhost:3000' })
  })
})

describe('the shared dialog and its routes', () => {
  it('a route that wants a check says which act and subject, and the dialog reads exactly that', () => {
    expect(askedFor({ error: { code: 'SECOND_CHECK', message: SAYS.noProof, act: 'second_check.reset', subjectId: 'p1' } })).toEqual({ act: 'second_check.reset', subjectId: 'p1' })
    expect(askedFor({ error: { code: 'FORBIDDEN', act: 'second_check.reset', subjectId: 'p1' } })).toBeNull()
    expect(askedFor({ error: { code: 'SECOND_CHECK', act: 'invented.act', subjectId: 'p1' } })).toBeNull()
    for (const f of ['src/app/api/settings/second-check/route.ts', 'src/app/api/settings/second-check/reset/route.ts']) {
      expect(read(f), f).toMatch(/r\.code === 'SECOND_CHECK' \? \{ act: 'second_check\.[a-z]+', subjectId:/)
    }
  })

  it('no screen, sentence or notice calls the check a step of signing in', () => {
    for (const f of [
      'src/lib/identity/second-check-words.ts', 'src/lib/identity/second-check-rules.ts', 'src/lib/identity/second-check.ts',
      'src/components/step-up/second-check-dialog.tsx', 'src/app/dashboard/settings/second-check/page.tsx',
      'src/components/shell/second-check-line.tsx',
    ]) {
      expect(read(f), f).not.toMatch(/two-step|2-step|two-factor|2FA|MFA|multi-factor/i)
    }
  })

  it('the account menu offers Second check on the desktop and the phone', () => {
    for (const f of ['src/components/shell/header.tsx', 'src/components/shell/mobile-nav.tsx']) expect(read(f), f).toContain('<SecondCheckLine')
  })
})

describe('/ready', () => {
  const base: ReadinessFacts = {
    env: { database: true, nextauthSecret: true, cronSecret: true, microsoft: false, google: false, emailLink: false, emailSender: false, anthropic: false },
    db: { reachable: true, schemaCurrent: true, ms: 1 },
    realCompanies: 0, realSignIns: 0, imports: { total: 0, committed: 0 }, email: { sent: 0, unsent: 0 },
    teams: { channels: 0, retired: 0, posted: 0 } as unknown as ReadinessFacts['teams'],
    cron: { tracked: false, lastRunAt: null, lastBroke: 0 },
    watch: { staffConfigured: false, alertsSent: 0, incidentsToday: 0 },
    demo: { seeded: false, current: false }, privacyContact: false,
  }
  const edge = (secondCheck: ReadinessFacts['secondCheck']) => assess({ ...base, secondCheck }).edges.find((e) => e.key === 'second-check')

  it('shows the second check missing without its key, set before anybody passed one, and proven after', () => {
    expect(edge({ keySet: false, passed: 0 })).toMatchObject({ state: 'MISSING', required: false })
    expect(edge({ keySet: false, passed: 0 })!.fix).toContain('ETYME_SECOND_CHECK_KEY')
    expect(edge({ keySet: true, passed: 0 })).toMatchObject({ state: 'SET' })
    expect(edge({ keySet: true, passed: 2 })).toMatchObject({ state: 'PROVEN', says: '2 second checks have passed on this deployment.' })
    expect(edge(undefined)).toBeUndefined()
  })
})
