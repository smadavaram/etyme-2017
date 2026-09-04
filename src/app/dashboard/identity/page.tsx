'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * Two records that might be one human.
 *
 * When a client and a bench vendor are both here and the prime between
 * them is not, the same person arrives twice and the tenure ledger
 * counts fourteen months and twelve as two people. That number is the
 * one this product sells on, and a confidently wrong one is worse than
 * none.
 *
 * A decision surface, and a careful one. Nothing merges — confirming
 * records that these are one person, and the records stay separate.
 * Merging two different contractors blocks one on a cap they never
 * earned and pays the other at somebody else's rate.
 */

interface Signal { says: string; weight: number; decisive?: boolean }

interface Match {
  aId: string
  bId: string
  name: string
  confidence: 'CERTAIN' | 'LIKELY' | 'POSSIBLE'
  score: number
  signals: Signal[]
  monthsIfSame: number
  says: string
  ifConfirmed: { months: number; overCap: boolean; says: string }
}

const TONE: Record<string, string> = {
  CERTAIN: 'chip--verified',
  LIKELY: 'chip--action',
  POSSIBLE: 'chip--passive',
}

export default function IdentityPage() {
  const [matches, setMatches] = useState<Match[]>([])
  const [summary, setSummary] = useState('')
  const [note, setNote] = useState('')
  const [dismissing, setDismissing] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/identity')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setMatches(body.data.matches)
      setSummary(body.data.summary)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function decide(m: Match, same: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/identity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          aId: m.aId, bId: m.bId, same,
          confidence: m.confidence, score: m.score,
          signals: m.signals, monthsIfSame: m.monthsIfSame,
          note: same ? undefined : note,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setDone(body.data.says)
      setNote('')
      setDismissing(null)
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Governance</p>
        <h1 className="headline-serif text-[30px] leading-tight">Same person, twice?</h1>
        <p className="mt-2 max-w-[58ch] text-[13px] text-etyme-muted">
          When a supplier in the middle of a chain is not on Etyme, one
          contractor can arrive twice under two records — and their tenure here
          reads as two shorter spells instead of one long one.
        </p>
      </header>

      <p className="border-b border-etyme-rule pb-4 text-[14px] text-etyme-ink">{summary}</p>

      {done && (
        <div className="panel">
          <p className="text-[13px]" style={{ color: 'var(--color-verified)' }}>{done}</p>
        </div>
      )}

      {loading && <p className="text-[13px] text-etyme-muted">Loading…</p>}

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {!loading && matches.length === 0 && !error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Nobody looks like a duplicate. This fills in as suppliers put people
            forward through chains we can only see part of.
          </p>
        </div>
      )}

      {matches.map((m) => (
        <article
          key={`${m.aId}:${m.bId}`}
          className="panel"
          style={m.ifConfirmed.overCap ? { borderColor: 'var(--color-attention)' } : undefined}
        >
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[15px] font-semibold text-etyme-ink">{m.name}</p>
            <span className={`chip ${TONE[m.confidence]}`}>{m.confidence.toLowerCase()}</span>
          </div>

          <p className="mt-2 text-[13px] text-etyme-muted">{m.says}</p>

          {/* The consequence, said before anybody decides. "These might be
              the same person" is a curiosity; the tenure line is a decision. */}
          <p
            className={`mt-2 text-[13px] ${m.ifConfirmed.overCap ? 'text-etyme-attention' : 'text-etyme-ink'}`}
          >
            {m.ifConfirmed.says}
          </p>

          <ul className="mt-3 space-y-1.5 border-t border-etyme-rule pt-3">
            {m.signals.map((s, i) => (
              <li
                key={i}
                className="text-[12px]"
                style={{ color: s.weight < 0 ? 'var(--color-attention)' : 'var(--color-muted)' }}
              >
                {s.weight < 0 ? '✕ ' : '✓ '}{s.says}
              </li>
            ))}
          </ul>

          {dismissing !== `${m.aId}:${m.bId}` ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => decide(m, true)}
                disabled={busy}
                className="rounded bg-etyme-action px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
              >
                Yes, one person
              </button>
              <button
                onClick={() => setDismissing(`${m.aId}:${m.bId}`)}
                disabled={busy}
                className="rounded border border-etyme-rule px-4 py-2 text-[12px] text-etyme-muted"
              >
                No, two people
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why are they not the same person?"
                className="w-full rounded border border-etyme-rule bg-etyme-raised px-3 py-2 text-[13px]"
              />
              <p className="text-[11px] text-etyme-faint">
                In six months nobody will remember why two obvious duplicates
                were left apart.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => decide(m, false)}
                  disabled={busy || note.trim().length < 3}
                  className="rounded border border-etyme-rule px-4 py-2 text-[12px] text-etyme-ink disabled:opacity-40"
                >
                  Record as two people
                </button>
                <button
                  onClick={() => { setDismissing(null); setNote('') }}
                  className="px-2 text-[12px] text-etyme-faint underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </article>
      ))}

      {matches.length > 0 && (
        <p className="border-t border-etyme-rule pt-4 text-[12px] leading-relaxed text-etyme-faint">
          Nothing is merged. Confirming records that these are one person; the two
          records stay separate and tenure reads the link. Merging two different
          contractors would block one on a cap they never earned and pay the other
          at somebody else&rsquo;s rate.
        </p>
      )}
    </div>
  )
}
