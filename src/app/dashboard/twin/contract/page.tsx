'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { readJson } from '@/lib/read-response'
import { hasPermission } from '@/lib/permissions'
import { tierWord } from '@/lib/twin/feed-words'
import { useSession } from '@/components/session-provider'
import { usePageSection } from '@/components/page-section'
import {
  PageHead, Panel, Chip, RefusedState, LoadingState, ErrorState,
  Field, Select, Textarea, SubmitButton, FormMessage,
} from '@/components/ui'

/**
 * What the twin may do: the role contract, in three columns.
 *
 * Every act the twin knows sits in exactly one — acts alone, needs
 * approval, never touches. The acts that stay with a person whatever the
 * contract says are drawn locked in the third column; an act that moves
 * money or leaves the company cannot be put in the first, and the choice
 * is not offered rather than refused after. Saving writes a new version
 * with the reason, through `PUT /api/twin/role-contract`; the earlier
 * versions are kept, and the change appears in the twin's ledger.
 */

type Tier = 'ACTS_ALONE' | 'NEEDS_APPROVAL' | 'NEVER'

interface Act {
  action: string
  says: string
  tier: Tier
  staysWithAPerson: boolean
  movesMoney: boolean
  leavesTheCompany: boolean
}

const TIERS: { tier: Tier; title: string; line: string }[] = [
  { tier: 'ACTS_ALONE', title: 'Acts alone', line: 'Reversible or tell-only, inside the company, within a rule.' },
  { tier: 'NEEDS_APPROVAL', title: 'Needs approval', line: 'Money, anything that leaves the company, anything that cannot be put back.' },
  { tier: 'NEVER', title: 'Never touches', line: 'Stays with a person. Some acts are here whatever the contract says.' },
]

/** Why an act may not go into a tier, or null where it may. Mirrors `checkContract`. */
function cannot(a: Act, t: Tier): string | null {
  if (a.staysWithAPerson && t !== 'NEVER') return 'This stays with a person, whatever the contract says.'
  if (t === 'ACTS_ALONE' && a.movesMoney) return 'This moves money, so a person approves it.'
  if (t === 'ACTS_ALONE' && a.leavesTheCompany) return 'This leaves the company, so a person approves it.'
  return null
}

export default function TwinContractPage() {
  const session = useSession()
  const eyebrow = usePageSection('/dashboard/twin')
  const mayEdit = hasPermission(session.permissions, 'settings.manage')

  const [acts, setActs] = useState<Act[] | null>(null)
  const [version, setVersion] = useState<number | null>(null)
  const [isDefault, setIsDefault] = useState(false)
  const [tiers, setTiers] = useState<Record<string, Tier>>({})
  const [refused, setRefused] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [said, setSaid] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/twin/role-contract')
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}))
        setRefused(body?.error?.message ?? 'The twin’s role contract is not part of your seat.')
        return
      }
      const body = await readJson(res)
      setActs(body.data.acts)
      setVersion(body.data.version)
      setIsDefault(body.data.isDefault)
      setTiers(Object.fromEntries((body.data.acts as Act[]).map((a) => [a.action, a.tier])))
      setFailed(null)
    } catch (err: any) {
      setFailed(err?.message ?? 'The role contract could not be read.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const changed = useMemo(() => (acts ?? []).filter((a) => tiers[a.action] !== a.tier), [acts, tiers])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setSaid(null)
    const list = (t: Tier) => (acts ?? []).filter((a) => tiers[a.action] === t).map((a) => a.action)
    try {
      const res = await fetch('/api/twin/role-contract', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actsAlone: list('ACTS_ALONE'), needsApproval: list('NEEDS_APPROVAL'), neverTouches: list('NEVER'), reason }),
      })
      const body = await readJson(res)
      setSaid({ tone: 'ok', text: `${body.data.note} The change is in the twin’s ledger.` })
      setReason('')
      await load()
    } catch (err: any) {
      setSaid({ tone: 'error', text: err?.message ?? 'The contract could not be saved.' })
    } finally {
      setPending(false)
    }
  }

  if (refused) return <RefusedState says={refused} />

  return (
    <div>
      <PageHead
        eyebrow={eyebrow}
        title="What the twin may do"
        subtitle={version == null ? undefined : isDefault
          ? 'The shipped contract: nobody here has written one yet. Any change is saved as version 1.'
          : `Version ${version}. Every change is a new version with its reason; earlier versions are kept.`}
        actions={<Link href={'/dashboard/twin' as any} className="btn-secondary">Back to the twin</Link>}
      />

      {failed && <ErrorState says={failed} action={{ label: 'Try again', onClick: load }} />}
      {!failed && acts === null && <LoadingState says="Opening the role contract…" />}

      {acts && (
        <form onSubmit={save}>
          {!mayEdit && (
            <p className="mb-4 text-[13px] text-etyme-muted">You can read the contract. Changing it is the desk that holds the company’s settings.</p>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {TIERS.map((col) => {
              const here = acts.filter((a) => tiers[a.action] === col.tier)
              return (
                <Panel key={col.tier} title={col.title} subtitle={col.line}>
                  {here.length === 0 && <p className="text-[13px] text-etyme-muted">Nothing in this column.</p>}
                  <ul className="space-y-3">
                    {here.map((a) => (
                      <li key={a.action} className="rounded-box border border-etyme-rule bg-etyme-raised px-3 py-3">
                        <p className="text-[13.5px] leading-relaxed text-etyme-ink">{a.says}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {a.staysWithAPerson && <Chip tone="passive">Locked</Chip>}
                          {a.movesMoney && <Chip tone="attention">Money</Chip>}
                          {a.leavesTheCompany && <Chip tone="action">Leaves the company</Chip>}
                          {tiers[a.action] !== a.tier && <Chip tone="verified">Was: {tierWord(a.tier)}</Chip>}
                        </div>
                        {mayEdit && !a.staysWithAPerson && (
                          <div className="mt-2">
                            <Field label="Tier">
                              <Select value={tiers[a.action]} onChange={(e) => setTiers({ ...tiers, [a.action]: e.target.value as Tier })}>
                                {TIERS.map((t) => (
                                  <option key={t.tier} value={t.tier} disabled={!!cannot(a, t.tier)}>
                                    {t.title}{cannot(a, t.tier) ? ' — not allowed' : ''}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                          </div>
                        )}
                        {a.staysWithAPerson && <p className="mt-1.5 text-[12px] text-etyme-muted">{cannot(a, 'ACTS_ALONE')}</p>}
                      </li>
                    ))}
                  </ul>
                </Panel>
              )
            })}
          </div>

          {mayEdit && (
            <Panel title="Save as a new version" className="mt-6"
              subtitle={changed.length === 0 ? 'Move an act to another column first.' : `${changed.length} ${changed.length === 1 ? 'act moves' : 'acts move'}.`}>
              <div className="space-y-3">
                <Field label="Why is it changing?" help="Kept with the version. A change with no reason is the first thing an audit asks about.">
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
                </Field>
                {said && <FormMessage tone={said.tone}>{said.text}</FormMessage>}
                <SubmitButton pending={pending} pendingLabel="Saving…" disabled={changed.length === 0 || !reason.trim()}>Save version {(version ?? 0) + 1}</SubmitButton>
              </div>
            </Panel>
          )}
        </form>
      )}
    </div>
  )
}
