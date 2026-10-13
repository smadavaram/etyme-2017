'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { momentFor, readerZone } from '@/lib/when'
import { ListSurface, type Column } from '@/components/list-surface'
import { Field, Check, Textarea, SubmitButton, FormMessage } from '@/components/ui/form'
import { Empty, Panel, setLine } from './panel-bits'

/**
 * Ask Etyme and the model (founder, 2026-10-13, "The model boundary").
 * Off until the settings desk turns it on; who did and when is said under
 * it; every prompt that left is listed, masked, with a CSV export. The
 * rules are lib/model-boundary, through /api/settings/ask-etyme.
 */

interface PromptRow {
  id: string
  ts: string
  personName: string | null
  provider: string
  model: string
  maskedPrompt: string
  maskedAnswer: string
  tokensIn: number | null
  tokensOut: number | null
  purpose: string
}

interface ModelSetting {
  on: boolean
  /** False when this deployment has no model key, so nothing can leave. */
  modelSetUp: boolean
  setByName: string | null
  setAt: string | null
  canEdit: boolean
  prompts: PromptRow[]
}

export function AskEtymePanel() {
  const [data, setData] = useState<ModelSetting | null>(null)
  const [want, setWant] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch('/api/settings/ask-etyme'))
      setData(body.data)
      setWant(body.data.on)
    } catch (e: any) {
      setErr(e.message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    setBusy(true); setErr(null); setNote(null)
    try {
      const body = await readJson(await fetch('/api/settings/ask-etyme', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on: want, reason }),
      }))
      setNote(body.data?.message ?? 'Saved.')
      setReason('')
      await load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const title = 'Ask Etyme may send free-text questions to the model'
  if (!data) {
    return <Panel title={title}>{err ? <FormMessage tone="error">{err}</FormMessage> : <Empty>Opening the model setting…</Empty>}</Panel>
  }

  const columns: Column<PromptRow>[] = [
    { key: 'ts', label: 'When', render: (r) => <span className="whitespace-nowrap tabular-nums">{momentFor(new Date(r.ts), readerZone())}</span>, sortValue: (r) => r.ts, exportValue: (r) => r.ts },
    { key: 'personName', label: 'Asked by', exportValue: (r) => r.personName ?? '' },
    { key: 'maskedPrompt', label: 'What was sent (masked)' },
    { key: 'maskedAnswer', label: 'What came back (masked)', hideOnMobile: true },
    { key: 'model', label: 'Model', render: (r) => `${r.provider} · ${r.model}`, exportValue: (r) => `${r.provider} ${r.model}`, hideOnMobile: true },
    { key: 'tokensIn', label: 'Tokens in', align: 'right', hideOnMobile: true },
    { key: 'tokensOut', label: 'Tokens out', align: 'right', hideOnMobile: true },
  ]

  return (
    <Panel
      title={title}
      subtitle="Names, rates and pay are masked before anything leaves; every prompt is logged below."
    >
      <p className="mb-4 text-[13.5px] text-etyme-ink">
        {data.on
          ? data.modelSetUp
            ? 'On. Questions the rules do not answer may go to the model, masked.'
            : 'On, but no model is set up on this deployment, so nothing leaves.'
          : 'Off. Ask Etyme answers from the rules only and sends nothing to the model.'}
      </p>
      {data.canEdit && (
        <div className="mb-4 space-y-3">
          <Check label="Let Ask Etyme send free-text questions to the model" checked={want} disabled={busy} onChange={(e) => setWant(e.target.checked)} />
          {want !== data.on && (
            <Field label="Why?" help="Kept with the change, with your name and the time.">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
            </Field>
          )}
          {(err || note) && (
            <div>
              {err && <FormMessage tone="error">{err}</FormMessage>}
              {note && <FormMessage tone="ok">{note}</FormMessage>}
            </div>
          )}
          <SubmitButton type="button" onClick={save} pending={busy} pendingLabel="Saving…" disabled={want === data.on || !reason.trim()}>
            {want ? 'Turn it on' : 'Turn it off'}
          </SubmitButton>
        </div>
      )}
      <p className="text-[12px] text-etyme-muted border-t border-etyme-rule pt-3 mb-4">{setLine(data.setAt, data.setByName)}</p>
      <ListSurface<PromptRow>
        name="model-prompts"
        columns={columns}
        data={data.prompts}
        rowKey={(r) => r.id}
        searchPlaceholder="Search what left…"
        emptyMessage="Nothing has been sent to the model."
        emptyDetail={data.on ? 'A question the rules cannot answer will be listed here once it is sent.' : 'The model is off, so nothing can be sent.'}
        exportName="ask-etyme-model-prompts"
      />
    </Panel>
  )
}
