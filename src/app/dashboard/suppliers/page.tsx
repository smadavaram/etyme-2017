'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Your suppliers.
 *
 * A client running contract staff already has twelve of them and an MSA
 * with each. This is the box they paste that list into — the one they
 * already email — and every firm in it becomes a supplier they can send
 * a role to today, whether or not that firm has heard of us.
 *
 * Two steps on purpose. Read first, create second: creating twelve
 * companies and then asking somebody to check them is the wrong way
 * round, and the wrong ones are hard to take back out.
 */

interface Row {
  company: string | null
  contactName: string | null
  email: string
  domain: string | null
  line: string
  needs: string[]
}

interface Pair {
  domain: string
  ok: boolean
  keep: { id: string; name: string } | null
  fold: { id: string; name: string } | null
  says: string
  moving: string[]
  button: string
}

interface Supplier {
  companyId: string
  name: string
  joined: boolean
  agreement: boolean
  contacts: { email: string; name: string | null; state: string }[]
  invitedAt: string | null
  where: string
}

export default function SuppliersPage() {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [readSummary, setReadSummary] = useState('')
  const [skipped, setSkipped] = useState<string[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [pairs, setPairs] = useState<Pair[]>([])
  const [listSummary, setListSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setSuppliers(body.data.suppliers)
      setListSummary(body.data.summary)

      // The same firm listed twice. Two clients each list Cloudepa and
      // neither knows the other did — a real state, and one somebody has
      // to be able to fix.
      const dup = await fetch('/api/suppliers/join').then((r) => r.json()).catch(() => null)
      setPairs(dup?.data?.pairs ?? [])
    } catch (err: any) {
      setError(err.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function read() {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch('/api/suppliers/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setRows(body.data.rows)
      setReadSummary(body.data.summary)
      setSkipped(body.data.skipped)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    if (!rows) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setDone(body.data.summary)
      setRows(null)
      setText('')
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function join(keepId: string, foldId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/suppliers/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keepId, foldId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setDone(body.data.says)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function edit(i: number, field: 'company' | 'contactName', value: string) {
    if (!rows) return
    const next = [...rows]
    next[i] = {
      ...next[i],
      [field]: value || null,
      needs: field === 'company' && value ? [] : next[i].needs,
    }
    setRows(next)
  }

  const blocked = rows?.filter((r) => !r.company).length ?? 0

  return (
    <div className="mx-auto max-w-[820px] space-y-6 px-4 py-6">
      <header>
        <p className="eyebrow">Program</p>
        <h1 className="headline-serif text-[30px] leading-tight">Your suppliers</h1>
        <p className="mt-2 max-w-[58ch] text-[13px] text-etyme-muted">
          Paste the list you already email. Nobody has to switch anything, and
          none of them has to sign up before you can send them a role — they
          find out when one arrives.
        </p>
      </header>

      {/* ── The paste box ─────────────────────────────────────────── */}
      <section className="panel space-y-3">
        <p className="stat-label">Add suppliers</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={
            'Cloudepa Systems, Ravi Menon, ravi@cloudepa.com\n' +
            'Vertex Talent Ltd, priya@vertextalent.io\n' +
            'Brightmoor Staffing <hello@brightmoor.co.uk>'
          }
          className="w-full rounded-lg border border-etyme-rule bg-white p-3 font-mono
                     text-[12px] leading-relaxed text-etyme-ink placeholder:text-etyme-faint"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={read}
            disabled={busy || text.trim().length === 0}
            className="rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white
                       disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Reading…' : 'Read the list'}
          </button>
          <span className="text-[12px] text-etyme-faint">
            A spreadsheet column, a signature block, or an Outlook To: field.
          </span>
        </div>
      </section>

      {error && (
        <div className="panel">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {done && (
        <div className="panel">
          <p className="text-[13px]" style={{ color: 'var(--color-verified)' }}>{done}</p>
        </div>
      )}

      {/* ── What it made of the paste ─────────────────────────────── */}
      {rows && (
        <section className="space-y-3">
          <p className="text-[14px] text-etyme-ink">{readSummary}</p>

          {rows.length > 0 && (
            <div className="panel space-y-2">
              {rows.map((r, i) => (
                <div
                  key={r.email}
                  className="grid grid-cols-[1fr_1fr_1.2fr] items-center gap-2 border-b
                             border-etyme-rule pb-2 last:border-0 last:pb-0"
                >
                  <input
                    value={r.company ?? ''}
                    onChange={(e) => edit(i, 'company', e.target.value)}
                    placeholder="Which firm?"
                    className={`rounded border px-2 py-1 text-[13px] ${
                      r.company ? 'border-etyme-rule' : 'border-etyme-attention'
                    }`}
                  />
                  <input
                    value={r.contactName ?? ''}
                    onChange={(e) => edit(i, 'contactName', e.target.value)}
                    placeholder="Contact"
                    className="rounded border border-etyme-rule px-2 py-1 text-[13px]"
                  />
                  <span className="font-mono text-[12px] text-etyme-muted">{r.email}</span>
                </div>
              ))}
            </div>
          )}

          {skipped.length > 0 && (
            <p className="text-[12px] text-etyme-faint">
              Ignored, no address in them: {skipped.slice(0, 4).join(' · ')}
              {skipped.length > 4 && ` and ${skipped.length - 4} more`}
            </p>
          )}

          {rows.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={add}
                disabled={busy || blocked > 0}
                className="rounded-lg bg-etyme-action px-4 py-2 text-[13px] font-semibold text-white
                           disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? 'Adding…' : `Add ${rows.length} ${rows.length === 1 ? 'contact' : 'contacts'}`}
              </button>
              {blocked > 0 && (
                <span className="text-[12px] text-etyme-attention">
                  {blocked} still {blocked === 1 ? 'needs' : 'need'} a firm — a personal
                  address does not say which.
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── The same firm, listed twice ───────────────────────────── */}
      {pairs.length > 0 && (
        <section className="space-y-3">
          <p className="stat-label">The same firm, listed twice</p>
          {pairs.map((p) => (
            <article key={p.domain} className="panel">
              <p className="text-[13px] text-etyme-ink">{p.says}</p>
              {/* Said before the button, not after. A dialog that only
                  says "this cannot be undone" is one people click
                  through. */}
              {p.moving.length > 0 && (
                <p className="mt-1 text-[12px] text-etyme-muted">
                  Moving: {p.moving.join(', ')}.
                </p>
              )}
              {p.ok && p.keep && p.fold ? (
                <button
                  onClick={() => join(p.keep!.id, p.fold!.id)}
                  disabled={busy}
                  className="mt-3 rounded border border-etyme-rule px-3 py-1.5 text-[12px]
                             text-etyme-ink hover:border-etyme-action disabled:opacity-40"
                >
                  {p.button}
                </button>
              ) : (
                <p className="mt-2 text-[12px] text-etyme-faint">{p.button}</p>
              )}
            </article>
          ))}
        </section>
      )}

      {/* ── Who you buy from ──────────────────────────────────────── */}
      <section className="space-y-3">
        <p className="stat-label">Who you buy from</p>
        <p className="text-[13px] text-etyme-muted">{listSummary}</p>

        {suppliers.map((s) => (
          <article key={s.companyId} className="panel">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-[15px] font-semibold text-etyme-ink">{s.name}</p>
                <p className="text-[12px] text-etyme-faint">
                  {s.contacts.map((c) => c.email).join(' · ') || 'No contact on file'}
                </p>
              </div>
              <span
                className={`chip ${s.joined ? 'chip--verified' : 'chip--passive'}`}
              >
                {s.joined ? 'Signed in' : 'Listed'}
              </span>
            </div>
            <p className="mt-2 text-[12px] text-etyme-muted">{s.where}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
