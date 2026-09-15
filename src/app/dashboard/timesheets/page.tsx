'use client'

import { useEffect, useState, useCallback } from 'react'
import { amount, compact } from '@/lib/money-display'
import { useRouter, useSearchParams } from 'next/navigation'
import { ListSurface, type Column } from '@/components/list-surface'
import { useSession } from '@/components/session-provider'
import { pageFraming } from '@/lib/page-framing'
import { says as overtimeTerms } from '@/lib/overtime'

/**
 * Timesheets working surface — the Operate section.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * Timesheets live on the sell side — tracking billable hours against
 * a SellContract. Status lifecycle: OPEN → SUBMITTED → APPROVED
 * or → REJECTED at any point.
 *
 * CLAUDE.md (hard things): "Cycle generation. Nineteen kinds, five
 * frequencies... Port the arithmetic, not the architecture, and
 * write the tests first." Timesheets reference cycle periods but
 * the cycle engine is built separately.
 *
 * Anomaly detection: the API flags > 12hr days and > 60hr weeks.
 * This page surfaces those flags visually.
 */

// ── Types ────────────────────────────────────────────

interface Timesheet {
  id: string
  person: { id: string; name: string }
  sellContract: {
    id: string
    clientCompany: { id: string; name: string }
    engagement: { id: string; title: string } | null
  }
  /**
   * Whose rate this row carries, and whether there is one.
   *
   * The server decides. A client is shown what it pays — walked up the
   * chain, never the leg its supplier buys on — and a consultant is
   * shown their own pay and never the bill rate taken out of it.
   * `cents` is null where the paper cannot say, and `says` is the
   * sentence that goes in the blank's place.
   */
  rate: {
    cents: number | null
    currency: string | null
    basis: 'BILL' | 'PAY'
    label: string
    says: string | null
  }
  periodStart: string
  periodEnd: string
  totalHours: number
  status: string
  anomalyScore: number | null
  anomalyReason: string | null
  approvedAt: string | null
  /** Whether the server would let this seat sign this week. */
  mayApprove: boolean
  mayApproveWhyNot: string | null
  /** Whether this seat may file or send these hours. */
  maySubmit: boolean
  overtime?: OvertimeState | null
}

/**
 * What this sheet's overtime weeks are waiting for, and what they were
 * already told.
 *
 * A multiplier on a contract is an offer, not an outcome: a week over
 * the threshold is worth nothing extra until whoever signs it says so.
 * The list carries the question so a row can say it holds one, rather
 * than the reader finding out by pressing Approve and being refused.
 */
interface PendingWeek {
  weekOf: string
  workedHours: number
  overtimeHours: number
}

interface OvertimeState {
  afterHours: number | null
  multiplierBps: number
  /** Null where this reader is owed no rate for this row. */
  rateCents: number | null
  /**
   * What this sheet is worth at this reader's own rate. Never includes
   * an undecided hour, and null where there is no rate to price it at.
   */
  billableCents: number | null
  pendingHours: number
  bankedHours: number
  leaveHours: number
  weeks: PendingWeek[]
  decided: { weekOf: string; hours: number; says: string }[]
  says: string | null
}

type StatusFilter = 'ALL' | 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'

/**
 * What this week is worth to the person reading it, or nothing.
 *
 * Priced from what somebody decided about each week rather than from
 * the multiplier sitting on the contract, and left blank where the
 * server could not name a rate — a row valued at an unknown rate of
 * zero is a wrong number wearing a right one's clothes.
 */
function centsOf(t: Timesheet): number | null {
  if (t.overtime) return t.overtime.billableCents
  if (t.rate.cents == null) return null
  return t.totalHours * t.rate.cents
}

// ── Status chip class ───────────────────────────────

function statusChipClass(status: string): string {
  const map: Record<string, string> = {
    OPEN:      'chip--passive',
    SUBMITTED: 'chip--action',
    APPROVED:  'chip--verified',
    REJECTED:  'chip--danger',
  }
  return map[status] ?? 'chip--passive'
}

// ── Period formatting ────────────────────────────────

function formatPeriod(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

  // Same month → "Aug 1 – 15"
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString('en-US', opts)} – ${e.getDate()}`
  }
  // Different months → "Jul 28 – Aug 10"
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`
}

// ── Create Timesheet Modal ──────────────────────────

interface ContractOption {
  id: string
  personName: string
  clientName: string
  billRate: number
}

function getWeekDates(start: Date): string[] {
  const dates: string[] = []
  const d = new Date(start)
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  return monday
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function CreateTimesheetModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (msg: string) => void
}) {
  const [contracts, setContracts] = useState<ContractOption[]>([])
  const [contractId, setContractId] = useState('')
  const [weekStart, setWeekStart] = useState(() => {
    const mon = getMonday(new Date())
    return mon.toISOString().slice(0, 10)
  })
  const [hours, setHours] = useState<Record<string, number>>({})
  // Which of those hours were paid time off taken out of the bank,
  // rather than worked. Per day, because the overtime threshold is a
  // weekly judgment and leave must never count toward it.
  const [leave, setLeave] = useState<Record<string, number>>({})
  const [showLeave, setShowLeave] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch active sell contracts for the dropdown
  useEffect(() => {
    fetch('/api/contracts?side=sell&state=IN_PROGRESS&limit=100')
      .then((r) => r.json())
      .then((body) => {
        const list = (body.data?.contracts ?? []).map((c: any) => ({
          id: c.id,
          personName: c.person?.name ?? 'Unknown',
          clientName: c.endClientCompany?.name ?? c.clientCompany?.name ?? 'Unknown',
          billRate: c.billRate,
        }))
        setContracts(list)
        if (list.length === 1) setContractId(list[0].id)
      })
      .catch(() => {})
  }, [])

  const weekDates = getWeekDates(new Date(weekStart + 'T00:00:00'))
  const totalHrs = Object.values(hours).reduce((s, h) => s + h, 0)
  const selectedContract = contracts.find((c) => c.id === contractId)
  const estimatedValue = selectedContract
    ? totalHrs * (selectedContract.billRate / 100)
    : 0

  function setDayHours(date: string, val: string) {
    const num = parseFloat(val)
    if (val === '' || isNaN(num)) {
      const next = { ...hours }
      delete next[date]
      setHours(next)
    } else {
      setHours({ ...hours, [date]: Math.max(0, Math.min(24, num)) })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!contractId) {
      setError('Select a sell contract')
      return
    }
    if (totalHrs === 0) {
      setError('Enter at least some hours')
      return
    }

    setSubmitting(true)
    setError(null)

    // Build days object — only include dates with hours > 0
    const days: Record<string, number> = {}
    for (const [date, h] of Object.entries(hours)) {
      if (h > 0) days[date] = h
    }

    const leaveDays: Record<string, number> = {}
    for (const [date, h] of Object.entries(leave)) {
      if (h > 0 && (days[date] ?? 0) > 0) leaveDays[date] = Math.min(h, days[date])
    }

    const periodEnd = weekDates[weekDates.length - 1]

    try {
      const res = await fetch('/api/timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellContractId: contractId,
          periodStart: weekStart,
          periodEnd,
          days,
          leaveDays,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Failed to create timesheet')
        return
      }

      const body = await res.json()
      const msg = body.data?.message ?? `Timesheet created: ${totalHrs}h`
      onCreated(msg)
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-2xl mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Create timesheet</h2>
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

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Contract selector */}
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Sell contract *</label>
            <select
              required
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
            >
              <option value="">Select a contract…</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.personName} — {c.clientName} ({compact(c.billRate)}/hr)
                </option>
              ))}
            </select>
          </div>

          {/* Week selector */}
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Week starting</label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => {
                const d = new Date(e.target.value + 'T00:00:00')
                const mon = getMonday(d)
                setWeekStart(mon.toISOString().slice(0, 10))
                setHours({})
              }}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
            />
          </div>

          {/* Daily hours grid */}
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-2">Hours per day</label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {weekDates.map((date, i) => {
                const isWeekend = i >= 5
                return (
                  <div key={date} className="text-center">
                    <div className={`text-[10px] font-semibold mb-1 ${isWeekend ? 'text-etyme-faint' : 'text-etyme-muted'}`}>
                      {DAY_LABELS[i]}
                    </div>
                    <div className={`text-[10px] tabular-nums mb-1.5 ${isWeekend ? 'text-etyme-faint' : 'text-etyme-muted'}`}>
                      {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={hours[date] ?? ''}
                      onChange={(e) => setDayHours(date, e.target.value)}
                      placeholder={isWeekend ? '0' : '8'}
                      className={`w-full px-1 py-2 text-sm text-center tabular-nums border rounded-lg
                                  focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action
                                  ${isWeekend ? 'border-etyme-rule/50 bg-etyme-canvas/50' : 'border-etyme-rule'}`}
                    />
                  </div>
                )
              })}
            </div>

            {/* Paid time off inside those hours */}
            <div className="mt-3">
              {!showLeave ? (
                <button
                  type="button"
                  onClick={() => setShowLeave(true)}
                  className="text-[11px] text-etyme-action hover:underline"
                >
                  Some of these hours were paid time off
                </button>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-etyme-muted mb-2">
                    Of those, paid time off
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {weekDates.map((date, i) => (
                      <div key={date} className="text-center">
                        <div className="text-[10px] text-etyme-faint mb-1">{DAY_LABELS[i]}</div>
                        <input
                          type="number"
                          min="0"
                          max={hours[date] ?? 0}
                          step="0.5"
                          value={leave[date] ?? ''}
                          onChange={(e) => {
                            const n = e.target.value === '' ? 0 : Number(e.target.value)
                            setLeave((prev) => ({ ...prev, [date]: n }))
                          }}
                          disabled={!(hours[date] > 0)}
                          placeholder="0"
                          className="w-full px-1 py-2 text-sm text-center tabular-nums border border-etyme-rule
                                     rounded-lg disabled:bg-etyme-canvas/50 disabled:text-etyme-faint
                                     focus:outline-none focus:ring-2 focus:ring-etyme-action/20"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-etyme-faint mt-1.5">
                    Taken from the time-off bank and paid at the usual rate. Leave never counts
                    toward the weekly overtime hours.
                  </p>
                </div>
              )}
            </div>

            {/* Quick fill buttons */}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  const filled: Record<string, number> = {}
                  weekDates.forEach((d, i) => { if (i < 5) filled[d] = 8 })
                  setHours(filled)
                }}
                className="text-[11px] text-etyme-action hover:underline"
              >
                Fill 40h (8×5)
              </button>
              <button
                type="button"
                onClick={() => setHours({})}
                className="text-[11px] text-etyme-muted hover:underline"
              >
                Clear all
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-etyme-canvas">
            <div>
              <span className="text-sm font-medium tabular-nums">{totalHrs.toFixed(1)}h</span>
              <span className="text-etyme-muted text-sm ml-1">total</span>
            </div>
            {selectedContract && totalHrs > 0 && (
              <div className="text-sm text-etyme-verified font-medium tabular-nums">
                ≈ ${estimatedValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} billable
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !contractId || totalHrs === 0}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create timesheet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Deciding what happens to a week's overtime ───────

/** "Monday, September 7" — the way somebody says which week they mean. */
function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

const MULTIPLIERS = [
  { bps: 12_500, label: 'A quarter more (1.25×)' },
  { bps: 15_000, label: 'Time and a half (1.5×)' },
  { bps: 20_000, label: 'Double time (2×)' },
]

type Answer = { treatment: 'SAME_RATE' | 'PREMIUM' | 'TIME_OFF' | null; multiplierBps: number; reason: string }

/**
 * The question a client is asked before they sign a week that went over.
 *
 * Nobody is trained on this product, and everybody using it has signed
 * a hundred timesheets. So the three answers are the three answers the
 * trade already gives — pay it, pay extra for it, or give the time back
 * — each with the money spelled out, and never the enum behind them.
 *
 * One question per week, because overtime is a weekly fact: a
 * semi-monthly sheet holding two heavy weeks asks twice, and says why
 * so that asking twice does not read as a bug.
 */
function DecideOvertimeModal({
  row,
  weeks,
  lead,
  onClose,
  onDecided,
}: {
  row: Timesheet
  weeks: PendingWeek[]
  lead: string
  onClose: () => void
  onDecided: (message: string) => void
}) {
  const contractBps = row.overtime?.multiplierBps ?? 15_000
  const afterHours = row.overtime?.afterHours ?? 40
  const rateCents = row.overtime?.rateCents ?? row.rate.cents ?? 0

  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(
      weeks.map((w) => [w.weekOf, { treatment: null, multiplierBps: contractBps, reason: '' }])
    )
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (weekOf: string, patch: Partial<Answer>) =>
    setAnswers((prev) => ({ ...prev, [weekOf]: { ...prev[weekOf], ...patch } }))

  /** A reason is asked for where the answer costs somebody something they did not sign for. */
  const needsReason = (w: PendingWeek) => {
    const a = answers[w.weekOf]
    if (!a?.treatment) return false
    if (a.treatment === 'TIME_OFF') return true
    return a.treatment === 'PREMIUM' && a.multiplierBps !== contractBps
  }

  const complete = weeks.every((w) => {
    const a = answers[w.weekOf]
    return !!a?.treatment && (!needsReason(w) || a.reason.trim().length > 0)
  })

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/timesheets/${row.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overtime: weeks.map((w) => ({
            weekOf: w.weekOf,
            treatment: answers[w.weekOf].treatment,
            multiplierBps:
              answers[w.weekOf].treatment === 'PREMIUM' ? answers[w.weekOf].multiplierBps : undefined,
            reason: answers[w.weekOf].reason.trim() || undefined,
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error?.message ?? 'That could not be saved.')
        return
      }
      onDecided(body.data?.message ?? 'Approved.')
    } catch {
      setError('The network dropped that. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="card w-full max-w-2xl max-h-[88vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="page-head mb-4">
          <p className="eyebrow">Before you approve</p>
          <h1 className="text-xl">What happens to the overtime?</h1>
          <p>{lead}</p>
        </div>

        {/* What the contract actually offers, in the same words on every
            screen that mentions overtime. */}
        <p className="text-[12px] text-etyme-muted mb-3">
          {overtimeTerms({ afterHours, multiplierBps: contractBps })}
        </p>

        {weeks.length > 1 && (
          <p className="text-[12px] text-etyme-muted mb-4">
            Overtime is a weekly fact, so each week is its own answer. Two heavy weeks on one
            timesheet are two questions.
          </p>
        )}

        <div className="space-y-4">
          {weeks.map((w) => {
            const a = answers[w.weekOf]
            const flat = Math.round(w.overtimeHours * rateCents)
            const premium = Math.round(w.overtimeHours * rateCents * (a.multiplierBps / 10_000))
            const options: { key: Answer['treatment']; title: string; detail: string }[] = [
              {
                key: 'SAME_RATE',
                title: 'Pay them at the usual rate',
                detail: `${w.overtimeHours}h × ${compact(rateCents)} = ${amount(flat)} on the invoice.`,
              },
              {
                key: 'PREMIUM',
                title: 'Pay them at a premium',
                detail: `${w.overtimeHours}h at the higher rate = ${amount(premium)} on the invoice.`,
              },
              {
                key: 'TIME_OFF',
                title: 'Give the time back instead',
                detail: `Nothing extra billed. ${w.overtimeHours}h goes into ${row.person.name.split(' ')[0]}’s time-off bank, to be taken as paid leave later.`,
              },
            ]

            return (
              <div key={w.weekOf} className="panel">
                <p className="stat-label">Week of {weekLabel(w.weekOf)}</p>
                <p className="text-[13px] text-etyme-ink mt-1 mb-3 tabular-nums">
                  {w.workedHours}h worked — {w.overtimeHours}h over the {afterHours} on this contract.
                </p>

                <div className="space-y-2">
                  {options.map((opt) => {
                    const on = a.treatment === opt.key
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => set(w.weekOf, { treatment: opt.key })}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                          on
                            ? 'border-etyme-action bg-etyme-action/5'
                            : 'border-etyme-rule hover:bg-etyme-canvas'
                        }`}
                      >
                        <p className="text-[13px] font-medium text-etyme-ink">{opt.title}</p>
                        <p className="text-[12px] text-etyme-muted tabular-nums">{opt.detail}</p>
                      </button>
                    )
                  })}
                </div>

                {a.treatment === 'PREMIUM' && (
                  <div className="mt-3">
                    <label className="stat-label block mb-1">How much more</label>
                    <select
                      value={a.multiplierBps}
                      onChange={(e) => set(w.weekOf, { multiplierBps: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white"
                    >
                      {MULTIPLIERS.map((m) => (
                        <option key={m.bps} value={m.bps}>
                          {m.label}
                          {m.bps === contractBps ? ' — what the contract offers' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {needsReason(w) && (
                  <div className="mt-3">
                    <label className="stat-label block mb-1">
                      {a.treatment === 'TIME_OFF'
                        ? 'Why the hours are being banked rather than paid'
                        : 'Why this week is different from the contract'}
                    </label>
                    <textarea
                      value={a.reason}
                      onChange={(e) => set(w.weekOf, { reason: e.target.value })}
                      rows={2}
                      placeholder={
                        a.treatment === 'TIME_OFF'
                          ? 'e.g. Agreed with the supplier — taken back in October'
                          : 'e.g. Go-live weekend, agreed with the account manager'
                      }
                      className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg resize-none
                                 focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {error && (
          <p className="mt-4 text-[13px] text-etyme-attention">{error}</p>
        )}

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary">
            Not now
          </button>
          <button onClick={submit} disabled={!complete || saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Approving…' : 'Approve the week'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────

export default function TimesheetsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { company } = useSession()
  const isClient = company?.kind === 'CLIENT'
  const framing = pageFraming(company?.kind ?? 'VENDOR', 'timesheets')

  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [approving, setApproving] = useState(false)
  const [acting, setActing] = useState<string | null>(null)  // ID of the timesheet being acted on
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  // The week that went over the line, and the sentence that asks about it.
  const [deciding, setDeciding] = useState<{ row: Timesheet; weeks: PendingWeek[]; lead: string } | null>(null)

  // Open modal from ?new=1 link
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowCreate(true)
      router.replace('/dashboard/timesheets')
    }
  }, [searchParams, router])

  const fetchTimesheets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/timesheets?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      setTimesheets(body.data?.timesheets ?? [])
    } catch (err: any) {
      setError(err.message)
      setTimesheets([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchTimesheets()
  }, [fetchTimesheets])

  // ── Stats ──────────────────────────────────────────
  const totalHours = timesheets.reduce((sum, t) => sum + t.totalHours, 0)
  const pendingApproval = timesheets.filter((t) => t.status === 'SUBMITTED').length
  const anomalies = timesheets.filter((t) => t.anomalyScore != null && t.anomalyScore > 0).length
  // What has been approved, valued at the rate this reader is billed —
  // which in a chain is the client's own contract and not its
  // supplier's. Rows nobody can price are left out of the number and
  // counted separately, because a total that quietly treats an unknown
  // rate as zero is a figure nobody can stand behind.
  // Whose rate the column and the export are headed with. The server
  // says it per row and it is the same answer for every row a given
  // seat can see, so the first row that has one speaks for the page.
  const rateLabel = timesheets.find((t) => t.rate)?.rate.label ?? 'Bill rate'
  // Whether this seat signs anything here at all. A consultant's session
  // opens this page; it does not get an Approve button on it.
  const canSignAny = timesheets.some((t) => t.mayApprove)

  const approvedRows = timesheets.filter((t) => t.status === 'APPROVED')
  const valued = approvedRows.filter((t) => centsOf(t) != null)
  const approvedValue = valued.reduce((sum, t) => sum + centsOf(t)! / 100, 0)
  const unpriced = approvedRows.length - valued.length
  // Hours over the weekly limit that nobody has answered for yet. Not a
  // failure and not an anomaly — a question waiting on a person.
  const toDecide = timesheets.filter((t) => (t.overtime?.weeks?.length ?? 0) > 0).length

  // ── Approve handler ────────────────────────────────
  async function handleBulkApprove(selectedIds: Set<string>) {
    const submittedIds = Array.from(selectedIds).filter(id => {
      const ts = timesheets.find(t => t.id === id)
      // Only what this seat may actually sign. Sending the rest would
      // collect a row of refusals the screen already knew about.
      return ts?.status === 'SUBMITTED' && ts.mayApprove
    })

    if (submittedIds.length === 0) {
      setToast({
        message: canSignAny
          ? 'No submitted timesheets selected — only submitted timesheets can be approved.'
          : 'These are not yours to approve. Whoever is billed for the work signs it.',
        type: 'error',
      })
      setTimeout(() => setToast(null), 4000)
      return
    }

    setApproving(true)
    let approved = 0
    let failed = 0
    // Weeks over the threshold are not failures. They are questions that
    // have to be answered one at a time, by a person, so a bulk press
    // approves what it can and says plainly what it left.
    let undecided = 0

    for (const id of submittedIds) {
      try {
        const res = await fetch(`/api/timesheets/${id}/approve`, { method: 'POST' })
        if (res.ok) {
          approved++
        } else {
          const body = await res.json().catch(() => ({}))
          if (body.error?.code === 'OVERTIME_UNDECIDED') undecided++
          else failed++
        }
      } catch {
        failed++
      }
    }

    setApproving(false)
    const parts = [`Approved ${approved} timesheet${approved !== 1 ? 's' : ''}`]
    if (undecided > 0) {
      parts.push(
        `${undecided} went over the weekly hours and ${undecided === 1 ? 'needs' : 'need'} ` +
          'somebody to say what happens to the overtime — open the row to decide'
      )
    }
    if (failed > 0) parts.push(`${failed} could not be approved`)
    setToast({ message: `${parts.join('. ')}.`, type: failed > 0 ? 'error' : 'success' })
    setTimeout(() => setToast(null), 4000)

    // Refresh the list
    fetchTimesheets()
  }

  // ── Individual timesheet actions ──────────────────
  async function handleSubmitTimesheet(id: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/timesheets/${id}/submit`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setToast({ message: body.error?.message ?? 'Failed to submit', type: 'error' })
      } else {
        setToast({ message: 'Timesheet submitted for approval', type: 'success' })
        fetchTimesheets()
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' })
    } finally {
      setActing(null)
      setTimeout(() => setToast(null), 4000)
    }
  }

  async function handleApproveTimesheet(id: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/timesheets/${id}/approve`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // A week over the threshold is not an error — it is a question
        // nobody has been asked yet. So the refusal opens the question
        // rather than showing a red message and stopping.
        if (body.error?.code === 'OVERTIME_UNDECIDED') {
          const row = timesheets.find((t) => t.id === id)
          if (row) {
            setDeciding({
              row,
              weeks: (body.error.weeks ?? []) as PendingWeek[],
              lead: body.error.message as string,
            })
            return
          }
        }
        setToast({ message: body.error?.message ?? 'Failed to approve', type: 'error' })
      } else {
        const body = await res.json()
        setToast({ message: body.data?.message ?? 'Timesheet approved', type: 'success' })
        fetchTimesheets()
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' })
    } finally {
      setActing(null)
      setTimeout(() => setToast(null), 4000)
    }
  }

  async function handleRejectTimesheet(id: string, reason: string) {
    setActing(id)
    try {
      const res = await fetch(`/api/timesheets/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setToast({ message: body.error?.message ?? 'Failed to reject', type: 'error' })
      } else {
        setToast({ message: 'Timesheet rejected — returned to consultant', type: 'success' })
        setRejectTarget(null)
        setRejectReason('')
        fetchTimesheets()
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' })
    } finally {
      setActing(null)
      setTimeout(() => setToast(null), 4000)
    }
  }

  // ── Filter ─────────────────────────────────────────
  const filtered = statusFilter === 'ALL'
    ? timesheets
    : timesheets.filter((t) => t.status === statusFilter)

  // ── Column definitions ─────────────────────────────
  const columns: Column<Timesheet>[] = [
    {
      key: 'person',
      label: 'Consultant',
      render: (row) => (
        <div>
          <p className="font-medium text-etyme-ink">{row.person.name}</p>
          {row.sellContract.engagement && (
            <p className="text-[11px] text-etyme-faint truncate max-w-[160px]">
              {row.sellContract.engagement.title}
            </p>
          )}
        </div>
      ),
      sortValue: (row) => row.person.name,
      width: 'min-w-[180px]',
    },
    {
      key: 'client',
      label: 'Client',
      render: (row) => (
        <span className="text-etyme-ink">{row.sellContract.clientCompany.name}</span>
      ),
      sortValue: (row) => row.sellContract.clientCompany.name,
      hideOnMobile: true,
    },
    {
      key: 'period',
      label: 'Period',
      render: (row) => (
        <span className="text-[12px] tabular-nums">{formatPeriod(row.periodStart, row.periodEnd)}</span>
      ),
      sortValue: (row) => new Date(row.periodStart).getTime(),
    },
    {
      key: 'totalHours',
      label: 'Hours',
      render: (row) => (
        <span className="tabular-nums font-medium">
          {row.totalHours.toFixed(1)}
          {row.anomalyScore != null && row.anomalyScore > 0 && (
            <span className="ml-1.5 text-etyme-attention" title={row.anomalyReason ?? 'Anomaly detected'}>
              ⚠
            </span>
          )}
        </span>
      ),
      sortValue: (row) => row.totalHours,
      align: 'right' as const,
    },
    {
      key: 'billRate',
      label: rateLabel,
      render: (row) =>
        row.rate.cents == null ? (
          <span className="text-[11px] text-etyme-faint" title={row.rate.says ?? ''}>
            not recorded
          </span>
        ) : (
          <span className="tabular-nums text-etyme-muted">
            {compact(row.rate.cents)}<span className="text-etyme-faint">/hr</span>
          </span>
        ),
      sortValue: (row) => row.rate.cents ?? -1,
      align: 'right' as const,
      hideOnMobile: true,
    },
    {
      key: 'value',
      label: 'Value',
      render: (row) => {
        // Priced from what somebody decided about each week, not from
        // the multiplier sitting on the contract — and with undecided
        // hours left out rather than valued at a number nobody chose.
        const cents = centsOf(row)
        const waiting = row.overtime?.pendingHours ?? 0
        if (cents == null) {
          return (
            <span className="text-[11px] text-etyme-faint" title={row.rate.says ?? ''}>
              —
            </span>
          )
        }
        return (
          <span className="tabular-nums font-medium">
            {compact(cents)}
            {waiting > 0 && (
              <span className="block text-[10px] text-etyme-attention font-normal">
                + {waiting}h to decide
              </span>
            )}
          </span>
        )
      },
      sortValue: (row) => centsOf(row) ?? -1,
      align: 'right' as const,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className={`chip ${statusChipClass(row.status)}`}>{row.status}</span>
          {(row.overtime?.weeks?.length ?? 0) > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setDeciding({
                  row,
                  weeks: row.overtime!.weeks,
                  lead: row.overtime!.says ?? 'This week went over the hours on the contract.',
                })
              }}
              className="chip chip--attention hover:underline whitespace-nowrap"
              title={row.overtime?.says ?? ''}
            >
              Overtime to decide
            </button>
          )}
          {row.status === 'OPEN' && row.maySubmit && (
            <button
              onClick={(e) => { e.stopPropagation(); handleSubmitTimesheet(row.id) }}
              disabled={acting === row.id}
              className="text-[11px] text-etyme-action hover:underline disabled:opacity-50 whitespace-nowrap"
            >
              {acting === row.id ? '…' : '→ Submit'}
            </button>
          )}
          {/* A button the server would refuse is not a button. The
              commonest case is the person whose week it is: their hours,
              somebody else's signature. */}
          {row.status === 'SUBMITTED' && !row.mayApprove && row.mayApproveWhyNot && (
            <span className="text-[11px] text-etyme-faint">{row.mayApproveWhyNot}</span>
          )}
          {row.status === 'SUBMITTED' && row.mayApprove && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handleApproveTimesheet(row.id) }}
                disabled={acting === row.id}
                className="text-[11px] text-etyme-verified hover:underline disabled:opacity-50"
              >
                {acting === row.id ? '…' : '✓'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setRejectTarget(row.id) }}
                disabled={acting === row.id}
                className="text-[11px] text-red-500 hover:underline disabled:opacity-50"
              >
                ✕
              </button>
            </>
          )}
        </div>
      ),
      sortValue: (row) => row.status,
    },
  ]

  // ── Search filter ──────────────────────────────────
  const searchFilter = (row: Timesheet, q: string) =>
    row.person.name.toLowerCase().includes(q) ||
    row.sellContract.clientCompany.name.toLowerCase().includes(q) ||
    (row.sellContract.engagement?.title ?? '').toLowerCase().includes(q) ||
    row.status.toLowerCase().includes(q)

  // ── Status filter options ──────────────────────────
  const statusOptions: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'OPEN', label: 'Open' },
    { key: 'SUBMITTED', label: 'Submitted' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'REJECTED', label: 'Rejected' },
  ]

  return (
    <>
      {/* Head — prototype pattern: eyebrow + serif h1 + prose subtitle */}
      <div className="flex items-start justify-between mb-6">
        <div className="page-head">
          <p className="eyebrow">{framing.eyebrow}</p>
          <h1>{framing.title}</h1>
          <p>{framing.subtitle}</p>
        </div>
        {/* A client approves hours; the consultant's vendor raises them. */}
        {!isClient && (
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-3 shrink-0">
            + New
          </button>
        )}
      </div>

      {/* Stats row — prototype Stat component pattern */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Total hours</p>
          <p className="stat-value text-etyme-ink">{totalHours.toFixed(0)}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">this period</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Pending approval</p>
          <p className={`stat-value ${pendingApproval > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {pendingApproval}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">{pendingApproval > 0 ? 'need review' : 'all clear'}</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Anomalies</p>
          <p className={`stat-value ${anomalies > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {anomalies}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">{anomalies > 0 ? 'flagged by system' : 'none detected'}</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Overtime to decide</p>
          <p className={`stat-value ${toDecide > 0 ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
            {toDecide}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">
            {toDecide > 0 ? 'weeks over the hours' : 'nothing waiting'}
          </p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Approved value</p>
          <p className="stat-value text-etyme-verified">
            ${approvedValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">
            {unpriced > 0
              ? `${unpriced} more with no rate on file`
              : rateLabel === 'Your rate' ? 'your pay' : 'billable'}
          </p>
        </div>
      </div>

      {/* Status filters — prototype filter-tab pattern */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {statusOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setStatusFilter(opt.key)}
            className={`filter-tab ${
              statusFilter === opt.key ? 'filter-tab--active' : 'filter-tab--inactive'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Data table */}
      <ListSurface<Timesheet>
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder="Search by consultant, client, or engagement…"
        emptyMessage={statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} timesheets.` : 'No timesheets yet.'}
        emptyDetail="Timesheets will appear here once consultants start logging hours against sell contracts."
        exportName="timesheets"
        selectable
        bulkActions={(selected) => (
          <>
            {canSignAny && (
            <button
              onClick={() => handleBulkApprove(selected)}
              disabled={approving}
              className="px-3 py-1.5 text-[11px] font-medium rounded-md
                         bg-etyme-verified text-white hover:bg-etyme-verified/90
                         transition-colors disabled:opacity-50"
            >
              {approving ? 'Approving…' : `Approve (${selected.size})`}
            </button>
            )}
            <button
              onClick={() => {
                const rows = filtered.filter((t) => selected.has(t.id))
                if (rows.length === 0) return
                const header = ['Consultant','Client','Engagement','Period Start','Period End','Hours',rateLabel,'Value','Status']
                const csvRows = rows.map((t) => {
                  const value = centsOf(t)
                  return [
                    t.person.name,
                    t.sellContract.clientCompany.name,
                    t.sellContract.engagement?.title ?? '',
                    t.periodStart,
                    t.periodEnd,
                    t.totalHours.toFixed(1),
                    t.rate.cents == null ? '' : (t.rate.cents / 100).toFixed(2),
                    value == null ? '' : (value / 100).toFixed(2),
                    t.status,
                  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
                })
                const csv = [header.join(','), ...csvRows].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `timesheets-export-${new Date().toISOString().slice(0, 10)}.csv`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
              }}
              className="px-3 py-1.5 text-[11px] font-medium rounded-md
                               border border-etyme-rule text-etyme-muted
                               hover:bg-etyme-canvas transition-colors"
            >
              Export selected
            </button>
          </>
        )}
        rowClassName={(row) =>
          row.anomalyScore != null && row.anomalyScore > 0
            ? 'bg-amber-50/30'
            : ''
        }
        defaultPageSize={20}
      />

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {filtered.length} timesheet{filtered.length !== 1 ? 's' : ''}
          {statusFilter !== 'ALL' && ` · ${statusFilter.toLowerCase()}`}
        </p>
      )}

      {/* Create timesheet modal */}
      {showCreate && (
        <CreateTimesheetModal
          onClose={() => setShowCreate(false)}
          onCreated={(msg) => {
            setToast({ message: msg, type: 'success' })
            setTimeout(() => setToast(null), 4000)
            fetchTimesheets()
          }}
        />
      )}

      {/* What happens to a week that went over the line */}
      {deciding && (
        <DecideOvertimeModal
          row={deciding.row}
          weeks={deciding.weeks}
          lead={deciding.lead}
          onClose={() => setDeciding(null)}
          onDecided={(message) => {
            setDeciding(null)
            setToast({ message, type: 'success' })
            setTimeout(() => setToast(null), 5000)
            fetchTimesheets()
          }}
        />
      )}

      {/* Reject reason modal */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => { setRejectTarget(null); setRejectReason('') }}
        >
          <div className="card w-full max-w-sm mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-2">Reject timesheet</h3>
            <p className="text-sm text-etyme-muted mb-4">
              This will return the timesheet to the consultant for correction.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (required)…"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg mb-4
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action
                         resize-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setRejectTarget(null); setRejectReason('') }} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => handleRejectTimesheet(rejectTarget, rejectReason)}
                disabled={!rejectReason.trim() || acting === rejectTarget}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-etyme-danger text-white
                           hover:bg-etyme-danger/90 transition-colors disabled:opacity-50"
              >
                {acting === rejectTarget ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
                         ${toast.type === 'success'
                           ? 'bg-etyme-verified text-white'
                           : 'bg-etyme-danger text-white'
                         } animate-slide-up`}>
          {toast.message}
        </div>
      )}
    </>
  )
}
