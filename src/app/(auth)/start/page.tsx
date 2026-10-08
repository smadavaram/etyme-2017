'use client'

import { readJson } from '@/lib/read-response'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WeekPanel } from '@/components/settings/week-panel'
import { PayrollPanel } from '@/components/settings/payroll-panel'
import { InviteTeammate } from '@/components/invite-teammate'
import { deskHome } from '@/components/desk-home'
import { railFor, stepLabel, packSentence, currencyFor, asksPayroll, CLIENT_NO_PAYROLL, type SetupStep } from '@/lib/setup-steps'
import { packFor, MEMBER_ROLE, type CompanyKind } from '@/lib/company-defaults'
import { memberWelcome } from '@/lib/password-words'

/**
 * Getting in, and setting up. Five steps, then it stops.
 *
 * The founder, 2026-10-07: after the first sign-in a new company walks
 * the prototype's five steps (prototypes/Etyme_Onboarding.jsx) — sign in;
 * your company; how you work; your people; your team. Every answer has a
 * default, so a company may click through in a minute, and what it
 * answers is recorded with who and when (lib/setup-steps,
 * /api/onboarding/setup).
 *
 * There is still no sign-up form apart from sign-in. You sign in; if your
 * company is here you join it as Member and land on your own work; if it
 * is not, you set it up. A company that finished setup never sees the
 * steps again: this page sends its people to their desks.
 */

interface TypeOption { key: string; kind: string; label: string; blurb: string; example: string }
interface Country { code: string; name: string; currency: string }

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
}

function Rail({ at, done, kind }: { at: 'SIGN_IN' | SetupStep; done: (k: 'SIGN_IN' | SetupStep) => boolean; kind: string | null }) {
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Setup steps">
      {railFor(kind).map((s, i) => {
        const on = s.key === at
        const isDone = !on && done(s.key)
        return (
          <li key={s.key}
            aria-current={on ? 'step' : undefined}
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-[12.5px] ${on ? 'bg-etyme-ink text-etyme-canvas font-semibold' : isDone ? 'text-etyme-muted' : 'text-etyme-faint'}`}>
            <span className={`w-[17px] h-[17px] rounded-full grid place-items-center text-[10px] font-bold ${
              isDone ? 'bg-etyme-verified/15 text-etyme-verified' : on ? 'bg-etyme-canvas text-etyme-ink' : 'border border-etyme-rule'}`}>
              {isDone ? '✓' : i + 1}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

const primary = 'px-5 py-2.5 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-40'
const secondary = 'px-5 py-2.5 border border-etyme-rule bg-etyme-surface rounded text-sm text-etyme-ink hover:border-etyme-muted disabled:opacity-40'
const field = 'w-full mt-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm text-etyme-ink focus:outline-none focus:border-etyme-action'

export default function StartPage() {
  const router = useRouter()
  const [state, setState] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [joined, setJoined] = useState<any>(null)
  // Step 2's answers, each pre-filled with its guess.
  const [type, setType] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [country, setCountry] = useState('US')
  const [currency, setCurrency] = useState('USD')
  const [invitedHere, setInvitedHere] = useState(0)
  // Steps passed on this visit after following the dashboard's link back,
  // so skipping one again moves on rather than showing it twice.
  const [passed, setPassed] = useState<SetupStep[]>([])
  // Arrived from the password sign-up's link (2026-10-08): step 2 was
  // answered on the sign-up form, so it is shown once as what they told
  // us, pre-filled, before step 3.
  const [welcome, setWelcome] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      const back = params?.get('finish') === '1'
      if (params?.get('welcome') === '1') setWelcome(true)
      const j = await readJson(await fetch(`/api/onboarding${back ? '?finish=1' : ''}`))
      setState(j.data)
      if (j.data.suggestedName) setName((n) => n || j.data.suggestedName)
      if (j.data.suggestedCountry) setCountry(j.data.suggestedCountry)
      if (j.data.suggestedCurrency) setCurrency(j.data.suggestedCurrency)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  // Where this seat's own desk is.
  const desk = useMemo(() => {
    if (state?.action !== 'ALREADY_IN') return null
    return deskHome({
      kind: (state.company?.kind ?? null) as CompanyKind | null,
      isConsultant: state.seat?.type === 'CONSULTANT',
      role: state.seat?.role ?? null,
      permissions: state.seat?.permissions ?? [],
    })
  }, [state])

  const setup = state?.action === 'ALREADY_IN' ? state.setup : null
  const showingSteps = setup?.shows === true

  // A colleague who just confirmed their email and was seated as Member
  // (round one of the sign-up walk, item 20): told where they are and what
  // happens next, once, before the desk.
  const newMember = welcome && state?.action === 'ALREADY_IN' && !showingSteps
    && state.seat?.role === MEMBER_ROLE && state.company?.name

  // Already here, nothing owed, not just arrived: straight to their desk.
  useEffect(() => {
    if (state?.action === 'ALREADY_IN' && !showingSteps && !joined && !newMember && desk) router.replace(desk as any)
  }, [state, showingSteps, joined, newMember, desk, router])

  async function enter(body: Record<string, unknown>) {
    setBusy(true); setError(null)
    try {
      const j = await readJson(await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }))
      // A consultant has no firm and no setup: their own work is the desk.
      if (j.data.action === 'CONSULTANT') { router.push('/dashboard/my-work'); return }
      if (j.data.action === 'JOIN') setJoined(j.data)
      await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  async function answer(step: SetupStep, outcome: 'DONE' | 'SKIPPED') {
    setBusy(true); setError(null)
    try {
      const j = await readJson(await fetch('/api/onboarding/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, outcome }),
      }))
      // The last answer lands on the dashboard, which says its own first-day sentence.
      const nowPassed = [...passed, step]
      setPassed(nowPassed)
      const left = setup?.finishedAt
        ? (j.data.owed as SetupStep[]).filter((k) => !nowPassed.includes(k))
        : j.data.next ? [j.data.next] : []
      if (left.length === 0) {
        router.push('/dashboard')
        return
      }
      await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-etyme-muted">Checking your account…</div>
  }

  // ── A colleague, just confirmed by the password door ───────────────
  if (newMember) {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="max-w-lg text-center">
          <Lbl>You are in</Lbl>
          <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em] text-balance">
            {state.company.name}
          </h1>
          <p className="text-etyme-muted mt-3">{memberWelcome(state.company.name)}</p>
          <a href={desk ?? '/dashboard'} className={`inline-block mt-6 ${primary}`}>
            Go to your desk
          </a>
        </div>
      </div>
    )
  }

  // ── A colleague, just arrived ──────────────────────────────────────
  if (joined && state?.action === 'ALREADY_IN') {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="max-w-lg text-center">
          <Lbl>You are in</Lbl>
          <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em] text-balance">
            {state.company?.name ?? 'Ready'}
          </h1>
          <p className="text-etyme-muted mt-3">{joined.message}</p>
          <a href={desk ?? '/dashboard'} className={`inline-block mt-6 ${primary}`}>
            Go to your desk
          </a>
        </div>
      </div>
    )
  }

  // Which step is on screen.
  const step: 'SIGN_IN' | SetupStep | null =
    state?.action === 'CREATE' || (state?.action === 'SUGGEST') ? 'COMPANY'
      : showingSteps && welcome && setup.next === 'WORK' ? 'COMPANY'
        : showingSteps ? ((setup.finishedAt ? (setup.owed as SetupStep[]).find((k) => !passed.includes(k)) : setup.next) ?? null)
          : null

  // A one-person firm walks three steps and is never asked for a list or
  // a team (round two, item 37). Before the company exists the kind is
  // the type chosen on step 2.
  const chosenKind = (state?.companyTypes as TypeOption[] | undefined)?.find((t) => t.key === type)?.kind ?? null
  const kind: string | null = setup?.company?.kind ?? state?.company?.kind ?? chosenKind
  const solo = kind === 'CONSULTANT_CORP'

  const answered = (k: 'SIGN_IN' | SetupStep) =>
    k === 'SIGN_IN' || (setup?.record?.[k] != null) || (k === 'COMPANY' && state?.action === 'ALREADY_IN')

  return (
    <div className="min-h-screen bg-etyme-canvas">
      {step && (
        <div className="border-b border-etyme-rule">
          <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
            <Lbl>Etyme setup</Lbl>
            <Rail at={step} done={answered} kind={kind} />
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-6 py-12">
        {!step && <Lbl>Etyme</Lbl>}

        {state?.action === 'JOIN' && (
          <>
            <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em] text-balance">
              {state.company?.name ?? state.companyName} is already here
            </h1>
            <p className="text-etyme-muted mt-3">{state.message}</p>
            <p className="text-sm text-etyme-muted mt-4">
              You join as Member. You can see your own work at once. An owner there gives you a desk.
            </p>
            <button onClick={() => enter({})} disabled={busy} className={`mt-6 ${primary}`}>
              {busy ? 'Joining…' : `Join ${state.company?.name ?? state.companyName}`}
            </button>
          </>
        )}

        {state?.action === 'REQUEST' && (
          <>
            <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em] text-balance">
              {state.companyName} is already here
            </h1>
            <p className="text-etyme-muted mt-3">{state.message}</p>
            <button onClick={() => enter({})} disabled={busy} className={`mt-6 ${primary}`}>
              {busy ? 'Joining…' : `Join ${state.companyName}`}
            </button>
          </>
        )}

        {state?.action === 'CONSULTANT' && (
          <>
            <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em]">Setting you up as a consultant</h1>
            <p className="text-etyme-muted mt-3">{state.message}</p>
            <button onClick={() => enter({})} disabled={busy} className={`mt-6 ${primary}`}>
              {busy ? 'Setting up…' : 'Continue'}
            </button>
            {(state.companyTypes ?? []).map((t: TypeOption) => (
              <div key={t.key} className="mt-8 border-t border-etyme-rule pt-6 max-w-md">
                <p className="text-sm text-etyme-ink font-medium">{t.label}</p>
                <p className="text-sm text-etyme-muted mt-1">{t.blurb}</p>
                <label className="block mt-3 text-sm text-etyme-muted">
                  Your company&rsquo;s name
                  <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
                </label>
                <button onClick={() => enter({ type: t.key, name })} disabled={busy || !name.trim()} className={`mt-3 ${secondary}`}>
                  Set up my company
                </button>
              </div>
            ))}
          </>
        )}

        {state?.action === 'REFUSE' && (
          <h1 className="font-serif text-2xl text-etyme-ink mt-2 tracking-[-0.02em] text-balance">{state.message}</h1>
        )}

        {/* ── Step 2, answered on the sign-up form: what they told us ── */}
        {step === 'COMPANY' && state?.action === 'ALREADY_IN' && (
          <div className="max-w-xl">
            <Lbl>{stepLabel('COMPANY', kind)}</Lbl>
            <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em] text-balance">Your company</h1>
            <p className="text-etyme-muted mt-2">Your email is confirmed. This is what you told us when you signed up.</p>
            <dl className="mt-6 grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-y-1 sm:gap-y-3 text-sm">
              <dt className="text-etyme-muted">Company name</dt><dd className="text-etyme-ink">{setup.company.name}</dd>
              <dt className="text-etyme-muted">Etyme address</dt><dd className="text-etyme-ink">{state.company?.slug}.etyme.com</dd>
              <dt className="text-etyme-muted">Country</dt><dd className="text-etyme-ink">{setup.company.countryName}</dd>
              <dt className="text-etyme-muted">Currency</dt><dd className="text-etyme-ink">{setup.company.currency}</dd>
            </dl>
            {setup.company.packSays && <p className="text-sm text-etyme-ink mt-4">{setup.company.packSays}</p>}
            <button onClick={() => setWelcome(false)} className={`mt-6 ${primary}`}>Continue</button>
            <p className="text-xs text-etyme-faint mt-3">
              You can change the name and the currency later in Settings.
              {!solo && ' Colleagues join by invitation, or by signing up with the same Etyme address from your email domain.'}
            </p>
          </div>
        )}

        {/* ── Step 2: your company ── */}
        {step === 'COMPANY' && state?.action !== 'ALREADY_IN' && (
          <div className="max-w-xl">
            <Lbl>{stepLabel('COMPANY', kind)}</Lbl>
            <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em] text-balance">Your company</h1>
            <p className="text-etyme-muted mt-2">Everything here has a guess filled in. Change what is wrong.</p>

            {state.action === 'SUGGEST' && (
              <div className="mt-6 p-4 border border-etyme-rule rounded-lg bg-etyme-surface">
                <p className="text-sm text-etyme-ink">{state.message}</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => enter({ joinExisting: true })} disabled={busy} className={primary}>Yes, we are part of {state.companyName}</button>
                </div>
                <p className="text-xs text-etyme-muted mt-2">If you are a separate company, fill in the form below.</p>
              </div>
            )}

            <label className="block mt-6">
              <Lbl>Company name</Lbl>
              <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
              <p className="text-xs text-etyme-muted mt-1">Guessed from your web address. Change it if it is wrong.</p>
            </label>

            <div className="mt-6">
              <Lbl>What does your company do here?</Lbl>
              <div className="mt-2 space-y-2">
                {(state.companyTypes as TypeOption[]).map((t) => (
                  <button key={t.key} onClick={() => setType(t.key)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors ${
                      type === t.key ? 'border-etyme-action bg-etyme-action/5' : 'border-etyme-rule bg-etyme-surface hover:border-etyme-muted'}`}>
                    <span className="text-etyme-ink font-medium">{t.label}</span>
                    <p className="text-sm text-etyme-muted mt-1">{t.blurb}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mt-6">
              <label className="block">
                <Lbl>Country</Lbl>
                <select value={country} className={field}
                  onChange={(e) => { setCountry(e.target.value); setCurrency(currencyFor(e.target.value)) }}>
                  {(state.countries as Country[]).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </label>
              <label className="block">
                <Lbl>Currency</Lbl>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
                  {(state.currencies as string[]).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <p className="text-xs text-etyme-muted mt-2">
              {country === state.suggestedCountry ? state.countrySays : 'Your choice. The currency follows the country unless you change it.'}
            </p>
            <p className="text-sm text-etyme-ink mt-4">
              {packSentence(packFor((chosenKind ?? 'VENDOR') as CompanyKind, country), chosenKind)}
            </p>

            {error && <p className="mt-4 text-sm text-etyme-attention">{error}</p>}
            <button onClick={() => enter({ type, name, country, currency, ...(state.action === 'SUGGEST' ? { joinExisting: false } : {}) })}
              disabled={busy || !type} className={`mt-6 ${primary}`}>
              {busy ? 'Setting up…' : 'Continue'}
            </button>
            {!solo && <p className="text-xs text-etyme-faint mt-3">Anyone else from your web address who signs in will join you as Member.</p>}
          </div>
        )}

        {/* ── Step 3: how you work ── */}
        {step === 'WORK' && (
          <div>
            <Lbl>{stepLabel('WORK', kind)}</Lbl>
            <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em]">How you work</h1>
            {setup.claimedSays && <p className="text-etyme-ink mt-2">{setup.claimedSays}</p>}
            <p className="text-etyme-muted mt-2 mb-6">
              {setup.company.packSays} The defaults are filled in. Change one and save it, or keep them all.
            </p>
            <WeekPanel canEdit />
            {asksPayroll(kind)
              ? <PayrollPanel canEdit shiftSection={false} />
              : <p className="text-sm text-etyme-muted mb-6">{CLIENT_NO_PAYROLL}</p>}
            {error && <p className="mb-4 text-sm text-etyme-attention">{error}</p>}
            <button onClick={() => answer('WORK', 'DONE')} disabled={busy} className={primary}>Continue</button>
            <p className="text-xs text-etyme-faint mt-3">Continue keeps what is saved above. You can change all of it later in Settings.</p>
          </div>
        )}

        {/* ── Step 4: your people ── */}
        {step === 'PEOPLE' && !solo && (
          <div className="max-w-xl">
            <Lbl>{stepLabel('PEOPLE', kind)}</Lbl>
            <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em]">Your people</h1>
            <p className="text-etyme-muted mt-2">
              Bring in your contractor list from a spreadsheet. A system of record with none of your records is a demo.
            </p>
            <p className="text-sm text-etyme-muted mt-2">Any columns will do. We read them, and you check the result before anything is saved.</p>
            {error && <p className="mt-4 text-sm text-etyme-attention">{error}</p>}
            <div className="flex flex-wrap gap-2 mt-6">
              {setup.facts.peopleImported ? (
                <button onClick={() => answer('PEOPLE', 'DONE')} disabled={busy} className={primary}>Continue</button>
              ) : (
                <a href="/dashboard/import" className={primary}>Import a file</a>
              )}
              {!setup.facts.peopleImported && (
                <button onClick={() => answer('PEOPLE', 'SKIPPED')} disabled={busy} className={secondary}>Skip for now</button>
              )}
            </div>
            {setup.facts.peopleImported && <p className="text-sm text-etyme-verified mt-3">Your people are in.</p>}
          </div>
        )}

        {/* ── Step 5: your team ── */}
        {step === 'TEAM' && !solo && (
          <div>
            <Lbl>{stepLabel('TEAM', kind)}</Lbl>
            <h1 className="font-serif text-3xl text-etyme-ink mt-2 tracking-[-0.02em]">Your team</h1>
            <p className="text-etyme-muted mt-2 mb-6">
              Invite the people who work here: name, work email, and what they do. They are emailed, and the seat is theirs when they sign in.
            </p>
            <InviteTeammate onInvited={() => setInvitedHere((n) => n + 1)} />
            {error && <p className="mt-4 text-sm text-etyme-attention">{error}</p>}
            <div className="flex flex-wrap gap-2 mt-6">
              {(invitedHere > 0 || setup.facts.teammates > 0) && (
                <button onClick={() => answer('TEAM', 'DONE')} disabled={busy} className={primary}>Finish</button>
              )}
              {invitedHere === 0 && setup.facts.teammates === 0 && (
                <button onClick={() => answer('TEAM', 'SKIPPED')} disabled={busy} className={secondary}>Skip for now</button>
              )}
            </div>
          </div>
        )}

        {error && !state && <p className="mt-4 text-sm text-etyme-attention">{error}</p>}
      </div>
    </div>
  )
}
