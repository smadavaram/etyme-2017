'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { plainDate } from '@/lib/plain-date'
import { stepsMailto, type ConnectDomainView } from '@/lib/domains-owned'
import { Chip, Field, FormMessage, Input, LoadingState, ErrorState, SubmitButton } from '@/components/ui'

/**
 * Connect your domain (founder, "build it" on the drawing, 2026-11-12).
 * Drawn on the setup checklist's "Your domain" item and on its own page
 * under Settings. The company types its domain, Etyme shows the one TXT
 * record to add, "Check now" reads it, and the result is said in a
 * sentence; once it stands the first-verified day is shown.
 *
 * Every question the route asks has a field here: the domain (CLAIM) and
 * which claim to check (CHECK). Both go through PUT
 * /api/settings/setup/domain, the one DNS proof.
 */

type View = ConnectDomainView & { company: string }

export function ConnectDomain({ suggested = '', onChanged }: { suggested?: string; onChanged?: (data: any) => void }) {
  const [view, setView] = useState<View | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [domain, setDomain] = useState(suggested)
  const [busy, setBusy] = useState<string | null>(null)
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const j = await readJson(await fetch('/api/settings/domain'))
      setView(j.data)
      setFailed(null)
    } catch (e: any) { setFailed(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  async function act(key: string, body: Record<string, unknown>) {
    setBusy(key); setSaid(null)
    try {
      const j = await readJson(await fetch('/api/settings/setup/domain', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }))
      setSaid({ tone: 'ok', text: j.data?.says ?? 'Saved.' })
      onChanged?.(j.data)
      await load()
    } catch (e: any) { setSaid({ tone: 'error', text: e.message }) } finally { setBusy(null) }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(value) } catch { setCopied(null) }
  }

  if (failed) return <ErrorState says={`Your domain could not be read. ${failed}`} />
  if (!view) return <LoadingState says="Reading your domain…" compact />

  return (
    <div className="space-y-5">
      {view.rows.map((r) => (
        <div key={r.domain} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[14px] text-etyme-ink">{r.domain}</span>
            {r.state === 'VERIFIED'
              ? <Chip tone="verified">Verified</Chip>
              : <Chip tone="attention">Waiting for the record</Chip>}
          </div>
          <p className="text-[13.5px] leading-relaxed text-etyme-ink">
            {r.says}
            {r.firstVerifiedOn && <> First verified {plainDate(r.firstVerifiedOn)}.</>}
          </p>
          {r.record && (
            <>
              <div className="overflow-x-auto rounded border border-etyme-rule">
                <table className="w-full min-w-[520px] bg-etyme-raised text-[13px] tabular-nums">
                  <thead>
                    <tr className="bg-etyme-sunk text-left">
                      <th className="eyebrow px-3 py-2">Add this record</th>
                      <th className="eyebrow px-3 py-2">Type</th>
                      <th className="eyebrow px-3 py-2">Name</th>
                      <th className="eyebrow px-3 py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-etyme-rule align-top">
                      <td className="px-3 py-2 text-etyme-ink">Prove it is yours</td>
                      <td className="px-3 py-2 font-mono">TXT</td>
                      <td className="px-3 py-2 font-mono">{r.record.host}</td>
                      <td className="px-3 py-2">
                        <span className="break-all font-mono text-[12.5px]">{r.record.value}</span>{' '}
                        <button type="button" onClick={() => copy(r.record!.value)} className="ml-1 text-[12px] font-semibold text-etyme-action underline-offset-2 hover:underline">
                          {copied === r.record.value ? 'Copied' : 'Copy'}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[12.5px] text-etyme-muted">Some DNS screens want the full name: <span className="break-all font-mono">{r.record.name}</span></p>
              <p className="rounded bg-etyme-action-wash px-3 py-2 text-[13px] text-etyme-ink">{view.mail}</p>
              <div className="flex flex-wrap gap-2">
                <SubmitButton type="button" pending={busy === `check-${r.id}`} pendingLabel="Checking…" onClick={() => act(`check-${r.id}`, { action: 'CHECK', id: r.id })}>Check now</SubmitButton>
                {stepsMailto(r) && (
                  <a href={stepsMailto(r)!} className="inline-flex items-center rounded border border-etyme-rule px-4 py-2 text-[13px] font-semibold text-etyme-action">
                    Email these steps to my IT person
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      ))}

      {view.offerClaim && (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => { e.preventDefault(); if (domain.trim()) act('claim', { action: 'CLAIM', domain }) }}
        >
          <Field label="Your company’s domain">
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourcompany.com" autoCapitalize="none" autoCorrect="off" inputMode="url" />
          </Field>
          <SubmitButton type="submit" disabled={!domain.trim()} pending={busy === 'claim'} pendingLabel="Checking…">Check my domain</SubmitButton>
        </form>
      )}

      {said && <FormMessage tone={said.tone}>{said.text}</FormMessage>}

      <div className="space-y-1">
        <p className="eyebrow">{view.verified ? 'What your domain gives you' : 'Once it is verified'}</p>
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-etyme-ink">
          {view.gives.map((g) => <li key={g}>{g}</li>)}
        </ul>
        {view.joins && <p className="text-[13px] text-etyme-muted">Today: {view.joins}</p>}
      </div>
      {!view.verified && <p className="text-[13px] text-etyme-muted">{view.noDomain}</p>}
    </div>
  )
}
