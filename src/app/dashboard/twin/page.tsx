'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { readJson } from '@/lib/read-response'
import { momentFor, readerZone } from '@/lib/when'
import { hasPermission } from '@/lib/permissions'
import { outcomeWord, surfaceWord, tierWord } from '@/lib/twin/feed-words'
import { useSession } from '@/components/session-provider'
import { usePageSection } from '@/components/page-section'
import { ListSurface, type Column } from '@/components/list-surface'
import { PageHead, Panel, Chip, RefusedState, ErrorState, type ChipTone } from '@/components/ui'
import { TwinConversationSlot } from './conversation-slot'

/**
 * The program twin, from the program owner's desk.
 *
 * What the twin did — one line per entry, on whose authority and where —
 * under one line to Ask Etyme and the one number: acts per day in Ask
 * Etyme (founder, 2026-10-12, "Ask Etyme is the app"). The program's
 * numbers and the questions waiting were here until that day; they are
 * Ask Etyme's greeting now, and the page keeps only what the chat does
 * not: the ledger with its export, and the two editors.
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

interface DayCount { day: string; count: number }

/** The one number as a line of figures, oldest day first. */
function ActsPerDay({ days }: { days: DayCount[] }) {
  const total = days.reduce((n, d) => n + d.count, 0)
  return (
    <section aria-label="Acts per day in Ask Etyme" className="mb-6">
      <p className="eyebrow">Acts per day in Ask Etyme</p>
      <p className="mt-1 font-mono text-[13px] tabular-nums text-etyme-ink">
        {days.map((d) => d.count).join(' · ')}
      </p>
      <p className="mt-1 text-[12.5px] text-etyme-muted">
        A person’s yes or no on the web or on Teams, each of the last {days.length} days, oldest first: {total} in all.
        Nothing the twin did on its own is counted.
      </p>
    </section>
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
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [acts, setActs] = useState<DayCount[] | null>(null)

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
      setActs(body.data.actsPerDay ?? null)
      setFailed(null)
    } catch (err: any) {
      setFailed(err?.message ?? 'The twin’s ledger could not be read.')
    }
  }, [])

  useEffect(() => { loadFeed() }, [loadFeed])

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
      : 'What the twin did and the rule behind each; what it is waiting on is in Ask Etyme.'

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

      {isClient && <div className="mb-4"><TwinConversationSlot /></div>}

      {acts && acts.length > 0 && <ActsPerDay days={acts} />}

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
