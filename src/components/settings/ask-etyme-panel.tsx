'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { momentFor, readerZone } from '@/lib/when'
import { ListSurface, type Column } from '@/components/list-surface'
import { Field, Check, Textarea, SubmitButton, FormMessage } from '@/components/ui/form'
import { Empty, Panel, setLine } from './panel-bits'

/**
 * Ask Etyme and the model (founder, 2026-10-13, "The model boundary").
 * Off until an Owner or Admin turns it on; who did and when is said under
 * it; the boundary is said in four lines a buyer can check; every prompt
 * that left is listed, masked, with a CSV export. The rules are
 * lib/model-boundary, through /api/settings/ask-etyme.
 *
 * The panel carries the anchor Ask Etyme's "turn it on under Settings"
 * links to (`MODEL_SWITCH_ANCHOR` in lib/model-boundary, which this client
 * file cannot import because that file reads the database).
 */
export const PANEL_ANCHOR = 'ask-etyme-model'

/** The boundary, in the four lines a buyer can check against the log below. */
export const BOUNDARY_LINES = [
  'Names, rates and pay are masked before anything leaves.',
  'Only what the rules did not answer is sent.',
  'The provider keeps nothing.',
  'Every prompt and answer is logged on your record, below.',
] as const

/** Said where this deployment has no model key; the choice is still recorded. */
export const NOT_SET_UP_LINE = 'The model is not set up on this deployment yet; turning it on here takes effect when it is.'

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
  // Arrived by the link in Ask Etyme's sentence: bring the switch into view once it is drawn.
  useEffect(() => {
    if (data && window.location.hash === `#${PANEL_ANCHOR}`) document.getElementById(PANEL_ANCHOR)?.scrollIntoView()
  }, [data])

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

  const title = 'Ask Etyme and the model'
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
    <div id={PANEL_ANCHOR} className="scroll-mt-20">
    <Panel
      title={title}
      subtitle="Off until an Owner or an Admin turns it on. Ask Etyme answers from the rules first either way."
    >
      <p className="mb-2 text-[14px] text-etyme-ink">
        {data.on
          ? 'On. A question the rules do not answer may be sent, masked.'
          : 'Off. Ask Etyme answers from the rules only and sends nothing.'}
      </p>
      {!data.modelSetUp && <p className="mb-3 text-[13px] text-etyme-ink">{NOT_SET_UP_LINE}</p>}
      <ul className="mb-4 space-y-1 text-[13px] text-etyme-muted list-disc pl-5">
        {BOUNDARY_LINES.map((l) => <li key={l}>{l}</li>)}
      </ul>
      {data.canEdit ? (
        <div className="mb-4 space-y-3">
          <Check label="Send what the rules did not answer, masked" checked={want} disabled={busy} onChange={(e) => setWant(e.target.checked)} />
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
      ) : (
        <p className="mb-4 text-[13px] text-etyme-muted">Only the Owner or an Admin turns this on or off.</p>
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
    </div>
  )
}
