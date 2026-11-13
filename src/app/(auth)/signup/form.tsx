'use client'

import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { COMPANY_TYPES, classifyEmail } from '@/lib/onboarding'
import { DoorFrame, DoorLabel, DoorError, DoorDivider, DoorWho, doorField, doorButton } from '../door-frame'
import { AccountButtons, useKnownDoors } from '../account-doors'
import { PASSWORD_HINT_COMPANY, PASSWORD_HINT_PERSON, underHeading, signUpGuesses } from '@/lib/password-words'
import { looksLikeEmail, accountButtons, CONTINUE, OR_USE_YOUR_EMAIL, TYPE_YOUR_EMAIL } from '@/lib/login-doors'
import { signUpHeading, DETAILS_HEADING } from './heading'

/**
 * Signing up: the same screen as signing in (founder, 2026-11-12,
 * evening: "how a new user signs up, or Google sign in, or Microsoft sign
 * in, or LinkedIn sign in, and then if the user wants to use username and
 * password").
 *
 * Step 1: "Create your Etyme account", "Already have an account? Sign
 * in", the same account buttons as sign-in (a new person who presses one
 * is signed in by that provider and lands on /start, which asks what it
 * needs), "or use your email", Email, Continue.
 *
 * Step 2, "A few details", asks only: your name; "This account is for" my
 * company or me, as a candidate (preselected by the address: a public
 * address is a candidate, a work address a company); for a company its
 * name, the Etyme address guessed from the name and shown as one line
 * with Change, and what the company does; then the password. The country
 * and the currency are the guesses from the address (signUpGuesses), sent
 * and never asked: setup's checklist says them and changes them.
 *
 * The rules and the route are unchanged (lib/password-door): nothing is
 * made until the email is confirmed by its link, a colleague whose address
 * belongs at a company already here is asked only for a name and a
 * password, and a supplier invitation (`?claim=`) takes the invited
 * company's record. No button is greyed out for an empty field.
 */

type Tab = 'company' | 'candidate'
type Joins = { address: string; company: string; says: string } | null

/** Whether a refusal is about the Etyme address, so its field is drawn. */
function aboutAddress(says: string): boolean {
  return /\.etyme\.com|Etyme address/i.test(says)
}

export function SignUpForm({ claimToken, initialType = null, initialTab = 'company', initialEmail = '', noEmailHere = null }: {
  claimToken: string | null
  initialType?: string | null
  /** `?email=`, handed over by a link that already knows the address. */
  initialEmail?: string
  /** Said above the form where no email can leave this deployment. */
  noEmailHere?: string | null
  /** `?as=candidate` opens on a candidate: the contractors' door lands here. */
  initialTab?: Tab
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [personName, setPersonName] = useState('')
  const [type, setType] = useState(initialType ?? '')
  const [address, setAddress] = useState('')
  // The Etyme address is a guess from the company's name until the person
  // touches it, and never after. Its field is drawn on Change, or when the
  // route says the guess is taken.
  const [touched, setTouched] = useState({ address: false })
  const [addressOpen, setAddressOpen] = useState(false)
  const guesses = signUpGuesses(email, name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [joins, setJoins] = useState<Joins>(null)
  const [claim, setClaim] = useState<{ company: string; invitedBy: string } | null>(null)
  const available = useKnownDoors()

  useEffect(() => {
    if (!touched.address && guesses.address) setAddress(guesses.address)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guesses.address])

  const chosen = COMPANY_TYPES.find((t) => t.key === type)
  const askCompany = !claimToken && tab === 'company' && !joins

  // Who the invitation is from, said above the form.
  useEffect(() => {
    if (!claimToken) return
    fetch(`/api/claim/${claimToken}`)
      .then((r) => r.json())
      .then((b) => b?.data && setClaim({ company: b.data.company, invitedBy: b.data.invitedBy }))
      .catch(() => setClaim(null))
  }, [claimToken])

  /** Step 1's Continue: the address, checked, then the few details. */
  async function next(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!looksLikeEmail(email)) { setError(TYPE_YOUR_EMAIL); return }
    setError(null)
    // Preselected by the existing rule for the address, one tap to change:
    // a public address is a person, a work address a company. A link that
    // named the kind (`?type=`, `?as=candidate`) keeps what it named.
    if (!claimToken && !initialType && initialTab !== 'candidate') {
      setTab(classifyEmail(email) === 'CONSUMER' ? 'candidate' : 'company')
    }
    setJoins(null)
    if (!claimToken) {
      setBusy(true)
      try {
        const j = await readJson(await fetch(`/api/auth/password/signup?email=${encodeURIComponent(email.trim())}`))
        setJoins(j.data.joins ?? null)
      } catch {
        setJoins(null)
      } finally {
        setBusy(false)
      }
    }
    setStep(2)
  }

  /** What is missing, said before anything is sent. */
  function missing(): string | null {
    if (!personName.trim()) return 'Type your name.'
    if (askCompany && !name.trim()) return 'Type your company’s name.'
    if (askCompany && !address.trim()) return 'Choose an Etyme address: letters, numbers and hyphens.'
    if (askCompany && !type) return 'Choose what your company does.'
    if (!password) return 'Type a password.'
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const says = missing()
    if (says) { setError(says); if (askCompany && !address.trim()) setAddressOpen(true); return }
    setBusy(true); setError(null)
    try {
      const body = claimToken
        ? { as: 'claim', token: claimToken, email, password, personName }
        : tab === 'company'
          ? joins
            ? { as: 'company', email, password, personName, address: joins.address }
            : { as: 'company', email, password, personName, name, type, country: guesses.country, currency: guesses.currency, address }
          : { as: 'candidate', email, password, name: personName }
      const j = await readJson(await fetch('/api/auth/password/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }))
      setSent(j.data.says)
    } catch (err: any) {
      setError(err.message)
      if (aboutAddress(String(err.message ?? ''))) setAddressOpen(true)
    } finally {
      setBusy(false)
    }
  }

  async function again() {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const j = await readJson(await fetch('/api/auth/password/resend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      }))
      setSent(j.data.says)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <DoorFrame>
        <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-3">{noEmailHere ? 'Your link is with Etyme staff' : 'Check your email'}</h1>
        <p className="text-sm text-etyme-ink">{noEmailHere ? sent : underHeading('Check your email', sent)}</p>
        <p className="text-sm text-etyme-muted mt-3">Nothing is set up until you click the link.</p>
        <DoorError says={error} />
        <button type="button" onClick={again} disabled={busy}
          className="mt-6 text-sm text-etyme-action-press hover:underline disabled:opacity-50">
          {busy ? 'Sending…' : 'Send the link again'}
        </button>
      </DoorFrame>
    )
  }

  // The two answers to "This account is for": outlines, the chosen one marked, never filled.
  const pickClass = (on: boolean) =>
    `flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
      on ? 'border-etyme-action bg-etyme-sunk text-etyme-ink' : 'border-etyme-rule bg-etyme-raised text-etyme-muted hover:text-etyme-ink'}`
  const signInHref = claimToken ? `/login?next=/claim/${claimToken}` : '/login'

  if (step === 1) {
    return (
      <DoorFrame>
        <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-1">
          {signUpHeading({ claim: Boolean(claimToken), openedOn: initialType, openedTab: initialTab, type, tab })}
        </h1>
        <p className="text-sm text-etyme-muted mb-6">
          Already have an account?{' '}
          <a href={signInHref} className="text-etyme-action-press hover:underline">Sign in</a>
        </p>

        {noEmailHere && <p className="text-sm text-etyme-ink mb-6">{noEmailHere}</p>}

        {claimToken && (
          <p className="text-sm text-etyme-ink mb-6">
            {claim
              ? `${claim.invitedBy} put ${claim.company} on Etyme. Confirm your email and the account is yours. No new company is made.`
              : 'Confirm your email and your company’s account is yours. No new company is made.'}
          </p>
        )}

        {/* Not on an invitation: taking a company's record goes through the email. */}
        {!claimToken && <AccountButtons available={available} callbackUrl="/start" />}
        {!claimToken && accountButtons(available, null).length > 0 && <DoorDivider words={OR_USE_YOUR_EMAIL} />}

        <form onSubmit={next} className="space-y-3" noValidate>
          <div>
            <DoorLabel htmlFor="email">Email</DoorLabel>
            <input id="email" type="email" inputMode="email" value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null) }}
              autoComplete="email" placeholder="you@company.com" className={doorField} />
          </div>
          <DoorError says={error} />
          <button type="submit" data-door="continue" disabled={busy} className={doorButton}>
            {busy ? 'Checking…' : CONTINUE}
          </button>
        </form>
        <p className="text-xs text-etyme-muted mt-6 text-center">
          By continuing, you agree to the Etyme{' '}
          <a href="/terms" className="text-etyme-action-press hover:underline">Terms of Service</a>.
        </p>
      </DoorFrame>
    )
  }

  return (
    <DoorFrame>
      <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-6">{DETAILS_HEADING}</h1>
      <DoorWho email={email.trim()} onChange={() => { setStep(1); setError(null); setJoins(null) }} />

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <DoorLabel htmlFor="person-name">Your name</DoorLabel>
          <input id="person-name" autoFocus value={personName} onChange={(e) => { setPersonName(e.target.value); setError(null) }}
            autoComplete="name" className={doorField} />
        </div>

        {!claimToken && (
          <div>
            <p id="account-for" className="block text-xs font-medium text-etyme-muted mb-1.5">This account is for</p>
            <div role="group" aria-labelledby="account-for" className="flex gap-2">
              <button type="button" aria-pressed={tab === 'company'} onClick={() => { setTab('company'); setError(null) }} className={pickClass(tab === 'company')}>
                My company
              </button>
              <button type="button" aria-pressed={tab === 'candidate'} onClick={() => { setTab('candidate'); setError(null) }} className={pickClass(tab === 'candidate')}>
                Me, as a candidate
              </button>
            </div>
          </div>
        )}

        {joins && tab === 'company' && <p className="text-sm text-etyme-ink">{joins.says}</p>}

        {askCompany && (
          <>
            <div>
              <DoorLabel htmlFor="company-name">Company name</DoorLabel>
              <input id="company-name" value={name} onChange={(e) => { setName(e.target.value); setError(null) }}
                autoComplete="organization" className={doorField} />
              {!addressOpen && (
                <p className="text-xs text-etyme-muted mt-1 break-words">
                  {address ? <>Your Etyme address will be <span className="text-etyme-ink">{address}.etyme.com</span></> : 'Your Etyme address is made from the name.'}
                  {' · '}
                  <button type="button" onClick={() => setAddressOpen(true)} className="text-etyme-action-press hover:underline">Change</button>
                </p>
              )}
            </div>

            {addressOpen && (
              <div>
                <DoorLabel htmlFor="address">Etyme address</DoorLabel>
                <div className="flex items-center gap-2">
                  <input id="address" value={address}
                    onChange={(e) => { setTouched((t) => ({ ...t, address: true })); setAddress(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setError(null) }}
                    placeholder="acme" maxLength={40} className={doorField} />
                  <span className="text-sm text-etyme-muted whitespace-nowrap">.etyme.com</span>
                </div>
                <p className="text-xs text-etyme-muted mt-1">Letters, numbers and hyphens. Your colleagues use the same address to join you.</p>
              </div>
            )}

            <div>
              <DoorLabel htmlFor="type">What your company does</DoorLabel>
              <select id="type" value={type} onChange={(e) => { setType(e.target.value); setError(null) }} className={doorField}>
                <option value="" disabled>Choose one</option>
                {COMPANY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              {chosen && <p className="text-xs text-etyme-muted mt-1">{chosen.blurb}</p>}
            </div>
          </>
        )}

        <div>
          <DoorLabel htmlFor="password">Password</DoorLabel>
          <input id="password" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null) }}
            autoComplete="new-password" className={doorField} />
          <p className="text-xs text-etyme-muted mt-1">{tab === 'candidate' && !claimToken ? PASSWORD_HINT_PERSON : PASSWORD_HINT_COMPANY}</p>
        </div>

        <DoorError says={error} />

        <button type="submit" data-door="create" disabled={busy} className={doorButton}>
          {busy ? 'Creating your account…' : 'Create account'}
        </button>
        <p className="text-xs text-etyme-muted">
          We send a link to your email. Nothing is set up until you click it.
        </p>
      </form>
    </DoorFrame>
  )
}
