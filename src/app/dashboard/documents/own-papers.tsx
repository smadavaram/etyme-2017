'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { Chip, EmptyState, FormMessage, LoadingState } from '@/components/ui'
import type { OwnPaperAbout, OwnPaperNeeds } from '@/lib/document-stages/own-papers'

/**
 * The papers a person keeps on her own file before anybody asks, with
 * "Put on file" on each (release walk, 2026-10-27).
 *
 * Drawn on a one-person firm's Company paperwork for the firm's own
 * papers and her license, and exported so "Your paperwork" can draw the
 * person's half with `about="ME"`. What may be filed and what each needs
 * is `lib/document-stages/own-papers`; the route is PUT /api/me/papers.
 */

interface OnFile {
  id: string
  key: string | null
  label: string
  about: OwnPaperAbout
  number: string | null
  issuer: string | null
  validFrom: string | null
  expiresAt: string | null
  edition: string | null
  fileName: string | null
  fileUrl: string | null
  examined: boolean
  says: string
}

interface OwnView {
  firm: { id: string; name: string } | null
  /** A firm with a team whose own papers this seat files (Company paperwork). */
  teamFirm?: { id: string; name: string } | null
  canKeepCopy: boolean
  menu: OwnPaperNeeds[]
  onFile: OnFile[]
  says: string | null
}

/** Reads the own view, so a page can decide what to draw before drawing it. */
export async function readOwnPapers(): Promise<OwnView | null> {
  try {
    const res = await fetch('/api/me/papers?view=own')
    if (!res.ok) return null
    const body = await res.json()
    return (body?.data ?? null) as OwnView | null
  } catch {
    return null
  }
}

const lbl = 'block text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1'
const box = 'w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised'

export function OwnPapers({ about, heading }: { about?: OwnPaperAbout; heading?: string }) {
  const [view, setView] = useState<OwnView | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<OwnPaperNeeds | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setView(await readOwnPapers())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <LoadingState compact says="Reading your papers…" />
  if (!view) return <EmptyState compact says="Your papers could not be read just now." detail="Reload the page to try again." />

  const menu = view.menu.filter((m) => !about || m.about === about)
  const onFile = view.onFile.filter((f) => !about || f.about === about)
  const latest = (key: string, a: OwnPaperAbout) => onFile.find((f) => f.key === key && f.about === a) ?? null

  return (
    <section className="mb-8">
      {heading && <h2 className="font-serif text-lg text-etyme-ink mb-1">{heading}</h2>}
      <p className="text-sm text-etyme-muted mb-3">
        {view.teamFirm && about === 'MY_FIRM'
          ? `${view.teamFirm.name}’s own papers. Put each on file once; a client that buys from you looks at it and records what it saw.`
          : view.firm
          ? 'Put each paper on file once. A client that asks for one looks at it and records what it saw.'
          : 'Put a paper on file once. The firm that asks for it looks at it and records what it saw.'}
      </p>
      {view.says && <p className="text-xs text-etyme-attention mb-3">{view.says}</p>}
      {said && <div className="mb-3"><FormMessage tone="ok">{said}</FormMessage></div>}

      <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
        {menu.map((m) => {
          const f = latest(m.key, m.about)
          return (
            <div key={`${m.about}:${m.key}`} className="p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <div className="text-sm text-etyme-ink">{m.label}{m.about === 'ME' && view.firm ? ' (yours)' : ''}</div>
                <div className="text-xs text-etyme-faint tabular-nums mt-0.5">
                  {f
                    ? [f.number && `No. ${f.number}`, f.issuer, f.edition, f.expiresAt && `runs out ${f.expiresAt}`, f.fileName].filter(Boolean).join(' · ')
                    : m.hint}
                </div>
              </div>
              {f ? <Chip tone={f.examined ? 'verified' : 'attention'}>{f.says}</Chip> : <Chip tone="passive">Not on file</Chip>}
              <button onClick={() => setOpen(m)} className="text-xs text-etyme-action hover:underline">
                {f ? 'Put a newer one on file' : 'Put on file'}
              </button>
            </div>
          )
        })}
      </div>

      {open && (
        <PutOnFile
          needs={open}
          canKeepCopy={view.canKeepCopy}
          onClose={() => setOpen(null)}
          onDone={async (says) => { setOpen(null); setSaid(says); await load() }}
        />
      )}
    </section>
  )
}

function PutOnFile({ needs, canKeepCopy, onClose, onDone }: {
  needs: OwnPaperNeeds
  canKeepCopy: boolean
  onClose: () => void
  onDone: (says: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [f, setF] = useState({ number: '', issuer: '', validFrom: '', validUntil: '', edition: '', year: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('key', needs.key)
      form.set('about', needs.about)
      for (const [k, v] of Object.entries(f)) if (v.trim()) form.set(k, v.trim())
      if (file) form.set('file', file)
      const res = await fetch('/api/me/papers', { method: 'PUT', body: form })
      const body = await readJson(res)
      onDone(body?.data?.says ?? 'On file.')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-etyme-ink/30 p-4 md:p-8" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Put ${needs.label} on file`}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-etyme-surface border border-etyme-rule rounded-lg p-5 space-y-4">
        <h2 className="font-serif text-lg text-etyme-ink">{needs.label}</h2>
        {needs.hint && <p className="text-sm text-etyme-muted">{needs.hint}</p>}
        {canKeepCopy && (
          <label className="block">
            <span className={lbl}>The file</span>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required className="text-sm" />
          </label>
        )}
        {needs.number && (
          <label className="block"><span className={lbl}>Number on it</span>
            <input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} required className={box} /></label>
        )}
        {needs.issuer && (
          <label className="block"><span className={lbl}>Issued by</span>
            <input value={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.value })} required placeholder={needs.key === 'DEGREE' ? 'University of Wisconsin' : 'Wisconsin Board of Nursing'} className={box} /></label>
        )}
        {needs.year && (
          <label className="block"><span className={lbl}>Year awarded</span>
            <input value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} required inputMode="numeric" placeholder="2019" className={box} /></label>
        )}
        {needs.edition && (
          <label className="block"><span className={lbl}>Edition printed on it</span>
            <input value={f.edition} onChange={(e) => setF({ ...f, edition: e.target.value })} required placeholder="Rev. March 2024" className={box} /></label>
        )}
        {(needs.validFrom || needs.validUntil) && (
          <div className="flex gap-3">
            {needs.validFrom && (
              <label className="flex-1"><span className={lbl}>Starts</span>
                <input type="date" value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} required className={box} /></label>
            )}
            {needs.validUntil && (
              <label className="flex-1"><span className={lbl}>Runs out</span>
                <input type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} required className={box} /></label>
            )}
          </div>
        )}
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-etyme-muted">Cancel</button>
          <button type="submit" disabled={busy} className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">Put on file</button>
        </div>
      </form>
    </div>
  )
}
