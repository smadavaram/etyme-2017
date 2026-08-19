'use client'

import { useEffect, useState } from 'react'

/**
 * Getting in.
 *
 * There is no sign-up form separate from sign-in, because the difference is
 * something the system can work out. You sign in; if your company is here
 * you join it, and if it is not you set it up.
 *
 * The one question worth asking is what the company does here, because it
 * decides navigation and permissions for the rest of the relationship.
 * Everything else is inferred: the domain is verified by the identity
 * provider, the name is guessed from it, the address follows from the name.
 */

interface TypeOption {
  key: string
  label: string
  blurb: string
  example: string
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
}

export default function StartPage() {
  const [state, setState] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<any>(null)

  useEffect(() => {
    fetch('/api/onboarding')
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error?.message ?? 'Could not check your account')
        setState(j.data)
        if (j.data.suggestedName) setName(j.data.suggestedName)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function submit() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error?.message ?? 'Could not finish setting up')
      setDone(j.data)
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-etyme-muted">Checking your account…</div>
  }

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="max-w-lg text-center">
          <Lbl>You are in</Lbl>
          <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em] text-balance">
            {done.companyName ?? 'Ready'}
          </h1>
          <p className="text-etyme-muted mt-3">{done.message}</p>
          <a href="/dashboard"
            className="inline-block mt-6 px-5 py-2.5 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90">
            Go to Etyme
          </a>
        </div>
      </div>
    )
  }

  // Already placed, or joining, or a consultant — nothing to ask.
  const noQuestion = state && state.action !== 'CREATE'

  return (
    <div className="min-h-screen grid place-items-center px-6 py-12">
      <div className="max-w-2xl w-full">
        <Lbl>Etyme</Lbl>

        {state?.action === 'ALREADY_IN' && (
          <>
            <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em]">
              You are already in {state.company?.name}
            </h1>
            <a href="/dashboard" className="inline-block mt-6 px-5 py-2.5 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90">
              Continue
            </a>
          </>
        )}

        {state?.action === 'JOIN' && (
          <>
            <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em] text-balance">
              {state.company.name} is already here
            </h1>
            <p className="text-etyme-muted mt-3">{state.message}</p>
            <p className="text-sm text-etyme-muted mt-4">
              You will join them. Someone there decides what you can see — nobody
              gets access just for sharing an email domain.
            </p>
            <button onClick={submit} disabled={busy}
              className="mt-6 px-5 py-2.5 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {busy ? 'Joining…' : `Join ${state.company.name}`}
            </button>
          </>
        )}

        {state?.action === 'CONSULTANT' && (
          <>
            <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em]">
              Setting you up as a consultant
            </h1>
            <p className="text-etyme-muted mt-3">{state.message}</p>
            <button onClick={submit} disabled={busy}
              className="mt-6 px-5 py-2.5 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {busy ? 'Setting up…' : 'Continue'}
            </button>
          </>
        )}

        {state?.action === 'CREATE' && (
          <>
            <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em] text-balance">
              Setting up {state.suggestedName}
            </h1>
            <p className="text-etyme-muted mt-2">{state.message}</p>

            <div className="mt-8">
              <Lbl>What does your company do here?</Lbl>
              <div className="mt-3 space-y-2">
                {(state.companyTypes as TypeOption[]).map(t => (
                  <button key={t.key} onClick={() => setType(t.key)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      type === t.key
                        ? 'border-etyme-action bg-etyme-action/5'
                        : 'border-etyme-rule bg-etyme-surface hover:border-etyme-muted'
                    }`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-etyme-ink font-medium">{t.label}</span>
                      <span className="text-xs text-etyme-faint shrink-0">{t.example}</span>
                    </div>
                    <p className="text-sm text-etyme-muted mt-1">{t.blurb}</p>
                  </button>
                ))}
              </div>
            </div>

            <label className="block mt-6">
              <Lbl>Company name</Lbl>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm text-etyme-ink focus:outline-none focus:border-etyme-action" />
              <p className="text-xs text-etyme-muted mt-1">
                Guessed from your email domain. Change it if it is wrong.
              </p>
            </label>

            {error && <p className="mt-4 text-sm text-etyme-attention">{error}</p>}

            <button onClick={submit} disabled={busy || !type}
              className="mt-6 px-5 py-2.5 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-40">
              {busy ? 'Setting up…' : 'Create it'}
            </button>
            <p className="text-xs text-etyme-faint mt-3">
              Anyone else from your domain who signs in will join you automatically.
            </p>
          </>
        )}

        {error && !state && <p className="mt-4 text-sm text-etyme-attention">{error}</p>}
      </div>
    </div>
  )
}
