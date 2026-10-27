'use client'

import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { FormMessage } from '@/components/ui/form'
import { Panel, Lbl } from './panel-bits'

/**
 * "Grant a seat", on a client's MSPs page (Settings → MSPs).
 *
 * The onboarding walk of 2026-10-27: the page said "Nobody outside this
 * company sits in this program" and offered no way to change that, while
 * `POST /api/program/seats` already granted one. This is that route's
 * form, and nothing more: the MSP by its name or its Etyme address
 * (`GET /api/firms`), one of the client's own roles (`GET /api/roles`),
 * and the reason the route requires. The asks MSPs made of this client
 * are listed above the form; choosing one fills it in, and Not now
 * answers it. The route decides, and its sentence is shown as it is.
 *
 * Placed by the page's owner (demand) on `/dashboard/program/seats`, for a
 * client reader. `onGranted` lets the page read its seats again.
 */

interface Ask { id: string; office: { id: string; name: string; slug: string }; says: string }
interface Role { id: string; name: string }

export function GrantSeat({ onGranted }: { onGranted?: () => void }) {
  const [asks, setAsks] = useState<Ask[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [word, setWord] = useState('')
  const [office, setOffice] = useState<{ id: string; name: string } | null>(null)
  const [roleId, setRoleId] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function load() {
    const [a, r] = await Promise.all([
      fetch('/api/seat-requests').then(readJson).catch(() => null),
      fetch('/api/roles').then(readJson).catch(() => null),
    ])
    setAsks(Array.isArray(a?.data?.asks) ? a.data.asks : [])
    const list: Role[] = Array.isArray(r?.data?.roles) ? r.data.roles.map((x: Role) => ({ id: x.id, name: x.name })) : []
    setRoles(list)
    // Program Manager is the seat an MSP holds most often.
    setRoleId((prev) => prev || list.find((x) => x.name === 'Program Manager')?.id || '')
  }
  useEffect(() => { void load() }, [])

  async function find() {
    setError(null); setOffice(null)
    if (word.trim().length < 2) return
    try {
      const j = await readJson(await fetch(`/api/firms?as=MSP&q=${encodeURIComponent(word.trim())}`))
      setOffice({ id: j.data.firm.id, name: j.data.firm.name })
    } catch (err: any) {
      setError(err.message)
    }
  }

  function choose(ask: Ask) {
    setWord(ask.office.slug)
    setOffice({ id: ask.office.id, name: ask.office.name })
    setError(null); setDone(null)
  }

  async function grant(e: React.FormEvent) {
    e.preventDefault()
    if (!office) { await find(); return }
    setBusy(true); setError(null); setDone(null)
    try {
      const j = await readJson(await fetch('/api/program/seats', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ officeCompanyId: office.id, roleId, reason }),
      }))
      setDone(j.data.says)
      setWord(''); setOffice(null); setReason('')
      await load()
      onGranted?.()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function notNow(ask: Ask) {
    setBusy(true); setError(null)
    try {
      const j = await readJson(await fetch(`/api/seat-requests/${encodeURIComponent(ask.id)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'not-now' }),
      }))
      setDone(j.data.says)
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Grant a seat" subtitle="An MSP holds one of your own roles, under your rules. Everybody at that MSP acts in it, and every read is on the record.">
      {asks.length > 0 && (
        <ul className="mb-4 space-y-2">
          {asks.map((ask) => (
            <li key={ask.id} className="flex flex-wrap items-center justify-between gap-2 text-[14px] text-etyme-ink">
              <span>{ask.says}</span>
              <span className="flex gap-2">
                <button type="button" className="btn-secondary text-[13px]" disabled={busy} onClick={() => choose(ask)}>Grant</button>
                <button type="button" className="btn-secondary text-[13px]" disabled={busy} onClick={() => notNow(ask)}>Not now</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={grant} className="space-y-3 max-w-xl">
        <div>
          <Lbl>The MSP</Lbl>
          <input value={word} onChange={(e) => { setWord(e.target.value); setOffice(null) }} onBlur={find}
            placeholder="Its name, or its Etyme address" className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg" />
          {office && <p className="text-xs text-etyme-muted mt-1">{office.name} is on Etyme.</p>}
        </div>
        <div>
          <Lbl>The role it holds here</Lbl>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-etyme-raised">
            <option value="" disabled>Choose one of your roles</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <Lbl>Why</Lbl>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="They run our contractor program from January"
            className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg" />
        </div>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {done && <FormMessage tone="ok">{done}</FormMessage>}
        <button type="submit" disabled={busy || !roleId} className="btn-primary disabled:opacity-50">
          {busy ? 'Granting…' : 'Grant the seat'}
        </button>
      </form>
    </Panel>
  )
}
