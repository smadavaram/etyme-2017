'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { ErrorState, FormMessage, LoadingState, PageHead, Panel, RefusedState } from '@/components/ui'
import { ClientCodesPanel } from '../client-codes-panel'

/**
 * The client's own codes, on a page of their own as well as a tab of
 * Settings, because the people who keep them (Finance, the Owner, or the
 * AP clerk where no Finance seat exists) do not all open the company's
 * settings. Any other seat reads the route's sentence saying who sets them.
 */
interface CostCenterRow { id: string; code: string; name: string; glAccount: string | null; profitCenter: string | null }

export default function CostCentersPage() {
  const section = usePageSection('/dashboard/settings/cost-centers')
  const [rows, setRows] = useState<CostCenterRow[] | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editPc, setEditPc] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/codes')
      if (res.status === 403) {
        const body = await res.json().catch(() => null)
        setRefused(body?.error?.message ?? 'Your role does not keep these codes.')
        return
      }
      const body = await readJson(res)
      setRows(body.data.costCenters)
    } catch (e: any) {
      setError(e.message)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function send(path: string, method: string, payload?: unknown) {
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      const res = await fetch(path, {
        method,
        ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
      })
      const body = await readJson(res)
      setFlash(body.data?.message ?? 'Saved.')
      await load()
      return body.data
    } catch (e: any) {
      setError(e.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  if (refused) return <RefusedState says={refused} />
  if (!rows) return error ? <ErrorState says={error} /> : <LoadingState says="Opening your codes…" />

  return (
    <>
      <PageHead
        eyebrow={section}
        title="Cost centers"
        subtitle="The codes your own accounting system uses. They go on every line of the file you download."
      />
      {flash && <div className="mb-5"><FormMessage tone="ok">{flash}</FormMessage></div>}
      {error && <div className="mb-5"><FormMessage tone="error">{error}</FormMessage></div>}
      <div className="[&>*]:mb-5">
        <Panel title="Profit centers" subtitle="A cost center’s profit center goes on its lines in the file.">
          {rows.length === 0 ? (
            <p className="text-[13px] text-etyme-ink">No cost centers yet. Your Owner or Admin adds them in Settings.</p>
          ) : (
            <div className="divide-y divide-etyme-rule">
              {rows.map((cc) => (
                <div key={cc.id} className="py-2.5 flex flex-wrap items-baseline justify-between gap-3">
                  <span>
                    <span className="text-[13px] font-mono text-etyme-ink">{cc.code}</span>
                    <span className="ml-3 text-[13px] text-etyme-muted">{cc.name}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {cc.profitCenter && <span className="text-[12px] font-mono text-etyme-faint">Profit center {cc.profitCenter}</span>}
                    {editing === cc.id ? (
                      <span className="flex items-center gap-2">
                        <input
                          value={editPc}
                          onChange={(e) => setEditPc(e.target.value)}
                          aria-label={`Profit center for ${cc.code}`}
                          placeholder="Profit center"
                          className="px-2 py-1 border border-etyme-rule rounded bg-etyme-raised text-[12px] font-mono"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          className="text-[12px] underline"
                          style={{ color: 'var(--color-action)' }}
                          onClick={async () => {
                            const r = await send('/api/settings/cost-centers', 'PATCH', { id: cc.id, profitCenter: editPc.trim() || null })
                            if (r) setEditing(null)
                          }}
                        >
                          Save
                        </button>
                        <button type="button" className="text-[12px] underline text-etyme-muted" onClick={() => setEditing(null)}>Cancel</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        className="text-[12px] underline"
                        style={{ color: 'var(--color-action)' }}
                        onClick={() => { setEditing(cc.id); setEditPc(cc.profitCenter ?? '') }}
                      >
                        {cc.profitCenter ? 'Change profit center' : 'Set profit center'}
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <ClientCodesPanel send={send} busy={busy} />
      </div>
    </>
  )
}
