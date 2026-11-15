'use client'

import { usePageSection } from '@/components/page-section'
import { amount, DEFAULT_CURRENCY } from '@/lib/money-display'
import { ErrorState, Field, LoadingState, PageHead, Panel, RefusedState, SubmitButton, Textarea } from '@/components/ui'
import { useEffect, useState } from 'react'
import { useSession } from '@/components/session-provider'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'
import { mayOpen } from '@/lib/nav-table'
import { teamsLinkAsk, TEAMS_LINK_HREF, TEAMS_LINK_SAYS, TEAMS_LINK_WHERE } from '@/lib/team-structure/directory/words'

/**
 * Their books, fed from ours. Export once, stamped as sent; reconcile
 * with every break named.
 */

export default function IntegrationsPage() {
  const session = useSession()
  const seat = sidebarPropsFrom(session)
  const section = usePageSection('/dashboard/integrations')
  const [data, setData] = useState<any>(null)
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [statement, setStatement] = useState('')
  const [recon, setRecon] = useState<any>(null)
  // A refusal is the page: its sentence alone, never beside the
  // reconcile form (sign-up walk, round five, problem 10).
  const [refused, setRefused] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [e, r] = await Promise.all([
        fetch('/api/integrations/export'),
        fetch('/api/integrations/reconcile'),
      ])
      const eb = await e.json()
      const rb = await r.json()
      if (e.status === 403 || r.status === 403) {
        setRefused((e.status === 403 ? eb : rb).error?.message ?? 'Integrations are not part of your seat. Ask your company’s owner if you need them.')
        return
      }
      if (!e.ok) throw new Error(eb.error?.message ?? `HTTP ${e.status}`)
      setData(eb.data)
      setRuns(rb.data?.runs ?? [])
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function doExport() {
    setNote(null)
    const res = await fetch('/api/integrations/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const body = await res.json()
    if (!res.ok) {
      setNote(body.error?.message ?? 'Export refused.')
      return
    }
    setNote(body.data.says)
    if (body.data.csv) {
      const blob = new Blob([body.data.csv], { type: 'text/csv' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'etyme-journal.csv'
      a.click()
    }
    load()
  }

  async function doReconcile() {
    setNote(null)
    // One line per row: amount,date,ref — the shape a bank or AP
    // statement pastes as.
    const theirs = statement
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [amount, on, ref] = l.split(',').map((x) => x.trim())
        return { amount: Number(amount), on, ref: ref || null }
      })
      .filter((t) => Number.isFinite(t.amount))

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    const res = await fetch('/api/integrations/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        periodStart: start.toISOString(),
        periodEnd: now.toISOString(),
        theirs,
      }),
    })
    const body = await res.json()
    if (!res.ok) {
      setNote(body.error?.message ?? 'Could not reconcile.')
      return
    }
    setRecon(body.data)
    load()
  }

  if (refused) return <RefusedState says={refused} />

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6">
      <PageHead
        eyebrow={section}
        title="Integrations"
        subtitle="The journal exports once and is stamped as sent — a re-export is a double posting somebody’s auditor finds. Reconciliation names every break, because a bare difference gets redone next month from zero."
      />

      {/* The one integration a small firm uses is the Teams link, pasted on
          Settings; one line points there, no panel of its own (fault 22). */}
      <p className="mb-5 text-[13px] text-etyme-muted">
        {TEAMS_LINK_SAYS}{' '}
        {mayOpen(TEAMS_LINK_HREF, seat.permissions)
          ? <a href={TEAMS_LINK_HREF} className="text-etyme-action-press hover:underline">{TEAMS_LINK_WHERE}</a>
          : teamsLinkAsk(session.roleName)}
      </p>

      {loading && <LoadingState says="Opening integrations…" />}
      {error && <ErrorState says={error} action={{ label: 'Try again', onClick: () => load() }} />}
      {note && <p className="text-[13px] text-etyme-ink">{note}</p>}

      {data && (
        <Panel title="Your journal, as a file">
          {/* Only what is true today, in the route's words (E6): no product
              reads as chosen, and Export is drawn only where entries wait,
              the firm's own account codes exist and the seat's route takes it. */}
          <div className="space-y-2">
            {(data.says as string[]).map((line) => (
              <p key={line} className="text-[13px] text-etyme-ink">{line}</p>
            ))}
          </div>
          {data.showExport && (
            <SubmitButton type="button" onClick={doExport} className="mt-3">
              Export {data.pending} {data.pending === 1 ? 'entry' : 'entries'}
            </SubmitButton>
          )}
        </Panel>
      )}

      {data && (
      <Panel title="Reconcile against a statement">
        <Field
          label="Their statement"
          help={<>Paste their lines, one per row: amount, date, reference. Example:{' '}
            <code className="text-[12px]">3800.00, 2026-08-31, IN_ABC123_001</code></>}
        >
          <Textarea
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            rows={5}
            className="font-mono text-[12px]"
            placeholder="3800.00, 2026-08-31, IN_ABC123_001"
          />
        </Field>
        <SubmitButton type="button" onClick={doReconcile} disabled={!statement.trim()} className="mt-3">
          Reconcile
        </SubmitButton>

        {recon && (
          <div className="mt-4 border-t border-etyme-rule pt-3">
            <p className="text-[13px] text-etyme-ink">{recon.says}</p>
            <ul className="mt-2 space-y-1">
              {recon.breaks.map((b: any, i: number) => (
                <li key={i} className="text-[12px] text-etyme-muted">
                  {b.says}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
      )}

      {runs.length > 0 && (
        <Panel title="Past reconciliations">
          <ul className="space-y-2">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-3 text-[13px]">
                <span className="text-etyme-ink">{r.against}</span>
                <span className="text-etyme-faint">{r.period}</span>
                <span
                  className="tabular-nums"
                  style={{ color: r.differenceCents === 0 ? 'var(--color-verified)' : 'var(--color-attention)' }}
                >
                  {r.differenceCents === 0
                    ? 'exactly'
                    : `${amount(Math.abs(r.differenceCents), r.currency ?? DEFAULT_CURRENCY)} apart · ${(r.breaks as any[]).length} breaks named`}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
