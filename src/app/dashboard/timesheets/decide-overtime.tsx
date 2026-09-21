'use client'

import { useState } from 'react'
import { amount, compact } from '@/lib/money-display'
import { says as overtimeTerms } from '@/lib/overtime'

/**
 * The question asked before anybody signs a week that went over.
 *
 * ── Why this is its own file ─────────────────────────────────────────
 *
 * A week over the contract's threshold is refused by
 * `POST /api/timesheets/:id/approve` with OVERTIME_UNDECIDED and a good
 * sentence, and there are three screens where a person signs a week: the
 * program dashboard's queue, the Timesheets list, and the supplier's
 * Decisions page. Only one of them had ever been taught to ask the
 * question. On the other two the row sprang back and nothing was said,
 * so Omar Haddad's 45-hour week could not be approved from any desk —
 * a dead end with no words on it, which is worse than a refusal.
 *
 * The program dashboard had a reason box on the row ("Approve anyway"),
 * and a reason is not this decision. A reason explains a judgment; this
 * *is* the judgment, and it decides money: five hours at $132 is $660
 * billed, $990 billed, or nothing billed and five hours owed back.
 *
 * So the question lives in one place and all three screens open it. It
 * is under `app/dashboard/timesheets` rather than `components/` because
 * `components/` belongs to the platform and this is demand's question;
 * an architect who wants it beside the other shared surfaces may move it.
 *
 * ── What it never does ───────────────────────────────────────────────
 *
 * It does not decide anything itself. Every price on it is arithmetic
 * over numbers the route sent — the hours over the line, the threshold,
 * the rate on the leg this reader is on — and `lib/overtime` is what
 * actually prices the answer when it is posted back. A screen that
 * computed its own premium would be a second opinion about money.
 */

/** One week the route is waiting on, exactly as it sends it. */
export interface PendingWeek {
  weekOf: string
  workedHours: number
  overtimeHours: number
  /** The line this week went over. Present on the refusal, absent on a list row. */
  afterHours?: number | null
  /** What the contract offers. Present on the refusal, absent on a list row. */
  multiplierBps?: number | null
  /** This reader's own rate on their own leg. Null where they are owed none. */
  rateCents?: number | null
}

/** What the screen knows about the contract, where the week does not carry it. */
export interface OvertimeTerms {
  afterHours?: number | null
  multiplierBps?: number | null
  rateCents?: number | null
}


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
export function DecideOvertime({
  timesheetId,
  personName,
  weeks,
  lead,
  terms,
  note,
  onClose,
  onDecided,
}: {
  timesheetId: string
  personName: string
  weeks: PendingWeek[]
  lead: string
  /** Read only where a week does not carry its own answer. */
  terms?: OvertimeTerms
  /**
   * A reason already given for signing a week that does not fit its
   * contract — over the role's hours, or past its last day. It rides
   * with the signature. Without it the reason a person typed into the
   * queue's "Approve anyway" box was thrown away the moment the overtime
   * question opened on top of it, and the signature carried nothing.
   */
  note?: string | null
  onClose: () => void
  onDecided: (message: string) => void
}) {
  // The week's own copy wins. It came back on the refusal that stopped
  // the signature, so it is the leg being answered and the rate that leg
  // bills at — and in a chain that is not the same as the row the screen
  // was drawn from.
  const first = weeks[0]
  const contractBps = first?.multiplierBps ?? terms?.multiplierBps ?? 15_000
  const afterHours = first?.afterHours ?? terms?.afterHours ?? 40
  const rateCents = first?.rateCents ?? terms?.rateCents ?? 0

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
      const res = await fetch(`/api/timesheets/${timesheetId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(note ? { note } : {}),
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
                // "on the invoice" was right for a client and wrong for
                // the supplier accepting the same week on its own leg,
                // where the money is payroll rather than a bill.
                detail: `${w.overtimeHours}h × ${compact(rateCents)} = ${amount(flat)} added to the week.`,
              },
              {
                key: 'PREMIUM',
                title: 'Pay them at a premium',
                detail: `${w.overtimeHours}h at the higher rate = ${amount(premium)} added to the week.`,
              },
              {
                key: 'TIME_OFF',
                title: 'Give the time back instead',
                detail: `Nothing extra for those hours. ${w.overtimeHours}h goes into ${personName.split(' ')[0]}’s time-off bank, to be taken as paid leave later.`,
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
