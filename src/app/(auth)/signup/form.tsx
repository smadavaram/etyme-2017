'use client'

import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { COMPANY_TYPES } from '@/lib/onboarding'
import { COUNTRIES, CURRENCIES, currencyFor } from '@/lib/setup-steps'
import { DoorFrame, DoorLabel, DoorError, doorField, doorButton } from '../door-frame'
import { PASSWORD_HINT_COMPANY, PASSWORD_HINT_PERSON, underHeading } from '@/lib/password-words'

/**
 * Signing up with an email and a password.
 *
 * The founder, 2026-10-08: two forms. A company signs up with a work
 * email, a password and an Etyme address; a candidate with an email and a
 * password. Both ask the person's own name, so the app greets them by it.
 * Nothing is made until the email is confirmed by its link
 * (lib/password-door), so the last thing this page shows is "Check your
 * email", whatever happened.
 *
 * Two shortcuts, both found on round one of the sign-up walk:
 *   - A colleague whose email belongs at a company already here is told so
 *     after the email field, and asked only for a name and a password.
 *     What they typed in the company fields is kept, never thrown away.
 *   - Arriving from a supplier invitation (`?claim=` or `?next=/claim/…`)
 *     asks only for a name, an email and a password, and confirming takes
 *     the invited company's record rather than founding a second one.
 */

type Tab = 'company' | 'candidate'
type Joins = { address: string; company: string; says: string } | null

export function SignUpForm({ claimToken, initialType = null }: { claimToken: string | null; initialType?: string | null }) {
  const [tab, setTab] = useState<Tab>('company')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [personName, setPersonName] = useState('')
  const [type, setType] = useState(initialType ?? '')
  const [country, setCountry] = useState('US')
  const [currency, setCurrency] = useState('USD')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [joins, setJoins] = useState<Joins>(null)
  const [claim, setClaim] = useState<{ company: string; invitedBy: string } | null>(null)

  const chosen = COMPANY_TYPES.find((t) => t.key === type)
  const personal = Boolean((chosen as { personalEmail?: boolean } | undefined)?.personalEmail)

  // Who the invitation is from, said above the form.
  useEffect(() => {
    if (!claimToken) return
    fetch(`/api/claim/${claimToken}`)
      .then((r) => r.json())
      .then((b) => b?.data && setClaim({ company: b.data.company, invitedBy: b.data.invitedBy }))
      .catch(() => setClaim(null))
  }, [claimToken])

  async function probe() {
    if (tab !== 'company' || claimToken || !email.includes('@')) { setJoins(null); return }
    try {
      const j = await readJson(await fetch(`/api/auth/password/signup?email=${encodeURIComponent(email.trim())}`))
      setJoins(j.data.joins ?? null)
    } catch {
      setJoins(null)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const body = claimToken
        ? { as: 'claim', token: claimToken, email, password, personName }
        : tab === 'company'
          ? joins
            ? { as: 'company', email, password, personName, address: joins.address }
            : { as: 'company', email, password, personName, name, type, country, currency, address }
          : { as: 'candidate', email, password, name: personName }
      const j = await readJson(await fetch('/api/auth/password/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }))
      setSent(j.data.says)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function again() {
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
        <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-3">Check your email</h1>
        <p className="text-sm text-etyme-ink">{underHeading('Check your email', sent)}</p>
        <p className="text-sm text-etyme-muted mt-3">Nothing is set up until you click the link.</p>
        <DoorError says={error} />
        <button type="button" onClick={again} disabled={busy}
          className="mt-6 text-sm text-etyme-action-press hover:underline disabled:opacity-50">
          Send the link again
        </button>
      </DoorFrame>
    )
  }

  const tabClass = (on: boolean) =>
    `flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      on ? 'bg-etyme-raised text-etyme-ink shadow-sm' : 'text-etyme-muted hover:text-etyme-ink'}`

  const askCompany = !claimToken && tab === 'company' && !joins

  return (
    <DoorFrame>
      <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-1">
        {claimToken ? 'Take your company’s account' : 'Sign up for Etyme'}
      </h1>
      <p className="text-sm text-etyme-muted mb-6">
        Already have an account?{' '}
        <a href={claimToken ? `/login?next=/claim/${claimToken}` : '/login'} className="text-etyme-action-press hover:underline">Sign in</a>
      </p>

      {claimToken && (
        <p className="text-sm text-etyme-ink mb-6">
          {claim
            ? `${claim.invitedBy} put ${claim.company} on Etyme. Confirm your email and the account is yours. No new company is made.`
            : 'Confirm your email and your company’s account is yours. No new company is made.'}
        </p>
      )}

      {!claimToken && (
        <div role="tablist" aria-label="Who is signing up" className="flex gap-1 p-1 rounded-lg bg-etyme-sunk mb-6">
          <button type="button" role="tab" aria-selected={tab === 'company'} onClick={() => { setTab('company'); setError(null) }} className={tabClass(tab === 'company')}>
            A company
          </button>
          <button type="button" role="tab" aria-selected={tab === 'candidate'} onClick={() => { setTab('candidate'); setError(null); setJoins(null) }} className={tabClass(tab === 'candidate')}>
            A candidate
          </button>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <DoorLabel htmlFor="person-name">Your name</DoorLabel>
          <input id="person-name" required value={personName} onChange={(e) => setPersonName(e.target.value)}
            autoComplete="name" className={doorField} />
        </div>

        <div>
          <DoorLabel htmlFor="email">{tab === 'company' && !personal ? 'Work email' : 'Email'}</DoorLabel>
          <input id="email" type="email" required value={email}
            onChange={(e) => { setEmail(e.target.value); setJoins(null) }} onBlur={probe}
            autoComplete="email" placeholder={tab === 'company' && !personal ? 'you@company.com' : 'you@example.com'} className={doorField} />
          {joins && <p className="text-sm text-etyme-ink mt-2">{joins.says}</p>}
        </div>

        <div>
          <DoorLabel htmlFor="password">Password</DoorLabel>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" className={doorField} />
          <p className="text-xs text-etyme-muted mt-1">{tab === 'candidate' && !claimToken ? PASSWORD_HINT_PERSON : PASSWORD_HINT_COMPANY}</p>
        </div>

        {askCompany && (
          <>
            <div>
              <DoorLabel htmlFor="company-name">Company name</DoorLabel>
              <input id="company-name" required value={name} onChange={(e) => setName(e.target.value)}
                autoComplete="organization" className={doorField} />
            </div>

            <div>
              <DoorLabel htmlFor="address">Etyme address</DoorLabel>
              <div className="flex items-center gap-2">
                <input id="address" required value={address}
                  onChange={(e) => setAddress(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="acme" maxLength={40} className={doorField} />
                <span className="text-sm text-etyme-muted whitespace-nowrap">.etyme.com</span>
              </div>
              <p className="text-xs text-etyme-muted mt-1">
                Letters, numbers and hyphens. Your colleagues use the same address to join you.
              </p>
            </div>

            <div>
              <DoorLabel htmlFor="type">What does your company do here?</DoorLabel>
              <select id="type" required value={type} onChange={(e) => setType(e.target.value)} className={doorField}>
                <option value="">Choose one</option>
                {COMPANY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              {personal && <p className="text-xs text-etyme-muted mt-1">A personal email is fine for this one.</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <DoorLabel htmlFor="country">Country</DoorLabel>
                <select id="country" value={country} className={doorField}
                  onChange={(e) => { setCountry(e.target.value); setCurrency(currencyFor(e.target.value)) }}>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <DoorLabel htmlFor="currency">Currency</DoorLabel>
                <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={doorField}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        <DoorError says={error} />

        <button type="submit" disabled={busy} className={doorButton}>
          {busy ? 'Sending…' : 'Sign up'}
        </button>
        <p className="text-xs text-etyme-muted">
          We send a link to your email. Nothing is set up until you click it.
        </p>
      </form>
    </DoorFrame>
  )
}
