'use client'

import { useEffect, useState } from 'react'
import { DataTable, type Column } from '@/components/data-table'

/**
 * Compliance Overview — Governance section
 *
 * Addendum E §E.6: "Every cleared requisition records the basis on
 * which it cleared. An auto-cleared requisition is not an unreviewed
 * one — it is one where the review was executed by rule and recorded."
 *
 * This is a working surface: dense, sortable, filterable, exportable.
 * Surfaces governance policies with BLOCK vs WARN enforcement,
 * recent evaluations, verification status, and compliance health.
 */

// ── Types ──────────────────────────────────────────────────

interface ComplianceData {
  client: { id: string; name: string }
  policies: PolicyGroup[]
  recentEvaluations: Evaluation[]
  verifications: {
    persons: VerificationSubject[]
    companies: VerificationSubject[]
  }
  health: {
    totalChecks: number
    clear: number
    pending: number
    flagged: number
    expired: number
    clearPercentage: number
  }
  evaluationSummary: {
    total: number
    pass: number
    warn: number
    block: number
    overridden: number
  }
  /** Suppliers who cannot submit anybody today because cover has lapsed. */
  lapsed: LapsedSupplier[]
}

interface LapsedSupplier {
  companyId: string
  name: string
  outcome: string
  says: string
  fix: string | null
}

// ── Classification calls ───────────────────────────────────

interface ClassificationData {
  company: { id: string; name: string }
  calls: ClassificationCallRow[]
  review: {
    stale: StaleCall[]
    overdue: number
    noReviewDate: number
    dueSoon: number
  }
  superseded: number
}

interface ClassificationCallRow {
  id: string
  personId: string
  personName: string
  position: string
  reasons: string[]
  decidedAt: string
  decidedByName: string | null
  reviewBy: string | null
  testLabel: string | null
  testConcluded: string | null
  departed: boolean
  unknownCount: number | null
}

interface StaleCall {
  id: string
  personName: string
  position: string
  freshness: string
  daysOverdue: number | null
  says: string
}

interface PolicyGroup {
  id: string
  name: string
  description: string | null
  rules: GovernanceRule[]
}

interface GovernanceRule {
  id: string
  ruleType: string
  enforcementMode: string
  description: string | null
  parameters: any
  evaluationCount: number
}

interface Evaluation {
  id: string
  ruleType: string
  enforcementMode: string
  ruleDescription: string | null
  triggerPoint: string
  subjectType: string
  subjectId: string
  outcome: string
  reason: string | null
  overriddenBy: string | null
  overrideNote: string | null
  evaluatedAt: string
}

interface VerificationSubject {
  personId?: string
  companyId?: string
  name: string
  checks: VerificationCheck[]
  cover?: { outcome: string; says: string; fix: string | null } | null
}

interface VerificationCheck {
  type: string
  status: string
  provider: string | null
  issuedAt: string | null
  expiresAt: string | null
  /** What is true today, as against what the stored status claims. */
  standing?: string | null
  says?: string | null
}

// ── Status helpers ─────────────────────────────────────────

function formatRuleType(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function outcomeChipClass(outcome: string): string {
  switch (outcome) {
    case 'PASS':  return 'chip--verified'
    case 'WARN':  return 'chip--attention'
    case 'BLOCK': return 'chip--danger'
    default:      return 'chip--passive'
  }
}

function enforcementChipClass(mode: string): string {
  return mode === 'BLOCK' ? 'chip--danger' : 'chip--attention'
}

function verifDotClass(status: string): string {
  switch (status) {
    case 'CLEAR':       return 'evidence-dot'
    case 'PENDING':
    case 'IN_PROGRESS': return 'evidence-dot evidence-dot--pending'
    case 'FLAGGED':
    case 'FAILED':
    case 'CONDITIONAL': return 'evidence-dot evidence-dot--blocked'
    case 'EXPIRED':     return 'evidence-dot' // faint — override inline
    default:            return 'evidence-dot'
  }
}

function verifLabel(status: string): string {
  const labels: Record<string, string> = {
    CLEAR: 'Clear', PENDING: 'Pending', IN_PROGRESS: 'In progress',
    FLAGGED: 'Flagged', FAILED: 'Failed', CONDITIONAL: 'Conditional', EXPIRED: 'Expired',
  }
  return labels[status] ?? status
}

/**
 * What a check reads as on the screen.
 *
 * The computed standing wins over the stored status, because the stored
 * status is a claim about the day somebody last touched the row. A
 * certificate that lapsed in March reading "Clear" in July is the exact
 * 2017 bug, and it was a display problem as much as a sweep problem.
 */
function effectiveLabel(check: VerificationCheck): string {
  switch (check.standing) {
    case 'EXPIRED':            return 'Lapsed'
    case 'EXPIRING':           return 'Expiring'
    case 'NO_EXPIRY_RECORDED': return 'No expiry recorded'
    default:                   return verifLabel(check.status)
  }
}

function effectiveDotClass(check: VerificationCheck): string {
  if (check.standing === 'EXPIRED') return 'evidence-dot evidence-dot--blocked'
  if (check.standing === 'EXPIRING' || check.standing === 'NO_EXPIRY_RECORDED') {
    return 'evidence-dot evidence-dot--pending'
  }
  return verifDotClass(check.status)
}

function coverChipClass(outcome: string): string {
  if (outcome === 'BLOCK') return 'chip--danger'
  if (outcome === 'WARN') return 'chip--attention'
  return 'chip--verified'
}

// ── Evaluation columns ─────────────────────────────────────

const EVAL_COLUMNS: Column<Evaluation>[] = [
  {
    key: 'ruleType',
    label: 'Rule',
    render: (row) => (
      <div>
        <div className="font-medium text-etyme-ink text-xs">{formatRuleType(row.ruleType)}</div>
        <span className={`chip ${enforcementChipClass(row.enforcementMode)} mt-0.5`}>
          {row.enforcementMode}
        </span>
      </div>
    ),
    sortValue: (row) => row.ruleType,
  },
  {
    key: 'triggerPoint',
    label: 'Trigger',
    render: (row) => (
      <span className="text-etyme-muted">{row.triggerPoint.replace(/_/g, ' ').toLowerCase()}</span>
    ),
    sortValue: (row) => row.triggerPoint,
    hideOnMobile: true,
  },
  {
    key: 'outcome',
    label: 'Outcome',
    render: (row) => (
      <div>
        <span className={`chip ${outcomeChipClass(row.outcome)}`}>{row.outcome}</span>
        {row.overriddenBy && (
          <div className="text-[10px] text-etyme-action mt-0.5">
            Overridden{row.overrideNote ? `: ${row.overrideNote}` : ''}
          </div>
        )}
      </div>
    ),
    sortValue: (row) => {
      const order: Record<string, number> = { BLOCK: 0, WARN: 1, PASS: 2 }
      return order[row.outcome] ?? 3
    },
  },
  {
    key: 'reason',
    label: 'Reason',
    render: (row) => (
      <span className="text-etyme-muted text-xs max-w-[300px] block truncate">
        {row.reason ?? '—'}
      </span>
    ),
    sortable: false,
    hideOnMobile: true,
  },
  {
    key: 'evaluatedAt',
    label: 'Date',
    align: 'right',
    render: (row) => (
      <span className="text-etyme-muted tabular-nums whitespace-nowrap">
        {new Date(row.evaluatedAt).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        })}
      </span>
    ),
    sortValue: (row) => new Date(row.evaluatedAt).getTime(),
  },
]

// ── Page ───────────────────────────────────────────────────

type ComplianceTab = 'policies' | 'evaluations' | 'verifications' | 'classification'

export default function CompliancePage() {
  const [data, setData] = useState<ComplianceData | null>(null)
  const [calls, setCalls] = useState<ClassificationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [callsError, setCallsError] = useState<string | null>(null)
  const [tab, setTab] = useState<ComplianceTab>('policies')

  useEffect(() => {
    fetch('/api/compliance')
      .then(r => r.json())
      .then(body => {
        if (body.error) throw new Error(body.error.message)
        setData(body.data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/compliance/classification')
      .then(r => r.json())
      .then(body => {
        if (body.error) throw new Error(body.error.message)
        setCalls(body.data)
      })
      .catch(e => setCallsError(e.message))
  }, [])

  if (!data && !loading && !error) return null

  const health = data?.health ?? { totalChecks: 0, clear: 0, pending: 0, flagged: 0, expired: 0, clearPercentage: 100 }
  const evalSummary = data?.evaluationSummary ?? { total: 0, pass: 0, warn: 0, block: 0, overridden: 0 }
  const lapsed = data?.lapsed ?? []
  const needsReview = calls?.review.stale ?? []

  return (
    <>
      {/* Head */}
      <div className="page-head">
        <p className="eyebrow">Governance</p>
        <h1>Compliance overview</h1>
        <p>
          Governance policies, enforcement evaluations, and verification status at {data?.client.name ?? '…'}.
          Every cleared requisition records the basis on which it cleared.
        </p>
      </div>

      {/* Lapsed cover — lifted out of the table, because a lapse buried in
          forty vendors is a lapse nobody sees, and this one stops work. */}
      {lapsed.length > 0 && (
        <div className="mb-6 border border-etyme-rule rounded-[6px] overflow-hidden">
          <div className="px-4 py-3 border-b border-etyme-rule bg-etyme-surface">
            <h3 className="text-sm font-semibold text-etyme-ink">
              {lapsed.length === 1
                ? 'One supplier cannot submit anybody today'
                : `${lapsed.length} suppliers cannot submit anybody today`}
            </h3>
            <p className="text-[12px] text-etyme-muted mt-0.5">
              Lapsed insurance is one of the few things that blocks rather than warns.
            </p>
          </div>
          <div className="divide-y divide-etyme-rule">
            {lapsed.map(s => (
              <div key={s.companyId} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="chip chip--danger">Blocked</span>
                  <span className="font-medium text-etyme-ink text-[13px]">{s.name}</span>
                </div>
                <p className="text-[12px] text-etyme-muted mt-1">{s.says}</p>
                {s.fix && <p className="text-[12px] text-etyme-action mt-1">{s.fix}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Health stats */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[100px]">
          <p className="stat-label">Clear rate</p>
          <p className={`stat-value ${
            health.clearPercentage >= 90 ? 'text-etyme-verified' :
            health.clearPercentage >= 70 ? 'text-etyme-attention' : 'text-etyme-danger'
          }`}>
            {health.clearPercentage}%
          </p>
        </div>
        <div className="panel flex-1 min-w-[100px]">
          <p className="stat-label">Total checks</p>
          <p className="stat-value text-etyme-ink">{health.totalChecks}</p>
        </div>
        <div className="panel flex-1 min-w-[100px]">
          <p className="stat-label">Clear</p>
          <p className="stat-value text-etyme-verified">{health.clear}</p>
        </div>
        <div className="panel flex-1 min-w-[100px]">
          <p className="stat-label">Pending</p>
          <p className={`stat-value ${health.pending > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {health.pending}
          </p>
        </div>
        <div className="panel flex-1 min-w-[100px]">
          <p className="stat-label">Flagged</p>
          <p className={`stat-value ${health.flagged > 0 ? 'text-etyme-danger' : 'text-etyme-ink'}`}>
            {health.flagged}
          </p>
        </div>
        <div className="panel flex-1 min-w-[100px]">
          <p className="stat-label">Evaluations</p>
          <p className="stat-value text-etyme-ink">{evalSummary.total}</p>
          <p className="text-[10px] text-etyme-faint mt-0.5">
            {evalSummary.pass}p · {evalSummary.warn}w · {evalSummary.block}b
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6">
        {([
          { key: 'policies' as const, label: 'Policies' },
          { key: 'evaluations' as const, label: `Evaluations (${evalSummary.total})` },
          { key: 'verifications' as const, label: `Verifications (${health.totalChecks})` },
          { key: 'classification' as const, label: `Classification (${calls?.calls.length ?? 0})` },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`filter-tab ${tab === t.key ? 'filter-tab--active' : 'filter-tab--inactive'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'policies' && <PoliciesTab policies={data?.policies ?? []} loading={loading} error={error} />}
      {tab === 'evaluations' && (
        <DataTable
          columns={EVAL_COLUMNS}
          data={data?.recentEvaluations ?? []}
          rowKey={(row) => row.id}
          loading={loading}
          error={error}
          searchPlaceholder="Search evaluations…"
          searchFilter={(row, q) =>
            formatRuleType(row.ruleType).toLowerCase().includes(q) ||
            row.outcome.toLowerCase().includes(q) ||
            (row.reason?.toLowerCase().includes(q) ?? false)
          }
          emptyMessage="No evaluations in the last 90 days."
          exportName={`evaluations-${data?.client.name ?? 'export'}`}
        />
      )}
      {tab === 'verifications' && <VerificationsTab data={data} loading={loading} error={error} />}
      {tab === 'classification' && (
        <ClassificationTab calls={calls} stale={needsReview} error={callsError} />
      )}
    </>
  )
}

// ── Classification calls — the evidence, never a verdict ───

/**
 * What position was taken about each person, what it was taken from, and
 * when it has to be looked at again.
 *
 * Deliberately not a status column on a person. A classification is an
 * event with a date and an author, the same shape as a verification — the
 * moment it becomes an attribute of a human being it reads as a judgement
 * Etyme made, and Etyme does not make it.
 */
function ClassificationTab({
  calls,
  stale,
  error,
}: {
  calls: ClassificationData | null
  stale: StaleCall[]
  error: string | null
}) {
  if (error) {
    return (
      <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (!calls) {
    return (
      <div className="panel text-center py-12">
        <p className="text-body-sm text-etyme-muted">Loading…</p>
      </div>
    )
  }

  if (calls.calls.length === 0) {
    return (
      <div className="panel text-center py-12">
        <p className="text-[13px] text-etyme-muted">
          No classification calls recorded. A sole trader with no call on file is the
          exposure with nothing behind it.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {stale.length > 0 && (
        <div className="border border-etyme-rule rounded-[6px] overflow-hidden">
          <div className="px-4 py-3 border-b border-etyme-rule bg-etyme-surface">
            <h3 className="text-sm font-semibold text-etyme-ink">
              {stale.length === 1 ? 'One call needs looking at again' : `${stale.length} calls need looking at again`}
            </h3>
            <p className="text-[12px] text-etyme-muted mt-0.5">
              {calls.review.overdue} overdue · {calls.review.noReviewDate} with no review date ·{' '}
              {calls.review.dueSoon} due soon
            </p>
          </div>
          <div className="divide-y divide-etyme-rule">
            {stale.map(s => (
              <div key={s.id} className="px-4 py-2.5">
                <span
                  className={`chip ${s.freshness === 'OVERDUE' ? 'chip--danger' : 'chip--attention'}`}
                >
                  {s.freshness === 'OVERDUE'
                    ? 'Overdue'
                    : s.freshness === 'NO_REVIEW_DATE'
                      ? 'No review date'
                      : 'Due soon'}
                </span>
                <span className="text-[12px] text-etyme-muted ml-2">{s.says}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-etyme-surface border border-etyme-rule rounded-[6px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full text-[13px]">
            <thead>
              <tr>
                <th>Person</th>
                <th>Position</th>
                <th>Test</th>
                <th>Carried by</th>
                <th>Decided</th>
                <th style={{ textAlign: 'right' }}>Review by</th>
              </tr>
            </thead>
            <tbody>
              {calls.calls.map(c => (
                <tr key={c.id}>
                  <td><span className="font-medium text-etyme-ink">{c.personName}</span></td>
                  <td>
                    <span className={`chip ${c.position === 'EMPLOYEE' ? 'chip--attention' : 'chip--passive'}`}>
                      {c.position === 'EMPLOYEE' ? 'Employee' : 'Independent'}
                    </span>
                  </td>
                  <td>
                    <span className="text-etyme-muted">{c.testLabel ?? '—'}</span>
                    {c.departed && (
                      <div className="text-[10px] text-etyme-attention mt-0.5">
                        Departs from the test, with a written reason
                      </div>
                    )}
                    {c.testConcluded === 'UNCLEAR' && (
                      <div className="text-[10px] text-etyme-faint mt-0.5">
                        Test unclear{c.unknownCount ? ` · ${c.unknownCount} unanswered` : ''}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="text-etyme-muted text-xs max-w-[320px] block">
                      {c.reasons[0] ?? '—'}
                    </span>
                  </td>
                  <td>
                    <span className="text-etyme-muted tabular-nums whitespace-nowrap">
                      {new Date(c.decidedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                    {c.decidedByName && (
                      <div className="text-[10px] text-etyme-faint">{c.decidedByName}</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }} className="tabular-nums whitespace-nowrap">
                    {c.reviewBy
                      ? new Date(c.reviewBy).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })
                      : <span className="text-etyme-attention">not set</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {calls.superseded > 0 && (
        <p className="text-[11px] text-etyme-faint">
          {calls.superseded} earlier call{calls.superseded === 1 ? '' : 's'} superseded. Only the
          latest one per person speaks.
        </p>
      )}
    </div>
  )
}

// ── Policies tab — rules are grouped, not flat ────────────

function PoliciesTab({
  policies,
  loading,
  error,
}: {
  policies: PolicyGroup[]
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <div className="panel text-center py-12">
        <p className="text-body-sm text-etyme-muted">Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (policies.length === 0) {
    return (
      <div className="panel text-center py-12">
        <p className="text-[13px] text-etyme-muted">No governance policies configured.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {policies.map(policy => (
        <div key={policy.id} className="bg-etyme-surface border border-etyme-rule rounded-[6px] overflow-hidden">
          <div className="px-4 py-3 border-b border-etyme-rule">
            <h3 className="text-sm font-semibold text-etyme-ink">{policy.name}</h3>
            {policy.description && (
              <p className="text-[12px] text-etyme-muted mt-0.5">{policy.description}</p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="data-table w-full text-[13px]">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Enforcement</th>
                  <th>Description</th>
                  <th>Parameters</th>
                  <th style={{ textAlign: 'right' }}>Evaluations</th>
                </tr>
              </thead>
              <tbody>
                {policy.rules.map(rule => (
                  <tr key={rule.id}>
                    <td>
                      <span className="font-medium text-etyme-ink">{formatRuleType(rule.ruleType)}</span>
                    </td>
                    <td>
                      <span className={`chip ${enforcementChipClass(rule.enforcementMode)}`}>
                        {rule.enforcementMode}
                      </span>
                    </td>
                    <td>
                      <span className="text-etyme-muted">{rule.description ?? '—'}</span>
                    </td>
                    <td>
                      <span className="text-[11px] text-etyme-faint font-mono">
                        {formatParameters(rule.parameters)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }} className="tabular-nums">
                      {rule.evaluationCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function formatParameters(params: any): string {
  if (!params || typeof params !== 'object') return ''
  return Object.entries(params)
    .map(([k, v]) => {
      const label = k.replace(/([A-Z])/g, ' $1').trim()
      if (Array.isArray(v)) {
        const items = v.map(item =>
          typeof item === 'string'
            ? item.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
            : Array.isArray(item) ? item.join(' / ') : String(item)
        )
        return `${label}: ${items.join(', ')}`
      }
      return `${label}: ${v}`
    })
    .join(' · ')
}

// ── Verifications tab — person + company groups ───────────

function VerificationsTab({
  data,
  loading,
  error,
}: {
  data: ComplianceData | null
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <div className="panel text-center py-12">
        <p className="text-body-sm text-etyme-muted">Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
        {error}
      </div>
    )
  }

  const persons = data?.verifications.persons ?? []
  const companies = data?.verifications.companies ?? []

  if (persons.length === 0 && companies.length === 0) {
    return (
      <div className="panel text-center py-12">
        <p className="text-[13px] text-etyme-muted">No verifications found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Person verifications */}
      {persons.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-etyme-ink mb-3">Contractor verifications</h3>
          <div className="bg-etyme-surface border border-etyme-rule rounded-[6px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table w-full text-[13px]">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Checks</th>
                  </tr>
                </thead>
                <tbody>
                  {persons.map(person => (
                    <tr key={person.personId}>
                      <td>
                        <span className="font-medium text-etyme-ink">{person.name}</span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {person.checks.map((check, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1.5 text-[11px] bg-etyme-canvas/80 rounded px-2 py-1"
                            >
                              <span
                                className={verifDotClass(check.status)}
                                style={check.status === 'EXPIRED' ? { background: 'var(--color-faint)' } : undefined}
                              />
                              <span className="text-etyme-muted">{formatRuleType(check.type)}</span>
                              <span className="text-etyme-faint">·</span>
                              <span className="font-medium text-etyme-ink">{verifLabel(check.status)}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Company verifications */}
      {companies.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-etyme-ink mb-3">Vendor verifications</h3>
          <div className="bg-etyme-surface border border-etyme-rule rounded-[6px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table w-full text-[13px]">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Can submit today</th>
                    <th>Checks</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map(company => (
                    <tr key={company.companyId}>
                      <td>
                        <span className="font-medium text-etyme-ink">{company.name}</span>
                      </td>
                      <td>
                        {company.cover ? (
                          <>
                            <span className={`chip ${coverChipClass(company.cover.outcome)}`}>
                              {company.cover.outcome === 'BLOCK'
                                ? 'No — cover lapsed'
                                : company.cover.outcome === 'WARN'
                                  ? 'Yes, with something to chase'
                                  : 'Yes'}
                            </span>
                            <div className="text-[11px] text-etyme-muted mt-0.5 max-w-[320px]">
                              {company.cover.says}
                            </div>
                          </>
                        ) : (
                          <span className="text-etyme-faint">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {company.checks.map((check, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1.5 text-[11px] bg-etyme-canvas/80 rounded px-2 py-1"
                              title={check.says ?? undefined}
                            >
                              <span className={effectiveDotClass(check)} />
                              <span className="text-etyme-muted">{formatRuleType(check.type)}</span>
                              <span className="text-etyme-faint">·</span>
                              <span className="font-medium text-etyme-ink">{effectiveLabel(check)}</span>
                              {check.expiresAt && (
                                <>
                                  <span className="text-etyme-faint">·</span>
                                  <span className="text-etyme-faint tabular-nums">
                                    exp {new Date(check.expiresAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                  </span>
                                </>
                              )}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
