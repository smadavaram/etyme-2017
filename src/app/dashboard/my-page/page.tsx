'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * The screen where a consultant turns their own page on.
 *
 * Every agency they work through has a public page. The person doing the
 * work had nothing — no address, no way to be found, nothing that survives
 * leaving an agency. This is where that gets fixed, and it belongs to the
 * person: no company permission touches it.
 *
 * Written for somebody who will open it three times ever — once to claim an
 * address, once to fix a sentence, and once when they start looking again.
 */

interface Preview {
  name: string
  headline: string
  intro: string
  availability: string
  skills: { skill: string; years: number | null }[]
  engagements: { role: string; lasted: string; sector: string | null; current: boolean }[]
  training: { title: string; when: string }[]
  verified: string[]
  totalYears: number | null
}

interface MyPage {
  address: string | null
  url: string | null
  previousAddresses: string[]
  suggestion: string | null
  on: boolean
  headline: string | null
  intro: string | null
  writtenBy: string
  availableFrom: string | null
  preview: Preview | null
  modelAvailable: boolean
  note: string
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
}

function Panel({ title, subtitle, children }: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-5 mb-5">
      <h2 className="font-serif text-[19px] text-etyme-ink tracking-[-0.02em]">{title}</h2>
      {subtitle && <p className="text-[13px] text-etyme-muted mt-1 max-w-prose">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

const btn = 'px-3 py-1.5 rounded text-[13px] font-medium transition-colors disabled:opacity-40'
const primary = `${btn} bg-etyme-action text-white hover:opacity-90`
const quiet = `${btn} border border-etyme-rule text-etyme-ink hover:bg-etyme-canvas`
const field =
  'w-full px-3 py-2 rounded border border-etyme-rule bg-etyme-raised text-[14px] text-etyme-ink ' +
  'placeholder:text-etyme-faint focus:outline-none focus:border-etyme-action'

export default function MyPagePage() {
  const [data, setData] = useState<MyPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [address, setAddress] = useState('')
  const [headline, setHeadline] = useState('')
  const [intro, setIntro] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/me/portfolio')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      const d: MyPage = body.data
      setData(d)
      setAddress(d.address ?? d.suggestion ?? '')
      setHeadline(d.headline ?? d.preview?.headline ?? '')
      setIntro(d.intro ?? d.preview?.intro ?? '')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function send(path: string, method: string, payload?: unknown) {
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setFlash(body.data?.message ?? body.data?.note ?? 'Saved.')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="p-8 text-[14px] text-etyme-muted">Loading…</div>

  if (error && !data) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-etyme-attention">{error}</p>
        <button className={`${quiet} mt-4`} onClick={load}>Try again</button>
      </div>
    )
  }
  if (!data) return null

  const p = data.preview

  return (
    <div className="p-8 max-w-3xl">
      <div className="eyebrow">You</div>
      <h1 className="font-serif text-3xl text-etyme-ink mt-1 tracking-[-0.02em]">Your page</h1>
      <p className="text-[15px] text-etyme-muted mt-2 max-w-prose leading-relaxed">
        Yours, not your agency&rsquo;s. It goes with you when you leave, it shows what you did
        without naming who for, and it is off until you turn it on.
      </p>

      {flash && <p className="text-[13px] text-etyme-verified mt-4">{flash}</p>}
      {error && <p className="text-[13px] text-etyme-attention mt-4">{error}</p>}

      <div className="mt-6">
        {/* ── The address ──────────────────────────────────────────── */}
        <Panel
          title="Your address"
          subtitle="Yours permanently. If you change it, the old one keeps working — it is never given to anybody else."
        >
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-etyme-muted">etyme.com/c/</span>
            <input
              className={field}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="your-name"
            />
            <button
              className={primary}
              disabled={busy || !address.trim() || address === data.address}
              onClick={() => send('/api/me/portfolio', 'PATCH', { address })}
            >
              {data.address ? 'Change' : 'Claim'}
            </button>
          </div>

          {data.previousAddresses.length > 0 && (
            <p className="text-[12px] text-etyme-faint mt-3">
              Still yours and still working: {data.previousAddresses.map((s) => `/c/${s}`).join(', ')}
            </p>
          )}

          {data.url && (
            <p className="text-[13px] mt-3">
              <a
                href={data.url}
                target="_blank"
                rel="noreferrer"
                className="text-etyme-action hover:underline"
              >
                See it as a stranger sees it →
              </a>
            </p>
          )}
        </Panel>

        {/* ── On or off ────────────────────────────────────────────── */}
        <Panel title={data.on ? 'Your page is live' : 'Your page is off'} subtitle={data.note}>
          <button
            className={data.on ? quiet : primary}
            disabled={busy}
            onClick={() => send('/api/me/portfolio', 'PATCH', { on: !data.on })}
          >
            {data.on ? 'Turn it off' : 'Turn it on'}
          </button>
        </Panel>

        {/* ── The words ────────────────────────────────────────────── */}
        <Panel
          title="What it says about you"
          subtitle="Only these words are stored. Everything else on the page is read from your work every time somebody opens it, so it cannot go out of date."
        >
          <Lbl>Headline</Lbl>
          <input
            className={`${field} mt-1.5`}
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="SAP FICO consultant"
          />

          <div className="mt-4">
            <Lbl>A line or two</Lbl>
            <textarea
              className={`${field} mt-1.5 h-24 resize-none`}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="Written from your own work if you would rather not."
            />
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              className={primary}
              disabled={busy || (!headline.trim() && !intro.trim())}
              onClick={() => send('/api/me/portfolio', 'PATCH', { headline, intro })}
            >
              Save
            </button>
            <button
              className={quiet}
              disabled={busy}
              onClick={() =>
                send('/api/me/portfolio/write', 'POST', {
                  replaceMine: data.writtenBy === 'PERSON',
                })
              }
            >
              Write it for me
            </button>
            <span className="text-[12px] text-etyme-faint">
              {data.writtenBy === 'PERSON'
                ? 'These are your words.'
                : data.writtenBy === 'NOT_YET'
                  ? 'Not written yet.'
                  : data.modelAvailable
                    ? 'Written from your work.'
                    : 'Written from your work by rule.'}
            </span>
          </div>
        </Panel>

        {/* ── What a stranger sees ─────────────────────────────────── */}
        {p && (
          <Panel
            title="What a stranger sees"
            subtitle="Counted from real engagements. No client is named anywhere on it."
          >
            <p className="text-[15px] text-etyme-ink">{p.availability}</p>

            {p.skills.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {p.skills.map((s) => (
                  <span
                    key={s.skill}
                    className="px-2.5 py-1 rounded-full bg-etyme-canvas border border-etyme-rule text-[12px] text-etyme-ink"
                  >
                    {s.skill}
                    {s.years !== null && (
                      <span className="ml-1.5 text-etyme-faint tabular-nums">{s.years}y</span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {p.engagements.length > 0 ? (
              <div className="mt-5 space-y-2">
                {p.engagements.map((e, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-4">
                    <span className="text-[14px] text-etyme-ink">
                      {e.role}
                      {e.sector && <span className="text-etyme-muted"> · {e.sector}</span>}
                    </span>
                    <span className="text-[12px] text-etyme-muted tabular-nums shrink-0">
                      {e.lasted}
                      {e.current && <span className="text-etyme-verified ml-1.5">now</span>}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-etyme-faint mt-4">
                No engagements recorded on Etyme yet. This fills in as you work.
              </p>
            )}

            {p.verified.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-5">
                {p.verified.map((v) => (
                  <span
                    key={v}
                    className="px-2.5 py-1 rounded-full bg-etyme-verified/10 text-[12px] text-etyme-verified"
                  >
                    {v}
                  </span>
                ))}
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  )
}
