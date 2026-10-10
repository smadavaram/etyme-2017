'use client'

import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { refusalSentence } from '@/lib/refusal-words'
import { Chip, EmptyState, ErrorState, FormMessage, LoadingState, PageHead, RefusedState, type ChipTone } from '@/components/ui'

import { useEffect, useState } from 'react'

/**
 * The five onboardings, derived live. Nothing here is stored state —
 * every checklist is computed from what actually exists, so it cannot
 * drift from the truth.
 */

const TABS = ['CLIENTS', 'SUPPLIERS', 'CONSULTANTS', 'ASSIGNMENTS'] as const
type Tab = (typeof TABS)[number]

const STATE_CHIP: Record<string, ChipTone> = {
  DONE: 'verified',
  MISSING: 'attention',
  STALE: 'attention',
  NOT_APPLICABLE: 'passive',
}

export default function OnboardingPage() {
  // The section this page sits under on the reader's own menu, never a
  // word typed by hand (sign-up walk, round four, item 13).
  const section = usePageSection('/dashboard/onboarding')
  const [tab, setTab] = useState<Tab>('ASSIGNMENTS')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // A refusal is the page: its sentence alone, with no tabs around it
  // (sign-up walk, round six, problem 12). Nothing is drawn before the
  // first read answers.
  const [refused, setRefused] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding/readiness')
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}))
        setRefused(refusalSentence(body?.error?.message) || 'Setup is not part of your seat. Ask your company’s owner if you need it.')
        return
      }
      const body = await readJson(res)
      setData(body.data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function confirmStart(contractId: string) {
    const res = await fetch('/api/onboarding/confirm-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId }),
    })
    const body = await res.json()
    setNote(body.data?.says ?? body.error?.message ?? null)
    load()
  }

  const lists: Record<Tab, any[]> = {
    CLIENTS: data?.clients ?? [],
    SUPPLIERS: data?.suppliers ?? [],
    CONSULTANTS: data?.consultants ?? [],
    ASSIGNMENTS: data?.assignments ?? [],
  }

  if (refused) return <RefusedState says={refused} />
  if (!data && loading) return <LoadingState says="Opening setup…" />

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6">
      <PageHead
        eyebrow={section}
        title="Setup"
        subtitle="One word, five processes. Each list is derived from what actually exists right now — nothing here is a ticked box that can drift from the truth."
      />

      <div className="flex flex-wrap gap-1 border-b border-etyme-rule">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-2 text-[13px] capitalize"
            style={
              tab === t
                ? { borderBottom: '2px solid var(--color-action)', color: 'var(--color-ink)', fontWeight: 600 }
                : { color: 'var(--color-muted)' }
            }
          >
            {t.toLowerCase()} {lists[t].length > 0 && `(${lists[t].filter((c: any) => !c.ready).length} open)`}
          </button>
        ))}
      </div>

      {loading && <LoadingState compact says={`Opening ${tab.toLowerCase()}…`} />}
      {error && <ErrorState says={error} action={{ label: 'Try again', onClick: () => load() }} />}
      {note && <FormMessage tone="ok">{note}</FormMessage>}

      {!loading && !error && lists[tab].length === 0 && (
        <EmptyState says={`Nothing here yet. This list fills itself as ${tab.toLowerCase()} exist.`} />
      )}

      {!loading &&
        lists[tab].map((c: any, i: number) => (
          <article key={i} className="panel">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[15px] font-semibold text-etyme-ink">{c.subject}</p>
              <Chip tone={c.ready ? 'verified' : 'passive'}>
                {c.done}/{c.of}
              </Chip>
            </div>
            <p className="mt-1 text-[13px] text-etyme-muted">{c.says}</p>

            <ul className="mt-3 space-y-2 border-t border-etyme-rule pt-3">
              {c.items
                .filter((it: any) => it.state !== 'NOT_APPLICABLE')
                .map((it: any) => (
                  <li key={it.key} className="flex flex-wrap items-baseline gap-2">
                    <Chip tone={STATE_CHIP[it.state]}>
                      {it.state === 'DONE' ? 'done' : 'missing'}
                    </Chip>
                    <span className="text-[13px] text-etyme-ink">{it.label}</span>
                    {it.state !== 'DONE' && (
                      <>
                        <span className="text-[12px] text-etyme-faint">— {it.why}</span>
                        <a href={it.href} className="text-[12px]" style={{ color: 'var(--color-action)' }}>
                          Fix it →
                        </a>
                      </>
                    )}
                  </li>
                ))}
            </ul>

            {tab === 'ASSIGNMENTS' &&
              !c.items.find((x: any) => x.key === 'start')?.state?.includes('DONE') &&
              data?.assignmentIds?.[i] &&
              c.items.find((x: any) => x.key === 'start')?.state === 'MISSING' && (
                <button
                  onClick={() => confirmStart(data.assignmentIds[i])}
                  className="btn-primary mt-3 text-[13px]"
                >
                  Confirm they started
                </button>
              )}
          </article>
        ))}
    </div>
  )
}
