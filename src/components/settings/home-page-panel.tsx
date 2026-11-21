'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { Field, Select, SubmitButton, FormMessage } from '@/components/ui/form'
import { HOME_CHOICES } from '@/lib/decision-queue'
import { Panel } from './panel-bits'

/**
 * The first screen after sign-in (record 107, A1): the usual one, or the
 * decision queue. The Owner's choice, through /api/settings/home-page;
 * every change is a row on the record ledger.
 */
export function HomePagePanel() {
  const [data, setData] = useState<{ homePage: string; canEdit: boolean; entities: { id: string; name: string }[] } | null>(null)
  const [choice, setChoice] = useState('USUAL')
  const [entity, setEntity] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const body = await readJson(await fetch('/api/settings/home-page'))
      setData(body.data); setChoice(body.data.homePage)
    } catch (e: any) {
      setErr(e.message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    setBusy(true); setErr(null); setNote(null)
    try {
      const body = await readJson(await fetch('/api/settings/home-page', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ homePage: choice, actingEntityId: entity || null }),
      }))
      setNote(body.data.message)
      await load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="First screen after sign-in" subtitle="Where everyone at the firm lands when they sign in, and where Dashboard takes them back to.">
      {!data && !err && <p className="text-[13px] text-etyme-muted">Opening the setting…</p>}
      {data && (
        <div className="grid gap-4 max-w-[420px]">
          <Field label="First screen after sign-in" id="home-page-choice">
            <Select id="home-page-choice" value={choice} disabled={!data.canEdit} onChange={(e) => setChoice(e.target.value)}>
              {HOME_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          {data.canEdit && data.entities.length > 0 && (
            <Field label="The legal entity this change is made for" id="home-page-entity">
              <Select id="home-page-entity" value={entity} onChange={(e) => setEntity(e.target.value)}>
                <option value="">Choose an entity</option>
                {data.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
          )}
          {data.canEdit ? (
            <div><SubmitButton type="button" pending={busy} pendingLabel="Saving…" onClick={save}>Save</SubmitButton></div>
          ) : (
            <p className="text-[13px] text-etyme-muted">Only the firm’s Owner changes this.</p>
          )}
        </div>
      )}
      {err && <FormMessage tone="error">{err}</FormMessage>}
      {note && <FormMessage tone="ok">{note}</FormMessage>}
    </Panel>
  )
}
