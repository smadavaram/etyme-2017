'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, getSession, signOut } from 'next-auth/react'
import { DoorFrame, DoorLabel, doorField, doorButton } from '../door-frame'
import { readJson } from '@/lib/read-response'
import {
  signInRefusal, PICK_ANOTHER_ACCOUNT, LINKEDIN_DOOR_SAYS,
  WELCOME, CREATE_ACCOUNT, SIGN_IN, signUpWith, looksLikeEmail, type SignInDoor,
  orderDoors, readLastDoor, rememberDoor, takeRetry, didNotFinish, emailFromLink,
  OR_USE_A_PASSWORD, TRY_AGAIN, continueAs, USE_ANOTHER_ACCOUNT, AFTER_ANOTHER_ACCOUNT,
  type RememberedDoor, type Retry,
} from '@/lib/login-doors'
import { AccountDoorButton, startAccountDoor } from '../account-doors'

/**
 * Signing in, the email first (founder, 2026-11-12: "Rebuild this path
 * really simple"; CLAUDE.md "The sign-in page asks for the email first").
 *
 * The first screen is one email box and two buttons of equal size, Create
 * your account first, because most people arriving are new. "Sign in" asks
 * /api/auth/doors which door that address's company allows and draws only
 * that: its directory (the page goes straight there), Google or Microsoft
 * where this deployment holds their keys, or a password. Nobody at a
 * directory-only company ever sees a password box. The answer is decided
 * from the domain, never from whether the address has an account, so the
 * page reveals nobody.
 *
 * The second screen draws in one order (`orderDoors`): Google and
 * Microsoft first, then LinkedIn, then the password under "or use a
 * password". The door this browser used last goes first where the address
 * is offered it. A password that is the only door is drawn alone.
 *
 * A browser already signed in is shown only "Continue as <address>" and
 * "Use another account" (fault 2, 2026-11-12); /start decides the seat.
 * Until the session read answers, only the heading is drawn.
 *
 * A provider's round trip that did not finish comes back with a code and
 * is offered Try again, which starts the same provider afresh with the
 * address kept in this tab only (lib/login-doors `keepRetry`).
 */

/** The prefix the door puts on a refusal for an unconfirmed address. Kept in step with lib/password. */
const UNVERIFIED = 'UNVERIFIED:'

const outlineButton =
  'w-full px-4 py-2.5 rounded-lg border border-etyme-action text-sm font-medium text-etyme-action-press ' +
  'hover:bg-etyme-canvas transition-colors disabled:opacity-50'

function Divider({ words }: { words: string }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-etyme-rule" />
      <span className="text-xs text-etyme-muted">{words}</span>
      <div className="flex-1 h-px bg-etyme-rule" />
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  // Undefined while the session is read; null for nobody; the address for somebody.
  const [signedIn, setSignedIn] = useState<string | null | undefined>(undefined)
  // A Microsoft or Google sign-in that came back refused says why.
  const [sentBack, setSentBack] = useState<string | null>(null)
  const [retry, setRetry] = useState<Retry | null>(null)
  const [another, setAnother] = useState(false)
  const [devEmail, setDevEmail] = useState<string | null>(null)
  const [lastDoor, setLastDoor] = useState<RememberedDoor | null>(null)

  const [email, setEmail] = useState('')
  // Null on the first screen; the doors for the address once asked.
  const [doors, setDoors] = useState<SignInDoor[] | null>(null)
  const [doorsSay, setDoorsSay] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [emailRefused, setEmailRefused] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [resent, setResent] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('error')
    // Read once and cleared, whatever the code: Try again only follows a
    // round trip that did not finish.
    const kept = takeRetry()
    if (didNotFinish(code) && kept) setRetry(kept)
    setSentBack(signInRefusal(code))
    setAnother(params.get('another') === '1')
    // The address a link carried fills the box, and nothing else happens.
    const typed = (didNotFinish(code) && kept?.email) || emailFromLink(params.get('email'))
    if (typed) setEmail(typed)
    setLastDoor(readLastDoor())
    getSession()
      .then((s) => setSignedIn(s?.user?.email ?? null))
      .catch(() => setSignedIn(null))
    fetch('/api/auth/dev-session')
      .then((r) => r.json())
      .then((b) => setDevEmail(b?.data?.active ? b.data.email : null))
      .catch(() => setDevEmail(null))
  }, [])

  async function askDoors(e: React.FormEvent) {
    e.preventDefault()
    if (!looksLikeEmail(email)) {
      setEmailRefused('Type your email address, like you@company.com.')
      return
    }
    setAsking(true); setEmailRefused(null)
    try {
      const j = await readJson(await fetch('/api/auth/doors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }),
      }))
      if (j.data.start) {
        // The company's own directory: no second screen.
        window.location.assign(j.data.start)
        return
      }
      setDoors(j.data.doors)
      setDoorsSay(j.data.says)
    } catch (err: any) {
      setEmailRefused(err.message)
    } finally {
      setAsking(false)
    }
  }

  function change() {
    setDoors(null); setDoorsSay(null); setPassword(''); setRefusal(null); setUnconfirmed(false); setResent(null)
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setRefusal(null); setUnconfirmed(false); setResent(null)
    const res = await signIn('credentials', { email: email.trim(), password, redirect: false })
    setBusy(false)
    if (res?.ok && !res.error) {
      rememberDoor('password')
      router.push('/start')
      return
    }
    const said = res?.error ?? 'That email and password do not match.'
    if (said.startsWith(UNVERIFIED)) {
      setUnconfirmed(true)
      setRefusal(said.slice(UNVERIFIED.length))
    } else if (said === 'CredentialsSignin') {
      setRefusal('That email and password do not match.')
    } else {
      // A bare code (a sign-in the server could not finish) is said as its sentence.
      setRefusal(/^[A-Za-z]+$/.test(said) ? (signInRefusal(said) ?? 'That email and password do not match.') : said)
    }
  }

  async function resend() {
    setBusy(true)
    try {
      const j = await readJson(await fetch('/api/auth/password/resend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }),
      }))
      setResent(j.data.says)
    } catch (err: any) {
      setResent(err.message)
    } finally {
      setBusy(false)
    }
  }

  // The second screen's doors, in the one order (lib/login-doors).
  const ordered = doors ? orderDoors(doors, lastDoor) : []
  const passwordAlone = ordered.length === 1 && ordered[0] === 'password'

  function door(d: SignInDoor, i: number) {
    const first = i === 0
    // The line between two doors: over the password, "or use a password";
    // under a password drawn first, a plain "or".
    const divider = i === 0 ? null : d === 'password' ? OR_USE_A_PASSWORD : ordered[i - 1] === 'password' ? 'or' : null
    const space = i > 0 && !divider ? 'mt-3' : ''
    if (d === 'google' || d === 'microsoft') {
      return (
        <div key={d} className={space}>
          {divider && <Divider words={divider} />}
          <AccountDoorButton door={d} callbackUrl="/start" email={email.trim()} autoFocus={first} />
        </div>
      )
    }
    if (d === 'linkedin') {
      return (
        <div key={d} className={space}>
          {divider && <Divider words={divider} />}
          <button type="button" autoFocus={first} data-door="linkedin"
            onClick={() => startAccountDoor('linkedin', '/start', email.trim())}
            className="w-full px-4 py-2.5 rounded-lg border border-etyme-rule text-sm font-medium text-etyme-ink hover:bg-etyme-canvas">
            Continue with LinkedIn
          </button>
          <p className="text-xs text-etyme-muted mt-1 text-center">{LINKEDIN_DOOR_SAYS}</p>
        </div>
      )
    }
    if (d === 'password') {
      return (
        <div key={d}>
          {divider && !passwordAlone && <Divider words={divider} />}
          <form className="space-y-4" onSubmit={signInWithPassword}>
            <div>
              <DoorLabel htmlFor="pw">Password</DoorLabel>
              <input id="pw" type="password" required autoFocus={first} autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} className={doorField} />
            </div>
            {refusal && <p role="alert" className="text-sm text-etyme-attention">{refusal}</p>}
            {unconfirmed && (
              <button type="button" onClick={resend} disabled={busy}
                className="text-sm text-etyme-action-press hover:underline disabled:opacity-50">
                Send the link again
              </button>
            )}
            {resent && <p className="text-sm text-etyme-ink">{resent}</p>}
            <button type="submit" disabled={busy || !password} className={doorButton}>
              {busy ? 'Signing in…' : SIGN_IN}
            </button>
            <p className="text-xs"><a href="/reset" className="text-etyme-action-press hover:underline">Forgot your password?</a></p>
          </form>
        </div>
      )
    }
    return null
  }

  return (
    <DoorFrame>
      <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-6">{WELCOME}</h1>

      {/* Nothing but the heading until the session read answers, so no form flashes. */}
      {signedIn !== undefined && (
        <>
          {sentBack && <p role="alert" className="mb-4 text-sm text-etyme-attention">{sentBack}</p>}
          {retry && !signedIn && (
            <button type="button" data-door="try-again" onClick={() => startAccountDoor(retry.door, '/start', retry.email)}
              className={`${doorButton} mb-6`}>
              {TRY_AGAIN}
            </button>
          )}
          {another && <p className="mb-6 text-sm text-etyme-ink">{PICK_ANOTHER_ACCOUNT}</p>}

          {signedIn ? (
            /* Already signed in: one card, and /start decides the seat. */
            <div data-signed-in className="space-y-3">
              <a href="/start" className={`${doorButton} block text-center break-all`}>{continueAs(signedIn)}</a>
              <button type="button" onClick={() => signOut({ callbackUrl: AFTER_ANOTHER_ACCOUNT })} className={outlineButton}>
                {USE_ANOTHER_ACCOUNT}
              </button>
            </div>
          ) : (
            <>
              {devEmail && (
                <div className="mb-6 rounded-lg border border-etyme-rule bg-etyme-canvas p-3">
                  <p className="text-[13px] text-etyme-ink mb-2">
                    This build is running with a development session as{' '}
                    <span className="font-medium">{devEmail}</span>. No sign-in is needed.
                  </p>
                  <Link href="/dashboard"
                    className="inline-block px-4 py-2 rounded-lg bg-etyme-navy text-white text-[13px] font-medium hover:bg-etyme-ink transition-colors">
                    Continue to Etyme
                  </Link>
                </div>
              )}

              {doors === null ? (
                /* The first screen: one email box, two buttons of equal size, Create first. */
                <form className="space-y-3" onSubmit={askDoors}>
                  <div>
                    <DoorLabel htmlFor="email">Email</DoorLabel>
                    <input id="email" type="email" required autoComplete="email" value={email}
                      onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={doorField} />
                  </div>
                  {emailRefused && <p role="alert" className="text-sm text-etyme-attention">{emailRefused}</p>}
                  <div className="pt-1 space-y-3">
                    <button type="button" data-door="create" onClick={() => window.location.assign(signUpWith(email))} className={doorButton}>
                      {CREATE_ACCOUNT}
                    </button>
                    <button type="submit" data-door="sign-in" disabled={asking} className={outlineButton}>
                      {asking ? 'One moment…' : SIGN_IN}
                    </button>
                  </div>
                </form>
              ) : (
                /* The second screen: the address, Change, and only its doors, in one order. */
                <div>
                  <div className="flex items-center justify-between gap-3 mb-5 rounded-lg border border-etyme-rule bg-etyme-canvas px-3.5 py-2.5">
                    <span className="text-sm text-etyme-ink truncate">{email.trim()}</span>
                    <button type="button" onClick={change} className="text-sm text-etyme-action-press hover:underline shrink-0">Change</button>
                  </div>

                  {doorsSay && <p role="alert" className="mb-5 text-sm text-etyme-attention">{doorsSay}</p>}

                  {ordered.map(door)}
                </div>
              )}
            </>
          )}

          <p className="text-xs text-etyme-muted mt-6 text-center">
            By continuing, you agree to the Etyme{' '}
            <Link href="/terms" className="text-etyme-action-press hover:underline">Terms of Service</Link>.
          </p>
        </>
      )}
    </DoorFrame>
  )
}
