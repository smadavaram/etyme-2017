'use client'

import { useEffect, useMemo, useState } from 'react'

/**
 * Being screened — the other direction.
 *
 * Every other document screen here asks somebody else for papers. This
 * one answers the question a client's procurement team asks us, and
 * answers the one nobody asks until the bid is lost: could we answer it
 * today?
 *
 * A working surface. Dense, searchable, tabular figures — the serif is
 * for the headline and the hero number only. The one piece of prose that
 * earns its place is the refusal, because somebody who has been told the
 * bid closes at five will go looking for the override, and there is not
 * one.
 */

interface PackRow {
  key: string
  label: string
  ready: boolean
  asked: number
  answerable: number
  percent: number | null
  says: string
  askedBy: string | null
  lapsed: { key: string; label: string; says: string }[]
  neverCollected: { key: string; label: string; required: boolean }[]
  noExpiryRecorded: { key: string; label: string; says: string }[]
  expiresInsideHorizon: { key: string; label: string; daysLeft: number | null }[]
  unconfirmed: { key: string; label: string }[]
}

interface SentRow {
  id: string
  label: string
  to: string
  sentBy: string
  sentAt: string
  itemCount: number
  expiresAt: string
  expiresInDays: number
  linkExpired: boolean
  earliestDocument: { label: string; expiresAt: string } | null
}

type Filter = 'all' | 'blocked' | 'ready'

export default function OutboundPackPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)

  const [sendingKey, setSendingKey] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [refusal, setRefusal] = useState<any>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/outbound-pack')
      const body = await res.json()
      if (res.status === 403) {
        setDenied(body.error?.message ?? 'You cannot see this.')
        return
      }
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setData(body.data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const packs: PackRow[] = data?.packs ?? []
  const sent: SentRow[] = data?.sent ?? []

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return packs.filter((p) => {
      if (filter === 'blocked' && p.ready) return false
      if (filter === 'ready' && !p.ready) return false
      if (!q) return true
      return (
        p.label.toLowerCase().includes(q) ||
        (p.askedBy ?? '').toLowerCase().includes(q) ||
        p.lapsed.some((l) => l.label.toLowerCase().includes(q)) ||
        p.neverCollected.some((l) => l.label.toLowerCase().includes(q))
      )
    })
  }, [packs, query, filter])

  async function send(packKey: string) {
    setBusy(true)
    setResult(null)
    setRefusal(null)
    try {
      const res = await fetch('/api/outbound-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packKey, recipientEmail: email }),
      })
      const body = await res.json()
      if (!res.ok) {
        if (body.error?.code === 'NOT_SENDABLE') setRefusal(body.error)
        else setError(body.error?.message ?? `HTTP ${res.status}`)
        return
      }
      setResult(body.data)
      setSendingKey(null)
      setEmail('')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // ── Denied ──────────────────────────────────────────────────────────
  if (denied) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-6">
        <header className="page-head">
          <p className="eyebrow">Operate</p>
          <h1>Being screened</h1>
        </header>
        <div className="panel">
          <p className="text-[13px] text-etyme-ink">{denied}</p>
          <p className="mt-2 text-[13px] text-etyme-muted">
            An outbound pack is a company answering for itself, so it needs a company to answer for.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 px-4 py-6">
      <header className="page-head">
        <p className="eyebrow">Operate</p>
        <h1>Being screened</h1>
        <p>
          A vendor spends as much time being screened as screening. This is what we can
          put in front of a client&rsquo;s procurement team today — and what would stop
          us, before the bid rather than after.
        </p>
      </header>

      {/* ── Loading ──────────────────────────────────────────────── */}
      {loading && !data && (
        <p className="text-[13px] text-etyme-muted">Checking what we hold…</p>
      )}

      {/* ── Error ────────────────────────────────────────────────── */}
      {error && (
        <div className="panel" style={{ borderColor: 'var(--color-attention)' }}>
          <p className="text-[13px] text-etyme-attention">{error}</p>
          <button className="btn-secondary mt-3" onClick={() => { setError(null); load() }}>
            Try again
          </button>
        </div>
      )}

      {/* ── The number worth putting on a screen ─────────────────── */}
      {data?.standing && (
        <>
          <div className="flex flex-wrap items-baseline gap-8 border-b border-etyme-rule pb-4">
            <div>
              <p className="stat-label">Packs we could send</p>
              <p
                className="stat-value tabular-nums"
                style={{
                  color:
                    data.standing.ready === data.standing.packs
                      ? 'var(--color-verified)'
                      : 'var(--color-attention)',
                }}
              >
                {data.standing.ready}<span className="text-etyme-faint">/{data.standing.packs}</span>
              </p>
            </div>
            {data.standing.lapsed > 0 && (
              <div>
                <p className="stat-label">Lapsed</p>
                <p className="stat-value tabular-nums" style={{ color: 'var(--color-danger)' }}>
                  {data.standing.lapsed}
                </p>
              </div>
            )}
            {data.standing.noExpiryRecorded > 0 && (
              <div>
                <p className="stat-label">Expiry unknown</p>
                <p className="stat-value tabular-nums" style={{ color: 'var(--color-attention)' }}>
                  {data.standing.noExpiryRecorded}
                </p>
              </div>
            )}
            {data.standing.expiringInsideHorizon > 0 && (
              <div>
                <p className="stat-label">Gone in {data.horizonDays} days</p>
                <p className="stat-value tabular-nums">{data.standing.expiringInsideHorizon}</p>
              </div>
            )}
            {data.standing.neverCollected > 0 && (
              <div>
                <p className="stat-label">Never collected</p>
                <p className="stat-value tabular-nums">{data.standing.neverCollected}</p>
              </div>
            )}
            {data.standing.unconfirmed > 0 && (
              <div>
                <p className="stat-label">Nobody checked</p>
                <p className="stat-value tabular-nums">{data.standing.unconfirmed}</p>
              </div>
            )}
          </div>

          <p className="text-[13px] text-etyme-ink">{data.standing.says}</p>
        </>
      )}

      {/* ── Empty — nothing on file at all ───────────────────────── */}
      {data && data.standing.ready === 0 && data.standing.lapsed === 0 && data.standing.neverCollected > 0 && (
        <div className="panel">
          <p className="text-[13px] text-etyme-ink">
            We hold none of our own screening documents yet, so every pack here is empty.
          </p>
          <p className="mt-2 text-[13px] text-etyme-muted">
            Put the W-9, the certificates of insurance and the business registration on file
            first. A certificate that expires cannot go on file without its date — an unknown
            expiry looks current on every screen until the day somebody audits it.
          </p>
        </div>
      )}

      {/* ── Sent, with a refusal ─────────────────────────────────── */}
      {refusal && (
        <div className="panel" style={{ borderColor: 'var(--color-danger)' }}>
          <p className="lbl" style={{ color: 'var(--color-danger)' }}>Not sent</p>
          <p className="mt-2 text-[13px] text-etyme-ink">{refusal.message}</p>
          <ul className="mt-3 space-y-1">
            {refusal.refusals?.map((r: any) => (
              <li key={r.key} className="text-[13px] text-etyme-muted">
                <span className="text-etyme-ink">{r.label}</span> — {r.because}
              </li>
            ))}
            {refusal.missing?.map((m: any) => (
              <li key={m.key} className="text-[13px] text-etyme-muted">
                <span className="text-etyme-ink">{m.label}</span> — not on file.
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-etyme-muted">{refusal.fix}</p>
        </div>
      )}

      {result && (
        <div className="panel" style={{ borderColor: 'var(--color-verified)' }}>
          <p className="text-[13px] text-etyme-ink">{result.message}</p>
          <p className="mt-2 text-[13px]">
            <span className="text-etyme-muted">Link, valid to {result.expiresAt}: </span>
            <a href={result.link} style={{ color: 'var(--color-action)' }}>{result.link}</a>
          </p>
          {result.linkClampedBecause && (
            <p className="mt-1 text-[12px] text-etyme-attention">{result.linkClampedBecause}</p>
          )}
        </div>
      )}

      {/* ── Search on every list ─────────────────────────────────── */}
      {data && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search packs and documents"
            className="min-w-[240px] flex-1 rounded border border-etyme-rule bg-etyme-raised px-3 py-2 text-[13px]"
          />
          {(['all', 'blocked', 'ready'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`filter-tab ${filter === f ? 'filter-tab--active' : 'filter-tab--inactive'}`}
            >
              {f === 'all' ? 'All' : f === 'blocked' ? 'Would not go' : 'Ready'}
            </button>
          ))}
        </div>
      )}

      {/* ── Partial — a filter or a search that found nothing ────── */}
      {data && shown.length === 0 && packs.length > 0 && (
        <div className="panel">
          <p className="text-[13px] text-etyme-muted">
            Nothing matches. {packs.length} pack{packs.length === 1 ? '' : 's'} in total —
            clear the search to see them.
          </p>
        </div>
      )}

      {shown.map((p) => (
        <article key={p.key} className="panel">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-etyme-ink">{p.label}</p>
              {p.askedBy && <p className="mt-0.5 text-[12px] text-etyme-faint">{p.askedBy}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular-nums text-[13px] text-etyme-muted">
                {p.answerable} of {p.asked}
              </span>
              <span className={`chip ${p.ready ? 'chip--verified' : 'chip--attention'}`}>
                {p.ready ? 'ready to send' : 'would not go'}
              </span>
            </div>
          </div>

          <p className="mt-2 text-[13px] text-etyme-ink">{p.says}</p>

          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-etyme-rule pt-3">
            <button
              className="text-[13px]"
              style={{ color: 'var(--color-action)' }}
              onClick={() => setOpen(open === p.key ? null : p.key)}
            >
              {open === p.key ? 'Hide detail' : 'Why'}
            </button>

            {data?.canSend ? (
              sendingKey === p.key ? (
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="procurement@client.com"
                    className="rounded border border-etyme-rule bg-etyme-raised px-2 py-1.5 text-[13px]"
                  />
                  <button className="btn-primary" disabled={busy} onClick={() => send(p.key)}>
                    {busy ? 'Sending…' : 'Send'}
                  </button>
                  <button className="btn-secondary" onClick={() => setSendingKey(null)}>Cancel</button>
                </span>
              ) : (
                <button className="btn-secondary ml-auto" onClick={() => { setSendingKey(p.key); setRefusal(null); setResult(null) }}>
                  Send this pack
                </button>
              )
            ) : (
              <span className="ml-auto text-[12px] text-etyme-faint">
                Sending our own documents out needs settings.manage
              </span>
            )}
          </div>

          {open === p.key && (
            <div className="mt-3 space-y-3 border-t border-etyme-rule pt-3">
              <Group
                label="Lapsed — will not be sent"
                tone="danger"
                rows={p.lapsed.map((l) => ({ key: l.key, label: l.label, note: l.says }))}
              />
              <Group
                label="On file, expiry never recorded — will not be sent"
                tone="attention"
                rows={p.noExpiryRecorded.map((l) => ({ key: l.key, label: l.label, note: l.says }))}
              />
              <Group
                label="Never collected"
                tone="passive"
                rows={p.neverCollected.map((l) => ({
                  key: l.key,
                  label: l.label,
                  note: l.required ? 'Required. Nothing to send.' : 'Optional.',
                }))}
              />
              <Group
                label={`Expires inside the next ${data.horizonDays} days`}
                tone="attention"
                rows={p.expiresInsideHorizon.map((l) => ({
                  key: l.key,
                  label: l.label,
                  note: `${l.daysLeft} days left. Renew before, not during.`,
                }))}
              />
              <Group
                label="Nobody here has confirmed they looked at it"
                tone="passive"
                rows={p.unconfirmed.map((l) => ({ key: l.key, label: l.label, note: 'Going out on trust.' }))}
              />
            </div>
          )}
        </article>
      ))}

      {/* ── Sent packs — a working table ─────────────────────────── */}
      {data && (
        <section>
          <p className="lbl text-etyme-faint">Sent</p>
          {sent.length === 0 ? (
            <p className="mt-2 text-[13px] text-etyme-muted">
              Nothing sent yet. When a pack goes out its link is listed here with the date it dies.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Pack</th>
                    <th>To</th>
                    <th>Sent</th>
                    <th className="text-right">Items</th>
                    <th>Link dies</th>
                    <th>Earliest document</th>
                  </tr>
                </thead>
                <tbody>
                  {sent.map((s) => (
                    <tr key={s.id}>
                      <td className="text-[13px] text-etyme-ink">{s.label}</td>
                      <td className="text-[13px] text-etyme-muted">{s.to}</td>
                      <td className="tabular-nums text-[13px] text-etyme-muted">{s.sentAt}</td>
                      <td className="tabular-nums text-right text-[13px]">{s.itemCount}</td>
                      <td className="tabular-nums text-[13px]">
                        {s.linkExpired ? (
                          <span className="chip chip--passive">expired {s.expiresAt}</span>
                        ) : (
                          <span className="text-etyme-muted">{s.expiresAt}</span>
                        )}
                      </td>
                      <td className="tabular-nums text-[13px] text-etyme-muted">
                        {s.earliestDocument
                          ? `${s.earliestDocument.label} — ${s.earliestDocument.expiresAt}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Group({
  label,
  tone,
  rows,
}: {
  label: string
  tone: 'danger' | 'attention' | 'passive'
  rows: { key: string; label: string; note: string }[]
}) {
  if (rows.length === 0) return null
  return (
    <div>
      <p className={`chip chip--${tone}`}>{label}</p>
      <ul className="mt-2 space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="text-[13px] text-etyme-muted">
            <span className="text-etyme-ink">{r.label}</span> — {r.note}
          </li>
        ))}
      </ul>
    </div>
  )
}
