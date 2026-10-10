'use client'

import { readJson } from '@/lib/read-response'

import { useEffect, useState } from 'react'
import { usePageSection } from '@/components/page-section'
import { useSession } from '@/components/session-provider'
import { refusalOf, refusedRead } from '@/lib/money/refused-read'
import { Chip, EmptyState, ErrorState, LoadingState, PageHead, RefusedState, Stat, type ChipTone } from '@/components/ui'

/**
 * The links nobody meant to leave broken.
 *
 * A queue, not a report. A report is something somebody has to think to
 * ask for, and the person who would think to ask is the one who already
 * knows the numbers are wrong.
 *
 * Sorted worst and oldest first, deliberately. A gap found this week is a
 * phone call. The same gap in April is archaeology.
 */

const money = (c: number) =>
  `${c < 0 ? '-' : ''}$${Math.abs(Math.round(c / 100)).toLocaleString('en-US')}`

const SEVERITY: Record<string, { tone: ChipTone; word: string }> = {
  BREAKS_REPORTING: { tone: 'attention', word: 'breaks reporting' },
  MISSTATES_MARGIN: { tone: 'attention', word: 'misstates margin' },
  WORTH_TIDYING: { tone: 'passive', word: 'worth tidying' },
}

export default function LooseEndsPage() {
  // The section this page sits under on the reader's own menu, and
  // nothing while that is not known yet — never a word typed by hand.
  const section = usePageSection('/dashboard/loose-ends')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** What the route said when it refused the read; null where it did not. */
  const [refusedSaid, setRefusedSaid] = useState<string | null>(null)
  const { company, loading: sessionLoading } = useSession()

  useEffect(() => {
    fetch('/api/loose-ends')
      .then(async (r) => {
        // A refusal is not "nothing loose" (sign-up walk, round four, #5).
        if (r.status === 403) {
          setRefusedSaid(refusalOf(r.status, await r.json().catch(() => null)))
          return
        }
        const b = await readJson(r)
        setData(b.data)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Money pages wait (sign-up walk, round three, #17): until the session
  // says whose company this is, no figure and no refusal naming a desk.
  if (!company) {
    return sessionLoading ? <LoadingState /> : <RefusedState says="These are a company’s books, and you are not signed in at a company." />
  }
  // Refused: the sentence and nothing else — no count, no figure.
  const refused = refusedRead(refusedSaid, { what: 'Missing paperwork', kind: company.kind, company: company.name })
  if (refused) {
    return <RefusedState says={refused} />
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6">
      <PageHead
        eyebrow={section}
        title="Missing paperwork"
        subtitle={<>
          Placements missing the link that makes them add up. Worst first, then
          oldest — because a gap found this week is a phone call and the same
          gap in April is archaeology.
        </>}
      />

      {loading && <LoadingState says="Opening the missing paperwork…" />}

      {error && <ErrorState says={error} />}

      {data?.standing && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Loose" value={data.standing.total} />
          {data.standing.atRiskCents > 0 && (
            <Stat label="Billed with no cost behind it" value={money(data.standing.atRiskCents)} tone="attention" />
          )}
          {data.standing.coldTrails > 0 && (
            <Stat label="Cold trails" value={data.standing.coldTrails} />
          )}
        </div>
      )}

      {data?.standing && (
        <p className="text-[13px] text-etyme-ink">{data.standing.says}</p>
      )}

      {/* The line the profitability screen needs to hear. */}
      {data?.reporting && !data.reporting.ok && (
        <div className="panel" style={{ borderColor: 'var(--color-attention)' }}>
          <p className="text-[13px] text-etyme-attention">{data.reporting.says}</p>
        </div>
      )}

      {data?.ends?.map((e: any) => (
        <article key={`${e.kind}-${e.subject.id}`} className="panel">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[15px] font-semibold text-etyme-ink">{e.subject.label}</p>
            <div className="flex items-center gap-2">
              {e.coldTrail && <Chip tone="attention">cold trail</Chip>}
              <Chip tone={SEVERITY[e.severity].tone}>{SEVERITY[e.severity].word}</Chip>
            </div>
          </div>

          <p className="mt-2 text-[13px] text-etyme-ink">{e.says}</p>
          <p className="mt-1 text-[13px] text-etyme-muted">{e.fix}</p>

          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-etyme-rule pt-3">
            <span className="text-[11px] text-etyme-faint">
              Loose for {e.ageDays} day{e.ageDays === 1 ? '' : 's'}
            </span>
            {e.subject.client && (
              <span className="text-[11px] text-etyme-faint">{e.subject.client}</span>
            )}
            {e.subject.amountCents > 0 && (
              <span className="text-[11px] tabular-nums text-etyme-faint">
                {money(e.subject.amountCents)}
              </span>
            )}
            <a href={e.href} className="ml-auto text-[13px]" style={{ color: 'var(--color-action)' }}>
              Fix it →
            </a>
          </div>
        </article>
      ))}

      {!loading && data && data.ends.length === 0 && (
        <EmptyState says="Every placement has both sides and an order behind it. Nothing to chase." />
      )}
    </div>
  )
}
