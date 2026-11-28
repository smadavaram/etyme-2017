'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { FormMessage } from '@/components/ui'
import type { PaperDoor, PaperDoors } from '@/lib/document-stages/paper-doors'
import { ExaminePaper } from './examine'
import { RecordCheck } from '@/app/dashboard/compliance/record-check'

/**
 * The door one paper carries on a placement, drawn from `paperDoorsFor`
 * (lib/document-stages/paper-doors), with the dialog each door opens:
 *
 *   Check what arrived            the Paperwork accept-or-send-back dialog
 *   Record the provider's verdict the Compliance verdict form: the screening
 *                                 company, its reference, the day it reported
 *   Ask <worker>                  a request for the one paper, sent to her
 *
 * Demand's placement page draws this beside each chip and types no route.
 * Where the seat has no door, the reader's sentence says where the paper
 * is ("Arrived at CSI, being examined"). After any act, `onDone` is given
 * the route's own sentence, so the page can say it and read itself again.
 */
export function PaperDoorButtons({ doors, onDone }: { doors: PaperDoors | null | undefined; onDone: (says: string) => void }) {
  const [open, setOpen] = useState<PaperDoor | null>(null)
  if (!doors) return null
  const done = (says: string) => { setOpen(null); onDone(says) }
  return (
    <span className="inline-flex flex-wrap items-baseline gap-2">
      {doors.doors.map((d) => (
        <button key={d.kind} type="button" onClick={() => setOpen(d)} className="text-[12px] text-etyme-action hover:underline">
          {d.label}
        </button>
      ))}
      {doors.doors.length === 0 && doors.says && <span className="text-[12px] text-etyme-muted">{doors.says}</span>}
      {open?.kind === 'CHECK' && <ExaminePaper row={open.row} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'VERDICT' && (
        <RecordCheck kind="VERDICT" who={{ contractId: open.contractId, personId: open.personId, name: open.name, checkType: open.checkType }} onClose={() => setOpen(null)} onDone={done} />
      )}
      {open?.kind === 'ASK' && <AskForPaper door={open} onClose={() => setOpen(null)} onDone={done} />}
    </span>
  )
}

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return readJson(res)
}

/** Ask the person for one paper the placement needs: the request, then it is sent to her. */
export function AskForPaper({ door, onClose, onDone }: { door: Extract<PaperDoor, { kind: 'ASK' }>; onClose: () => void; onDone: (says: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function ask(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const made = await postJson('/api/documents', {
        type: 'ask', documentTypeKey: door.documentTypeKey, paperLabel: door.paperLabel, personId: door.personId, contractId: door.contractId,
      })
      const sent = await postJson(`/api/documents/${made.data.instance.id}/send`, {})
      onDone(sent?.data?.says ?? `${door.name} is asked for ${door.paperLabel}.`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-etyme-ink/30 p-4 md:p-8" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${door.label} for ${door.paperLabel}`}>
      <form onSubmit={ask} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-etyme-surface border border-etyme-rule rounded-lg p-5 space-y-4">
        <h2 className="font-serif text-lg text-etyme-ink">{door.label} for {door.paperLabel}</h2>
        <p className="text-sm text-etyme-muted">{door.name} is told what is asked and sends it from their own page. It arrives on Paperwork, under Contracts, for HR to look at.</p>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-etyme-muted">Cancel</button>
          <button type="submit" disabled={busy} className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {busy ? 'Asking…' : 'Ask'}
          </button>
        </div>
      </form>
    </div>
  )
}
