'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ListSurface, type Column } from '@/components/list-surface'
import { readJson, statusMeans } from '@/lib/read-response'
import {
  DO_THIS,
  FILTERS,
  RENEWAL_CHOICES,
  SIGNING_CHOICES,
  amendmentBody,
  amendmentHeading,
  disclosureControl,
  emptySays,
  headline,
  insideNoticePeriod,
  matchesFilter,
  methodSays,
  noticeSays,
  onDay,
  partyWord,
  readSigning,
  readStanding,
  reasonLabel,
  runsOutSays,
  signatureSays,
  tasks,
  termLines,
  type AmendmentRow,
  type DisclosureControl,
  type SignatureRow,
  type StandingInput,
  type Task,
} from './standing'

/**
 * Agreements — are we allowed to trade at all, with whom, until when,
 * and has anybody actually signed it.
 *
 * ── What was wrong with this page ────────────────────────────────────
 *
 * A master agreement used to carry one date. It now carries a term, a
 * standing, two named signatures, an executed document and an amendment
 * trail — and this screen still drew the old shape, so none of that work
 * was visible to the one person who verifies by clicking. A column that
 * exists and nothing draws is not a feature.
 *
 * ── How it reads ─────────────────────────────────────────────────────
 *
 * It opens on a sentence about the reader — "6 things need you. 4 are
 * urgent." — with the queue under it, the way the client dashboard does.
 * Then the picture, then every agreement as a row that answers the three
 * questions in order: may we trade, until when, and is it executed.
 *
 * A row opens into the whole life of the agreement: both signatures with
 * the signer's name and title, the executed copy, the term, the terms,
 * the engagements under it, the people under it, and the amendment trail
 * — which answers "what were the payment days on 3 March" on a day you
 * pick, because that is the only question anybody asks of a trail.
 *
 * Every refusal, every warning and every empty state here is a sentence
 * saying what is missing and what to do. The reason code is underneath,
 * where it can be counted; it is never what a person is shown alone.
 *
 * The arithmetic is in `./standing`, with no React in it, so the
 * sentences can be tested as sentences.
 */

// ── Shapes ────────────────────────────────────────────────────────────

interface Engagement {
  id: string
  title: string
  invoiceCycle: string
  statementOfWork: string | null
  sowSignedAt: string | null
  liveContracts: number
}

interface ContractRow {
  id: string
  person: { id: string; name: string }
  billRateCents: number
  marginPct: number | null
  state: string
  live: boolean
  engagementId: string | null
  startDate: string
  endDate: string | null
}

interface Agreement extends StandingInput {
  executedDocument: { fileName: string; fileUrl: string | null } | null
  engagements: Engagement[]
  contracts: ContractRow[]
  says: string | null
  createdAt: string
}

interface Payload {
  agreements: Agreement[]
  summary: {
    total: number
    unsigned: number
    lapsed: number
    lapsingSoon: number
    noTermOnFile: number
    ended: number
    needAttention: number
    engagements: number
    sowMissing: number
  }
}

interface History {
  id: string
  role: 'VENDOR' | 'CLIENT'
  counterparty: { id: string; name: string }
  status: string
  statusSays: string
  endedAt: string | null
  endedReason: string | null
  amendments: AmendmentRow[]
  signatures: (SignatureRow & {
    signerEmail: string | null
    attestedBy: { id: string; name: string } | null
    attestedAt: string
    attestation: string
  })[]
  asOf: { on: string; found: boolean; says: string; terms: unknown } | null
  says: string
}

/** A refusal or a failure, kept with the sentence the server sent. */
interface Trouble {
  says: string
  denied: boolean
}

async function ask<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (res.status === 403 || res.status === 401) {
    const body = await res.text().catch(() => '')
    let says = statusMeans(res.status)
    try {
      says = JSON.parse(body)?.error?.message ?? says
    } catch {
      // No body, or an HTML error page. The status sentence stands.
    }
    const trouble = new Error(says) as Error & { denied?: boolean }
    trouble.denied = true
    throw trouble
  }
  const body = await readJson<{ data: T }>(res)
  return body.data
}

// ── Page ──────────────────────────────────────────────────────────────

export default function AgreementsPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [trouble, setTrouble] = useState<Trouble | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [toast, setToast] = useState<{ message: string; bad?: boolean } | null>(null)

  const load = useCallback(async () => {
    try {
      const payload = await ask<Payload>('/api/program/agreements')
      setData(payload)
      setTrouble(null)
    } catch (e: any) {
      setTrouble({ says: e.message, denied: Boolean(e.denied) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function say(message: string, bad?: boolean) {
    setToast({ message, bad })
    setTimeout(() => setToast(null), 5000)
  }

  const all = useMemo(() => data?.agreements ?? [], [data])
  const rows = useMemo(() => all.filter((r) => matchesFilter(r, filter)), [all, filter])
  const queue = useMemo(() => tasks(all), [all])
  const role = all[0]?.role ?? null

  const executed = all.filter((r) => readSigning(r).state === 'BOTH').length
  const halfSigned = all.filter((r) => readSigning(r).state === 'HALF').length

  const columns = useMemo<Column<Agreement>[]>(
    () => [
      {
        key: 'counterparty',
        label: 'Counterparty',
        render: (r) => (
          <div>
            <div className="font-medium text-etyme-ink">{r.counterparty.name}</div>
            <div className="mt-0.5 text-[11px] text-etyme-muted">
              {r.role === 'VENDOR' ? 'We supply them' : 'They supply us'}
            </div>
          </div>
        ),
        sortValue: (r) => r.counterparty.name,
      },
      {
        key: 'standing',
        label: 'May we trade',
        render: (r) => {
          const s = readStanding(r)
          return <span className={`chip chip--${s.tone}`}>{s.word}</span>
        },
        sortValue: (r) => readStanding(r).word,
      },
      {
        key: 'runsOut',
        label: 'Runs out',
        render: (r) => {
          const says = runsOutCell(r)
          return (
            <span
              className={`tabular-nums text-[12px] ${says.faint ? 'text-etyme-faint' : 'text-etyme-muted'}`}
            >
              {says.text}
            </span>
          )
        },
        sortValue: (r) => r.terms.expiresAt ?? '',
      },
      {
        key: 'signed',
        label: 'Executed',
        render: (r) => {
          const s = readSigning(r)
          return <span className={`chip chip--${s.tone}`}>{s.word}</span>
        },
        sortValue: (r) => readSigning(r).state,
      },
      {
        key: 'pays',
        label: 'Pays in',
        align: 'right',
        render: (r) => (
          <span className="tabular-nums">
            {r.terms.paymentTermsDays === 0 ? 'On receipt' : `Net ${r.terms.paymentTermsDays}`}
          </span>
        ),
        sortValue: (r) => r.terms.paymentTermsDays,
        hideOnMobile: true,
      },
      {
        key: 'headcount',
        label: 'On site',
        align: 'right',
        render: (r) => (
          <span className="tabular-nums">
            {r.headcount}
            {r.terms.capacity != null && (
              <span className="text-etyme-faint"> / {r.terms.capacity}</span>
            )}
          </span>
        ),
        sortValue: (r) => r.headcount,
        hideOnMobile: true,
      },
      {
        key: 'needs',
        label: 'Needs you',
        render: (r) => {
          const warns = r.findings.filter((f) => f.severity === 'WARN').length
          if (warns > 0) {
            return (
              <span className="chip chip--attention">
                {warns} to sort out
              </span>
            )
          }
          if (insideNoticePeriod(r)) return <span className="chip chip--action">Decide now</span>
          return <span className="chip chip--verified">In order</span>
        },
        sortValue: (r) => -r.findings.filter((f) => f.severity === 'WARN').length,
      },
    ],
    []
  )

  const s = data?.summary
  const empty = emptySays(role)

  // ── Denied, said rather than coded ──
  if (trouble?.denied) {
    return (
      <>
        <Head />
        <div className="panel mt-6">
          <p className="text-[13px] text-etyme-attention">{trouble.says}</p>
          <p className="mt-2 text-[12px] text-etyme-faint">
            Agreements are read by the desk that papers deals. If that is your job here,
            ask an owner to seat you as a contract manager.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <Head />

      {/* ── What needs you, then the picture. The client dashboard opens
          this way and a person should know whether this screen wants
          anything from them before they read a row. ── */}
      {!loading && !trouble && (
        <div className="panel mt-6">
          <p className="font-serif text-xl tracking-[-0.02em] text-etyme-ink">
            {headline(queue)}
          </p>
          {queue.length === 0 ? (
            <p className="mt-1 text-[13px] text-etyme-muted">
              {all.length === 0
                ? empty.detail
                : 'Every agreement on file is in force, executed and inside its term.'}
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {queue.slice(0, 12).map((t, i) => (
                <QueueRow
                  key={`${t.agreementId}-${t.code}-${i}`}
                  task={t}
                  onOpen={() => setOpen(t.agreementId)}
                />
              ))}
              {queue.length > 12 && (
                <li className="pt-1 text-[12px] text-etyme-faint">
                  And {queue.length - 12} more, on the rows below.
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {s && (
        <div className="mt-6 mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          <Stat label="Agreements" value={s.total} />
          <Stat label="Executed" value={executed} sub="both sides signed" tone={executed === s.total && s.total > 0 ? 'verified' : undefined} />
          <Stat
            label="Half signed"
            value={halfSigned}
            sub="one side owes a counter"
            tone={halfSigned > 0 ? 'attention' : undefined}
          />
          <Stat
            label="Running out"
            value={s.lapsingSoon}
            sub="inside three months"
            tone={s.lapsingSoon > 0 ? 'attention' : undefined}
          />
          <Stat label="Lapsed" value={s.lapsed} tone={s.lapsed > 0 ? 'attention' : undefined} />
          <Stat
            label="No term on file"
            value={s.noTermOnFile}
            sub="nothing says when they end"
            tone={s.noTermOnFile > 0 ? 'attention' : undefined}
          />
        </div>
      )}

      <ListSurface
        name="program-agreements"
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        loading={loading}
        error={trouble && !trouble.denied ? trouble.says : null}
        searchPlaceholder="Search by counterparty or engagement…"
        searchFilter={(r, q) =>
          r.counterparty.name.toLowerCase().includes(q) ||
          r.engagements.some((e) => e.title.toLowerCase().includes(q))
        }
        emptyMessage={all.length === 0 ? empty.message : 'Nothing here answers that filter.'}
        emptyDetail={
          all.length === 0 ? empty.detail : 'Try Everyone to see every agreement on file.'
        }
        exportName="agreements"
        onRowClick={(r) => setOpen(open === r.id ? null : r.id)}
        filters={
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const count = all.filter((r) => matchesFilter(r, f.key)).length
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`filter-tab ${filter === f.key ? 'filter-tab--active' : 'filter-tab--inactive'}`}
                >
                  {f.label} ({count})
                </button>
              )
            })}
          </div>
        }
      />

      {open && all.find((r) => r.id === open) && (
        <Detail
          agreement={all.find((r) => r.id === open)!}
          onClose={() => setOpen(null)}
          onChanged={(m) => {
            say(m)
            load()
          }}
          onFailed={(m) => say(m, true)}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-md rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.bad ? 'bg-etyme-danger text-white' : 'bg-etyme-verified text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </>
  )
}

function Head() {
  return (
    <div className="mb-1">
      <div className="eyebrow mb-1">Procure</div>
      <h1 className="font-serif text-2xl font-semibold tracking-[-0.02em]">Agreements</h1>
      <p className="mt-1 max-w-2xl text-sm text-etyme-muted">
        Whether we are allowed to trade with somebody, until when, and whether both sides
        actually signed. Everything below an agreement inherits from it — payment days, the
        margin floor, how many people it permits. An order carries a ceiling; a contract
        carries a rate; this carries permission.
      </p>
    </div>
  )
}

/**
 * The date cell, and the reason it is not just a date.
 *
 * "—" in a Runs out column reads as "no end", and no end date recorded is
 * the opposite fact from an agreement that runs on forever.
 */
function runsOutCell(r: Agreement): { text: string; faint: boolean } {
  const says = runsOutSays(r)
  return { text: says, faint: says === 'No end date on file' }
}

// ── Queue ─────────────────────────────────────────────────────────────

function QueueRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  return (
    <li className="flex items-start justify-between gap-4 border-t border-etyme-rule pt-2 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-[13px] text-etyme-ink">{task.says}</p>
        <p className="mt-0.5 text-[12px] text-etyme-muted">{task.doThis}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`chip ${task.urgent ? 'chip--attention' : 'chip--action'}`}
          title={`Reason code ${task.code}. Codes are counted; the sentence is what you read.`}
        >
          {reasonLabel(task.code)}
        </span>
        <button
          onClick={onOpen}
          className="rounded border border-etyme-rule px-3 py-1.5 text-xs text-etyme-muted hover:border-etyme-muted hover:text-etyme-ink"
        >
          Open
        </button>
      </div>
    </li>
  )
}

// ── The open row ──────────────────────────────────────────────────────

function Detail({
  agreement,
  onClose,
  onChanged,
  onFailed,
}: {
  agreement: Agreement
  onClose: () => void
  onChanged: (says: string) => void
  onFailed: (says: string) => void
}) {
  const mine = agreement.role === 'VENDOR'
  const standing = readStanding(agreement)
  const signing = readSigning(agreement)
  const notice = noticeSays(agreement)

  return (
    <div className="card mt-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-1">Agreement</div>
          <h2 className="font-serif text-lg font-semibold">{agreement.counterparty.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`chip chip--${standing.tone}`}>{standing.word}</span>
            <span className={`chip chip--${signing.tone}`}>{signing.word}</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-etyme-ink">{agreement.termSays}</p>
          <p className="mt-1 max-w-2xl text-[12px] text-etyme-muted">{agreement.statusSays}</p>
          {notice && (
            <p className="mt-2 max-w-2xl text-[12px] text-etyme-attention">{notice}</p>
          )}
          {agreement.status === 'TERMINATED' && agreement.endedReason && (
            <p className="mt-2 max-w-2xl text-[12px] text-etyme-muted">
              Ended because: {agreement.endedReason}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded border border-etyme-rule px-3 py-1.5 text-xs text-etyme-muted hover:text-etyme-ink"
        >
          Close
        </button>
      </div>

      <Signing
        agreement={agreement}
        editable={mine}
        onChanged={onChanged}
        onFailed={onFailed}
      />

      <Executed agreement={agreement} editable={mine} onChanged={onChanged} onFailed={onFailed} />

      {agreement.findings.length > 0 && (
        <div className="mt-6 border-t border-etyme-rule pt-6">
          <p className="eyebrow mb-2">What is outstanding</p>
          <ul className="space-y-1.5">
            {agreement.findings.map((f, i) => (
              <li key={`${f.code}-${f.subjectId}-${i}`} className="flex items-start gap-3">
                <span
                  className={`chip shrink-0 ${f.severity === 'WARN' ? 'chip--attention' : 'chip--passive'}`}
                  title={`Reason code ${f.code}.`}
                >
                  {reasonLabel(f.code)}
                </span>
                <span className="text-sm text-etyme-ink">
                  {f.says}
                  {DO_THIS[f.code] && (
                    <span className="block text-[12px] text-etyme-muted">{DO_THIS[f.code]}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-etyme-faint">
            Every one of these carries a reason code rather than a note somebody typed, so it
            can be counted across every agreement on file. None of them stops anybody working:
            an expired commercial agreement is not one of the five things Addendum E allows a
            block for, and refusing here produces the deal done in email.
          </p>
        </div>
      )}

      <TermPanel agreement={agreement} editable={mine} onChanged={onChanged} onFailed={onFailed} />

      <Engagements
        agreement={agreement}
        onChanged={onChanged}
        onFailed={onFailed}
        editable={mine}
      />

      {agreement.contracts.length > 0 && (
        <div className="mt-6 border-t border-etyme-rule pt-6">
          <p className="eyebrow mb-2">People under it</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-etyme-muted">
                <th className="pb-2">Person</th>
                <th className="pb-2 text-right">Bill rate</th>
                <th className="pb-2 text-right">Margin</th>
                <th className="pb-2">State</th>
              </tr>
            </thead>
            <tbody>
              {agreement.contracts.map((c) => (
                <tr key={c.id} className="border-t border-etyme-rule">
                  <td className="py-2">{c.person.name}</td>
                  <td className="py-2 text-right tabular-nums">
                    ${(c.billRateCents / 100).toFixed(2)}/hr
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {c.marginPct == null ? (
                      <span
                        className="text-etyme-faint"
                        title="No buy contract behind it, so no margin can be stated."
                      >
                        not knowable
                      </span>
                    ) : (
                      <span
                        className={
                          agreement.terms.minMarginPct != null &&
                          c.marginPct < agreement.terms.minMarginPct
                            ? 'text-etyme-attention'
                            : ''
                        }
                      >
                        {c.marginPct}%
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-xs text-etyme-muted">{c.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-etyme-faint">
            This list is a table on purpose: it is read against the agreement above it, never
            on its own. Every list on the page that stands alone offers a feed as well.
          </p>
        </div>
      )}

      <Trail agreement={agreement} />

      {mine && agreement.status !== 'TERMINATED' && (
        <EndIt agreement={agreement} onChanged={onChanged} onFailed={onFailed} />
      )}

      <p className="mt-6 text-[11px] text-etyme-faint">
        Deliverables and their acceptance live on{' '}
        <Link
          href={{ pathname: '/dashboard/program/milestones' }}
          className="text-etyme-action underline"
        >
          milestones
        </Link>
        .
      </p>
    </div>
  )
}

// ── Is it executed ────────────────────────────────────────────────────

/**
 * Both sides, each with a name, a title and a date.
 *
 * Two panels rather than one tick, because the counter-signature is the
 * whole question: an agreement signed by one side is a document in
 * somebody's drawer, and the person to chase is named on the side that
 * is empty.
 */
function Signing({
  agreement,
  editable,
  onChanged,
  onFailed,
}: {
  agreement: Agreement
  editable: boolean
  onChanged: (says: string) => void
  onFailed: (says: string) => void
}) {
  const signing = readSigning(agreement)
  const [signingParty, setSigningParty] = useState<string | null>(null)

  return (
    <div className="border-t border-etyme-rule pt-6">
      <p className="eyebrow mb-2">Signatures</p>
      <p className="mb-4 max-w-2xl text-sm text-etyme-ink">{signing.says}</p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(['VENDOR', 'CLIENT'] as const).map((party) => {
          const sig = party === 'VENDOR' ? signing.vendor : signing.client
          return (
            <div
              key={party}
              className={`rounded-lg border p-4 ${
                sig ? 'border-etyme-rule' : 'border-dashed border-etyme-rule bg-etyme-canvas/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
                  {partyWord(party)}
                </p>
                {sig ? (
                  <span className="chip chip--verified">Signed</span>
                ) : (
                  <span className="chip chip--attention">Not signed</span>
                )}
              </div>

              {sig ? (
                <div className="mt-2">
                  <p className="text-sm font-medium text-etyme-ink">{sig.signerName}</p>
                  <p className="text-[12px] text-etyme-muted">{sig.signerTitle}</p>
                  <p className="mt-1 text-[12px] tabular-nums text-etyme-muted">
                    Signed {onDay(sig.signedAt)} in {methodSays(sig.method)}
                  </p>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-[12px] text-etyme-muted">
                    Nothing on file says the {partyWord(party).toLowerCase()} signed this
                    agreement.
                  </p>
                  {editable && signingParty !== party && (
                    <button
                      onClick={() => setSigningParty(party)}
                      className="mt-3 rounded border border-etyme-rule px-3 py-1.5 text-xs text-etyme-muted hover:border-etyme-muted hover:text-etyme-ink"
                    >
                      Record the {partyWord(party).toLowerCase()}’s signature
                    </button>
                  )}
                  {editable && signingParty === party && (
                    <SignForm
                      agreementId={agreement.id}
                      party={party}
                      onCancel={() => setSigningParty(null)}
                      onDone={(m) => {
                        setSigningParty(null)
                        onChanged(m)
                      }}
                      onFailed={onFailed}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-2 text-[11px] text-etyme-faint">
        Nothing here is an e-signature service. Somebody at this company looked at the
        executed paper and attested that it says what it says — which is worth exactly what an
        attestation is worth, and is why the attestor and the moment are both kept.
      </p>
    </div>
  )
}

function SignForm({
  agreementId,
  party,
  onCancel,
  onDone,
  onFailed,
}: {
  agreementId: string
  party: 'VENDOR' | 'CLIENT'
  onCancel: () => void
  onDone: (says: string) => void
  onFailed: (says: string) => void
}) {
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [method, setMethod] = useState('WET_INK')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setRefusal(null)
    try {
      const body = await ask<{ says: string }>(`/api/program/agreements/${agreementId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          party,
          signerName: name,
          signerTitle: title,
          signedAt: when || null,
          method,
        }),
      })
      onDone(body.says)
    } catch (e: any) {
      setRefusal(e.message)
      onFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <Field label="Who signed" value={name} onChange={setName} placeholder="Dana Whitfield" />
      <Field
        label="Their title"
        value={title}
        onChange={setTitle}
        placeholder="VP, Procurement"
        hint="Whether they had authority is the first thing anybody asks."
      />
      <Field label="Date on the paper" value={when} onChange={setWhen} placeholder="yyyy-mm-dd" />
      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
          How it was signed
        </span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="mt-1 w-full rounded border border-etyme-rule bg-etyme-surface px-2.5 py-1.5 text-sm"
        >
          {SIGNING_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {refusal && <p className="text-[12px] text-etyme-attention">{refusal}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="rounded bg-etyme-action px-4 py-2 text-xs text-white disabled:opacity-50"
        >
          {busy ? 'Recording…' : 'Record signature'}
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-etyme-rule px-3 py-2 text-xs text-etyme-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── The executed copy ─────────────────────────────────────────────────

function Executed({
  agreement,
  editable,
  onChanged,
  onFailed,
}: {
  agreement: Agreement
  editable: boolean
  onChanged: (says: string) => void
  onFailed: (says: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [fileName, setFileName] = useState(agreement.executedDocument?.fileName ?? '')
  const [fileUrl, setFileUrl] = useState(agreement.executedDocument?.fileUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setRefusal(null)
    try {
      const body = await ask<{ says: string }>(`/api/program/agreements/${agreement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executedFileName: fileName.trim() || null,
          executedFileUrl: fileUrl.trim() || null,
          reason: 'Recorded the executed copy against the agreement.',
        }),
      })
      setEditing(false)
      onChanged(body.says)
    } catch (e: any) {
      setRefusal(e.message)
      onFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 border-t border-etyme-rule pt-6">
      <p className="eyebrow mb-2">The executed copy</p>
      {agreement.executedDocument ? (
        <p className="text-sm text-etyme-ink">
          {agreement.executedDocument.fileUrl ? (
            <a
              href={agreement.executedDocument.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="text-etyme-action underline"
            >
              {agreement.executedDocument.fileName}
            </a>
          ) : (
            agreement.executedDocument.fileName
          )}
        </p>
      ) : (
        <p className="text-sm text-etyme-muted">
          No executed copy on file. The signed paper should be a document on this record, not
          an attachment in somebody’s email — record where it lives.
        </p>
      )}

      {editable && !editing && (
        <button
          onClick={() => setEditing(true)}
          className="mt-3 rounded border border-etyme-rule px-3 py-1.5 text-xs text-etyme-muted hover:border-etyme-muted hover:text-etyme-ink"
        >
          {agreement.executedDocument ? 'Change it' : 'Record the executed copy'}
        </button>
      )}

      {editable && editing && (
        <div className="mt-3 space-y-3">
          <Field
            label="File name"
            value={fileName}
            onChange={setFileName}
            placeholder="Northwind MSA — executed.pdf"
          />
          <Field
            label="Where it lives"
            value={fileUrl}
            onChange={setFileUrl}
            placeholder="https://…"
          />
          {refusal && <p className="text-[12px] text-etyme-attention">{refusal}</p>}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded bg-etyme-action px-4 py-2 text-xs text-white disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Record it'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded border border-etyme-rule px-3 py-2 text-xs text-etyme-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Term and terms ────────────────────────────────────────────────────

function TermPanel({
  agreement,
  editable,
  onChanged,
  onFailed,
}: {
  agreement: Agreement
  editable: boolean
  onChanged: (says: string) => void
  onFailed: (says: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const lines = termLines(agreement.terms, agreement.role)
  const disclosure = disclosureControl(
    agreement.terms,
    agreement.role,
    agreement.status,
    agreement.counterparty.name
  )

  return (
    <div className="mt-6 border-t border-etyme-rule pt-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow">Terms</p>
        {editable && agreement.status !== 'TERMINATED' && (
          <button
            onClick={() => setEditing(!editing)}
            className="rounded border border-etyme-rule px-3 py-1.5 text-xs text-etyme-muted hover:border-etyme-muted hover:text-etyme-ink"
          >
            {editing ? 'Cancel' : 'Amend the terms'}
          </button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {lines.map((l) => (
          <div key={l.label}>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
              {l.label}
            </dt>
            <dd className="mt-0.5 text-sm tabular-nums text-etyme-ink">{l.value}</dd>
          </div>
        ))}
      </dl>

      {agreement.role === 'VENDOR' && agreement.terms.marginFloorSays && (
        <p className="mt-3 text-[12px] text-etyme-muted">
          {agreement.terms.marginFloorSays} The client never sees this number.
        </p>
      )}

      <Disclosure control={disclosure} />

      {agreement.status === 'TERMINATED' && (
        <p className="mt-3 text-[12px] text-etyme-muted">
          These terms are history. An ended agreement cannot be amended — changing the payment
          days on one would rewrite what a closed engagement was billed under.
        </p>
      )}

      {editing && (
        <AmendForm
          agreement={agreement}
          onDone={(m) => {
            setEditing(false)
            onChanged(m)
          }}
          onFailed={onFailed}
        />
      )}
    </div>
  )
}

/**
 * Whether this client is entitled to the names of the firms behind a
 * placement — read by both sides of the deal.
 *
 * The margin floor above it is the supplier's alone. This one is not: the
 * client is the party that demands disclosure at signing, and a client
 * that demanded it should be able to see on a screen whether it was
 * written down, rather than take somebody's word for it. Read-only for
 * whichever side cannot amend, with a sentence saying why.
 */
function Disclosure({ control }: { control: DisclosureControl }) {
  return (
    <div className="mt-4 rounded border border-etyme-rule bg-etyme-surface p-3">
      <div className="flex items-start gap-3">
        <span className={`chip shrink-0 ${control.checked ? 'chip--action' : 'chip--passive'}`}>
          {control.checked ? 'Named' : 'Withheld'}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-etyme-ink">{control.label}</p>
          <p className="mt-0.5 text-[12px] text-etyme-muted">{control.says}</p>
          {control.whyNot && <p className="mt-1 text-[12px] text-etyme-faint">{control.whyNot}</p>}
        </div>
      </div>
    </div>
  )
}

function AmendForm({
  agreement,
  onDone,
  onFailed,
}: {
  agreement: Agreement
  onDone: (says: string) => void
  onFailed: (says: string) => void
}) {
  const t = agreement.terms
  const [days, setDays] = useState(String(t.paymentTermsDays))
  const [floor, setFloor] = useState(t.minMarginPct == null ? '' : String(t.minMarginPct))
  const [capacity, setCapacity] = useState(t.capacity == null ? '' : String(t.capacity))
  const [starts, setStarts] = useState(t.effectiveDate?.slice(0, 10) ?? '')
  const [ends, setEnds] = useState(t.expiresAt?.slice(0, 10) ?? '')
  const [renewal, setRenewal] = useState(t.renewalKind)
  const [months, setMonths] = useState(t.renewalMonths == null ? '' : String(t.renewalMonths))
  const [notice, setNotice] = useState(t.noticeDays == null ? '' : String(t.noticeDays))
  const [discloses, setDiscloses] = useState(t.disclosesSubVendors === true)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setRefusal(null)
    try {
      // The signature is deliberately not here. It is two named people on
      // /sign, and a date somebody types with nobody behind it answers
      // none of the questions anybody asks of a signature — the route
      // refuses `signedAt` for exactly that reason.
      const body = await ask<{ says: string }>(`/api/program/agreements/${agreement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...amendmentBody({
            paymentTermsDays: days,
            marginFloor: floor,
            capacity,
            starts,
            ends,
            renewalKind: renewal,
            renewalMonths: months,
            noticeDays: notice,
            disclosesSubVendors: discloses,
            reason: why,
          }),
        }),
      })
      onDone(body.says)
    } catch (e: any) {
      setRefusal(e.message)
      onFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 border-t border-etyme-rule pt-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <Field label="Payment days" value={days} onChange={setDays} placeholder="30" />
        <Field
          label="Margin floor %"
          value={floor}
          onChange={setFloor}
          placeholder="none"
          hint="Yours. The client never sees it."
        />
        <Field label="People allowed" value={capacity} onChange={setCapacity} placeholder="uncapped" />
        <Field label="Notice days" value={notice} onChange={setNotice} placeholder="none" />
        <Field label="Starts" value={starts} onChange={setStarts} placeholder="yyyy-mm-dd" />
        <Field
          label="Runs to"
          value={ends}
          onChange={setEnds}
          placeholder="yyyy-mm-dd"
          hint="Leave blank only if nothing on the paper says."
        />
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
            How it renews
          </span>
          <select
            value={renewal}
            onChange={(e) => setRenewal(e.target.value)}
            className="mt-1 w-full rounded border border-etyme-rule bg-etyme-surface px-2.5 py-1.5 text-sm"
          >
            {RENEWAL_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="mt-0.5 block text-[10px] text-etyme-faint">
            {RENEWAL_CHOICES.find((c) => c.value === renewal)?.hint}
          </span>
        </label>
        {renewal === 'AUTO_RENEW' && (
          <Field label="Renews for (months)" value={months} onChange={setMonths} placeholder="12" />
        )}

        {/*
          Who the client may be told about. A term, not a setting: it is
          recorded here beside the payment days and the margin floor so it
          amends through the same path, carries the same reason, and lands
          on the same version trail.
        */}
        <label className="block sm:col-span-2 md:col-span-4">
          <span className="flex items-start gap-2">
            <input
              type="checkbox"
              name="disclosesSubVendors"
              checked={discloses}
              onChange={(e) => setDiscloses(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-etyme-action"
            />
            <span className="min-w-0">
              <span className="block text-sm text-etyme-ink">
                Name our sub-vendors to this client
              </span>
              <span className="mt-0.5 block text-[12px] text-etyme-muted">
                {discloses
                  ? 'Every firm behind a placement is named to the client, on compliance, on tenure and on the alumni list.'
                  : 'The client sees the rung it pays and \u201cSupplied through us\u201d below it. A sub-vendor\u2019s name is ours to keep.'}
              </span>
              <span className="mt-0.5 block text-[11px] text-etyme-faint">
                Tick this only where the signed agreement requires it. Recording is not
                granting, and what you record here is on the trail with your reason.
              </span>
            </span>
          </span>
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
          Why it changed
        </span>
        <input
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Amendment 2, signed 14 March — payment days moved to 45."
          className="mt-1 w-full rounded border border-etyme-rule bg-etyme-surface px-2.5 py-1.5 text-sm"
        />
        <span className="mt-0.5 block text-[10px] text-etyme-faint">
          Goes on the amendment trail beside what moved, so somebody reading it in two years
          knows what this was.
        </span>
      </label>

      {refusal && <p className="mt-3 text-[12px] text-etyme-attention">{refusal}</p>}

      <button
        onClick={save}
        disabled={busy}
        className="mt-4 rounded bg-etyme-action px-4 py-2 text-xs text-white disabled:opacity-50"
      >
        {busy ? 'Recording…' : 'Record the amendment'}
      </button>
      <p className="mt-2 text-[11px] text-etyme-faint">
        A signature is not on this form. It is who signed, on which side, with what title —
        recorded on Signatures above.
      </p>
    </div>
  )
}

// ── The amendment trail ───────────────────────────────────────────────

/**
 * What changed and when, as history a person reads.
 *
 * With the one question anybody asks a trail on the front of it: what
 * were the terms on a day. A date before the agreement existed gets a
 * blank and a sentence rather than today's terms, because a confident
 * answer about a period with no record is the one nobody audits.
 */
function Trail({ agreement }: { agreement: Agreement }) {
  const [history, setHistory] = useState<History | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState<string | null>(null)
  const [on, setOn] = useState('')
  const [asOf, setAsOf] = useState<History['asOf']>(null)
  const [openVersion, setOpenVersion] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const body = await ask<History>(`/api/program/agreements/${agreement.id}/history`)
      setHistory(body)
      setFailed(null)
    } catch (e: any) {
      setFailed(e.message)
    } finally {
      setLoading(false)
    }
  }, [agreement.id])

  useEffect(() => {
    load()
  }, [load])

  async function askDay() {
    try {
      const body = await ask<History>(
        `/api/program/agreements/${agreement.id}/history?on=${encodeURIComponent(on)}`
      )
      setAsOf(body.asOf)
      setFailed(null)
    } catch (e: any) {
      setFailed(e.message)
    }
  }

  return (
    <div className="mt-6 border-t border-etyme-rule pt-6">
      <p className="eyebrow mb-2">History</p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
            What were the terms on
          </span>
          <input
            value={on}
            onChange={(e) => setOn(e.target.value)}
            placeholder="yyyy-mm-dd"
            className="mt-1 w-[150px] rounded border border-etyme-rule bg-etyme-surface px-2.5 py-1.5 text-sm tabular-nums"
          />
        </label>
        <button
          onClick={askDay}
          disabled={!on.trim()}
          className="rounded border border-etyme-rule px-3 py-2 text-xs text-etyme-muted hover:border-etyme-muted hover:text-etyme-ink disabled:opacity-50"
        >
          Ask
        </button>
      </div>

      {asOf && (
        <div className="mb-4 rounded-lg border border-etyme-rule bg-etyme-canvas/40 p-4">
          <p className="text-sm text-etyme-ink">{asOf.says}</p>
          {asOf.found && asOf.terms != null && (
            <TermGrid terms={asOf.terms as any} role={agreement.role} />
          )}
        </div>
      )}

      {loading && <p className="text-[13px] text-etyme-muted">Reading the trail…</p>}
      {failed && <p className="text-[13px] text-etyme-attention">{failed}</p>}

      {!loading && !failed && history && history.amendments.length === 0 && (
        <p className="text-[13px] text-etyme-muted">
          Nothing has been amended since this agreement was recorded. The first change to the
          payment days, the term or the floor will start the trail here.
        </p>
      )}

      {!loading && !failed && history && history.amendments.length > 0 && (
        <ol className="space-y-3">
          {history.amendments.map((v) => (
            <li key={v.version} className="border-l-2 border-etyme-rule pl-4">
              <p className="text-sm text-etyme-ink">{amendmentHeading(v)}</p>
              {v.changed.length > 0 && (
                <p className="mt-0.5 text-[12px] text-etyme-muted">
                  Moved: {v.changed.join(', ')}.
                </p>
              )}
              {v.reason && (
                <p className="mt-0.5 text-[12px] text-etyme-muted">Why: {v.reason}</p>
              )}
              <button
                onClick={() => setOpenVersion(openVersion === v.version ? null : v.version)}
                className="mt-1 text-[12px] text-etyme-action underline"
              >
                {openVersion === v.version
                  ? 'Hide the terms it set'
                  : 'What the terms were after it'}
              </button>
              {openVersion === v.version && <TermGrid terms={v.terms} role={agreement.role} />}
            </li>
          ))}
        </ol>
      )}

      {!loading && !failed && history && history.signatures.length > 0 && (
        <div className="mt-6">
          <p className="eyebrow mb-2">Who attested to each signature</p>
          <ul className="space-y-1.5">
            {history.signatures.map((s, i) => (
              <li key={`${s.party}-${i}`} className="text-[12px] text-etyme-muted">
                <span className="text-etyme-ink">{partyWord(s.party)}:</span>{' '}
                {signatureSays(s)}{' '}
                {s.attestedBy
                  ? `Recorded by ${s.attestedBy.name} on ${onDay(s.attestedAt)}.`
                  : 'Recorded with no attestor on file.'}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-etyme-faint">
            Nothing here verified a signature. Somebody read the paper and said what it says.
          </p>
        </div>
      )}
    </div>
  )
}

function TermGrid({
  terms,
  role,
}: {
  terms: Parameters<typeof termLines>[0]
  role: 'VENDOR' | 'CLIENT'
}) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
      {termLines(terms, role).map((l) => (
        <div key={l.label}>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
            {l.label}
          </dt>
          <dd className="mt-0.5 text-[13px] tabular-nums text-etyme-ink">{l.value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ── Ending one ────────────────────────────────────────────────────────

function EndIt({
  agreement,
  onChanged,
  onFailed,
}: {
  agreement: Agreement
  onChanged: (says: string) => void
  onFailed: (says: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  async function end() {
    setBusy(true)
    setRefusal(null)
    try {
      const body = await ask<{ says: string }>(`/api/program/agreements/${agreement.id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: why }),
      })
      setOpen(false)
      onChanged(body.says)
    } catch (e: any) {
      setRefusal(e.message)
      onFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 border-t border-etyme-rule pt-6">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded border border-etyme-rule px-3 py-1.5 text-xs text-etyme-muted hover:border-etyme-attention hover:text-etyme-attention"
        >
          End this agreement
        </button>
      ) : (
        <div className="max-w-2xl">
          <p className="text-sm text-etyme-ink">
            Ending it stops anything new being written under it. Its capacity and its margin
            floor stop enforcing, and{' '}
            {agreement.headcount > 0
              ? `the ${agreement.headcount === 1 ? 'person' : `${agreement.headcount} people`} working under it carry on under the contracts already written.`
              : 'nobody is working under it today.'}
          </p>
          <label className="mt-3 block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
              Why it is ending
            </span>
            <input
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="Replaced by the 2027 master agreement, signed 2 January."
              className="mt-1 w-full rounded border border-etyme-rule bg-etyme-surface px-2.5 py-1.5 text-sm"
            />
            <span className="mt-0.5 block text-[10px] text-etyme-faint">
              An agreement torn up for no recorded reason is the one nobody can explain two
              years later.
            </span>
          </label>
          {refusal && <p className="mt-3 text-[12px] text-etyme-attention">{refusal}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={end}
              disabled={busy}
              className="rounded bg-etyme-attention px-4 py-2 text-xs text-white disabled:opacity-50"
            >
              {busy ? 'Ending…' : 'End it'}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded border border-etyme-rule px-3 py-2 text-xs text-etyme-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Engagements and the statement of work ─────────────────────────────

function Engagements({
  agreement,
  onChanged,
  onFailed,
  editable,
}: {
  agreement: Agreement
  onChanged: (says: string) => void
  onFailed: (says: string) => void
  editable: boolean
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <div className="mt-6 border-t border-etyme-rule pt-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow">Engagements and their scope</p>
        {editable && (
          <button
            onClick={() => setAdding(!adding)}
            className="rounded border border-etyme-rule px-3 py-1.5 text-xs text-etyme-muted hover:text-etyme-ink"
          >
            {adding ? 'Cancel' : 'New engagement'}
          </button>
        )}
      </div>

      {adding && (
        <NewEngagement
          msaId={agreement.id}
          onDone={(m) => {
            setAdding(false)
            onChanged(m)
          }}
          onFailed={onFailed}
        />
      )}

      {agreement.engagements.length === 0 && !adding && (
        <p className="text-sm text-etyme-muted">
          Nothing under this agreement yet. An engagement is the project or statement of work
          several people and several contracts hang off.
        </p>
      )}

      <div className="space-y-3">
        {agreement.engagements.map((e) => (
          <div key={e.id} className="rounded-lg border border-etyme-rule p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-etyme-ink">{e.title}</p>
                <p className="mt-0.5 text-[11px] text-etyme-muted">
                  {e.invoiceCycle.toLowerCase()} billing · {e.liveContracts}{' '}
                  {e.liveContracts === 1 ? 'person' : 'people'} working
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {e.sowSignedAt ? (
                  <span className="chip chip--verified">Signed {onDay(e.sowSignedAt)}</span>
                ) : e.statementOfWork ? (
                  <span className="chip chip--action">Written, unsigned</span>
                ) : (
                  <span className="chip chip--attention">No scope</span>
                )}
                {editable && (
                  <button
                    onClick={() => setEditing(editing === e.id ? null : e.id)}
                    className="rounded border border-etyme-rule px-3 py-1.5 text-xs text-etyme-muted hover:text-etyme-ink"
                  >
                    {editing === e.id ? 'Close' : 'Scope'}
                  </button>
                )}
              </div>
            </div>

            {e.statementOfWork && editing !== e.id && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-etyme-muted">
                {e.statementOfWork}
              </p>
            )}

            {editing === e.id && (
              <Sow
                engagement={e}
                onDone={(m) => {
                  setEditing(null)
                  onChanged(m)
                }}
                onFailed={onFailed}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Sow({
  engagement,
  onDone,
  onFailed,
}: {
  engagement: Engagement
  onDone: (says: string) => void
  onFailed: (says: string) => void
}) {
  const [scope, setScope] = useState(engagement.statementOfWork ?? '')
  const [signed, setSigned] = useState(engagement.sowSignedAt?.slice(0, 10) ?? '')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setRefusal(null)
    try {
      const body = await ask<{ says: string }>(
        `/api/program/engagements/${engagement.id}/sow`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            statementOfWork: scope.trim() === '' ? null : scope,
            sowSignedAt: signed.trim() === '' ? null : signed,
          }),
        }
      )
      onDone(body.says)
    } catch (e: any) {
      setRefusal(e.message)
      onFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 border-t border-etyme-rule pt-4">
      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
          Statement of work
        </span>
        <textarea
          value={scope}
          onChange={(ev) => setScope(ev.target.value)}
          rows={5}
          placeholder="What is being delivered, by whom, over what period, and what done looks like."
          className="mt-1 w-full rounded border border-etyme-rule bg-etyme-surface p-3 text-sm"
        />
      </label>
      <div className="mt-3 flex items-end gap-4">
        <Field label="Signed on" value={signed} onChange={setSigned} placeholder="yyyy-mm-dd" />
        <button
          onClick={save}
          disabled={busy}
          className="rounded bg-etyme-action px-4 py-2 text-xs text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Record scope'}
        </button>
      </div>
      {refusal && <p className="mt-2 text-[12px] text-etyme-attention">{refusal}</p>}
      <p className="mt-2 text-[11px] text-etyme-faint">
        A signature over an empty scope is refused. It is the one state worse than having
        nothing, because every check downstream reads it as done and nobody chases it.
      </p>
    </div>
  )
}

function NewEngagement({
  msaId,
  onDone,
  onFailed,
}: {
  msaId: string
  onDone: (says: string) => void
  onFailed: (says: string) => void
}) {
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setRefusal(null)
    try {
      const body = await ask<{ says: string }>('/api/program/engagements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msaId, title, statementOfWork: scope || null }),
      })
      onDone(body.says)
    } catch (e: any) {
      setRefusal(e.message)
      onFailed(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-etyme-rule bg-etyme-canvas/40 p-4">
      <Field label="Title" value={title} onChange={setTitle} placeholder="SAP Program — phase two" />
      <label className="mt-3 block">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
          Scope (optional now, chased later)
        </span>
        <textarea
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded border border-etyme-rule bg-etyme-surface p-3 text-sm"
        />
      </label>
      {refusal && <p className="mt-2 text-[12px] text-etyme-attention">{refusal}</p>}
      <button
        onClick={create}
        disabled={busy || title.trim().length < 2}
        className="mt-3 rounded bg-etyme-action px-4 py-2 text-xs text-white disabled:opacity-50"
      >
        {busy ? 'Opening…' : 'Open engagement'}
      </button>
    </div>
  )
}

// ── Bits ──────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded border border-etyme-rule bg-etyme-surface px-2.5 py-1.5 text-sm tabular-nums"
      />
      {hint && <span className="mt-0.5 block text-[10px] text-etyme-faint">{hint}</span>}
    </label>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: number | string
  sub?: string
  tone?: 'attention' | 'action' | 'verified'
}) {
  const tones = {
    attention: 'text-etyme-attention',
    action: 'text-etyme-action',
    verified: 'text-etyme-verified',
  }
  return (
    <div className="card px-4 py-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-etyme-muted">
        {label}
      </p>
      <p
        className={`font-serif text-2xl font-semibold tabular-nums ${tone ? tones[tone] : 'text-etyme-ink'}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-etyme-faint">{sub}</p>}
    </div>
  )
}
