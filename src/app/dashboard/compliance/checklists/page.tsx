'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePageSection } from '@/components/page-section'
import { Chip, EmptyState, ErrorState, LoadingState, PageHead, Panel, RefusedState } from '@/components/ui'
import { Act, SavedLine, useSaved } from '../act-form'
import { petitionWords, stageWords } from '../act-spec'
import { markMetBody, markMetFields, recordSignedBody, recordSignedFields, signatoryBody, signatoryFields, startPetitionBody, startPetitionFields, filingDayBody, filingDayFields, type ItemKind } from './bodies'
import { formatDay } from '@/lib/format-date'

/**
 * Checklists, a tab of Contracts (record 112, chain 3: Start them).
 *
 * Each placement's contract items, the agreed value beside the line's, and
 * each petition's papers, one line each. Every act is a person's: the agent
 * changes nothing. Nothing here blocks a start or a payment.
 */

interface Entity { id: string; name: string }
interface Item { id: string; label: string; kind: ItemKind | null; state: string; agreed: string; actual: string; says: string }
interface Placement { lineId: string; person: string; client: string; currency: string; items: Item[] }
interface Contract { placements: Placement[]; entities: Entity[]; mayRecord: boolean; keepsPapers: boolean; rules: { packLeadDays: number } }
interface Line { id: string; label: string; state: string; reference: string | null; signatoryName: string | null; needsSignature: boolean }
interface Petition { id: string; person: string | null; kind: string; stage: string; filedOn: string | null; lines: Line[]; complete: boolean }
interface Petitions { petitions: Petition[]; entities: Entity[]; mayRecord: boolean; people: Entity[]; signatories: Entity[] }

async function read<T>(url: string): Promise<{ data: T | null; refused: string | null; failed: string | null }> {
  try {
    const res = await fetch(url)
    const body = await res.json().catch(() => ({}))
    if (res.status === 403) return { data: null, refused: body?.error?.message ?? 'This is not part of your seat.', failed: null }
    if (!res.ok) return { data: null, refused: null, failed: body?.error?.message ?? 'That could not be read. Try again.' }
    return { data: body.data as T, refused: null, failed: null }
  } catch {
    return { data: null, refused: null, failed: 'The server could not be reached. Check your connection and try again.' }
  }
}

export default function ChecklistsPage() {
  const section = usePageSection('/dashboard/compliance/checklists')
  const [contract, setContract] = useState<Contract | null>(null)
  const [petitions, setPetitions] = useState<Petitions | null>(null)
  const [says, setSays] = useState<{ contract: string | null; petitions: string | null }>({ contract: null, petitions: null })
  const [failed, setFailed] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { saved, tell } = useSaved()

  const load = useCallback(async () => {
    // Petitions are HR's and the compliance officer's: a seat that does not keep them is never asked for them, so nothing is refused or logged.
    const c = await read<Contract>('/api/compliance/checklist-items')
    const p = c.data?.keepsPapers ? await read<Petitions>('/api/compliance/immigration-petitions') : { data: null, refused: null, failed: null }
    setContract(c.data); setPetitions(p.data)
    setSays({ contract: c.refused, petitions: p.refused })
    setFailed(c.failed ?? p.failed)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  const done = (says: string) => { tell(says); load() }

  if (loading) return <LoadingState />
  if (says.contract) return <RefusedState says={says.contract} />

  return (
    <div className="min-w-0">
      <PageHead
        eyebrow={section}
        title="Checklists"
        subtitle="What each placement’s papers agree, beside what the line says now, and each petition’s papers one by one. A person records every change; nothing here stops a start or a payment."
      />
      <SavedLine says={saved} />
      {failed && <ErrorState says={failed} action={{ label: 'Try again', onClick: load }} />}

      <div className="space-y-6">
        {contract && (
          <Panel
            title="Contract items"
            subtitle={`HR is told ${contract.rules.packLeadDays} days before a start about papers still missing. Proposed rule, not yet confirmed with its source.`}
          >
            {contract.placements.length === 0 ? (
              <EmptyState compact says="No placement has items yet." detail="Items appear once a placement has a bill rate, and again for its payment terms and its order’s dates where it has them." />
            ) : (
              <ul className="space-y-5">
                {contract.placements.map((p) => (
                  <li key={p.lineId} className="min-w-0">
                    <h3 className="font-serif text-[16px] text-etyme-ink break-words">{p.person} at {p.client}</h3>
                    <ul className="mt-2 divide-y divide-etyme-rule">
                      {p.items.map((i) => (
                        <li key={i.id} className="py-3 min-w-0">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-[13.5px] text-etyme-ink">{i.label} <Chip tone={i.state === 'DRIFT' ? 'attention' : 'verified'}>{i.state === 'DRIFT' ? 'Differs' : i.state === 'MET' ? 'Agreed' : 'Set aside'}</Chip></p>
                              <p className="mt-1 text-[13px] text-etyme-muted break-words">{i.says}</p>
                            </div>
                            {contract.mayRecord && i.state !== 'WAIVED_WITH_REASON' && (
                              <Act
                                label="Record the signed paper" tone={i.state === 'DRIFT' ? 'primary' : 'secondary'}
                                fields={() => recordSignedFields(i.kind, contract.entities)}
                                url={`/api/compliance/checklist-items/${i.id}`}
                                body={(v) => recordSignedBody(i.kind, p.currency, v, contract.entities)}
                                onDone={done}
                              />
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {petitions && (
          <Panel
            title="Petitions"
            subtitle="One checklist per petition, each paper its own line. A petition is complete only when every paper is on hand. Etyme files nothing and signs nothing."
          >
            {petitions.mayRecord && <div className="mb-4 min-w-0">
              <Act label="Start a petition checklist" fields={() => startPetitionFields(petitions.people, petitions.entities)} url="/api/compliance/immigration-petitions"
                body={(v) => startPetitionBody(v, petitions.people, petitions.entities)} onDone={done} />
            </div>}
            {petitions.petitions.length === 0 ? (
              <EmptyState compact says="No petition has a checklist yet." detail="Start one for a person on your payroll or your bench, and each paper it needs becomes its own line." />
            ) : (
              <ul className="space-y-5">
                {petitions.petitions.map((p) => (
                  <li key={p.id} className="min-w-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-serif text-[16px] text-etyme-ink break-words">{p.person ?? 'Somebody'}: {petitionWords(p.kind)}</h3>
                        <p className="mt-1 text-[13px] text-etyme-muted">
                          {p.complete ? <Chip tone="verified">Complete</Chip> : <Chip tone="attention">Papers missing</Chip>}{' '}
                          Stage: {stageWords(p.stage)}. {p.filedOn ? `Filed ${formatDay(p.filedOn)}.` : 'Not filed yet.'}
                        </p>
                      </div>
                      {petitions.mayRecord && (
                        <Act label={p.filedOn ? 'Change the filing day' : 'Record the filing day'} fields={() => filingDayFields(petitions.entities)}
                          url={`/api/compliance/immigration-petitions/${p.id}`} method="PATCH" body={(v) => filingDayBody(v, petitions.entities)} onDone={done} />
                      )}
                    </div>
                    <ul className="mt-2 divide-y divide-etyme-rule">
                      {p.lines.map((l) => (
                        <li key={l.id} className="py-3 min-w-0">
                          <p className="text-[13.5px] text-etyme-ink">{l.label} <Chip tone={l.state === 'MET' ? 'verified' : 'attention'}>{l.state === 'MET' ? 'On hand' : 'Missing'}</Chip></p>
                          <p className="mt-1 text-[13px] text-etyme-muted break-words">
                            {l.state === 'MET' && l.reference ? `Paper: ${l.reference}. ` : ''}
                            {l.needsSignature ? (l.signatoryName ? `Signed by ${l.signatoryName}.` : 'Nobody is named to sign it yet.') : ''}
                          </p>
                          {petitions.mayRecord && (
                            <div className="mt-2 flex flex-col items-start gap-2">
                              {l.state !== 'MET' && (
                                <Act label="Mark met" fields={() => markMetFields(petitions.entities)} url={`/api/compliance/checklist-items/${l.id}`}
                                  body={(v) => markMetBody(v, petitions.entities)} onDone={done} />
                              )}
                              {l.needsSignature && (
                                <Act label={l.signatoryName ? 'Change who signs' : 'Name who signs'} fields={() => signatoryFields(petitions.signatories, petitions.entities)}
                                  url={`/api/compliance/checklist-items/${l.id}`} body={(v) => signatoryBody(v, petitions.signatories, petitions.entities)} onDone={done} />
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </div>
  )
}
