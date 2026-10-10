'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePageSection } from '@/components/page-section'
import { Chip, EmptyState, ErrorState, Field, FilterChips, FormMessage, Input, LoadingState, PageHead, Panel, RefusedState, Select, SubmitButton } from '@/components/ui'

/**
 * Screening packs — the other direction.
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
  // The heading the reader's own menu gives this page, and nothing while
  // the session loads or where that menu does not list it, so no page
  // borrows a section of the company's whole menu.
  const eyebrow = usePageSection('/dashboard/outbound-pack')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)

  // Who is screening us. A pack is answered to somebody, and which
  // somebody decides what is in it: a client whose own purchase order
  // requires a certificate of good standing is answered with one.
  const [askedById, setAskedById] = useState<string>('')

  const [sendingKey, setSendingKey] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [refusal, setRefusal] = useState<any>(null)

  async function load(clientCompanyId = askedById) {
    setLoading(true)
    try {
      const res = await fetch(
        clientCompanyId ? `/api/outbound-pack?clientCompanyId=${encodeURIComponent(clientCompanyId)}` : '/api/outbound-pack'
      )
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
        body: JSON.stringify({
          packKey,
          recipientEmail: email,
          // The same customer the screen was read against, so what was
          // shown and what goes out cannot be two different packs.
          ...(askedById ? { clientCompanyId: askedById } : {}),
        }),
      })
      // A safe parse rather than readJson: this branch needs the
      // error object itself (branches on error.code), and readJson throws an
      // Error, which would lose it. An empty body must still
      // not produce a parser error on screen.
      const body = await res.json().catch(() => ({}) as any)
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
    // The refusal is the whole answer: the route's sentence alone. A
    // second line here — "it needs a company to answer for" — was the
    // no-company sentence, shown to everybody, including desks that have a
    // company and simply do not hold this seat (sign-up walk round six,
    // problem 19). The route's own no-company refusal already says it.
    return <RefusedState says={denied} />
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 px-4 py-6">
      <PageHead
        eyebrow={eyebrow}
        title="Screening packs"
        subtitle="A vendor spends as much time being screened as screening. This is what we can put in front of a client’s procurement team today — and what would stop us, before the bid rather than after."
      />


      {/* ── Who is screening us ──────────────────────────────────────
          The packs below are the ones a procurement team usually asks
          for. A customer that wrote its own rules on its own order asks
          for more, and until this picker existed nothing on this screen
          could say so. */}
      {(data?.customers?.length ?? 0) > 0 && (
        <Panel>
          <Field
            label="Who is screening us"
            help={data.addedSays
              ? <span className="text-etyme-ink">{data.addedSays}</span>
              : askedById ? 'Their orders ask for nothing beyond the usual pack.' : undefined}
          >
            <Select
              className="max-w-[320px]"
              value={askedById}
              onChange={(e) => { setAskedById(e.target.value); load(e.target.value) }}
            >
              <option value="">Nobody in particular — the usual pack</option>
              {data.customers.map((c: { id: string; name: string }) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </Panel>
      )}

      {/* ── Loading ──────────────────────────────────────────────── */}
      {loading && !data && (
        <LoadingState says="Checking what we hold…" />
      )}

      {/* ── Error ────────────────────────────────────────────────── */}
      {error && (
        <ErrorState says={error} action={{ label: 'Try again', onClick: () => { setError(null); load() } }} />
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
        <EmptyState
          says="We hold none of our own screening documents yet, so every pack here is empty."
          detail="Put the W-9, the certificates of insurance and the business registration on file first. A certificate that expires cannot go on file without its date — an unknown expiry looks current on every screen until the day somebody audits it."
        />
      )}

      {/* ── Sent, with a refusal ─────────────────────────────────── */}
      {refusal && (
        <div className="panel" style={{ borderColor: 'var(--color-danger)' }}>
          <p className="lbl" style={{ color: 'var(--color-danger)' }}>Not sent</p>
          <div className="mt-2"><FormMessage tone="error">{refusal.message}</FormMessage></div>
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
          <FormMessage tone="ok">{result.message}</FormMessage>
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
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search packs and documents"
            placeholder="Search packs and documents"
            className="min-w-[240px] flex-1 w-auto"
          />
          <FilterChips<Filter>
            label="Which packs"
            value={filter}
            onChange={setFilter}
            options={[
              { key: 'all', label: 'All' },
              { key: 'blocked', label: 'Would not go', warn: true },
              { key: 'ready', label: 'Ready' },
            ]}
          />
        </div>
      )}

      {/* ── Partial — a filter or a search that found nothing ────── */}
      {data && shown.length === 0 && packs.length > 0 && (
        <EmptyState
          says="Nothing matches."
          detail={`${packs.length} pack${packs.length === 1 ? '' : 's'} in total — clear the search to see them.`}
        />
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
              <Chip tone={p.ready ? 'verified' : 'attention'}>
                {p.ready ? 'ready to send' : 'would not go'}
              </Chip>
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
                <span className="ml-auto flex flex-wrap items-end gap-2">
                  <Field label="Send it to">
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="procurement@client.com"
                    />
                  </Field>
                  {/* A button the route will refuse is a button that
                      lies. This one posted an empty box and came back
                      422 "An email address to send this to". The
                      overtime reason box beside it has always been
                      right; this is the same shape. */}
                  <SubmitButton
                    type="button"
                    pending={busy}
                    pendingLabel="Sending…"
                    disabled={busy || !email.trim()}
                    onClick={() => send(p.key)}
                  >
                    Send
                  </SubmitButton>
                  <button className="btn-secondary" onClick={() => setSendingKey(null)}>Cancel</button>
                </span>
              ) : (
                <button className="btn-secondary ml-auto" onClick={() => { setSendingKey(p.key); setRefusal(null); setResult(null) }}>
                  Send this pack
                </button>
              )
            ) : (
              <span className="ml-auto max-w-[420px] text-[12px] text-etyme-faint">
                {data?.cannotSend ??
                  'Sending this firm’s own documents out is somebody else’s desk here.'}
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
