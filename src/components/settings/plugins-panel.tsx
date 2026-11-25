'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { FormMessage } from '@/components/ui/form'
import { Panel } from './panel-bits'

interface PluginView {
  key: string
  label: string
  says: string
  on: boolean
  last: { on: boolean; by: string; atWords: string } | null
}

/**
 * Plugins (record 120): two switches the Owner turns on and off. Each
 * says what it is in one sentence, its state, and the last time it was
 * switched and by whom, Etyme staff included. Switching off hides and
 * never deletes. An Admin reads and is told who switches.
 */
export function PluginsPanel() {
  const [data, setData] = useState<{ plugins: PluginView[]; canSwitch: boolean } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setData((await readJson(await fetch('/api/settings/plugins'))).data) } catch (e: any) { setErr(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  async function flip(p: PluginView) {
    setBusy(p.key); setErr(null)
    try {
      const body = await readJson(await fetch('/api/settings/plugins', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plugin: p.key, on: !p.on }),
      }))
      setData(body.data)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel title="Plugins" subtitle="Extra modules, off until you turn them on. Turning one off hides it and deletes nothing.">
      {!data && !err && <p className="text-[13px] text-etyme-muted">Opening the plugins…</p>}
      {data && (
        <ul className="divide-y divide-etyme-rule">
          {data.plugins.map((p) => (
            <li key={p.key} className="py-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 max-w-[560px]">
                <div className="text-[14px] font-medium text-etyme-ink">
                  {p.label} <span className={p.on ? 'text-etyme-verified' : 'text-etyme-muted'}>{p.on ? 'On' : 'Off'}</span>
                </div>
                <p className="text-[13px] text-etyme-ink">{p.says}</p>
                <p className="text-[12px] text-etyme-muted">
                  {p.last ? `Last switched ${p.last.on ? 'on' : 'off'} by ${p.last.by}, ${p.last.atWords}.` : 'Never switched.'}
                </p>
              </div>
              {data.canSwitch ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.on}
                  aria-label={`${p.label}: ${p.on ? 'on' : 'off'}`}
                  disabled={busy === p.key}
                  onClick={() => flip(p)}
                  className="rounded-[8px] border border-etyme-rule bg-etyme-raised px-3 py-1.5 text-[13px] text-etyme-ink"
                >
                  {p.on ? 'Turn off' : 'Turn on'}
                </button>
              ) : (
                <span className="text-[12px] text-etyme-muted">Only the firm’s Owner switches this.</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {err && <FormMessage tone="error">{err}</FormMessage>}
    </Panel>
  )
}
