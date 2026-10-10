'use client'

import { usePageSection } from '@/components/page-section'
import { useEffect, useState, useCallback } from 'react'
import { ACTIONS, LADDER, RUNGS, type Rung } from '@/lib/autonomy'
import { dayOfMomentFor, momentFor, readerZone } from '@/lib/when'
import { Check, Chip, EmptyState, ErrorState, FilterChips, LoadingState, PageHead, Panel, RefusedState, Stat, type ChipTone } from '@/components/ui'

/**
 * Automation Log — what the system did, with reasons.
 *
 * BUILD.md §3: "GET /api/automation — what ran, with reasons"
 *
 * CLAUDE.md invariant: "Anything the system does unprompted writes an
 * AutomationLog row with a plain-English reason and an honest reversible flag."
 *
 * Working surface: dense table with filters and bulk inspection.
 *
 * Every row says four things, because those are the four a procurement
 * officer asks: what the system did, at what level it acted, under which
 * rule, and whether it can still be undone.
 *
 * The level is the ladder in `lib/autonomy` — L0 Observe through L5
 * Fully autonomous — derived from the action, never stored. Only what
 * the system did unprompted gets one. A refusal aimed at somebody who
 * asked for something is governance and shows its outcome instead, and a
 * person's own act shows that a person did it.
 *
 * The row also says whether a rule or a model decided it, and says it
 * does not know rather than guessing. Most of what we do unprompted is a
 * date comparison, and the surface has to be able to say so.
 */

// ── Types ────────────────────────────────────────────

interface AutomationEntry {
  id: string
  action: string
  summary: string
  reason: string
  payload: Record<string, any>
  reversible: boolean
  reversedAt: string | null
  at: string
  kind: 'UNPROMPTED' | 'ENFORCEMENT' | 'ATTRIBUTED' | null
  kindSays: string | null
  level: Rung | null
  levelName: string | null
  levelSays: string | null
  outcome: 'BLOCK' | 'WARN' | 'PERMIT' | null
  actSays: string | null
  decidedBy: 'RULE' | 'MODEL' | 'UNRECORDED'
  decidedSays: string
  undo: string
}

// ── Helpers ──────────────────────────────────────────

function actionIcon(action: string): string {
  const map: Record<string, string> = {
    ROLLOFF_CLAIMED:           '⚠',
    ROLLOFF_SCAN:              '⚠',
    BENCH_LISTING_CREATED:     '◎',
    BENCH_LISTING_GRANTED:     '◎',
    BENCH_LISTING_REVOKED:     '◎',
    CONTRACT_CREATED:          '▤',
    IMPORT_COMMITTED:          '↓',
    CONSULTANT_CREATED:        '◌',
    REQUISITION_DISTRIBUTED:   '◈',
    INVOICE_GENERATED:         '▧',
    PAYMENT_RECORDED:          '▧',
    TIMESHEET_APPROVED:        '▦',
    EXPENSE_APPROVED:          '◫',
    EXPENSE_REJECTED:          '◫',
    PAYROLL_RUN:               '▩',
    BLACKLIST_ADD:             '⊘',
    BLACKLIST_LIFT:            '⊘',
    TEMPLATE_PACK_APPLIED:     '◆',
    COMPANY_CREATED:           '◉',
    REVERSAL:                  '↩',
  }
  return map[action] ?? '●'
}

/**
 * The machine's word, said the way a reader says it. The action names are
 * enum values and do not move; what a person reads does (CLAUDE.md, "Plain
 * words"): a requisition is a job request, and what the firm raises to
 * its customer is a bill.
 */
const PLAIN_WORD: Record<string, string> = { REQUISITION: 'Job request', INVOICE: 'Bill' }

function actionLabel(action: string): string {
  return action
    .split('_')
    .map((w) => PLAIN_WORD[w] ?? w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

function actionCategory(action: string): string {
  if (action.startsWith('ROLLOFF')) return 'Rolloff'
  if (action.startsWith('BENCH')) return 'Bench'
  if (action.startsWith('CONTRACT')) return 'Contracts'
  if (action.startsWith('CONSULTANT')) return 'People'
  if (action.startsWith('REQUIREMENT') || action.startsWith('REQUISITION')) return 'Job requests'
  if (action.startsWith('INVOICE') || action.startsWith('PAYMENT')) return 'Billing'
  if (action.startsWith('TIMESHEET')) return 'Timesheets'
  if (action.startsWith('EXPENSE')) return 'Expenses'
  if (action.startsWith('PAYROLL')) return 'Payroll'
  if (action.startsWith('BLACKLIST')) return 'Compliance'
  if (action.startsWith('IMPORT')) return 'Import'
  if (action.startsWith('TEMPLATE') || action.startsWith('COMPANY')) return 'Setup'
  if (action === 'REVERSAL') return 'Reversal'
  return 'Other'
}

/**
 * How loud the chip is. Looking and suggesting are quiet; acting on its
 * own with a consequence is not, and should not read as though it were.
 */
function levelTone(rung: Rung): ChipTone {
  if (rung === 'L0' || rung === 'L1' || rung === 'L2') return 'passive'
  if (rung === 'L3') return 'action'
  return 'attention'
}

function outcomeTone(outcome: string): ChipTone {
  if (outcome === 'PERMIT') return 'verified'
  return 'attention'
}

function decidedLabel(by: string): string {
  if (by === 'RULE') return 'By a rule'
  if (by === 'MODEL') return 'By a model'
  return 'Not recorded'
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / (1000 * 60))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return dayOfMomentFor(d, readerZone())
}

// ── Page ─────────────────────────────────────────────

export default function AutomationPage() {
  const section = usePageSection('/dashboard/automation')
  const [entries, setEntries] = useState<AutomationEntry[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // A refusal is the page: its sentence alone, with no tiles, filters or
  // empty state around it (sign-up walk, round five, problem 10).
  const [refused, setRefused] = useState<string | null>(null)
  // Nothing is counted until the first read answers, so a zero is never
  // drawn before the server has said whether this seat may read at all.
  const [answered, setAnswered] = useState(false)
  const [actionFilter, setActionFilter] = useState<string | null>(null)
  const [showReversibleOnly, setShowReversibleOnly] = useState(false)
  const [levelFilter, setLevelFilter] = useState<Rung | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reversing, setReversing] = useState<string | null>(null)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('limit', '100')
      if (actionFilter) params.set('action', actionFilter)
      if (showReversibleOnly) params.set('reversible', '')
      if (levelFilter) params.set('level', levelFilter)

      const res = await fetch(`/api/automation?${params.toString()}`)
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}))
        setRefused(body.error?.message ?? 'The automation log is not part of your seat. Ask your company’s owner if you need it.')
        setEntries([])
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }
      const body = await res.json()
      setEntries(body.data?.entries ?? [])
      setCounts(body.data?.counts ?? {})
    } catch (err: any) {
      setError(err.message)
      setEntries([])
    } finally {
      setLoading(false)
      setAnswered(true)
    }
  }, [actionFilter, showReversibleOnly, levelFilter])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  // ── Reverse an action ────────────────────────────
  const handleReverse = async (id: string) => {
    setReversing(id)
    try {
      const res = await fetch(`/api/automation/${id}/reverse`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }
      await fetchEntries()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setReversing(null)
    }
  }

  // ── Build filter tabs from action counts ─────────
  const categoryMap: Record<string, number> = {}
  for (const [action, count] of Object.entries(counts)) {
    const cat = actionCategory(action)
    categoryMap[cat] = (categoryMap[cat] ?? 0) + count
  }
  const categories = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const reversibleCount = entries.filter((e) => e.reversible && !e.reversedAt).length

  // Level and kind are properties of the action, so they are counted here
  // from the action tallies. Nothing is stored per row.
  const levelCounts: Partial<Record<Rung, number>> = {}
  let unpromptedCount = 0
  let ruleCount = 0
  for (const [action, count] of Object.entries(counts)) {
    const act = ACTIONS[action]
    if (!act) continue
    if (act.basis === 'RULE') ruleCount += count
    if (act.kind !== 'UNPROMPTED') continue
    unpromptedCount += count
    levelCounts[act.rung] = (levelCounts[act.rung] ?? 0) + count
  }
  const rungsPresent = RUNGS.filter((r) => (levelCounts[r] ?? 0) > 0)
  const topRung = rungsPresent.length ? rungsPresent[rungsPresent.length - 1] : null

  if (refused) return <RefusedState says={refused} />
  if (!answered) return <LoadingState says="Opening the automation log…" />

  return (
    <>
      <PageHead
        eyebrow={section}
        title="What the system did on its own"
        subtitle="Every action, the level it acted at, the rule it followed, and whether it can still be undone. Most of this is a date or a threshold, not a judgment, and the rows say which."
        actions={
          <button onClick={fetchEntries} className="btn-secondary text-[13px]">
            Refresh
          </button>
        }
      />

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total actions" value={total} sub="recorded" />
        <Stat label="On its own" value={unpromptedCount} sub="nobody asked" />
        <Stat label="Reversible" value={reversibleCount} sub="can be undone" />
        <Stat label="Highest level" value={topRung} sub={topRung ? LADDER[topRung].name.toLowerCase() : 'nothing yet'} />
        <Stat label="By a rule" value={ruleCount} sub="no model involved" />
      </div>

      {/* The ladder, as the reader's own filter. Only rungs we actually
          reached are offered — a rung with nothing behind it is a claim. */}
      {rungsPresent.length > 0 && (
        <Panel className="mb-5">
          <p className="stat-label mb-2">How far from a person&apos;s hand</p>
          <FilterChips<'ALL' | Rung>
            label="How far from a person’s hand"
            options={[
              { key: 'ALL', label: 'Everything', count: total },
              ...rungsPresent.map((r) => ({ key: r, label: `${r} ${LADDER[r].name}`, count: levelCounts[r] })),
            ]}
            value={levelFilter ?? 'ALL'}
            onChange={(k) => setLevelFilter(k === 'ALL' ? null : k)}
          />
          <p className="text-[12px] text-etyme-muted mt-2.5">
            {levelFilter
              ? LADDER[levelFilter].says
              : 'A level is only given to what the system did unprompted. A refusal aimed at somebody who asked for something is governance, not autonomy, and carries no level.'}
          </p>
        </Panel>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex-1">
          <FilterChips<string>
            label="What it did"
            options={[
              { key: '', label: 'All', count: total },
              ...Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([action, count]) => ({ key: action, label: actionLabel(action), count })),
            ]}
            value={actionFilter ?? ''}
            onChange={(k) => setActionFilter(k === '' ? null : k)}
          />
        </div>

        <Check
          label="Reversible only"
          checked={showReversibleOnly}
          onChange={() => setShowReversibleOnly(!showReversibleOnly)}
        />
      </div>

      {error && <div className="mb-4"><ErrorState says={error} action={{ label: 'Try again', onClick: () => fetchEntries() }} /></div>}

      {loading && <LoadingState says="Opening the automation log…" />}

      {!loading && entries.length === 0 && (
        <EmptyState
          says="No automation entries found."
          detail={actionFilter || levelFilter
            ? 'Try a different filter to see other entries.'
            : 'The system has not done anything on its own yet.'}
        />
      )}

      {/* Log entries */}
      {!loading && entries.length > 0 && (
        <div className="space-y-1">
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id
            const isReversed = !!entry.reversedAt

            return (
              <div
                key={entry.id}
                className={`rounded-lg border transition-colors ${
                  isReversed
                    ? 'border-etyme-rule/60 bg-etyme-canvas/50 opacity-60'
                    : 'border-etyme-rule bg-etyme-surface'
                }`}
              >
                {/* Row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  {/* Icon */}
                  <span className="text-[13px] opacity-50 w-5 text-center shrink-0">
                    {actionIcon(entry.action)}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className={`text-[13px] font-medium truncate ${
                        isReversed ? 'text-etyme-muted line-through' : 'text-etyme-ink'
                      }`}>
                        {entry.summary}
                      </p>
                    </div>
                    <p className="text-[11px] text-etyme-faint truncate">
                      {entry.reason}
                    </p>
                  </div>

                  {/* Chips — the level it acted at, and what decided it. */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isReversed && (
                      <Chip>Reversed</Chip>
                    )}
                    {entry.reversible && !isReversed && (
                      <Chip tone="action">Reversible</Chip>
                    )}
                    {entry.level && (
                      <Chip tone={levelTone(entry.level)} title={entry.levelSays ?? undefined}>
                        {entry.level} {entry.levelName}
                      </Chip>
                    )}
                    {entry.outcome && (
                      <Chip tone={outcomeTone(entry.outcome)}>
                        {entry.outcome === 'BLOCK'
                          ? 'Refused'
                          : entry.outcome === 'WARN'
                            ? 'Warned'
                            : 'Let through'}
                      </Chip>
                    )}
                    {entry.kind === 'ATTRIBUTED' && (
                      <Chip>A person did this</Chip>
                    )}
                    <Chip title={entry.decidedSays}>
                      {decidedLabel(entry.decidedBy)}
                    </Chip>
                    <Chip>
                      {actionCategory(entry.action)}
                    </Chip>
                  </div>

                  {/* Time */}
                  <span className="text-[10px] text-etyme-faint tabular-nums w-16 text-right shrink-0">
                    {timeAgo(entry.at)}
                  </span>

                  {/* Expand indicator */}
                  <span className={`text-[10px] text-etyme-faint transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`}>
                    ▸
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-etyme-rule/50">
                    {/* The four sentences, before any field. A code is for
                        the machine; the sentence is the product. */}
                    <div className="mt-3 space-y-1.5">
                      {entry.kindSays && (
                        <p className="text-[12px] text-etyme-ink">{entry.kindSays}</p>
                      )}
                      {entry.levelSays && (
                        <p className="text-[12px] text-etyme-muted">
                          <span className="text-etyme-ink">
                            {entry.level} · {entry.levelName}.
                          </span>{' '}
                          {entry.levelSays}
                        </p>
                      )}
                      {entry.actSays && (
                        <p className="text-[12px] text-etyme-muted">{entry.actSays}</p>
                      )}
                      <p className="text-[12px] text-etyme-muted">{entry.decidedSays}</p>
                      <p className="text-[12px] text-etyme-muted">{entry.undo}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                      <div>
                        <p className="stat-label mb-1">Action</p>
                        <p className="text-[12px] text-etyme-ink font-mono">{entry.action}</p>
                      </div>
                      <div>
                        <p className="stat-label mb-1">Timestamp</p>
                        <p className="text-[12px] text-etyme-ink tabular-nums">
                          {momentFor(new Date(entry.at), readerZone())}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="stat-label mb-1">Reason</p>
                        <p className="text-[12px] text-etyme-ink">{entry.reason}</p>
                      </div>
                      {entry.payload && Object.keys(entry.payload).length > 0 && (
                        <div className="col-span-2">
                          <p className="stat-label mb-1">Payload</p>
                          <pre className="text-[11px] text-etyme-muted bg-etyme-canvas rounded-md p-3 overflow-x-auto font-mono">
                            {JSON.stringify(entry.payload, null, 2)}
                          </pre>
                        </div>
                      )}
                      {isReversed && (
                        <div className="col-span-2">
                          <p className="stat-label mb-1">Reversed At</p>
                          <p className="text-[12px] text-etyme-muted tabular-nums">
                            {momentFor(new Date(entry.reversedAt!), readerZone())}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Reverse button */}
                    {entry.reversible && !isReversed && (
                      <div className="mt-4 pt-3 border-t border-etyme-rule/50">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleReverse(entry.id)
                          }}
                          disabled={reversing === entry.id}
                          className="btn-secondary text-[12px]"
                        >
                          {reversing === entry.id ? 'Reversing…' : 'Reverse this action'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      {!loading && entries.length > 0 && (
        <p className="text-xs text-etyme-faint mt-4 tabular-nums">
          {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
          {actionFilter && ` · ${actionLabel(actionFilter).toLowerCase()}`}
          {levelFilter && ` · ${levelFilter} ${LADDER[levelFilter].name.toLowerCase()}`}
          {showReversibleOnly && ' · reversible only'}
        </p>
      )}
    </>
  )
}
