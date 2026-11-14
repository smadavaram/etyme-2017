'use client'

import { useEffect, useRef, useState } from 'react'
import { dayOfMomentFor, readerZone } from '@/lib/when'
import { NOT_AVAILABLE_YET, READ_TEAMS_LABEL, splitSources, tileStatus, IMPORT_RECORDS_HREF, IMPORT_RECORDS_LABEL } from '@/lib/team-structure/directory/words'

/**
 * "Read teams from your directory", once "Import from your directory" (founder, 2026-11-09: "Can it be integrated
 * or imported from Active Directory"). Three sources, as drawn: Microsoft
 * Entra ID, Google Workspace, and a file exported from Active Directory.
 * The file works today. Google Workspace connects here (2026-11-11): the
 * company's Workspace administrator presses Connect, allows read-only
 * access on Google's own consent screen, and comes back to this dialog;
 * Disconnect deletes the stored access. Microsoft Entra ID connects the
 * same way (2026-11-12): the client's IT admin grants read-only access on
 * Microsoft's own admin-consent screen. A preview of every change comes first, each ticked or not,
 * and only the ticked ones are made, through the same acts the tree uses
 * (/api/settings/team-structure/directory).
 */

type Connection = { domain: string; connectedBy: string | null; connectedAt: string; lastReadAt: string | null; lastReadCount: number | null }
type Source = { key: 'ENTRA' | 'GOOGLE' | 'CSV'; label: string; says: string; connected: boolean; adminApproves: string | null; connectable?: boolean; connection?: Connection | null }

const day = (iso: string) => dayOfMomentFor(new Date(iso), readerZone())
type Change = { key: string; tag: 'ADD' | 'MOVE' | 'LEAD' | 'PERSON' | 'ASKS'; says: string; ticked: boolean; tickable: boolean }
type Preview = {
  people: number
  skipped: string[]
  changes: Change[]
  invitations: { name: string; email: string; department: string | null; jobTitle: string | null }[]
  kept: string[]
}

const TAG: Record<Change['tag'], { word: string; tone: string }> = {
  ADD: { word: 'Add', tone: 'text-etyme-verified' },
  MOVE: { word: 'Move', tone: 'text-etyme-action-press' },
  LEAD: { word: 'Lead', tone: 'text-etyme-action-press' },
  PERSON: { word: 'Person', tone: 'text-etyme-action-press' },
  ASKS: { word: 'Asks you', tone: 'text-etyme-attention' },
}

const MAPPING: [string, string][] = [
  ['department', 'A department box. People with the same department sit in it.'],
  ['manager', 'Who leads the box. A manager’s manager is the box above.'],
  ['officeLocation', 'The site, matched to Settings → Sites by name.'],
  ['country', 'The site’s country, for its rules and money.'],
  ['jobTitle', 'The role shown beside the name. A role’s permissions are changed under Users & permissions, never by an import.'],
]

export function ImportDialog({ onClose, onApplied, opening }: { onClose: () => void; onApplied: (says: string) => void; opening?: { source: Source['key']; said: { says: string; no: boolean } | null } }) {
  const [sources, setSources] = useState<Source[]>([])
  const [source, setSource] = useState<Source['key']>(opening?.source ?? 'CSV')
  const [csv, setCsv] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [said, setSaid] = useState<{ says: string; no: boolean } | null>(opening?.said ?? null)
  const [result, setResult] = useState<{ refused: string[]; skipped: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const first = useRef<HTMLButtonElement>(null)

  const loadSources = () =>
    fetch('/api/settings/team-structure/directory')
      .then((r) => r.json())
      .then((j) => setSources(j?.data?.sources ?? []))
      .catch(() => setSaid({ says: 'The sources could not be read. Close and try again.', no: true }))

  useEffect(() => {
    first.current?.focus()
    void loadSources()
  }, [])

  const FILE_ONLY: Source = { key: 'CSV', label: 'A file from Active Directory', says: 'An export from Active Directory on your own servers (CSV).', connected: true, adminApproves: null }
  const { open, waiting } = splitSources(sources.length ? sources : [FILE_ONLY])
  // A source folded as waiting is never the chosen one: the dialog opens on what works.
  const chosen = open.find((s) => s.key === source) ?? null
  useEffect(() => {
    if (sources.length && !open.some((s) => s.key === source)) setSource(open[0]?.key ?? 'CSV')
  }, [sources]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (body: Record<string, unknown>) => {
    setBusy(true)
    setSaid(null)
    try {
      const res = await fetch('/api/settings/team-structure/directory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => null)
      if (!res.ok) { setSaid({ says: j?.error?.message ?? 'The directory could not be read. Try again.', no: true }); return null }
      return j.data
    } catch {
      setSaid({ says: 'The connection dropped. Nothing was changed; try again.', no: true })
      return null
    } finally {
      setBusy(false)
    }
  }

  const readFile = async (f: File) => {
    const text = await f.text()
    setCsv(text)
    setFileName(f.name)
    const data = await send({ source: 'CSV', csv: text })
    if (data) {
      setPreview(data)
      setTicked(new Set((data.changes as Change[]).filter((c) => c.ticked).map((c) => c.key)))
    }
  }

  // The directory a preview was read from, where it was not a file.
  const [readFrom, setReadFrom] = useState<'GOOGLE' | 'ENTRA'>('GOOGLE')

  const previewDirectory = async (key: 'GOOGLE' | 'ENTRA') => {
    const data = await send({ source: key })
    if (data) {
      setFileName(null)
      setCsv(null)
      setReadFrom(key)
      setPreview(data)
      setTicked(new Set((data.changes as Change[]).filter((c) => c.ticked).map((c) => c.key)))
    }
  }

  const connectDirectory = async (key: 'GOOGLE' | 'ENTRA') => {
    const data = await send({ source: key, connect: true })
    // Only ever the provider's own consent screen; anything else is not followed.
    const own = key === 'GOOGLE' ? 'https://accounts.google.com/' : 'https://login.microsoftonline.com/'
    if (data?.url && String(data.url).startsWith(own)) window.location.assign(data.url)
  }

  const disconnectDirectory = async (key: 'GOOGLE' | 'ENTRA') => {
    const data = await send({ source: key, disconnect: true })
    if (data) {
      setSaid({ says: data.says, no: false })
      await loadSources()
    }
  }

  const fromDirectory = preview !== null && csv === null

  const apply = async () => {
    if (!csv && !fromDirectory) return
    const data = await send(fromDirectory ? { source: readFrom, apply: [...ticked] } : { source: 'CSV', csv, apply: [...ticked] })
    if (!data) return
    if (data.refused.length || data.skipped.length) {
      setResult({ refused: data.refused, skipped: data.skipped })
      setSaid({ says: data.says, no: false })
    } else {
      onApplied(data.says)
    }
  }

  const count = preview ? preview.changes.filter((c) => c.tickable && ticked.has(c.key)).length : 0

  return (
    <div className="fixed !m-0 inset-0 z-[60] flex items-center justify-center bg-etyme-ink/35 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={preview ? 'Changes from your directory' : READ_TEAMS_LABEL} className="flex max-h-[88vh] w-full max-w-[640px] flex-col gap-3.5 overflow-auto rounded-r-lg border border-etyme-rule bg-etyme-surface p-5 shadow-float">
        {!preview ? (
          <>
            <div>
              <p className="eyebrow">Team structure</p>
              <h2 className="headline-serif text-[21px] text-etyme-ink">{READ_TEAMS_LABEL}</h2>
            </div>
            <p className="text-[13.5px] text-etyme-muted">Etyme reads your departments, who reports to whom, and each person’s office. You see every change before it is made.</p>
            {/* What works or can be connected today, the file first where
                nothing is connected; a source waiting on Etyme is folded
                under "Not available yet" with whose move it is (fault 22). */}
            <div className="grid gap-2 sm:grid-cols-3">
              {open.map((s, i) => (
                <button
                  key={s.key}
                  ref={i === 0 ? first : undefined}
                  aria-pressed={s.key === source}
                  onClick={() => { setSource(s.key); setSaid(null) }}
                  className={`flex flex-col gap-1 rounded-lg border bg-etyme-raised px-3 py-2.5 text-left text-[12.5px] text-etyme-muted ${s.key === source ? 'border-etyme-action ring-[3px] ring-etyme-action-wash' : 'border-etyme-rule'}`}
                >
                  <b className="text-[13.5px] font-medium text-etyme-ink">{s.label}</b>
                  {s.says}
                  {tileStatus(s) && <span className="text-[11.5px] text-etyme-muted">{tileStatus(s)}</span>}
                </button>
              ))}
            </div>
            {waiting.length > 0 && (
              <details className="rounded-lg border border-etyme-rule bg-etyme-raised px-3 py-2 text-[13px] text-etyme-muted">
                <summary className="cursor-pointer text-etyme-ink">{NOT_AVAILABLE_YET}: {waiting.map((s) => s.label).join(', ')}</summary>
                <ul className="mt-1.5 space-y-1">
                  {waiting.map((s) => <li key={s.key}><b className="font-medium text-etyme-ink">{s.label}.</b> {tileStatus(s)}</li>)}
                </ul>
              </details>
            )}
            <div>
              <p className="eyebrow mb-1.5">What is read, and where it goes</p>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 border-t border-etyme-rule pt-2 text-[13px] sm:grid-cols-[auto_1fr]">
                {MAPPING.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-mono text-[12px]">{k}</dt>
                    <dd className="m-0">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <p className="eyebrow mb-1.5">The rules</p>
              <ul className="list-disc space-y-1 pl-5 text-[13px]">
                <li>Read only. Etyme never writes to your directory.</li>
                <li>Only the Owner or an Admin imports, and says yes to the changes.</li>
                <li>Nothing is deleted. A box that is no longer in the directory is shown to you, not removed.</li>
                <li>Your own edits here stay. If the directory disagrees, you are asked.</li>
                <li>People are matched to their seats by email. Nobody gets a seat from an import; you invite them.</li>
                <li>Contractors are not in your directory, so nobody on a contract is moved. Contractors, suppliers and sites come in under <a href={IMPORT_RECORDS_HREF} className="text-etyme-action-press hover:underline">{IMPORT_RECORDS_LABEL}</a>.</li>
              </ul>
            </div>
            {chosen && !chosen.connected && chosen.connectable && chosen.adminApproves && (
              <p className="rounded-lg bg-etyme-attention-wash p-3 text-[13px]">{chosen.label} is not connected. {chosen.adminApproves} A file exported from Active Directory works today.</p>
            )}
            {(chosen?.key === 'GOOGLE' || chosen?.key === 'ENTRA') && chosen.connection && (
              <p className="rounded-lg border border-etyme-rule bg-etyme-raised p-3 text-[13px]">
                Connected for {chosen.connection.domain}{chosen.connection.connectedBy ? ` by ${chosen.connection.connectedBy}` : ''} on {day(chosen.connection.connectedAt)}. Read only.
                {chosen.connection.lastReadAt ? ` Last read ${day(chosen.connection.lastReadAt)}: ${chosen.connection.lastReadCount ?? 0} people.` : ' Not read yet.'}
                {' '}{chosen.key === 'GOOGLE' ? 'Disconnect deletes the stored access; your team structure stays.' : 'Disconnect stops Etyme reading it; your team structure stays.'}
              </p>
            )}
            <input ref={file} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose the file from Active Directory" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f) }} />
            <div className="flex flex-wrap gap-2">
              {source === 'CSV' && <button className="btn-primary" disabled={busy} onClick={() => file.current?.click()}>{busy ? 'Reading…' : 'Choose the file'}</button>}
              {source === 'GOOGLE' && chosen?.connected && <button className="btn-primary" disabled={busy} onClick={() => previewDirectory('GOOGLE')}>{busy ? 'Reading…' : 'Preview from Google'}</button>}
              {source === 'GOOGLE' && chosen?.connectable && <button className="btn-primary" disabled={busy} onClick={() => connectDirectory('GOOGLE')}>{busy ? 'Opening Google…' : 'Connect Google Workspace'}</button>}
              {source === 'GOOGLE' && chosen?.connection && <button className="btn-secondary" disabled={busy} onClick={() => disconnectDirectory('GOOGLE')}>Disconnect</button>}
              {source === 'ENTRA' && chosen?.connected && <button className="btn-primary" disabled={busy} onClick={() => previewDirectory('ENTRA')}>{busy ? 'Reading…' : 'Preview from Microsoft'}</button>}
              {source === 'ENTRA' && chosen?.connectable && <button className="btn-primary" disabled={busy} onClick={() => connectDirectory('ENTRA')}>{busy ? 'Opening Microsoft…' : 'Connect Microsoft Entra ID'}</button>}
              {source === 'ENTRA' && chosen?.connection && <button className="btn-secondary" disabled={busy} onClick={() => disconnectDirectory('ENTRA')}>Disconnect</button>}
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="eyebrow">{fromDirectory ? (readFrom === 'ENTRA' ? 'Microsoft Entra ID' : 'Google Workspace') : fileName ?? 'A file from Active Directory'} · Preview</p>
              <h2 className="headline-serif text-[21px] text-etyme-ink">
                {preview.changes.length ? `${preview.changes.length} ${preview.changes.length === 1 ? 'change' : 'changes'}. Nothing changes until you say yes.` : 'Your tree already matches your directory.'}
              </h2>
            </div>
            <p className="text-[13px] text-etyme-muted">{preview.people} people read. Untick anything you do not want.</p>
            {result ? (
              <ul className="space-y-1.5 text-[13px]">
                {[...result.refused, ...result.skipped].map((r, i) => <li key={i} className="rounded-lg border border-etyme-rule bg-etyme-raised px-2.5 py-2">{r}</li>)}
              </ul>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {preview.changes.map((c) => (
                  <li key={c.key} className="flex items-start gap-2.5 rounded-lg border border-etyme-rule bg-etyme-raised px-2.5 py-2 text-[13px]">
                    <input
                      id={`d-${c.key}`}
                      type="checkbox"
                      className="mt-[3px] h-4 w-4 accent-etyme-action"
                      checked={c.tickable && ticked.has(c.key)}
                      disabled={!c.tickable || busy}
                      onChange={(e) => { const s = new Set(ticked); e.target.checked ? s.add(c.key) : s.delete(c.key); setTicked(s) }}
                    />
                    <span className={`min-w-[52px] text-[10px] font-semibold uppercase tracking-[0.07em] ${TAG[c.tag].tone}`}>{TAG[c.tag].word}</span>
                    <label htmlFor={`d-${c.key}`} className="text-etyme-ink">{c.says}</label>
                  </li>
                ))}
              </ul>
            )}
            {preview.invitations.length > 0 && !result && (
              <div className="text-[13px]">
                <p className="eyebrow mb-1">Not seated yet ({preview.invitations.length})</p>
                <p className="text-etyme-muted">
                  These people are in your directory and hold no seat here. An import never makes a seat; invite them under <a className="text-etyme-action-press" href="/dashboard/access">Users & permissions</a>, then import again to place them.
                </p>
                <p className="mt-1">{preview.invitations.slice(0, 12).map((p) => p.name).join(', ')}{preview.invitations.length > 12 ? ` and ${preview.invitations.length - 12} more` : ''}.</p>
              </div>
            )}
            {preview.kept.length > 0 && !result && <p className="text-[12.5px] text-etyme-muted">{preview.kept.slice(0, 5).join(' ')}{preview.kept.length > 5 ? ` And ${preview.kept.length - 5} more boxes stay.` : ''}</p>}
            {preview.skipped.length > 0 && !result && <p className="text-[12.5px] text-etyme-muted">{preview.skipped.slice(0, 3).join(' ')}{preview.skipped.length > 3 ? ` ${preview.skipped.length - 3} more rows were not read.` : ''}</p>}
            <p className="text-[12.5px] text-etyme-muted">Contractors are not in your directory, so nobody on a contract is moved or removed. Nothing is deleted.</p>
            <div className="flex flex-wrap gap-2">
              {result
                ? <button className="btn-primary" onClick={() => onApplied(said?.says ?? 'Done.')}>Done</button>
                : <button className="btn-primary" disabled={busy || count === 0} onClick={apply}>{busy ? 'Applying…' : `Apply ${count} ${count === 1 ? 'change' : 'changes'}`}</button>}
              {!result && <button className="btn-secondary" onClick={() => { setPreview(null); setCsv(null); setFileName(null) }}>Back</button>}
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
        {said && <p role={said.no ? 'alert' : 'status'} className={`text-[13px] ${said.no ? 'text-etyme-danger' : 'text-etyme-verified'}`}>{said.says}</p>}
      </div>
    </div>
  )
}
