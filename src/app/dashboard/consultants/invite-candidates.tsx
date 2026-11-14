'use client'

import { useState } from 'react'
import { readJson } from '@/lib/read-response'
import { Field, Textarea, SubmitButton, FormMessage } from '@/components/ui'
import {
  parseInviteList, inviteCandidatesBody, tooManyInvitesSays, MAX_INVITES_AT_ONCE, NO_ADDRESSES_SAYS, type InviteLine,
} from '@/lib/consultant-portfolio/bench-invites'

/**
 * Invite candidates: one box, several addresses, one press
 * (`POST /api/consultants/invite`). Each address is answered on its own
 * line. The route decides every rule and says whether email can leave;
 * this dialog only draws what it said. It never shows a link.
 */
export function InviteCandidatesDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [list, setList] = useState('')
  const [pending, setPending] = useState(false)
  const [boxError, setBoxError] = useState<string | null>(null)
  const [said, setSaid] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const [lines, setLines] = useState<InviteLine[] | null>(null)

  async function invite() {
    // Never a greyed button with no words: an empty or long box is said beside it.
    const emails = parseInviteList(list).filter((i) => i.kind === 'EMAIL').length
    if (parseInviteList(list).length === 0) { setBoxError(NO_ADDRESSES_SAYS); return }
    if (emails > MAX_INVITES_AT_ONCE) { setBoxError(tooManyInvitesSays(emails)); return }
    setBoxError(null); setSaid(null); setLines(null); setPending(true)
    try {
      const body = await readJson<{ data: { results: InviteLine[]; says: string } }>(await fetch('/api/consultants/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteCandidatesBody(list)),
      }))
      setLines(body.data.results)
      setSaid({ text: body.data.says, tone: 'ok' })
      setList('')
      onDone()
    } catch (e: any) {
      if (e?.field === 'list') setBoxError(e.message)
      else setSaid({ text: e?.message ?? 'The invitations did not go out. Try again.', tone: 'error' })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label="Invite candidates">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Invite candidates</h2>
          <button onClick={onClose} aria-label="Close" className="text-etyme-muted hover:text-etyme-ink p-1">×</button>
        </div>
        <p className="text-sm text-etyme-muted mb-4">
          Each person gets an invitation to join your bench. Nobody is on it until they say yes.
        </p>
        <Field label={`Email addresses, at most ${MAX_INVITES_AT_ONCE}`}
          help="One per line, or separated by commas. A name beside each is optional."
          error={boxError}>
          <Textarea value={list} rows={6} aria-label="Email addresses"
            onChange={(e) => { setList(e.target.value); if (boxError) setBoxError(null) }}
            placeholder={'Ana Ruiz <ana@example.com>\nben@example.com'} />
        </Field>
        <div className="mt-4 flex gap-3 items-center">
          <SubmitButton type="button" onClick={invite} pending={pending} pendingLabel="Inviting…">
            Invite
          </SubmitButton>
          <button type="button" onClick={onClose} className="btn-secondary">Done</button>
        </div>
        {said && <div className="mt-3"><FormMessage tone={said.tone}>{said.text}</FormMessage></div>}
        {lines && lines.length > 0 && (
          <ul className="mt-3 border border-etyme-rule rounded divide-y divide-etyme-rule">
            {lines.map((l, i) => (
              <li key={`${l.email}-${i}`} className="p-3 min-w-0">
                <div className="text-sm text-etyme-ink break-all">{l.email}</div>
                <div className={`text-xs mt-0.5 break-words ${l.asked ? 'text-etyme-muted' : 'text-etyme-attention'}`}>{l.says}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
