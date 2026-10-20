'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { DoorFrame, DoorLabel, doorField, doorButton } from '../door-frame'
import { readJson } from '@/lib/read-response'
import { offers, loginSubtitle, signInRefusal, PICK_ANOTHER_ACCOUNT } from '@/lib/login-doors'
import { AccountDoors, useKnownDoors } from '../account-doors'
import { AnotherAccount } from '../another-account'

/**
 * Signing in.
 *
 * There is no separate sign-up. Whether a company already exists for your
 * email domain is something the system can work out, so both buttons land
 * on /start, which either joins you to your colleagues or sets the company
 * up (src/lib/onboarding.ts).
 *
 * The buttons used to render and do nothing at all — the page looked
 * finished and was a picture of itself.
 *
 * They now also ask NextAuth which ways in exist before offering them. A
 * Microsoft button that redirects to an error page because nobody set the
 * tenant credentials is worse than no Microsoft button: the person cannot
 * tell whether they are locked out or the product is broken, and an
 * enterprise buyer only tries once.
 *
 * The email-and-password form sits above them and is always offered
 * (founder, 2026-10-08, "A password door"): it needs no provider key, so
 * this page no longer says no way in is switched on. A refusal is the
 * door's own sentence; an address nobody confirmed yet is offered its
 * link again (lib/password-door).
 *
 * It sits in the same frame as sign-up, confirm and reset (round two of
 * the sign-up walk, item 44): serif heading, warm canvas, the category
 * sentence and the home page's four steps beside it, and a Terms of
 * Service that is a link. The old footer said a personal address always
 * signs in as a consultant, which stopped being true when the one-person
 * firm could sign up on one.
 */

/** The prefix the door puts on a refusal for an unconfirmed address. Kept in step with lib/password. */
const UNVERIFIED = 'UNVERIFIED:'

export default function LoginPage() {
  const available = useKnownDoors()
  // A Microsoft or Google sign-in that came back refused says why.
  const [sentBack, setSentBack] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [devEmail, setDevEmail] = useState<string | null>(null)
  const router = useRouter()
  const [pwEmail, setPwEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [resent, setResent] = useState<string | null>(null)
  // Back from "Not you? Use another account": signed out, and told so.
  const [another, setAnother] = useState(false)

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setRefusal(null); setUnconfirmed(false); setResent(null)
    const res = await signIn('credentials', { email: pwEmail.trim(), password, redirect: false })
    setBusy(false)
    if (res?.ok && !res.error) {
      router.push('/start')
      return
    }
    const said = res?.error ?? 'That email and password do not match.'
    if (said.startsWith(UNVERIFIED)) {
      setUnconfirmed(true)
      setRefusal(said.slice(UNVERIFIED.length))
    } else {
      setRefusal(said === 'CredentialsSignin' ? 'That email and password do not match.' : said)
    }
  }

  async function resend() {
    setBusy(true)
    try {
      const j = await readJson(await fetch('/api/auth/password/resend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pwEmail.trim() }),
      }))
      setResent(j.data.says)
    } catch (err: any) {
      setResent(err.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setSentBack(signInRefusal(params.get('error')))
    setAnother(params.get('another') === '1')

    // The bypass already decides who the app thinks you are in development.
    // Saying so here is the difference between a preview somebody can open
    // and a front door that is honest and shut.
    fetch('/api/auth/dev-session')
      .then((r) => r.json())
      .then((b) => setDevEmail(b?.data?.active ? b.data.email : null))
      .catch(() => setDevEmail(null))
  }, [])

  // Null means we do not know yet, so no door beyond the password is
  // drawn: a button that shows for a second and vanishes is a promise the
  // deployment cannot keep (lib/login-doors).
  const has = (id: string) => offers(available, id)
  // The password door is always there, so "nothing works" means no
  // identity provider and no way to confirm an email either.
  const nothingWorks = available !== null && [...available].every((id) => id === 'credentials')

  return (
    <DoorFrame>
          <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-1">Sign in to Etyme</h1>
          <p className="text-sm text-etyme-muted mb-8">
            {loginSubtitle(available)}
          </p>

          {devEmail && (
            <div className="mb-6 rounded-lg border border-etyme-rule bg-etyme-canvas p-3">
              <p className="text-[13px] text-etyme-ink mb-2">
                This build is running with a development session as{' '}
                <span className="font-medium">{devEmail}</span>. No sign-in is needed.
              </p>
              <Link
                href="/dashboard"
                className="inline-block px-4 py-2 rounded-lg bg-etyme-navy text-white
                           text-[13px] font-medium hover:bg-etyme-ink transition-colors"
              >
                Continue to Etyme
              </Link>
            </div>
          )}

          {sentBack && <p role="alert" className="mb-6 text-sm text-etyme-attention">{sentBack}</p>}
          {another && <p className="mb-6 text-sm text-etyme-ink">{PICK_ANOTHER_ACCOUNT}</p>}
          {/* Already signed in as somebody: say who, and offer the way out (founder, 2026-10-20). */}
          <AnotherAccount className="mb-6" />

          {/* Email and password — always offered */}
          <form className="space-y-4 mb-6" onSubmit={signInWithPassword}>
            <div>
              <DoorLabel htmlFor="pw-email">Email</DoorLabel>
              <input
                id="pw-email"
                type="email"
                required
                autoComplete="email"
                value={pwEmail}
                onChange={(e) => setPwEmail(e.target.value)}
                placeholder="you@company.com"
                className={doorField}
              />
            </div>
            <div>
              <DoorLabel htmlFor="pw">Password</DoorLabel>
              <input
                id="pw"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={doorField}
              />
            </div>
            {refusal && <p role="alert" className="text-sm text-etyme-attention">{refusal}</p>}
            {unconfirmed && (
              <button type="button" onClick={resend} disabled={busy}
                className="text-sm text-etyme-action-press hover:underline disabled:opacity-50">
                Send the link again
              </button>
            )}
            {resent && <p className="text-sm text-etyme-ink">{resent}</p>}
            <button
              type="submit"
              disabled={busy || !pwEmail.trim() || !password}
              className={doorButton}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <div className="flex justify-between text-xs">
              <a href="/reset" className="text-etyme-action-press hover:underline">Forgot your password?</a>
              <a href="/signup" className="text-etyme-action-press hover:underline">New here? Sign up</a>
            </div>
          </form>

          {nothingWorks && !devEmail && (
            <p className="mb-6 text-xs text-etyme-muted">
              Microsoft and Google sign-in are not set up on this deployment yet.
            </p>
          )}

          {/* Microsoft and Google, the alternative, under the form (account-doors) */}
          <div className="mb-6">
            <AccountDoors available={available} callbackUrl="/start" />
          </div>

          {/* Divider */}
          {has('email') && (
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-etyme-rule" />
            <span className="text-xs text-etyme-muted">or</span>
            <div className="flex-1 h-px bg-etyme-rule" />
          </div>
          )}

          {/* Email sign in */}
          {has('email') && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!email.trim()) return
              setSent(true)
              signIn('email', { email: email.trim(), callbackUrl: '/start' })
            }}
          >
            <div>
              <DoorLabel htmlFor="email">Email</DoorLabel>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className={doorField}
              />
            </div>
            <button
              type="submit"
              disabled={sent || !email.trim()}
              className="w-full px-4 py-2.5 rounded-lg bg-etyme-navy text-white
                         text-sm font-medium hover:bg-etyme-ink transition-colors
                         disabled:opacity-50"
            >
              {sent ? 'Check your email' : 'Send magic link'}
            </button>
          </form>
          )}

          <p className="text-xs text-etyme-muted mt-6 text-center">
            By signing in, you agree to the Etyme{' '}
            <Link href="/terms" className="text-etyme-action-press hover:underline">Terms of Service</Link>.
          </p>
    </DoorFrame>
  )
}
