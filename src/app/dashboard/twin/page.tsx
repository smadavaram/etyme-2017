'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { readJson } from '@/lib/read-response'
import { compact } from '@/lib/money-display'
import { momentFor, readerZone } from '@/lib/when'
import { hasPermission } from '@/lib/permissions'
import { outcomeWord, questionLine, surfaceWord, tierWord } from '@/lib/twin/feed-words'
import { useSession } from '@/components/session-provider'
import { usePageSection } from '@/components/page-section'
import { ListSurface, type Column } from '@/components/list-surface'
import {
  PageHead, Panel, Stat, Chip, RefusedState, LoadingState, ErrorState, EmptyState,
  Field, Textarea, SubmitButton, FormMessage, type ChipTone,
} from '@/components/ui'
import { TwinConversationSlot } from './conversation-slot'

/**
 * The program twin, from the program owner's desk.
 *
 * Three things, in the order somebody acts on them: what the program
 * looks like today (the program desk's own numbers), what the twin is
 * waiting on a person for, and what it did — one line per entry, on
 * whose authority and where. The conversation with the twin sits between
 * them, and is etyme-conversation's.
 *
 * Who reads what is decided at the query (`ledgerFeed`): the owner reads
 * all, the client's other desks the program, a supplier only entries
 * about its own invoice receipts. A seat holding none of the three desks
 * the ledger route asks for reads the route's sentence and nothing else.
 */

interface FeedRow {
  id: string
  ts: string
  actorType: string
  actorName: string | null
  onAuthorityOfRole: string
  action: string
  tier: string
  outcome: string
  entityType: string
  entityId: string
  label: string | null
  program: string | null
  line: string
  ruleCited: string
  rationale: string
  surface: string
  roleContractVersion?: number
}

interface Question {
  id: string
  requestedAt: string
  action: string
  entityType: string
  label: string | null
  ruleCited: string
  rationale: string
  onAuthorityOfRole: string
  authorityName: string | null
  mayDecide: boolean
  whyNot: string | null
}

interface Picture {
  onSite: number | null
  spend: number | null
  spendBasis: string | null
  timeLimit: number | null
  timeLimitSays: string | null
  pending: number | null
}

const OUTCOME_TONE: Record<string, ChipTone> = {
  PERFORMED: 'verified',
  AWAITING_APPROVAL: 'attention',
  REFUSED: 'danger',
  REJECTED: 'passive',
}

function when(ts: string): string {
  return momentFor(new Date(ts), readerZone())
}

/** "Why?" — the rule the twin cited and its reason, one click away. */
function Why({ rule, reason, open, onToggle }: { rule: string; reason: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="mt-1.5">
      <button type="button" onClick={(e) => { e.stopPropagation(); onToggle() }} aria-expanded={open}
        className="text-[12.5px] font-medium text-etyme-action hover:underline">
        {open ? 'Hide why' : 'Why?'}
      </button>
      {open && (
        <dl className="mt-2 space-y-1.5 rounded-box border border-etyme-rule bg-etyme-canvas px-3 py-2.5 text-[12.5px] leading-relaxed">
          <div><dt className="eyebrow">Rule</dt><dd className="text-etyme-ink">{rule}</dd></div>
          <div><dt className="eyebrow">Reason</dt><dd className="text-etyme-ink">{reason || 'No reason was recorded.'}</dd></div>
        </dl>
      )}
    </div>
  )
}

function QuestionCard({ q, onAnswered }: { q: Question; onAnswered: (says: string) => void }) {
  const [why, setWhy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<'APPROVED' | 'REJECTED' | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  async function answer(decision: 'APPROVED' | 'REJECTED') {
    setPending(decision)
    setSaid(null)
    try {
      const res = await fetch(`/api/twin/approvals/${q.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: decision === 'REJECTED' ? reason : undefined, surface: 'WEB' }),
      })
      const body = await readJson(res)
      onAnswered(body?.data?.note ?? 'Recorded.')
    } catch (err: any) {
      setSaid(err?.message ?? 'Your answer could not be recorded.')
    } finally {
      setPending(null)
    }
  }

  return (
    <article className="rounded-panel border border-etyme-rule bg-etyme-raised px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-etyme-ink">{questionLine(q.action, q.entityType, q.label)}</h3>
          <p className="mt-1 text-[12.5px] text-etyme-muted">
            Asked under {q.onAuthorityOfRole} authority{q.authorityName ? ` (${q.authorityName})` : ''} · {when(q.requestedAt)}
          </p>
        </div>
        {q.mayDecide && !rejecting && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <SubmitButton type="button" pending={pending === 'APPROVED'} pendingLabel="Approving…" onClick={() => answer('APPROVED')}>
              Approve
            </SubmitButton>
            <button type="button" className="btn-secondary" onClick={() => setRejecting(true)}>Reject</button>
          </div>
        )}
      </div>
      <Why rule={q.ruleCited} reason={q.rationale} open={why} onToggle={() => setWhy(!why)} />
      {!q.mayDecide && q.whyNot && <p className="mt-2 text-[12.5px] leading-relaxed text-etyme-muted">{q.whyNot}</p>}
      {rejecting && (
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); answer('REJECTED') }}>
          <Field label="Why not?" help="The twin and whoever reads the ledger see this.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton pending={pending === 'REJECTED'} pendingLabel="Saying no…" disabled={!reason.trim()}>Say no</SubmitButton>
            <button type="button" className="btn-secondary" onClick={() => { setRejecting(false); setReason('') }}>Cancel</button>
          </div>
        </form>
      )}
      {said && <div className="mt-2"><FormMessage tone="error">{said}</FormMessage></div>}
    </article>
  )
}

export default function TwinPage() {
  const session = useSession()
  const eyebrow = usePageSection('/dashboard/twin')
  const isClient = session.company?.kind === 'CLIENT'
  const mayEdit = hasPermission(session.permissions, 'settings.manage')

  const [rows, setRows] = useState<FeedRow[] | null>(null)
  const [view, setView] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [questionsSay, setQuestionsSay] = useState<string | null>(null)
  const [picture, setPicture] = useState<Picture | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [note, setNote] = useState<string | null>(null)

  const loadFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/twin/ledger?take=200')
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}))
        setRefused(body?.error?.message ?? 'The twin’s ledger is not part of your seat. Ask your company’s owner if you need it.')
        return
      }
      const body = await readJson(res)
      setRows(body.data.rows ?? [])
      setView(body.data.view ?? null)
      setFailed(null)
    } catch (err: any) {
      setFailed(err?.message ?? 'The twin’s ledger could not be read.')
    }
  }, [])

  const loadQuestions = useCallback(async () => {
    try {
      const body = await readJson(await fetch('/api/twin/approvals'))
      setQuestions(body.data.questions ?? [])
      setQuestionsSay(null)
    } catch (err: any) {
      setQuestions([])
      setQuestionsSay(err?.message ?? 'What the twin is waiting on could not be read.')
    }
  }, [])

  useEffect(() => { loadFeed() }, [loadFeed])
  useEffect(() => { if (!refused) loadQuestions() }, [loadQuestions, refused])

  // The program desk's own numbers, read from the routes the desk reads.
  // Each is its own read: one that fails is a dash with its reason, never
  // a zero.
  useEffect(() => {
    if (!isClient || refused) return
    const p: Picture = { onSite: null, spend: null, spendBasis: null, timeLimit: null, timeLimitSays: null, pending: null }
    Promise.allSettled([
      fetch('/api/program').then(readJson).then((b) => {
        const s = b?.data?.summary
        if (!s) return
        p.onSite = s.activeContractors ?? null
        p.spend = s.monthlySpend ?? null
        p.spendBasis = s.monthlySpendBasis ?? 'from current rates'
        p.pending = s.pendingApprovals ?? null
      }),
      fetch('/api/tenure').then(readJson).then((b) => {
        const s = b?.data?.summary
        if (!s) return
        p.timeLimit = (s.warning ?? 0) + (s.breakRequired ?? 0)
      }).catch((err: any) => { p.timeLimitSays = err?.message ?? 'Tenure could not be read.' }),
    ]).then(() => setPicture({ ...p }))
  }, [isClient, refused])

  if (refused) return <RefusedState says={refused} />

  const columns: Column<FeedRow>[] = [
    {
      key: 'line', label: 'What happened',
      render: (r) => <span id={`entry-${r.id}`} className="scroll-mt-24 text-etyme-ink">{r.line}</span>,
      exportValue: (r) => r.line,
    },
    {
      key: 'ts', label: 'When',
      render: (r) => <span className="whitespace-nowrap tabular-nums text-etyme-muted">{when(r.ts)}</span>,
      sortValue: (r) => r.ts,
      exportValue: (r) => r.ts,
    },
    {
      key: 'outcome', label: 'Outcome',
      render: (r) => <Chip tone={OUTCOME_TONE[r.outcome] ?? 'passive'}>{r.actorType === 'CHANGE' ? 'Changed' : outcomeWord(r.outcome)}</Chip>,
      sortValue: (r) => r.outcome,
      exportValue: (r) => (r.actorType === 'CHANGE' ? 'Changed' : outcomeWord(r.outcome)),
    },
    { key: 'surface', label: 'Where', render: (r) => surfaceWord(r.surface), exportValue: (r) => surfaceWord(r.surface), hideOnMobile: true },
    { key: 'onAuthorityOfRole', label: 'Authority', exportValue: (r) => r.onAuthorityOfRole || '', hideOnMobile: true },
    { key: 'tier', label: 'Tier', render: (r) => tierWord(r.tier), exportValue: (r) => tierWord(r.tier), hideOnMobile: true },
    { key: 'ruleCited', label: 'Rule', hideOnMobile: true },
    { key: 'rationale', label: 'Reason', hideOnMobile: true },
    ...(view === 'PARTY' ? [{ key: 'program', label: 'Client', exportValue: (r: FeedRow) => r.program ?? '' } as Column<FeedRow>] : []),
    ...(view === 'OWNER' ? [{ key: 'roleContractVersion', label: 'Contract version', exportValue: (r: FeedRow) => r.roleContractVersion ?? '', hideOnMobile: true } as Column<FeedRow>] : []),
  ]

  // The conversation panel links to /dashboard/twin#entry-<id>, so each
  // entry carries its id as an anchor.
  const feedCard = (r: FeedRow) => (
    <div id={`entry-${r.id}`} className="scroll-mt-24">
      <p className="text-[14px] leading-relaxed text-etyme-ink">
        {r.line}, <span className="text-etyme-muted">{when(r.ts)}</span>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Chip tone={OUTCOME_TONE[r.outcome] ?? 'passive'}>{r.actorType === 'CHANGE' ? 'Changed' : outcomeWord(r.outcome)}</Chip>
        {view === 'PARTY' && r.program && <span className="text-[12px] text-etyme-muted">{r.program}</span>}
      </div>
      <Why rule={r.ruleCited} reason={r.rationale} open={!!open[r.id]} onToggle={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} />
    </div>
  )

  const subtitle =
    view === 'PARTY'
      ? 'What your clients’ program twins did about your own invoice receipts. Nothing about anybody else’s.'
      : 'What the program manager’s twin did, what it is waiting on a person for, and the rule behind each.'

  return (
    <div>
      <PageHead
        eyebrow={eyebrow}
        title="Program twin"
        subtitle={subtitle}
        actions={mayEdit && isClient ? (
          <>
            <Link href={'/dashboard/twin/contract' as any} className="btn-secondary">What it may do</Link>
            <Link href={'/dashboard/twin/rules' as any} className="btn-secondary">Its numbers</Link>
          </>
        ) : undefined}
      />

      {isClient && (
        <section aria-label="The program today" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="On site" value={picture?.onSite ?? null} sub={picture ? 'contractors at work today' : 'Reading…'} href="/dashboard/program" />
          <Stat label="This month" value={picture?.spend != null ? compact(picture.spend) : null} sub={picture?.spendBasis ?? (picture ? 'The program could not be read.' : 'Reading…')} href="/dashboard/program/budget" />
          <Stat label="Time-limit risks" value={picture?.timeLimit ?? null} tone={picture?.timeLimit ? 'attention' : 'default'}
            sub={picture?.timeLimitSays ?? (picture ? 'near or at the limit, across every supplier' : 'Reading…')} href="/dashboard/tenure" />
          <Stat label="Hours and expenses waiting" value={picture?.pending ?? null} tone={picture?.pending ? 'attention' : 'default'}
            sub={picture ? 'for approval on the program desk' : 'Reading…'} href="/dashboard/program" />
        </section>
      )}

      {view !== 'PARTY' && (
        <Panel title="Waiting for you" subtitle="What the twin will not do without a person. Approve, say no with a reason, or ask why." className="mb-6">
          {note && <div className="mb-3"><FormMessage tone="ok">{note}</FormMessage></div>}
          {questions === null
            ? <LoadingState says="Opening what the twin is waiting on…" compact />
            : questionsSay
              ? <ErrorState says={questionsSay} action={{ label: 'Try again', onClick: loadQuestions }} />
              : questions.length === 0
                ? <EmptyState says="The twin is not waiting on anybody." detail="When it needs a yes, the question appears here and on Teams." compact />
                : (
                  <div className="space-y-3">
                    {questions.map((q) => (
                      <QuestionCard key={q.id} q={q} onAnswered={(says) => { setNote(says); loadQuestions(); loadFeed() }} />
                    ))}
                  </div>
                )}
        </Panel>
      )}

      {isClient && <div className="mb-6"><TwinConversationSlot companyId={session.company?.id ?? null} /></div>}

      <Panel title="What the twin did" subtitle="Every act, on whose authority and where. The export is the ledger as you are allowed to read it.">
        {failed
          ? <ErrorState says={failed} action={{ label: 'Try again', onClick: loadFeed }} />
          : (
            <ListSurface<FeedRow>
              name="twin-ledger"
              defaultView="feed"
              columns={columns}
              data={rows ?? []}
              rowKey={(r) => r.id}
              loading={rows === null}
              loadingMessage="Opening the twin’s ledger…"
              searchPlaceholder="Search the ledger…"
              emptyMessage={view === 'PARTY' ? 'No client’s twin has done anything about your invoice receipts yet.' : 'The twin has not done anything here yet.'}
              emptyDetail="It reads the program every night."
              exportName="twin-ledger"
              card={feedCard}
            />
          )}
      </Panel>
    </div>
  )
}
