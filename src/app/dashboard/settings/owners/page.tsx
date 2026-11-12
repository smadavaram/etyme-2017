'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePageSection } from '@/components/page-section'
import { Chip, ErrorState, Field, FormMessage, LoadingState, PageHead, Panel, RefusedState, Select, SubmitButton, Textarea } from '@/components/ui'
import { readJson } from '@/lib/read-response'

/**
 * Settings → Owners (founder, 2026-11-11, drawn and built): who owns the
 * company. An Owner passes ownership, adds an Owner, or asks to remove or
 * move one; each waits for a second person's yes, answered here or on the
 * card in Ask Etyme. An Admin reads it and acts on none of it.
 *
 * Every question POST /api/settings/owners asks has a field here: who
 * (contextId), what you are afterwards (after), the role an Owner moves to
 * (toRoleId) and why (reason); and POST /api/settings/owners/:id's answer
 * (decision) is the Yes, Not now and Withdraw buttons.
 */

type Ask = { id: string; kind: 'PASS' | 'REMOVE' | 'DEMOTE'; subject: string; askedBy: string; reason: string; waitsUntil: string; mayDecide: boolean; mayCancel: boolean; says: string }
type Read = {
  company: string
  owners: { contextId: string; name: string; you: boolean }[]
  others: { contextId: string; name: string; role: string | null }[]
  roles: { id: string; name: string }[]
  iAmOwner: boolean
  narrowAdminOffered: boolean
  asks: Ask[]
}

type Flow = null | { kind: 'pass'; after: 'ADMIN' | 'OWNER' | 'LEAVE' } | { kind: 'owner' }

export default function OwnersPage() {
  const eyebrow = usePageSection('/dashboard/settings')
  const [r, setR] = useState<Read | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [flow, setFlow] = useState<Flow>(null)
  const [who, setWho] = useState('')
  const [reason, setReason] = useState('')
  const [ownerAct, setOwnerAct] = useState<'remove' | 'demote'>('remove')
  const [toRoleId, setToRoleId] = useState('')

  const load = useCallback(async () => {
    try {
      const j = await readJson(await fetch('/api/settings/owners'))
      setR(j.data)
    } catch (e: any) {
      if (e?.status === 403) setRefused(e.message)
      else setError(e?.message ?? 'Could not read who owns this company.')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function post(key: string, url: string, body: unknown) {
    setBusy(key); setSaid(null)
    try {
      const j = await readJson(await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
      setSaid({ tone: 'ok', text: j.data.message })
      setFlow(null); setWho(''); setReason('')
      await load()
    } catch (e: any) {
      setSaid({ tone: 'error', text: e.message })
    } finally {
      setBusy(null)
    }
  }

  if (refused) return <RefusedState says={refused} />
  if (error) return <ErrorState says={error} />
  if (!r) return <LoadingState says="Reading who owns this company…" />

  const adminRole = r.roles.find((x) => x.name === 'Admin')

  return (
    <div className="space-y-5">
      <PageHead eyebrow={eyebrow} title="Owners" subtitle="Who owns the company. The Owner runs the business; an Admin runs people and settings." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel title={`${r.company}’s Owners`}>
          <div className="space-y-2">
            {r.owners.map((o) => (
              <div key={o.contextId} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-etyme-rule bg-etyme-raised px-3 py-2.5">
                <span className="text-[14px] text-etyme-ink">{o.name} {o.you && <Chip tone="verified">You</Chip>}</span>
                <Chip tone="action">Owner</Chip>
              </div>
            ))}
            {r.owners.length === 0 && <p className="text-[13.5px] text-etyme-muted">Nobody is the Owner yet. Whoever proves the domain and themselves becomes it, under <Link className="text-etyme-action underline" href="/dashboard/settings/setup/ownership">Setup → Prove ownership</Link>.</p>}
          </div>

          {r.iAmOwner && (
            <div className="mt-3 flex flex-wrap gap-2">
              <SubmitButton type="button" onClick={() => { setFlow({ kind: 'pass', after: 'ADMIN' }); setSaid(null) }}>Pass ownership…</SubmitButton>
              <SubmitButton type="button" tone="secondary" onClick={() => { setFlow({ kind: 'pass', after: 'OWNER' }); setSaid(null) }}>Add an Owner</SubmitButton>
              {r.owners.length > 1 && <SubmitButton type="button" tone="secondary" onClick={() => { setFlow({ kind: 'owner' }); setSaid(null) }}>Remove or move an Owner…</SubmitButton>}
            </div>
          )}

          {flow?.kind === 'pass' && (
            <div className="mt-4 space-y-3 rounded-[12px] border border-etyme-action bg-etyme-action-wash p-4">
              <p className="text-[14px] font-medium text-etyme-ink">{flow.after === 'OWNER' ? 'Who becomes an Owner too?' : 'Who takes over?'}</p>
              <Field label="Who">
                <Select value={who} onChange={(e) => setWho(e.target.value)}>
                  <option value="">Choose somebody with a seat here</option>
                  {r.others.map((o) => <option key={o.contextId} value={o.contextId}>{o.name}{o.role ? ` · ${o.role}` : ''}</option>)}
                </Select>
              </Field>
              <p className="text-[12.5px] text-etyme-muted">Somebody new? Invite them from Users & permissions first, then come back.</p>
              <fieldset className="space-y-1.5">
                <legend className="text-[13px] text-etyme-ink">What are you at {r.company} afterwards?</legend>
                {([['ADMIN', 'Admin', 'People, settings and integrations. No money, no contracts.'], ['OWNER', 'Stay an Owner too', 'Two Owners.'], ['LEAVE', `Leave ${r.company}`, 'Your access ends. What you did stays under your name.']] as const).map(([v, label, line]) => (
                  <label key={v} className="flex cursor-pointer items-start gap-2 rounded-[10px] border border-etyme-rule bg-etyme-raised px-3 py-2 text-[13px]">
                    <input type="radio" name="after" className="mt-1" checked={flow.after === v} onChange={() => setFlow({ kind: 'pass', after: v })} />
                    <span><b className="font-medium">{label}</b> — {line}</span>
                  </label>
                ))}
              </fieldset>
              <Field label="Why"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
              <p className="text-[12.5px] text-etyme-muted">They say yes on a card in Ask Etyme and by email. Nothing changes until then. Both changes then happen together.</p>
              <div className="flex gap-2">
                <SubmitButton type="button" pending={busy === 'pass'} pendingLabel="Asking…" onClick={() => post('pass', '/api/settings/owners', { action: 'pass', contextId: who, after: flow.after, reason })}>Ask them</SubmitButton>
                <SubmitButton type="button" tone="secondary" onClick={() => setFlow(null)}>Cancel</SubmitButton>
              </div>
            </div>
          )}

          {flow?.kind === 'owner' && (
            <div className="mt-4 space-y-3 rounded-[12px] border border-etyme-danger-line bg-etyme-danger-wash p-4">
              <p className="text-[14px] font-medium text-etyme-ink">Remove or move an Owner</p>
              <Field label="Which Owner">
                <Select value={who} onChange={(e) => setWho(e.target.value)}>
                  <option value="">Choose an Owner</option>
                  {r.owners.map((o) => <option key={o.contextId} value={o.contextId}>{o.name}{o.you ? ' (you)' : ''}</option>)}
                </Select>
              </Field>
              <Field label="What happens">
                <Select value={ownerAct} onChange={(e) => setOwnerAct(e.target.value as 'remove' | 'demote')}>
                  <option value="remove">Remove: their seat here ends</option>
                  <option value="demote">Move them to another role</option>
                </Select>
              </Field>
              {ownerAct === 'demote' && (
                <Field label="Their new role">
                  <Select value={toRoleId || adminRole?.id || ''} onChange={(e) => setToRoleId(e.target.value)}>
                    <option value="">Choose a role</option>
                    {r.roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Why"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
              <p className="text-[12.5px] text-etyme-muted">This needs the yes of an Owner who did not ask. Nothing changes until they answer, and you can withdraw it. The last Owner is never removed.</p>
              <div className="flex gap-2">
                <SubmitButton type="button" pending={busy === 'owner'} pendingLabel="Asking…" onClick={() => post('owner', '/api/settings/owners', { action: ownerAct, contextId: who, reason, toRoleId: ownerAct === 'demote' ? (toRoleId || adminRole?.id || '') : undefined })}>Ask for their yes</SubmitButton>
                <SubmitButton type="button" tone="secondary" onClick={() => setFlow(null)}>Cancel</SubmitButton>
              </div>
            </div>
          )}

          {said && <div className="mt-3"><FormMessage tone={said.tone}>{said.text}</FormMessage></div>}
        </Panel>

        <Panel title="Waiting for a yes">
          {r.asks.length === 0 && <p className="text-[13.5px] text-etyme-muted">Nothing is waiting.</p>}
          <div className="space-y-3">
            {r.asks.map((a) => (
              <div key={a.id} className="space-y-2 rounded-[12px] border border-etyme-rule bg-etyme-raised p-3">
                <p className="text-[13.5px] text-etyme-ink">{a.says}</p>
                <p className="text-[12px] text-etyme-faint">Waits until {a.waitsUntil}, then lapses and nothing changes.</p>
                <div className="flex flex-wrap gap-2">
                  {a.mayDecide && <SubmitButton type="button" pending={busy === `y${a.id}`} pendingLabel="Saying yes…" onClick={() => post(`y${a.id}`, `/api/settings/owners/${a.id}`, { decision: 'yes' })}>Yes</SubmitButton>}
                  {a.mayDecide && <SubmitButton type="button" tone="secondary" pending={busy === `n${a.id}`} pendingLabel="Answering…" onClick={() => post(`n${a.id}`, `/api/settings/owners/${a.id}`, { decision: 'no' })}>Not now</SubmitButton>}
                  {a.mayCancel && <SubmitButton type="button" tone="secondary" pending={busy === `c${a.id}`} pendingLabel="Withdrawing…" onClick={() => post(`c${a.id}`, `/api/settings/owners/${a.id}`, { decision: 'cancel' })}>Withdraw</SubmitButton>}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="The rules">
        <ul className="list-disc space-y-1 pl-4 text-[13.5px] text-etyme-ink">
          <li>The new Owner has to say yes. Nobody is made an Owner by surprise.</li>
          <li>One step, one record. They become Owner and you become what you chose, in the same moment.</li>
          <li>There is never no Owner. The last Owner cannot be removed or moved.</li>
          <li>Only an Owner removes an Owner. An Admin cannot.</li>
          <li>Removing or moving an Owner needs the yes of an Owner who did not ask.</li>
          <li>What stays: the address, the bank check, signed agreements, every record.</li>
          <li>If nobody can say yes because an Owner lost access, write to support@etyme.com.</li>
        </ul>
      </Panel>

      {r.narrowAdminOffered && (
        <Panel title="Admin runs the system. The Owner runs the business.">
          <p className="text-[13.5px] text-etyme-ink">Admins here still hold money and contract work: payroll, paying and sending bills, signing, awarding, extending. Narrow them to people, roles, settings and integrations, and give money or contract work through Finance, AP & Payroll or Contract Manager.</p>
          <Field label="Why"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
          <div className="mt-2"><SubmitButton type="button" tone="secondary" pending={busy === 'narrow'} pendingLabel="Narrowing…" onClick={() => post('narrow', '/api/settings/owners', { action: 'narrow-admin', reason })}>Narrow Admin to people and settings</SubmitButton></div>
        </Panel>
      )}
    </div>
  )
}
