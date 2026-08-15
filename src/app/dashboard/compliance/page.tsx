'use client'

import { useEffect, useState } from 'react'

/**
 * Compliance Overview — Governance section
 *
 * Addendum E §E.6: "Every cleared requisition records the basis on
 * which it cleared. An auto-cleared requisition is not an unreviewed
 * one — it is one where the review was executed by rule and recorded."
 *
 * Surfaces governance policies with BLOCK vs WARN enforcement,
 * recent evaluations, verification status, and compliance health.
 */

// ── Types ──────────────────────────────────────────────────

interface ComplianceData {
  client: { id: string; name: string }
  policies: {
    id: string
    name: string
    description: string | null
    rules: {
      id: string
      ruleType: string
      enforcementMode: string
      description: string | null
      parameters: any
      evaluationCount: number
    }[]
  }[]
  recentEvaluations: {
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
  }[]
  verifications: {
    persons: {
      personId: string
      name: string
      checks: VerificationCheck[]
    }[]
    companies: {
      companyId: string
      name: string
      checks: VerificationCheck[]
    }[]
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
}

interface VerificationCheck {
  type: string
  status: string
  provider: string | null
  issuedAt: string | null
  expiresAt: string | null
}

// ── Status helpers ─────────────────────────────────────────

const OUTCOME_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  PASS:  { label: 'Pass',  bg: 'bg-etyme-verified/10', text: 'text-etyme-verified' },
  WARN:  { label: 'Warn',  bg: 'bg-etyme-attention/10', text: 'text-etyme-attention' },
  BLOCK: { label: 'Block', bg: 'bg-red-500/10',        text: 'text-red-600' },
}

const ENFORCEMENT_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  BLOCK: { label: 'BLOCK', bg: 'bg-red-500/10', text: 'text-red-600' },
  WARN:  { label: 'WARN',  bg: 'bg-etyme-attention/10', text: 'text-etyme-attention' },
}

const VERIF_STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  CLEAR:       { dot: 'bg-etyme-verified', label: 'Clear' },
  PENDING:     { dot: 'bg-etyme-attention', label: 'Pending' },
  IN_PROGRESS: { dot: 'bg-etyme-action', label: 'In progress' },
  FLAGGED:     { dot: 'bg-red-500', label: 'Flagged' },
  FAILED:      { dot: 'bg-red-500', label: 'Failed' },
  CONDITIONAL: { dot: 'bg-etyme-attention', label: 'Conditional' },
  EXPIRED:     { dot: 'bg-etyme-faint', label: 'Expired' },
}

function formatRuleType(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

// ── Page ───────────────────────────────────────────────────

type ComplianceTab = 'policies' | 'evaluations' | 'verifications'

export default function CompliancePage() {
  const [data, setData] = useState<ComplianceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-etyme-rule/50 rounded animate-pulse" />
        <div className="h-64 bg-etyme-surface rounded-lg border border-etyme-rule animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-700 text-sm">{error}</p>
      </div>
    )
  }

  if (!data) return null

  const { health, evaluationSummary } = data

  const TABS: { key: ComplianceTab; label: string; count?: number }[] = [
    { key: 'policies', label: 'Policies' },
    { key: 'evaluations', label: 'Evaluations', count: evaluationSummary.total || undefined },
    { key: 'verifications', label: 'Verifications', count: health.totalChecks || undefined },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="eyebrow mb-2">Governance</div>
        <h1 className="font-serif text-2xl text-etyme-ink tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
          Compliance overview
        </h1>
        <p className="text-sm text-etyme-muted mt-1 max-w-2xl">
          Governance policies, enforcement evaluations, and verification status at {data.client.name}.
          Every cleared requisition records the basis on which it cleared.
        </p>
      </div>

      {/* Health summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Clear rate"
          value={`${health.clearPercentage}%`}
          tone={health.clearPercentage >= 90 ? 'verified' : health.clearPercentage >= 70 ? 'attention' : 'danger'}
        />
        <StatCard label="Total checks" value={health.totalChecks} />
        <StatCard label="Clear" value={health.clear} tone="verified" />
        <StatCard label="Pending" value={health.pending} tone={health.pending > 0 ? 'attention' : undefined} />
        <StatCard label="Flagged" value={health.flagged} tone={health.flagged > 0 ? 'danger' : undefined} />
        <StatCard label="Evaluations" value={evaluationSummary.total} sub={
          `${evaluationSummary.pass} pass · ${evaluationSummary.warn} warn · ${evaluationSummary.block} block`
        } />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-etyme-rule">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`
              px-4 py-2.5 text-[13px] -mb-px flex items-center gap-2 transition-colors
              border-b-2
              ${tab === t.key
                ? 'text-etyme-ink font-semibold border-etyme-ink'
                : 'text-etyme-muted border-transparent hover:text-etyme-ink'
              }
            `}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`
                text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums
                ${tab === t.key
                  ? 'bg-etyme-ink text-white'
                  : 'bg-etyme-canvas text-etyme-muted'
                }
              `}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'policies' && <PoliciesTab policies={data.policies} />}
      {tab === 'evaluations' && <EvaluationsTab evaluations={data.recentEvaluations} summary={evaluationSummary} />}
      {tab === 'verifications' && <VerificationsTab verifications={data.verifications} />}
    </div>
  )
}

// ── Policies tab ──────────────────────────────────────────

function PoliciesTab({ policies }: { policies: ComplianceData['policies'] }) {
  if (policies.length === 0) {
    return (
      <div className="bg-etyme-surface rounded-lg border border-etyme-rule p-8 text-center">
        <p className="text-etyme-muted text-sm">No governance policies configured.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {policies.map(policy => (
        <div key={policy.id} className="bg-etyme-surface rounded-lg border border-etyme-rule overflow-hidden">
          <div className="px-5 py-4 border-b border-etyme-rule">
            <h3 className="text-sm font-semibold text-etyme-ink">{policy.name}</h3>
            {policy.description && (
              <p className="text-xs text-etyme-muted mt-1">{policy.description}</p>
            )}
          </div>
          <div className="divide-y divide-etyme-rule/50">
            {policy.rules.map(rule => {
              const enforcement = ENFORCEMENT_CONFIG[rule.enforcementMode] ?? {
                label: rule.enforcementMode,
                bg: 'bg-etyme-rule/40',
                text: 'text-etyme-muted',
              }
              return (
                <div key={rule.id} className="px-5 py-3.5 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-etyme-ink">
                        {formatRuleType(rule.ruleType)}
                      </span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${enforcement.bg} ${enforcement.text}`}>
                        {enforcement.label}
                      </span>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-etyme-muted mt-1">{rule.description}</p>
                    )}
                    {rule.parameters && (
                      <p className="text-[11px] text-etyme-faint mt-1 font-mono">
                        {formatParameters(rule.parameters)}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs tabular-nums text-etyme-muted">
                      {rule.evaluationCount} eval{rule.evaluationCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )
            })}
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
      const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()
      if (Array.isArray(v)) return `${label}: ${JSON.stringify(v)}`
      return `${label}: ${v}`
    })
    .join(' · ')
}

// ── Evaluations tab ───────────────────────────────────────

function EvaluationsTab({
  evaluations,
  summary,
}: {
  evaluations: ComplianceData['recentEvaluations']
  summary: ComplianceData['evaluationSummary']
}) {
  if (evaluations.length === 0) {
    return (
      <div className="bg-etyme-surface rounded-lg border border-etyme-rule p-8 text-center">
        <p className="text-etyme-muted text-sm">No evaluations in the last 90 days.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-etyme-muted">
        Last 90 days: {summary.pass} passed, {summary.warn} warned, {summary.block} blocked.
        {summary.overridden > 0 && ` ${summary.overridden} overridden.`}
      </p>

      <div className="bg-etyme-surface rounded-lg border border-etyme-rule overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-etyme-rule">
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Rule</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Trigger</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Outcome</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Reason</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-etyme-faint font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.map((ev) => {
                const outcomeConfig = OUTCOME_CONFIG[ev.outcome] ?? {
                  label: ev.outcome,
                  bg: 'bg-etyme-rule/40',
                  text: 'text-etyme-muted',
                }
                return (
                  <tr key={ev.id} className="border-b border-etyme-rule/50 hover:bg-etyme-canvas/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-etyme-ink text-xs">{formatRuleType(ev.ruleType)}</div>
                      <div className="text-[10px] text-etyme-faint mt-0.5">{ev.enforcementMode}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-etyme-muted">
                      {ev.triggerPoint.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${outcomeConfig.bg} ${outcomeConfig.text}`}>
                        {outcomeConfig.label}
                      </span>
                      {ev.overriddenBy && (
                        <div className="text-[10px] text-etyme-action mt-0.5">
                          Overridden{ev.overrideNote ? `: ${ev.overrideNote}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-etyme-muted max-w-[300px]">
                      {ev.reason ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-etyme-muted tabular-nums whitespace-nowrap">
                      {new Date(ev.evaluatedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Verifications tab ─────────────────────────────────────

function VerificationsTab({ verifications }: { verifications: ComplianceData['verifications'] }) {
  const hasPersons = verifications.persons.length > 0
  const hasCompanies = verifications.companies.length > 0

  if (!hasPersons && !hasCompanies) {
    return (
      <div className="bg-etyme-surface rounded-lg border border-etyme-rule p-8 text-center">
        <p className="text-etyme-muted text-sm">No verifications found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Person verifications */}
      {hasPersons && (
        <div>
          <h3 className="text-sm font-semibold text-etyme-ink mb-3">Contractor verifications</h3>
          <div className="bg-etyme-surface rounded-lg border border-etyme-rule overflow-hidden divide-y divide-etyme-rule/50">
            {verifications.persons.map(person => (
              <div key={person.personId} className="px-5 py-4">
                <div className="text-sm font-medium text-etyme-ink mb-2">{person.name}</div>
                <div className="flex flex-wrap gap-3">
                  {person.checks.map((check, i) => {
                    const status = VERIF_STATUS_CONFIG[check.status] ?? {
                      dot: 'bg-etyme-faint',
                      label: check.status,
                    }
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs bg-etyme-canvas/80 rounded px-2.5 py-1.5"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        <span className="text-etyme-muted">{formatRuleType(check.type)}</span>
                        <span className="text-etyme-faint">·</span>
                        <span className="text-etyme-ink font-medium">{status.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Company verifications */}
      {hasCompanies && (
        <div>
          <h3 className="text-sm font-semibold text-etyme-ink mb-3">Vendor verifications</h3>
          <div className="bg-etyme-surface rounded-lg border border-etyme-rule overflow-hidden divide-y divide-etyme-rule/50">
            {verifications.companies.map(company => (
              <div key={company.companyId} className="px-5 py-4">
                <div className="text-sm font-medium text-etyme-ink mb-2">{company.name}</div>
                <div className="flex flex-wrap gap-3">
                  {company.checks.map((check, i) => {
                    const status = VERIF_STATUS_CONFIG[check.status] ?? {
                      dot: 'bg-etyme-faint',
                      label: check.status,
                    }
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs bg-etyme-canvas/80 rounded px-2.5 py-1.5"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        <span className="text-etyme-muted">{formatRuleType(check.type)}</span>
                        <span className="text-etyme-faint">·</span>
                        <span className="text-etyme-ink font-medium">{status.label}</span>
                        {check.expiresAt && (
                          <>
                            <span className="text-etyme-faint">·</span>
                            <span className="text-etyme-faint tabular-nums">
                              exp {new Date(check.expiresAt).toLocaleDateString('en-US', {
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────

function StatCard({ label, value, sub, tone }: {
  label: string
  value: number | string
  sub?: string
  tone?: 'verified' | 'attention' | 'danger' | 'action'
}) {
  const toneClasses = {
    verified: 'text-etyme-verified',
    attention: 'text-etyme-attention',
    danger: 'text-red-600',
    action: 'text-etyme-action',
  }

  return (
    <div className="bg-etyme-surface rounded-lg border border-etyme-rule p-4">
      <div className="text-[10px] uppercase tracking-wider text-etyme-faint font-medium">
        {label}
      </div>
      <div className={`font-serif text-2xl mt-1 ${tone ? toneClasses[tone] : 'text-etyme-ink'}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-etyme-faint mt-0.5">{sub}</div>
      )}
    </div>
  )
}
