'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'

/**
 * Invite a teammate: name, work email, and what they do here.
 *
 * Posts to the same door as "Invite a teammate" on Users and permissions
 * (`POST /api/access/invite`, regulation's), with the roles this company
 * grants (`GET /api/roles`). Drawn at setup's "Your team" step; the access
 * page may draw it too, so the two cannot drift.
 *
 * `onInvited` lets a host count the people brought in.
 */

interface RoleOption { id: string; name: string }

export function InviteTeammate({ onInvited }: { onInvited?: (says: string) => void }) {
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [invite, setInvite] = useState({ name: '', email: '', roleId: '' })
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ text: string; tone: 'ok' | 'error' }[]>([])

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch('/api/roles'))
      // Owner is not handed out by invitation; Member is what a colleague
      // gets by arriving, so neither is offered here.
      setRoles((body.data?.roles ?? []).filter((r: RoleOption) => r.name !== 'Owner' && r.name !== 'Member'))
    } catch {
      setRoles([])
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function send() {
    setBusy(true)
    try {
      const body = await readJson(await fetch('/api/access/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: invite.name.trim(), email: invite.email.trim(), roleId: invite.roleId || undefined }),
      }))
      const text = body.data?.says ?? `${invite.email.trim()} has been invited.`
      setSaid((s) => [...s, { text, tone: 'ok' }])
      setInvite({ name: '', email: '', roleId: '' })
      onInvited?.(text)
    } catch (e: any) {
      setSaid((s) => [...s, { text: e.message, tone: 'error' }])
    } finally {
      setBusy(false)
    }
  }

  const field = 'px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm text-etyme-ink focus:outline-none focus:border-etyme-action'
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.3fr_1fr_auto] gap-2 items-center">
        <input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} placeholder="Name" className={field} aria-label="Name" />
        <input value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="Work email" className={field} aria-label="Work email" />
        <select value={invite.roleId} onChange={(e) => setInvite({ ...invite, roleId: e.target.value })} className={field} aria-label="Role">
          <option value="">What they do here…</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button onClick={send} disabled={busy || !invite.email.includes('@')}
          className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-40">
          {busy ? 'Inviting…' : 'Invite'}
        </button>
      </div>
      {said.map((s, i) => (
        <p key={i} className={`mt-2 text-sm ${s.tone === 'ok' ? 'text-etyme-verified' : 'text-etyme-attention'}`}>{s.text}</p>
      ))}
    </div>
  )
}
