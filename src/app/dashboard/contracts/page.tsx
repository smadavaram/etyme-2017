'use client'

import { useEffect, useState, useCallback } from 'react'
import { compact } from '@/lib/money-display'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, type Column } from '@/components/data-table'
import { useSession } from '@/components/session-provider'
import { pageFraming } from '@/lib/page-framing'

/**
 * Contracts working surface — sell and buy side.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *
 * Sell contracts → what you bill clients (revenue).
 * Buy contracts → what you pay talent (cost).
 * Filter tabs partition by state group (Active, Draft, Ended).
 */

// ── Types ──────────────────────────────────────────────────

interface Contract {
  id: string
  side: 'sell' | 'buy'
  /** The employer on a sell contract — whose company this actually is. */
  companyId: string
  personId: string
  personName: string
  counterpartyName: string | null
  endClientName: string | null  // where the consultant actually works
  viaName: string | null        // paying customer when different from end client
  workLocationLabel: string | null
  rate: number
  currency: string
  state: string
  startDate: string
  endDate: string | null
  daysUntilEnd: number | null
  /** The team lead named to approve this contract's timesheets, if any. */
  approverId: string | null
  approverName: string | null
}

// ── Helpers ────────────────────────────────────────────────

type ViewTab = 'sell' | 'buy'
type StateFilter = 'all' | 'active' | 'draft' | 'ended' | 'bench'

function stateLabel(state: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING_VERIFICATION: 'Pending',
    VERIFIED: 'Verified',
    IN_PROGRESS: 'Active',
    BENCH_PAID: 'Bench (Paid)',
    INTERNAL: 'Internal',
    TRAINING: 'Training',
    PAUSED: 'Paused',
    ENDED: 'Ended',
    CANCELLED: 'Cancelled',
  }
  return labels[state] ?? state
}

function stateChipClass(state: string): string {
  switch (state) {
    case 'IN_PROGRESS':
    case 'VERIFIED':
      return 'chip--verified'
    case 'PENDING_VERIFICATION':
    case 'DRAFT':
      return 'chip--action'
    case 'BENCH_PAID':
    case 'TRAINING':
      return 'chip--attention'
    case 'INTERNAL':
      return 'chip--action'
    case 'PAUSED':
    case 'ENDED':
    case 'CANCELLED':
    default:
      return 'chip--passive'
  }
}

const ACTIVE_STATES = ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION']
const DRAFT_STATES = ['DRAFT']
const ENDED_STATES = ['ENDED', 'CANCELLED', 'PAUSED']
const BENCH_STATES = ['BENCH_PAID', 'INTERNAL', 'TRAINING']

function matchesFilter(state: string, filter: StateFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'active') return ACTIVE_STATES.includes(state)
  if (filter === 'draft') return DRAFT_STATES.includes(state)
  if (filter === 'ended') return ENDED_STATES.includes(state)
  if (filter === 'bench') return BENCH_STATES.includes(state)
  return true
}

// ── Create Contract Modal ─────────────────────────────────

interface ClientCompanyOption {
  id: string
  name: string
}

interface ConsultantOption {
  personId: string
  name: string
}

/**
 * "As a delivery I will have team leads assigned to manage and approve
 * timesheets for the project." — this is the assigning. Anybody named
 * here can approve this one contract's timesheets on the employer's
 * side without needing timesheets.approve at all; see
 * src/lib/timesheet-authority.ts.
 */
function ApproverModal({
  contract,
  onClose,
  onAssigned,
}: {
  contract: Contract
  onClose: () => void
  onAssigned: (message: string) => void
}) {
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [selected, setSelected] = useState(contract.approverId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/access')
        const body = await res.json()
        if (!res.ok) throw new Error(body.error?.message ?? 'Could not load your team')
        const list = (body.data?.people ?? [])
          .map((g: any) => g.person)
          .filter((p: any) => p && p.id !== contract.personId)
        // De-duplicated — one person can hold more than one context.
        const byId = new Map<string, { id: string; name: string }>(
          list.map((p: { id: string; name: string }) => [p.id, p])
        )
        setMembers([...byId.values()])
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoadingMembers(false)
      }
    }
    load()
  }, [contract.personId])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${contract.id}/approver`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approverPersonId: selected || null }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not save')
      onAssigned(body.data?.message ?? 'Saved')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-sm mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Who approves this contract's hours?</h2>
          <button onClick={onClose} className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="text-xs text-etyme-muted mb-4">
          {contract.personName}'s timesheets on this contract. Left blank, anybody at your
          company with approval rights can approve it, same as today.
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        {loadingMembers ? (
          <div className="text-sm text-etyme-muted animate-pulse py-6 text-center">Loading your team…</div>
        ) : (
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                       focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action mb-4"
          >
            <option value="">— Anyone with approval rights —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm" disabled={saving}>
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary flex-1 text-sm" disabled={saving || loadingMembers}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateContractModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    personId: '',
    clientCompanyId: '',
    endClientCompanyId: '',
    workLocationId: '',
    billRate: '',
    payRate: '',
    billCurrency: 'USD',
    payCurrency: 'USD',
    startDate: '',
    endDate: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [consultants, setConsultants] = useState<ConsultantOption[]>([])
  const [clientCompanies, setClientCompanies] = useState<ClientCompanyOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)

  // Fetch company context, consultants, and client companies on mount
  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true)
      try {
        const [meRes, consultantsRes, contractsRes] = await Promise.all([
          fetch('/api/me'),
          fetch('/api/consultants?limit=100'),
          fetch('/api/contracts?side=sell&limit=100'),
        ])

        // Get user's company ID
        if (meRes.ok) {
          const meBody = await meRes.json()
          setCompanyId(meBody.data?.companyId ?? meBody.data?.membership?.companyId ?? null)
        }

        // Get consultants for dropdown
        if (consultantsRes.ok) {
          const body = await consultantsRes.json()
          const mapped = (body.data?.consultants ?? []).map((c: any) => ({
            personId: c.personId,
            name: c.person?.name ?? c.name ?? 'Unknown',
          }))
          setConsultants(mapped)
        }

        // Extract unique client companies from existing sell contracts
        if (contractsRes.ok) {
          const body = await contractsRes.json()
          const rawContracts = body.data?.contracts ?? []
          const seen = new Map<string, string>()
          for (const c of rawContracts) {
            if (c.clientCompany?.id && c.clientCompany?.name) {
              seen.set(c.clientCompany.id, c.clientCompany.name)
            }
            if (c.endClientCompany?.id && c.endClientCompany?.name) {
              seen.set(c.endClientCompany.id, c.endClientCompany.name)
            }
          }
          setClientCompanies(
            Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
          )
        }
      } catch {
        // Options loading is best-effort
      } finally {
        setLoadingOptions(false)
      }
    }
    loadOptions()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    if (!companyId) {
      setError('Could not determine your company. Please reload and try again.')
      setSubmitting(false)
      return
    }

    const billRateNum = parseFloat(form.billRate)
    if (isNaN(billRateNum) || billRateNum <= 0) {
      setError('Bill rate must be a positive number.')
      setSubmitting(false)
      return
    }

    const payload: Record<string, unknown> = {
      personId: form.personId,
      companyId,
      clientCompanyId: form.clientCompanyId,
      billRate: Math.round(billRateNum * 100), // convert $/hr to cents/hr
      billCurrency: form.billCurrency,
      startDate: form.startDate,
    }

    if (form.endClientCompanyId) {
      payload.endClientCompanyId = form.endClientCompanyId
    }
    if (form.workLocationId) {
      payload.workLocationId = form.workLocationId
    }
    if (form.endDate) {
      payload.endDate = form.endDate
    }

    if (form.payRate) {
      const payRateNum = parseFloat(form.payRate)
      if (isNaN(payRateNum) || payRateNum <= 0) {
        setError('Pay rate must be a positive number if provided.')
        setSubmitting(false)
        return
      }
      payload.payRate = Math.round(payRateNum * 100)
      payload.payCurrency = form.payCurrency
    }

    try {
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json()
        setError(body.error?.message ?? 'Failed to create contract')
        return
      }

      onCreated()
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = `w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                      focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action`
  const selectClass = `w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                       focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action`
  const labelClass = 'block text-xs font-semibold text-etyme-muted mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-2xl mx-4 animate-slide-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Create contract</h2>
          <button onClick={onClose} className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {loadingOptions ? (
          <div className="text-sm text-etyme-muted animate-pulse py-8 text-center">Loading options…</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Consultant */}
            <div>
              <label className={labelClass}>Consultant *</label>
              <select
                required
                value={form.personId}
                onChange={(e) => setForm({ ...form, personId: e.target.value })}
                className={selectClass}
              >
                <option value="">Select consultant…</option>
                {consultants.map((c) => (
                  <option key={c.personId} value={c.personId}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Client (bill to) and End client */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Client (bill to) *</label>
                <select
                  required
                  value={form.clientCompanyId}
                  onChange={(e) => setForm({ ...form, clientCompanyId: e.target.value })}
                  className={selectClass}
                >
                  <option value="">Select client…</option>
                  {clientCompanies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>End client (where consultant works)</label>
                <select
                  value={form.endClientCompanyId}
                  onChange={(e) => setForm({ ...form, endClientCompanyId: e.target.value })}
                  className={selectClass}
                >
                  <option value="">Same as billing client</option>
                  {clientCompanies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-etyme-faint mt-1">Leave empty if same as billing client</p>
              </div>
            </div>

            {/* Bill rate and currency */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className={labelClass}>Bill rate ($/hr) *</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={form.billRate}
                  onChange={(e) => setForm({ ...form, billRate: e.target.value })}
                  className={inputClass}
                  placeholder="125.00"
                />
              </div>
              <div>
                <label className={labelClass}>Currency</label>
                <select
                  value={form.billCurrency}
                  onChange={(e) => setForm({ ...form, billCurrency: e.target.value })}
                  className={selectClass}
                >
                  <option value="USD">USD</option>
                  <option value="CAD">CAD</option>
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            {/* Pay rate and currency */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className={labelClass}>Pay rate ($/hr)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.payRate}
                  onChange={(e) => setForm({ ...form, payRate: e.target.value })}
                  className={inputClass}
                  placeholder="95.00"
                />
                <p className="text-[10px] text-etyme-faint mt-1">Creates a linked buy contract</p>
              </div>
              <div>
                <label className={labelClass}>Pay currency</label>
                <select
                  value={form.payCurrency}
                  onChange={(e) => setForm({ ...form, payCurrency: e.target.value })}
                  className={selectClass}
                >
                  <option value="USD">USD</option>
                  <option value="CAD">CAD</option>
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Start date *</label>
                <input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>End date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className={inputClass}
                />
                <p className="text-[10px] text-etyme-faint mt-1">Leave empty for open-ended</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
                {submitting ? 'Creating…' : 'Create contract'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Contract Detail Drawer ────────────────────────────────

function ContractDetailDrawer({
  contract,
  tab,
  onClose,
  onToast,
  onRefresh,
}: {
  contract: Contract
  tab: ViewTab
  onClose: () => void
  onToast: (message: string, type: 'success' | 'error') => void
  onRefresh: () => void
}) {
  const [showExtendConfirm, setShowExtendConfirm] = useState(false)
  const [showRolloffConfirm, setShowRolloffConfirm] = useState(false)
  const [extending, setExtending] = useState(false)
  const [initiatingRolloff, setInitiatingRolloff] = useState(false)
  const [activating, setActivating] = useState(false)
  const [governanceWarn, setGovernanceWarn] = useState<{ message: string; evaluations: any[] } | null>(null)
  const [overrideReason, setOverrideReason] = useState('')

  const isActive = contract.state === 'IN_PROGRESS'
  const isDraft = contract.state === 'DRAFT'
  const isPending = contract.state === 'PENDING_VERIFICATION'
  const isPaused = contract.state === 'PAUSED'
  const canActivate = isDraft || isPending
  const canCancel = isDraft || isPending
  const canPause = isActive
  const canResume = isPaused
  const canComplete = isActive
  const isRolloff = contract.daysUntilEnd != null && contract.daysUntilEnd >= 0 && contract.daysUntilEnd <= 28
  const drawerRateLabel = tab === 'sell' ? 'Bill rate' : 'Pay rate'
  const drawerCounterpartyLabel = tab === 'sell' ? 'Client' : 'Vendor'

  // Three-party: endClientName differs from counterpartyName
  const hasThreeParty = contract.endClientName
    && contract.counterpartyName
    && contract.endClientName !== contract.counterpartyName

  const dateOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }

  async function handleExtend() {
    setExtending(true)
    try {
      const extensionMonths = 3
      const currentEnd = contract.endDate ? new Date(contract.endDate) : new Date()
      const newEnd = new Date(currentEnd)
      newEnd.setMonth(newEnd.getMonth() + extensionMonths)

      const res = await fetch(`/api/contracts/${contract.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extensionMonths, newEndDate: newEnd.toISOString() }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        onToast(body.error?.message ?? 'Failed to extend contract', 'error')
        return
      }

      onToast('Contract extended by 3 months', 'success')
      setShowExtendConfirm(false)
      onRefresh()
      onClose()
    } catch {
      onToast('Network error. Please try again.', 'error')
    } finally {
      setExtending(false)
    }
  }

  async function handleRolloff() {
    setInitiatingRolloff(true)
    try {
      const res = await fetch(`/api/contracts/${contract.id}/rolloff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        onToast(body.error?.message ?? 'Failed to initiate rolloff', 'error')
        return
      }

      onToast('Rolloff initiated', 'success')
      setShowRolloffConfirm(false)
      onRefresh()
      onClose()
    } catch {
      onToast('Network error. Please try again.', 'error')
    } finally {
      setInitiatingRolloff(false)
    }
  }

  async function handleActivation(action: string, label: string, overrideReasonText?: string) {
    setActivating(true)
    try {
      const payload: Record<string, string> = { action }
      if (overrideReasonText) payload.overrideReason = overrideReasonText

      const res = await fetch(`/api/contracts/${contract.id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))

        // Governance warning — show override prompt
        if (body.error?.code === 'GOVERNANCE_WARN' && body.error?.overridable) {
          setGovernanceWarn({
            message: body.error.message,
            evaluations: body.error.evaluations ?? [],
          })
          return
        }

        // Governance block — show but don't allow override
        if (body.error?.code === 'GOVERNANCE_BLOCK') {
          onToast(`⛔ ${body.error.message}`, 'error')
          return
        }

        onToast(body.error?.message ?? `Failed to ${label.toLowerCase()} contract`, 'error')
        return
      }

      setGovernanceWarn(null)
      setOverrideReason('')
      onToast(`Contract ${label.toLowerCase()}d`, 'success')
      onRefresh()
      onClose()
    } catch {
      onToast('Network error. Please try again.', 'error')
    } finally {
      setActivating(false)
    }
  }

  async function handleGovernanceOverride() {
    if (!overrideReason.trim()) return
    setGovernanceWarn(null)
    await handleActivation('activate', 'Activate', overrideReason)
    setOverrideReason('')
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white h-full shadow-xl overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-etyme-rule flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{contract.personName}</h2>
              <span className={`chip ${stateChipClass(contract.state)}`}>
                {stateLabel(contract.state)}
              </span>
            </div>
            <p className="text-[11px] text-etyme-faint font-mono mt-1">{contract.id.slice(0, 12)}…</p>
          </div>
          <button onClick={onClose} className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Rolloff warning */}
          {isRolloff && isActive && (
            <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-2">
                <span className="evidence-dot evidence-dot--pending" />
                <span className="text-sm font-semibold text-amber-800">
                  {contract.daysUntilEnd === 0
                    ? 'Contract ends today'
                    : `Contract ends in ${contract.daysUntilEnd} day${contract.daysUntilEnd !== 1 ? 's' : ''}`}
                </span>
              </div>
              <p className="text-xs text-amber-700 mt-1 ml-4">
                Extend or initiate rolloff before the end date.
              </p>
            </div>
          )}

          {/* Key details */}
          <div>
            <p className="eyebrow mb-2">Key details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="stat-label">{drawerCounterpartyLabel}</p>
                <p className="text-sm font-medium text-etyme-ink mt-0.5">
                  {contract.counterpartyName ?? '—'}
                </p>
              </div>
              <div>
                <p className="stat-label">{drawerRateLabel}</p>
                <p className="text-sm font-medium tabular-nums text-etyme-ink mt-0.5">
                  {compact(contract.rate)}/hr
                  <span className="text-etyme-faint text-[11px] ml-1">{contract.currency}</span>
                </p>
              </div>
              <div>
                <p className="stat-label">Start date</p>
                <p className="text-sm tabular-nums mt-0.5">
                  {new Date(contract.startDate).toLocaleDateString('en-US', dateOpts)}
                </p>
              </div>
              <div>
                <p className="stat-label">End date</p>
                <p className={`text-sm tabular-nums mt-0.5 ${isRolloff ? 'text-etyme-attention font-medium' : ''}`}>
                  {contract.endDate
                    ? new Date(contract.endDate).toLocaleDateString('en-US', dateOpts)
                    : 'Open-ended'}
                </p>
              </div>
              <div>
                <p className="stat-label">State</p>
                <span className={`chip ${stateChipClass(contract.state)}`}>
                  {stateLabel(contract.state)}
                </span>
              </div>
            </div>
          </div>

          {/* Three-party display */}
          {hasThreeParty && (
            <div>
              <p className="eyebrow mb-2">Engagement structure</p>
              <div className="bg-etyme-canvas rounded-lg px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-etyme-muted">End client</span>
                  <span className="text-sm font-medium text-etyme-ink">{contract.endClientName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-etyme-muted">Bills via</span>
                  <span className="text-sm text-etyme-muted">{contract.counterpartyName}</span>
                </div>
              </div>
            </div>
          )}

          {/* Work location */}
          {contract.workLocationLabel && (
            <div>
              <p className="eyebrow mb-1">Work location</p>
              <p className="text-sm">{contract.workLocationLabel}</p>
            </div>
          )}

          {/* Lifecycle actions — DRAFT or PENDING contracts */}
          {(canActivate || canCancel) && (
            <>
              <hr className="border-etyme-rule" />
              <div>
                <p className="eyebrow mb-3">Contract lifecycle</p>
                <div className="flex gap-3">
                  {canActivate && (
                    <button
                      onClick={() => handleActivation('activate', 'Activate')}
                      disabled={activating}
                      className="btn-primary flex-1 disabled:opacity-50"
                    >
                      {activating ? 'Activating…' : '▶ Activate'}
                    </button>
                  )}
                  {canCancel && (
                    <button
                      onClick={() => handleActivation('cancel', 'Cancel')}
                      disabled={activating}
                      className="btn-secondary flex-1 disabled:opacity-50 text-red-600 border-red-200 hover:bg-red-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Quick actions — active contracts */}
          {isActive && (
            <>
              <hr className="border-etyme-rule" />
              <div>
                <p className="eyebrow mb-3">Quick actions</p>
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => setShowExtendConfirm(true)}
                    className="btn-primary flex-1"
                  >
                    Extend
                  </button>
                  <button
                    onClick={() => setShowRolloffConfirm(true)}
                    className="btn-secondary flex-1"
                  >
                    Initiate rolloff
                  </button>
                </div>
                <div className="flex gap-3 mt-2">
                  {canPause && (
                    <button
                      onClick={() => handleActivation('pause', 'Pause')}
                      disabled={activating}
                      className="btn-secondary flex-1 disabled:opacity-50"
                    >
                      {activating ? 'Updating…' : '⏸ Pause'}
                    </button>
                  )}
                  {canComplete && (
                    <button
                      onClick={() => handleActivation('complete', 'Complete')}
                      disabled={activating}
                      className="btn-secondary flex-1 disabled:opacity-50"
                    >
                      {activating ? 'Updating…' : '✓ Complete'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Resume — paused contracts */}
          {canResume && (
            <>
              <hr className="border-etyme-rule" />
              <div>
                <p className="eyebrow mb-3">Contract lifecycle</p>
                <button
                  onClick={() => handleActivation('resume', 'Resume')}
                  disabled={activating}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  {activating ? 'Resuming…' : '▶ Resume contract'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Extend confirmation dialog */}
      {showExtendConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
          onClick={() => setShowExtendConfirm(false)}
        >
          <div className="card w-full max-w-sm mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-2">Extend contract</h3>
            <p className="text-sm text-etyme-muted mb-4">
              Extend <strong>{contract.personName}</strong>&apos;s contract by 3 months?
              {contract.endDate && (
                <span className="block mt-1 text-[12px] tabular-nums">
                  Current end: {new Date(contract.endDate).toLocaleDateString('en-US', dateOpts)}
                  {' → '}
                  New end: {(() => {
                    const d = new Date(contract.endDate!)
                    d.setMonth(d.getMonth() + 3)
                    return d.toLocaleDateString('en-US', dateOpts)
                  })()}
                </span>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowExtendConfirm(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleExtend} disabled={extending} className="btn-primary disabled:opacity-50">
                {extending ? 'Extending…' : 'Confirm extend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rolloff confirmation dialog */}
      {showRolloffConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
          onClick={() => setShowRolloffConfirm(false)}
        >
          <div className="card w-full max-w-sm mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-2">Initiate rolloff</h3>
            <p className="text-sm text-etyme-muted mb-4">
              Start the rolloff process for <strong>{contract.personName}</strong>?
              This will notify stakeholders and begin the offboarding checklist.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRolloffConfirm(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleRolloff} disabled={initiatingRolloff} className="btn-primary disabled:opacity-50">
                {initiatingRolloff ? 'Initiating…' : 'Confirm rolloff'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Governance warning override dialog */}
      {governanceWarn && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
          onClick={() => { setGovernanceWarn(null); setOverrideReason('') }}
        >
          <div className="card w-full max-w-md mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">⚠️</span>
              <h3 className="text-base font-semibold">Governance warning</h3>
            </div>
            <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 mb-4">
              <p className="text-sm text-amber-800">{governanceWarn.message}</p>
              {governanceWarn.evaluations.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {governanceWarn.evaluations
                    .filter((e: any) => e.outcome === 'WARN')
                    .map((e: any, i: number) => (
                      <li key={i} className="text-[12px] text-amber-700">
                        • <strong>{e.ruleType}</strong>: {e.reason}
                      </li>
                    ))
                  }
                </ul>
              )}
            </div>
            <p className="text-sm text-etyme-muted mb-3">
              You can proceed by providing a justification. This will be recorded in the governance audit trail.
            </p>
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Justification for override (required)…"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg mb-4
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action
                         resize-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setGovernanceWarn(null); setOverrideReason('') }} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleGovernanceOverride}
                disabled={!overrideReason.trim() || activating}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white
                           hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {activating ? 'Activating…' : 'Override and activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────

export default function ContractsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialSide = (searchParams.get('side') === 'buy' ? 'buy' : 'sell') as ViewTab

  const { company } = useSession()
  const isClient = company?.kind === 'CLIENT'

  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<ViewTab>(initialSide)
  const [assigningApprover, setAssigningApprover] = useState<Contract | null>(null)
  const framing = pageFraming(company?.kind ?? 'VENDOR', tab === 'sell' ? 'contracts.sell' : 'contracts.buy')
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Open the create modal when navigated with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowCreate(true)
      router.replace('/dashboard/contracts', { scroll: false })
    }
  }, [searchParams, router])

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const fetchContracts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/contracts?side=${tab}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      const rawContracts = body.data?.contracts ?? []

      setContracts(rawContracts.map((c: any) => {
        // Resolve the display name: end client if set, otherwise paying customer
        const endClientName = tab === 'sell'
          ? (c.endClientCompany?.name ?? c.clientCompany?.name ?? null)
          : null
        // "via" label: show paying customer when it differs from end client
        const viaName = tab === 'sell' && c.endClientCompany && c.clientCompany
          && c.endClientCompany.id !== c.clientCompany.id
          ? c.clientCompany.name
          : null
        // Work location label
        const loc = c.workLocation
        const workLocationLabel = loc
          ? (loc.isRemote ? 'Remote' : [loc.name, loc.city, loc.state].filter(Boolean).join(', '))
          : null

        return {
          id: c.id,
          side: c.side ?? tab,
          companyId: c.companyId,
          personId: c.personId ?? c.person?.id,
          personName: c.person?.name ?? 'Unknown',
          counterpartyName: tab === 'sell'
            ? (endClientName ?? c.clientCompany?.name ?? null)
            : c.vendorCompany?.name ?? null,
          endClientName,
          viaName,
          workLocationLabel,
          rate: tab === 'sell' ? c.billRate : c.payRate,
          currency: tab === 'sell' ? (c.billCurrency ?? 'USD') : (c.payCurrency ?? 'USD'),
          state: c.state,
          startDate: c.startDate,
          endDate: c.endDate ?? null,
          daysUntilEnd: c.endDate
            ? Math.ceil((new Date(c.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
            : null,
          approverId: c.approver?.id ?? null,
          approverName: c.approver?.name ?? null,
        }
      }))
    } catch (err: any) {
      setError(err.message)
      setContracts([])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    fetchContracts()
  }, [fetchContracts])

  // Reset state filter when switching sell/buy
  useEffect(() => {
    setStateFilter('all')
  }, [tab])

  const filtered = contracts.filter(c => matchesFilter(c.state, stateFilter))

  // Stats
  const activeCount = contracts.filter(c => ACTIVE_STATES.includes(c.state)).length
  const draftCount = contracts.filter(c => DRAFT_STATES.includes(c.state)).length
  const endedCount = contracts.filter(c => ENDED_STATES.includes(c.state)).length
  const benchCount = contracts.filter(c => BENCH_STATES.includes(c.state)).length

  const rolloffWarnings = contracts.filter(
    c => c.daysUntilEnd != null && c.daysUntilEnd >= 0 && c.daysUntilEnd <= 28 && c.state === 'IN_PROGRESS'
  )

  const totalRate = contracts
    .filter(c => ['IN_PROGRESS', 'VERIFIED'].includes(c.state))
    .reduce((sum, c) => sum + (c.rate / 100), 0)

  const rateLabel = tab === 'sell' ? 'Bill rate' : 'Pay rate'
  const counterpartyLabel = tab === 'sell' ? 'Client' : 'Vendor'

  // ── Column definitions ──
  const columns: Column<Contract>[] = [
    {
      key: 'personName',
      label: 'Consultant',
      render: (row) => (
        <span className="font-medium text-etyme-ink">{row.personName}</span>
      ),
      sortValue: (row) => row.personName,
    },
    {
      key: 'counterpartyName',
      label: counterpartyLabel,
      render: (row) => (
        <div>
          <span className="text-etyme-muted">{row.counterpartyName ?? '—'}</span>
          {row.viaName && (
            <div className="text-[10px] text-etyme-faint">via {row.viaName}</div>
          )}
          {row.workLocationLabel && (
            <div className="text-[10px] text-etyme-faint">{row.workLocationLabel}</div>
          )}
        </div>
      ),
      sortValue: (row) => row.counterpartyName ?? '',
    },
    {
      key: 'rate',
      label: rateLabel,
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-etyme-ink">
          {compact(row.rate)}<span className="text-etyme-faint">/hr</span>
        </span>
      ),
      sortValue: (row) => row.rate,
    },
    // Only on your own sell contracts — assigning who approves a
    // contract's timesheets is the employer's call, never the client's,
    // and buy contracts have no timesheets of their own to approve.
    ...(tab === 'sell'
      ? [
          {
            key: 'approver',
            label: 'Approver',
            render: (row: Contract) =>
              row.companyId === company?.id ? (
                <button
                  onClick={() => setAssigningApprover(row)}
                  className="text-[12px] text-left hover:underline"
                >
                  {row.approverName ? (
                    <span className="text-etyme-ink">{row.approverName}</span>
                  ) : (
                    <span className="text-etyme-faint">Assign a team lead</span>
                  )}
                </button>
              ) : (
                <span className="text-[12px] text-etyme-faint">—</span>
              ),
            sortValue: (row: Contract) => row.approverName ?? '',
            hideOnMobile: true,
          } as Column<Contract>,
        ]
      : []),
    {
      key: 'startDate',
      label: 'Start',
      render: (row) => (
        <span className="tabular-nums text-etyme-muted text-[12px]">
          {new Date(row.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </span>
      ),
      sortValue: (row) => new Date(row.startDate).getTime(),
      hideOnMobile: true,
    },
    {
      key: 'endDate',
      label: 'End',
      render: (row) => {
        const isRolloff = row.daysUntilEnd != null && row.daysUntilEnd >= 0 && row.daysUntilEnd <= 28
        if (!row.endDate) {
          return <span className="text-etyme-faint text-[12px]">Open-ended</span>
        }
        return (
          <div>
            <span className={`tabular-nums text-[12px] ${isRolloff ? 'text-etyme-attention font-medium' : 'text-etyme-muted'}`}>
              {new Date(row.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
            {isRolloff && (
              <div className="text-[10px] text-etyme-attention">
                {row.daysUntilEnd === 0 ? 'Today' : `${row.daysUntilEnd}d left`}
              </div>
            )}
          </div>
        )
      },
      sortValue: (row) => row.endDate ? new Date(row.endDate).getTime() : Infinity,
      hideOnMobile: true,
    },
    {
      key: 'state',
      label: 'Status',
      render: (row) => (
        <span className={`chip ${stateChipClass(row.state)}`}>
          {stateLabel(row.state)}
        </span>
      ),
      sortValue: (row) => {
        const order: Record<string, number> = {
          IN_PROGRESS: 0, VERIFIED: 1, PENDING_VERIFICATION: 2,
          DRAFT: 3, BENCH_PAID: 4, INTERNAL: 5, TRAINING: 6,
          PAUSED: 7, ENDED: 8, CANCELLED: 9,
        }
        return order[row.state] ?? 10
      },
    },
  ]

  // Build filter tabs
  const SELL_FILTERS: { key: StateFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: contracts.length },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'draft', label: 'Draft', count: draftCount },
    { key: 'ended', label: 'Ended', count: endedCount },
  ]

  const BUY_FILTERS: { key: StateFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: contracts.length },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'bench', label: 'Bench & Internal', count: benchCount },
    { key: 'draft', label: 'Draft', count: draftCount },
    { key: 'ended', label: 'Ended', count: endedCount },
  ]

  const filters = tab === 'sell' ? SELL_FILTERS : BUY_FILTERS

  return (
    <>
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-up ${
          toast.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Head */}
      <div className="flex items-start justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">{framing.eyebrow}</p>
          <h1>{framing.title}</h1>
          <p>{framing.subtitle}</p>
        </div>
        {/* A client does not raise contracts here — their vendors do. */}
        {!isClient && (
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-3 shrink-0">
            + New
          </button>
        )}
      </div>

      {/* Sell / Buy tabs — a client has no buy side */}
      <div className={`flex gap-1.5 mb-6 ${isClient ? 'hidden' : ''}`}>
        {(['sell', 'buy'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`filter-tab ${tab === t ? 'filter-tab--active' : 'filter-tab--inactive'}`}
          >
            {t === 'sell' ? 'Sell' : 'Buy'}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Active</p>
          <p className="stat-value text-etyme-ink">{activeCount}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">contracts</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Rolloffs</p>
          <p className={`stat-value ${rolloffWarnings.length > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {rolloffWarnings.length}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">within 28 days</p>
        </div>
        {tab === 'sell' && (
          <div className="panel flex-1 min-w-[140px]">
            <p className="stat-label">Active bill rates</p>
            <p className="stat-value text-etyme-verified">
              ${totalRate.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-etyme-faint mt-0.5">total $/hr</p>
          </div>
        )}
      </div>

      {/* Rolloff warnings banner */}
      {rolloffWarnings.length > 0 && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="evidence-dot evidence-dot--pending" />
            <span className="text-sm font-semibold text-amber-800">
              {rolloffWarnings.length} contract{rolloffWarnings.length !== 1 ? 's' : ''} ending within 28 days
            </span>
          </div>
          <div className="ml-4 space-y-1">
            {rolloffWarnings.map((c) => (
              <p key={c.id} className="text-xs text-amber-700">
                <strong>{c.personName}</strong>
                {c.counterpartyName && ` at ${c.counterpartyName}`}
                {' — '}
                {c.daysUntilEnd === 0
                  ? 'ends today'
                  : `${c.daysUntilEnd} day${c.daysUntilEnd !== 1 ? 's' : ''} remaining`}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* DataTable with state filter tabs */}
      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchPlaceholder={`Search by consultant${tab === 'sell' ? ', client' : ', vendor'}…`}
        searchFilter={(row, q) =>
          row.personName.toLowerCase().includes(q) ||
          (row.counterpartyName?.toLowerCase().includes(q) ?? false) ||
          stateLabel(row.state).toLowerCase().includes(q)
        }
        emptyMessage={
          stateFilter === 'all'
            ? `No ${tab} contracts yet.`
            : `No ${stateFilter} ${tab} contracts.`
        }
        emptyDetail={
          tab === 'sell'
            ? 'Sell contracts are created when a submission is accepted or via import.'
            : 'Buy contracts track what you pay — created alongside sell contracts or for bench/internal employees.'
        }
        exportName={`${tab}-contracts`}
        onRowClick={(row) => setSelectedContract(row)}
        filters={
          <div className="flex gap-1.5">
            {filters.map(f => (
              <button
                key={f.key}
                onClick={() => setStateFilter(f.key)}
                className={`filter-tab ${stateFilter === f.key ? 'filter-tab--active' : 'filter-tab--inactive'}`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        }
        rowClassName={(row) =>
          row.daysUntilEnd != null && row.daysUntilEnd >= 0 && row.daysUntilEnd <= 28
            ? '!bg-amber-50/30'
            : ''
        }
      />

      {/* Contract detail drawer */}
      {selectedContract && (
        <ContractDetailDrawer
          contract={selectedContract}
          tab={tab}
          onClose={() => setSelectedContract(null)}
          onToast={(message, type) => setToast({ type, message })}
          onRefresh={fetchContracts}
        />
      )}

      {/* Create contract modal */}
      {showCreate && (
        <CreateContractModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setToast({ type: 'success', message: 'Contract created successfully.' })
            fetchContracts()
          }}
        />
      )}

      {/* Assign this contract's timesheet approver */}
      {assigningApprover && (
        <ApproverModal
          contract={assigningApprover}
          onClose={() => setAssigningApprover(null)}
          onAssigned={(message) => {
            setAssigningApprover(null)
            setToast({ type: 'success', message })
            fetchContracts()
          }}
        />
      )}
    </>
  )
}
