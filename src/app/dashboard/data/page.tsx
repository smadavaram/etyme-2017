'use client'

import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { refusalSentence } from '@/lib/refusal-words'
import { EmptyState, ErrorState, FormMessage, Lbl, LoadingState, PageHead, Panel, RefusedState, Stat, SubmitButton } from '@/components/ui'

import { useEffect, useState, useCallback } from 'react'

/**
 * Loading reference data.
 *
 * There was one importer and it loaded candidates, so operations had a way
 * in and finance did not — no cost centers, no GL accounts, no purchase
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
  // The section this page sits under on the reader's own menu, never a
  // word typed by hand (sign-up walk, round four, item 13).
  const section = usePageSection('/dashboard/data')
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
  // A desk that may not import reads the route's sentence alone.
  const [refused, setRefused] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/imports/sheets')
      if (res.status === 403) {
        const b = await res.json().catch(() => null)
        setRefused(refusalSentence(b?.error?.message) || 'Import is not part of your seat. Ask your company’s owner if you need it.')
        return
      }
      const body = await readJson(res)
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

  if (refused) return <RefusedState says={refused} />
  if (!sheets) {
    return error
      ? <ErrorState says={error} action={{ label: 'Try again', onClick: () => load() }} />
      : <LoadingState says="Opening import…" />
  }

  return (
    <>
      <PageHead
        eyebrow={section}
        title="Import"
        subtitle="Cost centers, work sites, purchase orders, holidays, people. Matched on a key, so loading the same file twice changes nothing the second time."
      />

      {note && (
        <div className="mb-5 rounded-md border border-etyme-rule bg-etyme-canvas p-3">
          <p className="text-[13px] text-etyme-ink">{note}</p>
        </div>
      )}
      {flash && <div className="mb-5"><FormMessage tone="ok">{flash}</FormMessage></div>}
      {error && <div className="mb-5"><FormMessage tone="error">{error}</FormMessage></div>}

      {sheets.length === 0 ? (
        <EmptyState says="Nothing here is yours to load." />
      ) : (
        <>
          <Panel className="mb-5">
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
          </Panel>

          {sheet && (
            <Panel className="mb-5">
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
                <SubmitButton
                  type="button"
                  tone="secondary"
                  onClick={() => send(false)}
                  pending={busy}
                  pendingLabel="Checking…"
                  className="ml-2"
                >
                  See what this would do
                </SubmitButton>
              )}
            </Panel>
          )}

          {mapping && (
            <Panel className="mb-5" title="How your columns were read">
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
            </Panel>
          )}

          {preview && (
            <Panel title="What this would do">
              <p className="text-[13px] text-etyme-ink mb-4">{preview.summary}</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <Stat label="New" value={preview.willCreate} />
                <Stat label="Updated" value={preview.willUpdate} />
                <Stat label="Skipped" value={preview.willSkip} tone={preview.willSkip > 0 ? 'attention' : 'default'} />
              </div>

              {preview.problems.length > 0 && (
                <div className="mb-5">
                  <Lbl className="mb-1">Rows that will be skipped</Lbl>
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

              <SubmitButton
                type="button"
                onClick={() => send(true)}
                pending={busy}
                pendingLabel="Loading the rows…"
                disabled={preview.willCreate + preview.willUpdate === 0}
              >
                {`Load ${preview.willCreate + preview.willUpdate} row(s)`}
              </SubmitButton>
            </Panel>
          )}
        </>
      )}
    </>
  )
}
