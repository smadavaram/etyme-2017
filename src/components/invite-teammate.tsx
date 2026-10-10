'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { Field, Input, Select, SubmitButton, FormMessage } from '@/components/ui/form'

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

  // The shared field set (components/ui/form): each box has its label
  // above it rather than a placeholder standing in for one, so "Work
  // email" is still said once somebody has typed in it. Stacked on a
  // phone, one row from sm up.
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (invite.email.includes('@')) send() }}
      noValidate
    >
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.3fr_1fr_auto] gap-3 sm:items-end">
        <Field label="Name">
          <Input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="Work email">
          <Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="What they do here">
          <Select value={invite.roleId} onChange={(e) => setInvite({ ...invite, roleId: e.target.value })}>
            <option value="">Choose a role…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <SubmitButton pending={busy} pendingLabel="Inviting…" disabled={!invite.email.includes('@')}>
          Invite
        </SubmitButton>
      </div>
      {said.length > 0 && (
        <div className="mt-3 space-y-1">
          {said.map((s, i) => <FormMessage key={i} tone={s.tone === 'ok' ? 'ok' : 'error'}>{s.text}</FormMessage>)}
        </div>
      )}
    </form>
  )
}
