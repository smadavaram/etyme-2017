'use client'

import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { formatDay } from '@/lib/format-date'
import { FormMessage } from '@/components/ui/form'
import { Panel, Lbl } from './panel-bits'
import { giveAccessBody, fieldsDrawn, type GiveAccessValues } from '@/lib/permission-grants/form'

/**
 * "Give access", on Users & permissions (founder, 2026-11-08: "Owner
 * should control who should see what … by team hierarchy or individual
 * role or company as well").
 *
 * The form of `POST /api/settings/grants` and nothing more: what they may
 * do, in plain words; who (a role, or one person here); how far (only the
 * scopes the route offers for that permission); why. Below it, every grant
 * with Revoke. The route decides and its sentence is shown as it is.
 *
 * Placed by the page's owner (regulatory) on `/dashboard/access`.
 */

interface Option { key: string; label: string; personOnly: boolean; scopes: string[] }
interface Grant { id: string; says: string; reason: string; grantedBy: string; grantedAt: string; revokedBy: string | null; revokedAt: string | null }
interface Data {
  canGive: boolean
  permissions: Option[]
  scopes: { key: string; label: string }[]
  roles: { id: string; name: string }[]
  people: { contextId: string; name: string; roleName: string | null }[]
  units: { id: string; name: string }[]
  grants: Grant[]
}

const EMPTY: GiveAccessValues = { permission: '', who: '', scope: 'COMPANY', orgUnitId: '', reason: '' }
const input = 'w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-etyme-raised'

export function GiveAccess() {
  const [data, setData] = useState<Data | null>(null)
  const [v, setV] = useState<GiveAccessValues>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)

  async function load() {
    // A seat that may not read who holds what is shown nothing: the page
    // around it already says what that seat can do, and a red box over a
    // read it never asked for reads as something broken.
    try {
      const res = await fetch('/api/settings/grants')
      if (!res.ok) { setData(null); setRefused(true); return }
      setData((await res.json()).data)
    } catch {
      setRefused(true)
    }
  }
  useEffect(() => { void load() }, [])

  const chosen = data?.permissions.find((p) => p.key === v.permission) ?? null
  const scopes = (data?.scopes ?? []).filter((s) => !chosen || chosen.scopes.includes(s.key))
  const set = (patch: Partial<GiveAccessValues>) => { setV((x) => ({ ...x, ...patch })); setDone(null) }

  async function give(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setDone(null)
    try {
      const j = await readJson(await fetch('/api/settings/grants', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(giveAccessBody(v)),
      }))
      setDone(j.data.says)
      setV(EMPTY)
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    setBusy(true); setError(null); setDone(null)
    try {
      const j = await readJson(await fetch(`/api/settings/grants?id=${encodeURIComponent(id)}`, { method: 'DELETE' }))
      setDone(j.data.says)
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (refused || !data) return null
  const live = data.grants.filter((g) => !g.revokedAt)
  const past = data.grants.filter((g) => g.revokedAt)
  const drawn = fieldsDrawn(v.scope)

  return (
    <Panel title="Give access" subtitle="Let a role, or one person, do one more thing than their role allows. Every grant keeps who gave it, when and why.">
      {data.canGive && (
        <form onSubmit={give} className="space-y-3 max-w-xl mb-6">
          <div>
            <Lbl>What they may do</Lbl>
            <select value={v.permission} onChange={(e) => set({ permission: e.target.value, scope: 'COMPANY', orgUnitId: '' })} className={input}>
              <option value="">Choose one</option>
              {data.permissions.map((p) => <option key={p.key} value={p.key}>{p.label[0].toUpperCase() + p.label.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <Lbl>Who</Lbl>
            <select value={v.who} onChange={(e) => set({ who: e.target.value })} className={input}>
              <option value="">Choose a role or a person</option>
              {!chosen?.personOnly && (
                <optgroup label="A role: everybody in it">
                  {data.roles.map((r) => <option key={r.id} value={`role:${r.id}`}>{r.name}</option>)}
                </optgroup>
              )}
              <optgroup label="One person">
                {data.people.map((p) => (
                  <option key={p.contextId} value={`person:${p.contextId}`}>{p.name}{p.roleName ? ` · ${p.roleName}` : ''}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <Lbl>How far</Lbl>
            <select value={v.scope} onChange={(e) => set({ scope: e.target.value, orgUnitId: '' })} className={input}>
              {scopes.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          {drawn.includes('orgUnitId') && (
            <div>
              <Lbl>The team</Lbl>
              <select value={v.orgUnitId} onChange={(e) => set({ orgUnitId: e.target.value })} className={input}>
                <option value="">Choose a team</option>
                {data.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <Lbl>Why</Lbl>
            <input value={v.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="She runs the Dayton account and reviews its margin monthly" className={input} />
          </div>
          {error && <FormMessage tone="error">{error}</FormMessage>}
          {done && <FormMessage tone="ok">{done}</FormMessage>}
          <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">{busy ? 'Saving…' : 'Give access'}</button>
        </form>
      )}
      {live.length === 0 ? (
        <p className="text-[14px] text-etyme-muted">Nobody holds anything beyond their role.</p>
      ) : (
        <ul className="divide-y divide-etyme-rule">
          {live.map((g) => (
            <li key={g.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
              <div className="text-[14px] text-etyme-ink">
                <p>{g.says}</p>
                <p className="text-[13px] text-etyme-muted">Given by {g.grantedBy}, {formatDay(g.grantedAt)}. Why: {g.reason}</p>
              </div>
              {data.canGive && (
                <button type="button" className="btn-secondary text-[13px]" disabled={busy} onClick={() => revoke(g.id)}>Revoke</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <details className="mt-4 text-[13px] text-etyme-muted">
          <summary>Taken away ({past.length})</summary>
          <ul className="mt-2 space-y-1">
            {past.map((g) => <li key={g.id}>{g.says} Taken away by {g.revokedBy ?? 'somebody no longer here'}, {formatDay(g.revokedAt!)}.</li>)}
          </ul>
        </details>
      )}
    </Panel>
  )
}
