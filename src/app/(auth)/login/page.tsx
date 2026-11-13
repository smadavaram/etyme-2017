'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, getSession, signOut } from 'next-auth/react'
import { DoorFrame, DoorLabel, DoorDivider, DoorWho, doorField, doorButton, doorOutline } from '../door-frame'
import { readJson } from '@/lib/read-response'
import {
  signInRefusal, PICK_ANOTHER_ACCOUNT, SIGN_IN_HEADING, WELCOME_BACK, SIGN_IN, CONTINUE, OR_USE_YOUR_EMAIL,
  EMAIL_HINT, TYPE_YOUR_EMAIL, TYPE_YOUR_PASSWORD, signUpWith, looksLikeEmail, type SignInDoor,
  orderDoors, readLastDoor, rememberDoor, takeRetry, didNotFinish, emailFromLink,
  USE_ANOTHER_ACCOUNT, AFTER_ANOTHER_ACCOUNT, middleEllipsis, directoryCardSays, continueToDirectory,
  accountButtons, type RememberedDoor, type Retry, type RetryDoor,
} from '@/lib/login-doors'
import { AccountButtons, AccountDoorButton, useKnownDoors } from '../account-doors'

/**
 * Signing in: the account buttons first, then the email (founder,
 * 2026-11-12, evening: "I meant how a new user signs up, or Google sign
 * in, or Microsoft sign in, or LinkedIn sign in, and then if the user
 * wants to use username and password or directory sign in"). The look is
 * the page's own, unchanged; only the order and the words moved.
 *
 * The first screen: "Sign in to Etyme", "New here? Sign up", Continue
 * with Google, Microsoft and LinkedIn where this deployment holds their
 * keys (the door this browser used last first), then "or use your email",
 * one Email box and the one filled button, Continue.
 *
 * Continue asks /api/auth/doors which door that address's company allows,
 * exactly as before: a company's own directory is gone to at once; an
 * address with the password door gets the second screen (the address,
 * Change, Password, Sign in, Forgot your password?); an address whose only
 * doors are account buttons gets those buttons. The answer is decided from
 * the domain, never from whether the address has an account.
 *
 * No button is greyed out for an empty field: it can be pressed and says
 * what is missing. A button is disabled only while its own request is in
 * flight, and its words say so.
 *
 * An account button a directory-only company refused comes back with a
 * sealed proof (lib/identity/door-proof); the page hands it to the doors
 * route and draws that company's directory screen. A round trip that did
 * not finish draws the provider tried first and filled, "Try Google
 * again", with the address kept in this tab only.
 */

/** The prefix the door puts on a refusal for an unconfirmed address. Kept in step with lib/password. */
const UNVERIFIED = 'UNVERIFIED:'

type Directory = { email: string; company: string; start: string | null; says: string | null }

export default function LoginPage() {
  const router = useRouter()
  // Undefined while the session is read; null for nobody; the address for somebody.
  const [signedIn, setSignedIn] = useState<string | null | undefined>(undefined)
  // A Microsoft, Google or LinkedIn sign-in that came back refused says why.
  const [sentBack, setSentBack] = useState<string | null>(null)
  const [retry, setRetry] = useState<Retry | null>(null)
  const [another, setAnother] = useState(false)
  const [devEmail, setDevEmail] = useState<string | null>(null)
  const [lastDoor, setLastDoor] = useState<RememberedDoor | null>(null)
  const [directory, setDirectory] = useState<Directory | null>(null)
  const available = useKnownDoors()

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
    // A directory-only company refused an account button: the sealed proof
    // that the address just went through that provider is handed to the
    // doors route once, and taken off the address bar.
    const proof = code === 'DirectoryOnly' ? params.get('proof') : null
    if (proof) {
      params.delete('proof')
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
      fetch('/api/auth/doors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proof }) })
        .then((r) => readJson(r))
        .then((j) => {
          if (j?.data?.directory) {
            setDirectory(j.data.directory)
            setSentBack(null)
          }
        })
        .catch(() => {})
    }
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
    if (asking) return
    if (!looksLikeEmail(email)) {
      setEmailRefused(TYPE_YOUR_EMAIL)
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
    setDirectory(null)
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!password) {
      setRefusal(TYPE_YOUR_PASSWORD); setUnconfirmed(false); setResent(null)
      return
    }
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
    if (busy) return
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

  // The second screen: the password where the route named it, and any
  // account buttons it named, in the one order (lib/login-doors).
  const ordered = doors ? orderDoors(doors, lastDoor) : []
  const offersPassword = ordered.includes('password')
  const buttonsOnly = ordered.filter((d): d is RetryDoor => d === 'google' || d === 'microsoft' || d === 'linkedin')
  const retried = retry?.door ?? null

  let screen: React.ReactNode
  if (signedIn) {
    /* Already signed in: one filled button, and /start decides the seat. */
    screen = (
      <div data-signed-in className="space-y-3">
        <a href="/start" aria-label={`${CONTINUE} as ${signedIn}`} className={`${doorButton} block text-center`}>
          <span className="block">{CONTINUE}</span>
          <span className="block text-xs font-normal text-white/80 truncate" title={signedIn}>{middleEllipsis(signedIn)}</span>
        </a>
        <button type="button" onClick={() => signOut({ callbackUrl: AFTER_ANOTHER_ACCOUNT })} className={doorOutline}>
          {USE_ANOTHER_ACCOUNT}
        </button>
      </div>
    )
  } else if (directory) {
    /* A directory-only company, after one of its people pressed an account button. */
    screen = (
      <div data-directory>
        <DoorWho email={directory.email} onChange={change} />
        <div className="mb-5 rounded-lg border border-etyme-rule bg-etyme-raised px-3.5 py-3 text-sm text-etyme-ink">
          {directory.says ?? directoryCardSays(directory.company)}
        </div>
        {directory.start && (
          <button type="button" onClick={() => window.location.assign(directory.start!)} className={doorButton}>
            {continueToDirectory(directory.company)}
          </button>
        )}
      </div>
    )
  } else if (doors !== null) {
    /* The second screen: the address, Change, and only its doors. */
    screen = (
      <div>
        <DoorWho email={email.trim()} onChange={change} />
        {doorsSay && <p role="alert" className="mb-5 text-sm text-etyme-attention">{doorsSay}</p>}
        {offersPassword ? (
          <form className="space-y-4" onSubmit={signInWithPassword} noValidate>
            <div>
              <DoorLabel htmlFor="pw">Password</DoorLabel>
              <input id="pw" type="password" autoFocus autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} className={doorField} />
            </div>
            {refusal && <p role="alert" className="text-sm text-etyme-attention">{refusal}</p>}
            {unconfirmed && (
              <button type="button" onClick={resend} disabled={busy}
                className="text-sm text-etyme-action-press hover:underline disabled:opacity-50">
                {busy ? 'Sending…' : 'Send the link again'}
              </button>
            )}
            {resent && <p className="text-sm text-etyme-ink">{resent}</p>}
            <button type="submit" data-door="sign-in" disabled={busy} className={doorButton}>
              {busy ? 'Signing in…' : SIGN_IN}
            </button>
            <p className="text-xs"><a href="/reset" className="text-etyme-action-press hover:underline">Forgot your password?</a></p>
          </form>
        ) : (
          <div className="space-y-3">
            {buttonsOnly.map((d, i) => (
              <AccountDoorButton key={d} door={d} callbackUrl="/start" email={email.trim()} autoFocus={i === 0} />
            ))}
          </div>
        )}
      </div>
    )
  } else {
    /* The first screen: the account buttons, then the email. */
    screen = (
      <>
        {devEmail && (
          <div className="mb-6 rounded-lg border border-etyme-rule bg-etyme-canvas p-3">
            <p className="text-[13px] text-etyme-ink mb-2">
              This build is running with a development session as{' '}
              <span className="font-medium">{devEmail}</span>. No sign-in is needed.
            </p>
            <Link href="/dashboard" className="text-[13px] font-medium text-etyme-action-press hover:underline">
              Continue to Etyme
            </Link>
          </div>
        )}
        <AccountButtons available={available} callbackUrl="/start" email={email.trim()} retry={retried} />
        {/* While the list of providers is not known, nothing above the email is drawn, and no divider either. */}
        <AccountDividerWhen available={available} />
        <form className="space-y-3" onSubmit={askDoors} noValidate>
          <div>
            <DoorLabel htmlFor="email">Email</DoorLabel>
            <input id="email" type="email" inputMode="email" autoComplete="email" value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailRefused(null) }} placeholder="you@company.com" className={doorField} />
          </div>
          {emailRefused && <p role="alert" className="text-sm text-etyme-attention">{emailRefused}</p>}
          <button type="submit" data-door="continue" disabled={asking} className={retried ? doorOutline : doorButton}>
            {asking ? 'Checking…' : CONTINUE}
          </button>
          <p className="text-xs text-etyme-muted">{EMAIL_HINT}</p>
        </form>
      </>
    )
  }

  return (
    <DoorFrame>
      <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-1">{signedIn ? WELCOME_BACK : SIGN_IN_HEADING}</h1>

      {/* Nothing but the heading until the session read answers, so no form flashes. */}
      {signedIn !== undefined && (
        <>
          {!signedIn ? (
            <p className="text-sm text-etyme-muted mb-6">
              New here?{' '}
              <a href={signUpWith(email)} data-door="create" className="text-etyme-action-press hover:underline">Sign up</a>
            </p>
          ) : <div className="mb-6" />}
          {sentBack && <p role="alert" className="mb-5 text-sm text-etyme-attention">{sentBack}</p>}
          {another && !signedIn && <p className="mb-5 text-sm text-etyme-ink">{PICK_ANOTHER_ACCOUNT}</p>}

          {screen}

          <p className="text-xs text-etyme-muted mt-6 text-center">
            By continuing, you agree to the Etyme{' '}
            <Link href="/terms" className="text-etyme-action-press hover:underline">Terms of Service</Link>.
          </p>
        </>
      )}
    </DoorFrame>
  )
}

/** "or use your email", drawn only where at least one account button is. */
function AccountDividerWhen({ available }: { available: ReturnType<typeof useKnownDoors> }) {
  return accountButtons(available, null).length > 0 ? <DoorDivider words={OR_USE_YOUR_EMAIL} /> : <div className="mt-1" />
}
