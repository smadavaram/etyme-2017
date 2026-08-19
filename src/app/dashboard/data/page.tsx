'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * Loading reference data.
 *
 * There was one importer and it loaded candidates, so operations had a way
 * in and finance did not — no cost centres, no GL accounts, no purchase
 * orders. Three people own three kinds of data and only one could get any
 * in.
 *
 * What you are offered here depends on what you are allowed to load.
 * Finance does not see the people sheet; recruiting does not see the GL.
 * Being told at the end of a long upload that you were never allowed is
 * the version that wastes an afternoon.
 *
 * Preview and commit are two acts, because loading a rate card over a live
 * one should never be a surprise.
 */

interface Field {
  key: string
  label: string
  required: boolean
  kind: string
  hint: string | null
}
interface Sheet {
  key: string
  label: string
  owner: string
  blurb: string
  naturalKey: string
  fields: Field[]
}
interface Preview {
  entity: string
  total: number
  willCreate: number
  willUpdate: number
  willSkip: number
  summary: string
  problems: { row: number; problems: string[] }[]
  sample: Record<string, unknown>[]
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
}

/** Same parser shape as the server uses, so what you preview is what loads. */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const split = (line: string) => {
    const out: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') quoted = false
        else cur += ch
      } else if (ch === '"') quoted = true
      else if (ch === ',') { out.push(cur.trim()); cur = '' }
      else cur += ch
    }
    out.push(cur.trim())
    return out
  }
  const headers = split(lines[0])
  return lines.slice(1).map((l) => {
    const vals = split(l)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  })
}

export default function DataPage() {
  const [sheets, setSheets] = useState<Sheet[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string>('')
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/imports/sheets')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setSheets(body.data.sheets)
      setNote(body.data.note)
    } catch (e: any) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const sheet = sheets?.find((s) => s.key === chosen)

  async function send(commit: boolean) {
    setBusy(true); setError(null); setFlash(null)
    try {
      const res = await fetch('/api/imports/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: chosen, rows, commit }),
      })
      const body = await res.json()
      if (!res.ok) {
        if (body.error?.mapping) setMapping(body.error.mapping)
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }
      if (commit) {
        setFlash(body.data.message)
        setPreview(null); setRows([]); setFileName('')
      } else {
        setMapping(body.data.mapping)
        setPreview(body.data.preview)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!sheets) return <p className="text-etyme-muted text-sm">{error ?? 'Loading…'}</p>

  return (
    <>
      <div className="page-head mb-6">
        <p className="eyebrow">Settings</p>
        <h1>Load a spreadsheet</h1>
        <p>
          Cost centres, work sites, purchase orders, holidays, people. Matched on a key, so
          loading the same file twice changes nothing the second time.
        </p>
      </div>

      {note && (
        <div className="mb-5 rounded-md border border-etyme-rule bg-etyme-canvas p-3">
          <p className="text-[13px] text-etyme-ink">{note}</p>
        </div>
      )}
      {flash && (
        <div className="mb-5 rounded-md border border-etyme-verified/30 bg-etyme-verified/5 p-3">
          <p className="text-[13px] text-etyme-verified">{flash}</p>
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-md border border-etyme-attention/30 bg-etyme-attention/5 p-3">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {sheets.length === 0 ? (
        <p className="text-[13px] text-etyme-faint">Nothing here is yours to load.</p>
      ) : (
        <>
          <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-5 mb-5">
            <Lbl>What kind of data</Lbl>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              {sheets.map((s) => (
                <button
                  key={s.key}
                  onClick={() => { setChosen(s.key); setPreview(null); setMapping(null) }}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    chosen === s.key
                      ? 'border-etyme-action bg-etyme-action/5'
                      : 'border-etyme-rule bg-etyme-raised hover:border-etyme-muted'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] text-etyme-ink font-medium">{s.label}</span>
                    <span className="text-[11px] text-etyme-faint shrink-0">{s.owner}</span>
                  </div>
                  <p className="text-[12px] text-etyme-muted mt-1">{s.blurb}</p>
                </button>
              ))}
            </div>
          </section>

          {sheet && (
            <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-5 mb-5">
              <Lbl>Columns it looks for</Lbl>
              <div className="flex flex-wrap gap-1.5 mt-2 mb-4">
                {sheet.fields.map((f) => (
                  <span
                    key={f.key}
                    title={f.hint ?? undefined}
                    className={`text-[12px] px-2 py-0.5 rounded ${
                      f.required
                        ? 'bg-etyme-ink text-white'
                        : 'bg-etyme-canvas text-etyme-muted'
                    }`}
                  >
                    {f.label}{f.required ? '' : ' (optional)'}
                  </span>
                ))}
              </div>

              <label className="inline-block px-4 py-2 rounded bg-etyme-action text-white text-[13px] font-medium cursor-pointer">
                {fileName || 'Choose a CSV'}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const parsed = parseCSV(await f.text())
                    setRows(parsed)
                    setFileName(`${f.name} — ${parsed.length} row(s)`)
                    setPreview(null)
                    setError(parsed.length === 0 ? 'That file has no rows under its header.' : null)
                    e.target.value = ''
                  }}
                />
              </label>

              {rows.length > 0 && !preview && (
                <button
                  onClick={() => send(false)}
                  disabled={busy}
                  className="ml-2 px-4 py-2 rounded border border-etyme-rule text-[13px] text-etyme-ink disabled:opacity-50"
                >
                  {busy ? 'Checking…' : 'See what this would do'}
                </button>
              )}
            </section>
          )}

          {mapping && (
            <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-5 mb-5">
              <h2 className="font-serif text-[19px] text-etyme-ink mb-3 tracking-[-0.02em]">
                How your columns were read
              </h2>
              <div className="space-y-1">
                {mapping.columns.map((c: any) => (
                  <div key={c.column} className="flex items-baseline justify-between gap-3 py-1 border-b border-etyme-rule/60">
                    <span className="text-[13px] font-mono text-etyme-ink">{c.column}</span>
                    <span className={`text-[12px] shrink-0 ${
                      !c.field ? 'text-etyme-faint' : c.confidence < 1 ? 'text-etyme-attention' : 'text-etyme-muted'
                    }`}>
                      {c.field ? `→ ${c.field}` : 'not used'}
                      {c.note && c.field ? ` · ${c.note}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {preview && (
            <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-5">
              <h2 className="font-serif text-[19px] text-etyme-ink mb-2 tracking-[-0.02em]">
                What this would do
              </h2>
              <p className="text-[13px] text-etyme-ink mb-4">{preview.summary}</p>

              <div className="grid grid-cols-3 gap-6 mb-5 pb-4 border-b border-etyme-rule">
                <div>
                  <Lbl>New</Lbl>
                  <p className="font-serif text-2xl text-etyme-ink tabular-nums mt-0.5">{preview.willCreate}</p>
                </div>
                <div>
                  <Lbl>Updated</Lbl>
                  <p className="font-serif text-2xl text-etyme-ink tabular-nums mt-0.5">{preview.willUpdate}</p>
                </div>
                <div>
                  <Lbl>Skipped</Lbl>
                  <p className={`font-serif text-2xl tabular-nums mt-0.5 ${
                    preview.willSkip > 0 ? 'text-etyme-attention' : 'text-etyme-ink'
                  }`}>{preview.willSkip}</p>
                </div>
              </div>

              {preview.problems.length > 0 && (
                <div className="mb-5">
                  <Lbl>Rows that will be skipped</Lbl>
                  <div className="mt-2 space-y-1">
                    {preview.problems.map((p) => (
                      <p key={p.row} className="text-[12px] text-etyme-muted">
                        <span className="tabular-nums text-etyme-attention">Row {p.row}</span>
                        {' — '}{p.problems.join(' · ')}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => send(true)}
                disabled={busy || preview.willCreate + preview.willUpdate === 0}
                className="px-4 py-2 rounded bg-etyme-action text-white text-[13px] font-medium disabled:opacity-40"
              >
                {busy ? 'Loading…' : `Load ${preview.willCreate + preview.willUpdate} row(s)`}
              </button>
            </section>
          )}
        </>
      )}
    </>
  )
}
