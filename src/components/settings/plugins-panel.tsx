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
  opensSays: string | null
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

  // A company that only buys is offered no plugin: no panel, no switch.
  if (data && data.plugins.length === 0) return null

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
              {data.canSwitch && !p.on && p.opensSays ? (
                <span className="text-[12px] text-etyme-muted max-w-[260px]">{p.opensSays}</span>
              ) : data.canSwitch ? (
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
      {data?.plugins.some((p) => p.key === 'WEBSITE') && <WebsiteChecks canSet={data.canSwitch} onChanged={load} />}
      {err && <FormMessage tone="error">{err}</FormMessage>}
    </Panel>
  )
}

interface ChecksView {
  branding: { approved: boolean; by: string | null; atWords: string | null }
  compliancePassRequired: boolean
  passes: { id: string; passedAt: string; by: string | null; fileName: string | null; note: string | null }[]
  checks: { missing: { check: string; says: string }[]; says: string | null }
  canSet: boolean
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('That file could not be read.'))
    r.readAsDataURL(file)
  })
}

/**
 * The three checks before the site goes public (records 121, 123): the
 * Owner approves the branding, says whether a compliance pass is required
 * and records the pass with its paper. The domain is read, never set here.
 */
function WebsiteChecks({ canSet, onChanged }: { canSet: boolean; onChanged: () => void }) {
  const [v, setV] = useState<ChecksView | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [day, setDay] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    try { setV((await readJson(await fetch('/api/settings/website-checks'))).data) } catch (e: any) { setErr(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  async function send(method: 'PATCH' | 'POST', body: unknown) {
    setBusy(true); setErr(null)
    try {
      setV((await readJson(await fetch('/api/settings/website-checks', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))).data)
      onChanged()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  async function recordPass() {
    if (!file) { setErr('Attach the document that shows the pass.'); return }
    await send('POST', { passedAt: day, note, fileName: file.name, contentType: file.type, contentBase64: await toBase64(file) })
    setDay(''); setNote(''); setFile(null)
  }

  if (!v) return err ? <FormMessage tone="error">{err}</FormMessage> : null
  const btn = 'rounded-[8px] border border-etyme-rule bg-etyme-raised px-3 py-1.5 text-[13px] text-etyme-ink'
  return (
    <div className="mt-4 border-t border-etyme-rule pt-3" aria-label="Before the site goes public">
      <div className="text-[14px] font-medium text-etyme-ink">Before the site goes public</div>
      <p className="text-[13px] text-etyme-ink">
        Branding: {v.branding.approved ? `approved by ${v.branding.by}, ${v.branding.atWords}.` : 'not approved yet.'}{' '}
        {canSet && <button type="button" disabled={busy} className={btn} onClick={() => send('PATCH', { brandingApproved: !v.branding.approved })}>{v.branding.approved ? 'Withdraw approval' : 'Approve the branding'}</button>}
      </p>
      <p className="text-[13px] text-etyme-ink">
        <label>
          <input type="checkbox" disabled={!canSet || busy} checked={v.compliancePassRequired} onChange={(e) => send('PATCH', { compliancePassRequired: e.target.checked })} />{' '}
          Our business requires a compliance pass before the site goes public
        </label>
      </p>
      {v.passes.length > 0 && (
        <ul className="text-[13px] text-etyme-ink">
          {v.passes.map((p) => <li key={p.id}>Passed {p.passedAt}, recorded by {p.by}, with {p.fileName}.{p.note ? ` ${p.note}` : ''}</li>)}
        </ul>
      )}
      {canSet && v.compliancePassRequired && (
        <div className="flex flex-wrap items-end gap-2 mt-2">
          <label className="text-[12px] text-etyme-muted">Day it passed <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="block rounded-[8px] border border-etyme-rule px-2 py-1 text-[13px] text-etyme-ink" /></label>
          <label className="text-[12px] text-etyme-muted">Document <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block text-[13px]" /></label>
          <label className="text-[12px] text-etyme-muted">Note <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="block rounded-[8px] border border-etyme-rule px-2 py-1 text-[13px] text-etyme-ink" /></label>
          <button type="button" disabled={busy || !day} className={btn} onClick={recordPass}>Record the pass</button>
        </div>
      )}
      {v.checks.says && <p className="text-[12px] text-etyme-muted mt-2">{v.checks.says}</p>}
      {err && <FormMessage tone="error">{err}</FormMessage>}
    </div>
  )
}
