'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { readJson } from '@/lib/read-response'
import { hasPermission } from '@/lib/permissions'
import { useSession } from '@/components/session-provider'
import { usePageSection } from '@/components/page-section'
import {
  PageHead, Panel, Stat, RefusedState, LoadingState, ErrorState,
  Field, Input, Textarea, SubmitButton, FormMessage,
} from '@/components/ui'

/**
 * The twin's numbers: how many days before the time limit it warns, and
 * how far billed hours may sit from accepted hours before an invoice
 * receipt is raised to a person. Saved as a new version with a reason
 * through `PUT /api/twin/rule-set`; the change appears in the twin's
 * ledger. The time limit and the break themselves stay the company's
 * governance rules and are not set here.
 */

interface Rules {
  version: number
  source: 'DEFAULT' | 'COMPANY'
  tenureWarnAtDays: number[]
  hoursTolerancePct: number
}

export default function TwinRulesPage() {
  const session = useSession()
  const eyebrow = usePageSection('/dashboard/twin')
  const mayEdit = hasPermission(session.permissions, 'settings.manage')

  const [rules, setRules] = useState<Rules | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [days, setDays] = useState('')
  const [pct, setPct] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/twin/rule-set')
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}))
        setRefused(body?.error?.message ?? 'The twin’s numbers are not part of your seat.')
        return
      }
      const body = await readJson(res)
      const r = body.data as Rules
      setRules(r)
      setDays(r.tenureWarnAtDays.join(', '))
      setPct(String(r.hoursTolerancePct))
      setFailed(null)
    } catch (err: any) {
      setFailed(err?.message ?? 'The twin’s numbers could not be read.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setSaid(null)
    try {
      const res = await fetch('/api/twin/rule-set', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenureWarnAtDays: days.split(/[,\s]+/).filter(Boolean).map(Number),
          hoursTolerancePct: Number(pct),
          reason,
        }),
      })
      const body = await readJson(res)
      setSaid({ tone: 'ok', text: `${body.data.note} The change is in the twin’s ledger.` })
      setReason('')
      await load()
    } catch (err: any) {
      setSaid({ tone: 'error', text: err?.message ?? 'The numbers could not be saved.' })
    } finally {
      setPending(false)
    }
  }

  if (refused) return <RefusedState says={refused} />

  return (
    <div>
      <PageHead
        eyebrow={eyebrow}
        title="The twin’s numbers"
        subtitle={rules == null ? undefined : rules.source === 'DEFAULT'
          ? 'The shipped numbers: nobody here has set their own. Any change is saved as version 1.'
          : `Version ${rules.version}. Every change is a new version with its reason; earlier versions are kept.`}
        actions={<Link href={'/dashboard/twin' as any} className="btn-secondary">Back to the twin</Link>}
      />

      {failed && <ErrorState says={failed} action={{ label: 'Try again', onClick: load }} />}
      {!failed && rules === null && <LoadingState says="Opening the twin’s numbers…" />}

      {rules && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Stat label="Warns before the time limit" value={rules.tenureWarnAtDays.join(' · ')} sub="days, widest first" />
            <Stat label="Hours tolerance" value={`${rules.hoursTolerancePct}%`} sub="billed against accepted hours, before a person is asked" />
          </div>
          {mayEdit ? (
            <Panel title="Change the numbers" subtitle="The tolerance decides what the twin raises to a person, never what is paid.">
              <form onSubmit={save} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Warning days" help="Whole days from 1 to 365, separated by commas: 90, 60, 30.">
                    <Input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" required />
                  </Field>
                  <Field label="Hours tolerance, in per cent" help="From 0 to 25. 0.5 means half of one per cent, the shipped figure.">
                    <Input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" required />
                  </Field>
                </div>
                <Field label="Why are they changing?" help="Kept with the version.">
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
                </Field>
                {said && <FormMessage tone={said.tone}>{said.text}</FormMessage>}
                <SubmitButton pending={pending} pendingLabel="Saving…" disabled={!reason.trim()}>Save version {rules.version + 1}</SubmitButton>
              </form>
            </Panel>
          ) : (
            <p className="text-[13px] text-etyme-muted">Changing these is the desk that holds the company’s settings.</p>
          )}
        </>
      )}
    </div>
  )
}
