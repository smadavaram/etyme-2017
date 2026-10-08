'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { COMPANY_TYPES } from '@/lib/onboarding'
import { COUNTRIES, CURRENCIES, currencyFor } from '@/lib/setup-steps'
import { DoorFrame, DoorLabel, DoorError, doorField, doorButton } from '../door-frame'

/**
 * Signing up with an email and a password.
 *
 * The founder, 2026-10-08: two forms. A company signs up with a work
 * email, a password and an Etyme address; a candidate with an email and a
 * password. Nothing is made until the email is confirmed by its link
 * (lib/password-door), so the last thing this page shows is "Check your
 * email", whatever happened.
 */

type Tab = 'company' | 'candidate'

export default function SignUpPage() {
  const [tab, setTab] = useState<Tab>('company')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [personName, setPersonName] = useState('')
  const [type, setType] = useState('')
  const [country, setCountry] = useState('US')
  const [currency, setCurrency] = useState('USD')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const body = tab === 'company'
        ? { as: 'company', email, password, name, type, country, currency, address }
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
        <p className="text-sm text-etyme-ink">{sent}</p>
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

  return (
    <DoorFrame>
      <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em] mb-1">Sign up for Etyme</h1>
      <p className="text-sm text-etyme-muted mb-6">
        Already have an account? <a href="/login" className="text-etyme-action-press hover:underline">Sign in</a>
      </p>

      <div role="tablist" aria-label="Who is signing up" className="flex gap-1 p-1 rounded-lg bg-etyme-sunk mb-6">
        <button type="button" role="tab" aria-selected={tab === 'company'} onClick={() => { setTab('company'); setError(null) }} className={tabClass(tab === 'company')}>
          A company
        </button>
        <button type="button" role="tab" aria-selected={tab === 'candidate'} onClick={() => { setTab('candidate'); setError(null) }} className={tabClass(tab === 'candidate')}>
          A candidate
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {tab === 'candidate' && (
          <div>
            <DoorLabel htmlFor="person-name">Your name</DoorLabel>
            <input id="person-name" value={personName} onChange={(e) => setPersonName(e.target.value)}
              autoComplete="name" className={doorField} />
          </div>
        )}

        <div>
          <DoorLabel htmlFor="email">{tab === 'company' ? 'Work email' : 'Email'}</DoorLabel>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" placeholder={tab === 'company' ? 'you@company.com' : 'you@example.com'} className={doorField} />
        </div>

        <div>
          <DoorLabel htmlFor="password">Password</DoorLabel>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" className={doorField} />
          <p className="text-xs text-etyme-muted mt-1">At least 12 characters. Not your email or the company name.</p>
        </div>

        {tab === 'company' && (
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
            </div>

            <div className="grid grid-cols-2 gap-3">
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
