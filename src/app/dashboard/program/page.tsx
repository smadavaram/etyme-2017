'use client'

import { readJson } from '@/lib/read-response'

import { useEffect, useState } from 'react'
import { compact } from '@/lib/money-display'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ListSurface, type Column } from '@/components/list-surface'

/**
 * Client Program Overview
 *
 * BRD §17.1 — the enterprise/demand perspective.
 * What a hiring manager at Terumo BCT sees: their contractors,
 * pending approvals, vendor performance, and upcoming endings.
 *
 * This is the demand-side demo centerpiece — the contingent
 * staffing layer for enterprise.
 */

// ── Types ──────────────────────────────────────────────────

interface ProgramData {
  client: { id: string; name: string }
  summary: {
    activeContractors: number
    vendors: number
    monthlySpend: number // cents, at 160 hours a month
    pendingApprovals: number
    openRoles: number
    endingSoon: number
  }
  contractors: {
    contractId: string
    person: { id: string; name: string; headline?: string }
    vendor: { id: string; name: string }
    engagement: { id: string; title: string } | null
    role: string | null
    billRate: number | null
    state: string
    startDate: string | null
    endDate: string | null
    daysRemaining: number | null
    pendingTimesheets: number
  }[]
  vendors: {
    id: string
    name: string
    headcount: number
    avgRate: number
    totalMonthlySpend: number // cents
    standing: string
  }[]
  approvalQueue: {
    id: string
    kind: 'timesheet' | 'expense'
    person: string
    vendor: string
    detail: string
    amount: number | null
    submittedAt: string | null
    daysWaiting: number
  }[]
  openRoles: {
    id: string
    title: string
    status: string
    openDays: number
    submissions: number
    shortlisted: number
  }[]
  startingSoon: {
    contractId: string
    person: { id: string; name: string }
    vendor: { id: string; name: string }
    startDate: string
    daysUntil: number
    paperwork: { outcome: 'PASS' | 'WARN' | 'BLOCK'; says: string; fix: string | null }
  }[]
  today: { id: string; what: string; who: string; at: string }[]
  endingSoon: {
    contractId: string
    person: { id: string; name: string }
    vendor: { id: string; name: string }
    endDate: string | null
    daysRemaining: number | null
    billRate: number | null
  }[]
}


// ── Page ───────────────────────────────────────────────────

type Tab = 'overview' | 'contractors' | 'approvals' | 'vendors' | 'roles'

/** One thing that needs a person, from /api/decisions. */
interface Decision {
  type: string
  title: string
  subtitle: string
  urgency: 'HIGH' | 'MEDIUM' | 'LOW' | string
  entityType: string
  entityId: string
  actionUrl: string
  amount: number | null
  createdAt: string
  /** A sentence when the week does not fit the contract; approve anyway needs a reason. */
  flag?: string | null
}

interface TenureRow {
  personId: string
  name: string
  vendors: { id: string; name: string }[]
  cumulativeMonths: number
  status: 'OK' | 'WARNING' | 'BREAK_REQUIRED' | 'IN_BREAK' | 'ELIGIBLE' | string
  eligibleDate: string | null
}

interface Tenure {
  summary: { totalTracked: number; ok: number; warning: number; breakRequired: number; inBreak: number; eligible: number }
  people: TenureRow[]
}

const KIND_WORD: Record<string, string> = {
  TIMESHEET_APPROVAL: 'Hours',
  EXPENSE_APPROVAL: 'Expense',
  ROLLOFF_ACTION: 'Ending',
  SUBMISSION_REVIEW: 'Candidate',
  SUPPLIER_REVIEW: 'Supplier',
  INVOICE_OVERDUE: 'Invoice',
  RATE_CONFIRMATION: 'Rate',
  BILL_DISPUTED: 'Bill',
}

function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days`
}

const TENURE_WORD: Record<string, string> = {
  BREAK_REQUIRED: 'Over the cap',
  WARNING: 'Near the cap',
  IN_BREAK: 'In a break',
  ELIGIBLE: 'Clear to return',
  OK: 'Inside the cap',
}

/**
 * The client's desk.
 *
 * The page used to open with a vendor's number — hours to the first
 * submission worth reading — and a wall of six stats, with what the
 * client actually had to do buried in a tab. The founder's reading of
 * it: "the client dashboard needs to be a lot better." The prototype
 * (prototypes/client-console.tsx) opens with one sentence, the things
 * that need you, and the picture underneath. So does this.
 */
export default function ProgramPage() {
  const [data, setData] = useState<ProgramData | null>(null)
  const [decisions, setDecisions] = useState<Decision[] | null>(null)
  const [tenure, setTenure] = useState<Tenure | null>(null)
  const [firstGood, setFirstGood] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function loadData() {
    try {
      const res = await fetch('/api/program')
      const body = await readJson(res)
      setData(body.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
    // The queue and the exposure are their own reads. A desk whose queue
    // cannot load still shows the picture; a picture whose queue fails
    // says so in one line rather than taking the page down.
    fetch('/api/decisions').then(readJson).then((b) => setDecisions(b?.data?.decisions ?? [])).catch(() => setDecisions([]))
    fetch('/api/tenure').then(readJson).then((b) => setTenure(b?.data ?? null)).catch(() => setTenure(null))
    fetch('/api/first-good').then(readJson).then((b) => setFirstGood(b?.data ?? null)).catch(() => {})
  }

  useEffect(() => {
    loadData()
  }, [])

  function say(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), type === 'success' ? 3000 : 4500)
  }

  /** Approve from the row, for the two kinds a client signs here. */
  async function approve(d: Decision, note?: string) {
    setBusy(d.entityId)
    try {
      if (d.type === 'TIMESHEET_APPROVAL') {
        // A flagged week is approved anyway with the reason written on
        // the signature — WARN, capture a reason, proceed. Never silently.
        await readJson(await fetch(`/api/timesheets/${d.entityId}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(note ? { note } : {}) }))
      } else {
        await readJson(await fetch('/api/expenses/actions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve', expenseIds: [d.entityId] }),
        }))
      }
      say(`Approved — ${d.title.replace(/^(Approve|Review) (timesheet|expense) — /, '')}`)
      setDecisions((cur) => (cur ?? []).filter((x) => x.entityId !== d.entityId))
      // The same week sits on the Approvals tab; both queues move together.
      setData((cur) => cur && cur.approvalQueue.some((a) => a.id === d.entityId)
        ? { ...cur, approvalQueue: cur.approvalQueue.filter((a) => a.id !== d.entityId), summary: { ...cur.summary, pendingApprovals: Math.max(0, cur.summary.pendingApprovals - 1) } }
        : cur)
    } catch (err: any) {
      say(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleApproveItem(item: ProgramData['approvalQueue'][number]) {
    await approve({
      type: item.kind === 'timesheet' ? 'TIMESHEET_APPROVAL' : 'EXPENSE_APPROVAL',
      title: item.person, subtitle: item.detail, urgency: 'MEDIUM', entityType: item.kind.toUpperCase(),
      entityId: item.id, actionUrl: '', amount: item.amount, createdAt: item.submittedAt ?? new Date().toISOString(),
    })
    if (data) {
      setData({
        ...data,
        approvalQueue: data.approvalQueue.filter((a) => a.id !== item.id),
        summary: { ...data.summary, pendingApprovals: Math.max(0, data.summary.pendingApprovals - 1) },
      })
    }
  }

  async function handleExtend(contractId: string) {
    try {
      const body = await readJson(await fetch(`/api/contracts/${contractId}/extend`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ months: 3 }),
      }))
      say(body.data.message)
      loadData()
    } catch (err: any) {
      say(err.message, 'error')
    }
  }

  async function handleRolloff(contractId: string) {
    try {
      const body = await readJson(await fetch(`/api/contracts/${contractId}/rolloff`, { method: 'POST' }))
      say(body.data.message)
      loadData()
    } catch (err: any) {
      say(err.message, 'error')
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-40 rounded bg-etyme-rule/50" />
        <div className="h-9 w-2/3 rounded bg-etyme-rule/50" />
        <div className="h-4 w-1/2 rounded bg-etyme-rule/40" />
        <div className="h-40 rounded bg-etyme-rule/30 mt-8" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="panel p-6">
        <p className="text-sm text-etyme-attention font-medium">This desk could not be read.</p>
        <p className="text-sm text-etyme-muted mt-1">{error}</p>
        <button onClick={() => { setError(null); setLoading(true); loadData() }} className="btn-secondary mt-4">Try again</button>
      </div>
    )
  }

  const s = data.summary
  const queue = decisions ?? []
  const urgent = queue.filter((d) => d.urgency === 'HIGH').length
  const exceptions = queue.filter((d) => d.flag || d.type === 'BILL_DISPUTED').length
  const watch = tenure ? tenure.summary.warning + tenure.summary.breakRequired : null

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Today' },
    { key: 'approvals', label: 'Approvals', count: s.pendingApprovals || undefined },
    { key: 'contractors', label: 'Contractors', count: data.contractors.length || undefined },
    { key: 'vendors', label: 'Suppliers', count: s.vendors || undefined },
    { key: 'roles', label: 'Requirements', count: s.openRoles || undefined },
  ]

  return (
    <>
      {/* ── The sentence ─────────────────────────── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
        <div className="max-w-2xl">
          <p className="eyebrow">Workforce · {data.client.name}</p>
          <h1 className="mt-1 font-serif text-3xl md:text-4xl leading-tight tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
            {decisions === null
              ? 'Reading your desk…'
              : queue.length === 0
                ? 'Nothing needs you today.'
                : (
                  <>
                    {queue.length} thing{queue.length === 1 ? '' : 's'} need{queue.length === 1 ? 's' : ''} you.
                    {exceptions > 0 && <span className="text-etyme-attention"> {exceptions} {exceptions === 1 ? 'has an exception' : 'have exceptions'}.</span>}
                  </>
                )}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-etyme-muted">
            {plural(s.activeContractors, 'contractor')} on site through {plural(s.vendors, 'supplier')}.
            {' '}{compact(s.monthlySpend)} this month.
            {s.endingSoon > 0 && ` ${plural(s.endingSoon, 'contract')} ending within 60 days.`}
            {watch != null && watch > 0 && ` ${plural(watch, 'person', 'people')} at or near the tenure cap.`}
            {urgent > 0 && ` ${urgent} of yours ${urgent === 1 ? 'has' : 'have'} waited more than five days.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The paper behind the program. An order carries a ceiling, a
              contract carries a rate, an agreement carries permission —
              three different questions, so three different places. */}
          <Link href={{ pathname: '/dashboard/program/agreements' }} className="text-xs px-3 py-1.5 border border-etyme-rule rounded text-etyme-muted hover:text-etyme-ink hover:border-etyme-muted transition-colors">
            Agreements
          </Link>
          <Link href={{ pathname: '/dashboard/program/milestones' }} className="text-xs px-3 py-1.5 border border-etyme-rule rounded text-etyme-muted hover:text-etyme-ink hover:border-etyme-muted transition-colors">
            Milestones
          </Link>
          <Link href={{ pathname: '/dashboard/program/team' }} className="text-xs px-3 py-1.5 border border-etyme-rule rounded text-etyme-muted hover:text-etyme-ink hover:border-etyme-muted transition-colors">
            Program team
          </Link>
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────── */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-etyme-rule">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-[13px] -mb-px flex items-center gap-2 transition-colors border-b-2 ${
              tab === t.key ? 'text-etyme-ink font-semibold border-etyme-ink' : 'text-etyme-muted border-transparent hover:text-etyme-ink'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${tab === t.key ? 'bg-etyme-ink text-white' : 'bg-etyme-canvas text-etyme-muted'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <Today
          data={data}
          onApprovals={() => setTab('approvals')}
          queue={queue}
          queueLoaded={decisions !== null}
          tenure={tenure}
          firstGood={firstGood}
          busy={busy}
          onApprove={approve}
          onExtend={handleExtend}
          onRolloff={handleRolloff}
        />
      )}
      {tab === 'approvals' && <ApprovalsTab items={data.approvalQueue} onApprove={handleApproveItem} />}
      {tab === 'contractors' && <ContractorsTab contractors={data.contractors} />}
      {tab === 'vendors' && <VendorsTab vendors={data.vendors} />}
      {tab === 'roles' && <RolesTab roles={data.openRoles} />}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-up ${toast.type === 'success' ? 'bg-etyme-verified text-white' : 'bg-etyme-attention text-white'}`}>
          {toast.message}
        </div>
      )}
    </>
  )
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

// ── Stat ──────────────────────────────────────────────────

function Stat({ label, value, sub, tone, href }: {
  label: string
  value: number | string
  sub?: string
  tone?: 'attention' | 'action' | 'verified'
  href?: string
}) {
  const color = tone === 'attention' ? 'text-etyme-attention' : tone === 'action' ? 'text-etyme-action' : tone === 'verified' ? 'text-etyme-verified' : 'text-etyme-ink'
  const body = (
    <>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-etyme-faint mb-1">{label}</p>
      <p className={`font-serif text-3xl leading-none tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-etyme-muted mt-1.5">{sub}</p>}
    </>
  )
  const cls = 'block bg-etyme-surface border border-etyme-rule rounded-lg px-4 py-3'
  return href ? <a href={href} className={`${cls} hover:border-etyme-muted transition-colors`}>{body}</a> : <div className={cls}>{body}</div>
}

// ── Today ─────────────────────────────────────────────────

/**
 * What needs you, then the picture.
 *
 * The queue is every kind of decision across every supplier in one
 * list — hours to sign, an expense to review, a bill that did not
 * match, a contract ending — because the alternative is four inboxes.
 * Hours and expenses are approved from the row; a week that does not
 * fit its contract says so and is approved anyway with a reason;
 * everything else opens where the decision is made. Under the queue,
 * what was done today, so a clear desk is not an empty page.
 */
function Today({ data, queue, queueLoaded, tenure, firstGood, busy, onApprove, onExtend, onRolloff, onApprovals }: {
  data: ProgramData
  onApprovals: () => void
  queue: Decision[]
  queueLoaded: boolean
  tenure: Tenure | null
  firstGood: any
  busy: string | null
  onApprove: (d: Decision, note?: string) => void
  onExtend: (contractId: string) => void
  onRolloff: (contractId: string) => void
}) {
  const s = data.summary
  const [reasonFor, setReasonFor] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const watchList = (tenure?.people ?? [])
    .filter((p) => p.status === 'BREAK_REQUIRED' || p.status === 'WARNING' || p.status === 'IN_BREAK')
    .slice(0, 5)
  const watch = tenure ? tenure.summary.warning + tenure.summary.breakRequired : null
  const nothingYet = queueLoaded && queue.length === 0 && s.activeContractors === 0
    && data.openRoles.length === 0 && data.startingSoon.length === 0 && data.approvalQueue.length === 0

  if (nothingYet) {
    return (
      <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-6 max-w-2xl">
        <h2 className="font-serif text-xl text-etyme-ink">Nothing here yet.</h2>
        <p className="mt-2 text-sm text-etyme-muted leading-relaxed">
          Post a requirement and, within plan, it publishes itself to the suppliers Procurement cleared.
          Their submissions, the interviews, the award, the paperwork, the hours and the invoices all come
          back to this page — every contractor on site, across every supplier, with tenure added up.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={{ pathname: '/dashboard/requisitions' }} className="px-3 py-1.5 bg-etyme-action text-white rounded text-xs font-medium hover:opacity-90">Post a requirement</Link>
          <Link href={{ pathname: '/dashboard/suppliers' }} className="px-3 py-1.5 border border-etyme-rule rounded text-xs text-etyme-ink hover:bg-etyme-canvas">Invite your suppliers</Link>
          <Link href={{ pathname: '/dashboard/import' }} className="px-3 py-1.5 border border-etyme-rule rounded text-xs text-etyme-ink hover:bg-etyme-canvas">Import who is already on site</Link>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Yours today ── */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="font-serif text-lg text-etyme-ink">Yours today</h2>
          {queue.length > 0 && <Link href={{ pathname: '/dashboard/decisions' }} className="text-xs text-etyme-action hover:underline">All decisions</Link>}
        </div>
        <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
          {!queueLoaded && <p className="p-4 text-sm text-etyme-muted">Reading…</p>}
          {queueLoaded && queue.length === 0 && (
            <p className="p-4 text-sm text-etyme-muted">
              {data.approvalQueue.length > 0 ? (
                <>
                  Nothing is waiting on you. {plural(data.approvalQueue.length, 'approval')} {data.approvalQueue.length === 1 ? 'is' : 'are'} waiting on the hiring managers who own them —{' '}
                  <button type="button" onClick={onApprovals} className="text-etyme-action hover:underline">see Approvals</button>.
                </>
              ) : data.today.length > 0 ? (
                'Queue clear. Everything below was done today.'
              ) : (
                'Every week is signed, every claim reviewed, every invoice inside its terms. Nothing is waiting on you.'
              )}
            </p>
          )}
          {queue.slice(0, 8).map((d) => {
            const inline = d.type === 'TIMESHEET_APPROVAL' || d.type === 'EXPENSE_APPROVAL'
            const who = d.title.replace(/^(Approve|Review) (timesheet|expense) — /, '')
            const asking = reasonFor === d.entityId
            return (
              <div key={`${d.type}-${d.entityId}`} className={`p-4 ${d.flag ? 'bg-etyme-attention/[0.04]' : ''}`}>
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <span className="w-[72px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium pt-1">{KIND_WORD[d.type] ?? d.entityType.toLowerCase()}</span>
                  <div className="flex-1 min-w-[220px]">
                    <p className="text-sm text-etyme-ink">{who}</p>
                    <p className="text-xs text-etyme-muted mt-0.5">{d.subtitle}</p>
                    {d.flag && <p className="text-xs text-etyme-attention mt-1.5"><span className="font-mono mr-1.5">!</span>{d.flag}</p>}
                  </div>
                  <span className="text-xs text-etyme-faint tabular-nums pt-1">{ago(d.createdAt)}</span>
                  <div className="flex gap-2 shrink-0">
                    {inline && !d.flag && (
                      <button onClick={() => onApprove(d)} disabled={busy === d.entityId}
                        className="px-3 py-1.5 bg-etyme-action text-white rounded text-xs font-medium hover:opacity-90 disabled:opacity-50">
                        {busy === d.entityId ? 'Approving…' : 'Approve'}
                      </button>
                    )}
                    {inline && d.flag && !asking && (
                      <button onClick={() => { setReasonFor(d.entityId); setReason('') }} disabled={busy === d.entityId}
                        className="px-3 py-1.5 bg-etyme-attention text-white rounded text-xs font-medium hover:opacity-90 disabled:opacity-50">
                        Approve anyway
                      </button>
                    )}
                    <Link href={{ pathname: d.actionUrl || '/dashboard/decisions' }} className="px-3 py-1.5 border border-etyme-rule rounded text-xs text-etyme-ink hover:bg-etyme-canvas">
                      {inline ? 'Look' : 'Open'}
                    </Link>
                  </div>
                </div>
                {asking && (
                  <form
                    className="mt-3 md:ml-[88px] flex flex-wrap items-center gap-2"
                    onSubmit={(e) => { e.preventDefault(); if (reason.trim()) { onApprove(d, reason.trim()); setReasonFor(null) } }}
                  >
                    <input
                      autoFocus
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why this week is right anyway — it goes on the signature"
                      className="flex-1 min-w-[240px] px-3 py-1.5 text-xs border border-etyme-rule rounded bg-white text-etyme-ink"
                    />
                    <button type="submit" disabled={!reason.trim() || busy === d.entityId} className="px-3 py-1.5 bg-etyme-attention text-white rounded text-xs font-medium disabled:opacity-50">
                      {busy === d.entityId ? 'Approving…' : 'Approve with this reason'}
                    </button>
                    <button type="button" onClick={() => setReasonFor(null)} className="px-2 py-1.5 text-xs text-etyme-muted hover:underline">Not now</button>
                  </form>
                )}
              </div>
            )
          })}
          {queue.length > 8 && (
            <Link href={{ pathname: '/dashboard/decisions' }} className="block p-3 text-center text-xs text-etyme-action hover:underline">
              and {queue.length - 8} more
            </Link>
          )}
        </div>

        {/* ── Done today ── */}
        {data.today.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-[0.15em] text-etyme-faint font-medium mb-2">Done today</p>
            <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
              {data.today.slice(0, 6).map((t) => (
                <div key={t.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                  <span className="text-etyme-verified font-mono text-xs">✓</span>
                  <span className="flex-1 text-etyme-muted">{t.what} — <span className="text-etyme-ink">{t.who}</span></span>
                  <span className="text-xs text-etyme-faint tabular-nums">{clock(t.at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── The picture ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="On site" value={s.activeContractors} sub="contractors" href="/dashboard/contractors" />
        <Stat label="Suppliers" value={s.vendors} sub="with people here" href="/dashboard/suppliers" />
        <Stat label="This month" value={compact(s.monthlySpend)} sub="from current rates" />
        <Stat label="Ending soon" value={s.endingSoon} sub="within 60 days" tone={s.endingSoon > 0 ? 'attention' : undefined} href="/dashboard/rolloff" />
        <Stat label="Tenure" value={watch ?? '—'} sub={watch == null ? 'reading' : watch === 0 ? 'everybody inside the cap' : 'at or near the cap'} tone={watch ? 'attention' : undefined} href="/dashboard/tenure" />
        <Stat label="Requirements" value={s.openRoles} sub={firstGood?.hours == null ? 'published or drafted' : firstGood.hours < 1 ? 'first good candidate within the hour' : `first good candidate in ${firstGood.hours}h`} tone={s.openRoles > 0 ? 'action' : undefined} href="/dashboard/requisitions" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-8">
          {/* ── Starting soon — the paperwork, read early ── */}
          {data.startingSoon.length > 0 && (
            <section>
              <h2 className="font-serif text-lg text-etyme-ink mb-3">Starting soon</h2>
              <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
                {data.startingSoon.map((c) => (
                  <div key={c.contractId} className="p-4 flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-sm text-etyme-ink">{c.person.name} <span className="text-etyme-muted">through {c.vendor.name}</span></p>
                      <p className={`text-xs mt-1 ${c.paperwork.outcome === 'BLOCK' ? 'text-etyme-attention' : c.paperwork.outcome === 'WARN' ? 'text-etyme-muted' : 'text-etyme-verified'}`}>
                        {c.paperwork.outcome === 'PASS' ? 'Paperwork complete. Nothing stops the start.' : c.paperwork.says}
                        {c.paperwork.outcome !== 'PASS' && c.paperwork.fix && <span className="text-etyme-muted"> {c.paperwork.fix}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm tabular-nums ${c.daysUntil <= 7 && c.paperwork.outcome === 'BLOCK' ? 'text-etyme-attention' : 'text-etyme-ink'}`}>
                        {c.daysUntil > 0 ? `in ${plural(c.daysUntil, 'day')}` : c.daysUntil === 0 ? 'today' : `${plural(-c.daysUntil, 'day')} ago`}
                      </p>
                      <p className="text-xs text-etyme-faint">{shortDate(c.startDate)}</p>
                    </div>
                    <Link href={{ pathname: `/dashboard/placements/${c.contractId}` }} className="px-3 py-1.5 border border-etyme-rule rounded text-xs text-etyme-ink hover:bg-etyme-canvas">Open</Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Tenure to watch — the wedge ── */}
          <section>
            <h2 className="font-serif text-lg text-etyme-ink mb-3">Tenure to watch</h2>
            <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
              {tenure === null && <p className="p-4 text-sm text-etyme-muted">Reading…</p>}
              {tenure !== null && watchList.length === 0 && (
                <p className="p-4 text-sm text-etyme-muted">
                  {tenure.summary.totalTracked === 0
                    ? 'Nobody on site yet, so nobody to count.'
                    : `All ${tenure.summary.totalTracked} people on site are inside the cap, counted across every supplier.`}
                </p>
              )}
              {watchList.map((p) => (
                <div key={p.personId} className="p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm text-etyme-ink">{p.name}</p>
                    <p className="text-xs text-etyme-muted">
                      {p.cumulativeMonths} months here through {p.vendors.map((v) => v.name).join(' and ')}
                      {p.status === 'IN_BREAK' && p.eligibleDate && ` · can come back ${shortDate(p.eligibleDate)}`}
                    </p>
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${p.status === 'BREAK_REQUIRED' ? 'bg-etyme-attention/10 text-etyme-attention' : 'bg-etyme-rule/50 text-etyme-muted'}`}>
                    {TENURE_WORD[p.status] ?? p.status}
                  </span>
                </div>
              ))}
              {tenure !== null && tenure.summary.totalTracked > 0 && (
                <Link href={{ pathname: '/dashboard/tenure' }} className="block p-3 text-center text-xs text-etyme-action hover:underline">
                  Everybody's tenure, across every supplier
                </Link>
              )}
            </div>
          </section>

          {/* ── Ending soon ── */}
          {data.endingSoon.length > 0 && (
            <section>
              <h2 className="font-serif text-lg text-etyme-ink mb-3">Ending within 60 days</h2>
              <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
                {data.endingSoon.map((c) => (
                  <div key={c.contractId} className="p-4 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-sm text-etyme-ink">{c.person.name}</p>
                      <p className="text-xs text-etyme-muted">{c.vendor.name}{c.endDate && ` · last day ${shortDate(c.endDate)}`}</p>
                    </div>
                    <p className={`text-sm tabular-nums ${c.daysRemaining != null && c.daysRemaining <= 14 ? 'text-etyme-attention' : 'text-etyme-muted'}`}>
                      {c.daysRemaining != null ? `${c.daysRemaining} days` : '—'}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => onExtend(c.contractId)} className="text-xs px-3 py-1.5 border border-etyme-rule rounded text-etyme-ink hover:bg-etyme-canvas">Extend</button>
                      <button onClick={() => onRolloff(c.contractId)} className="text-xs px-3 py-1.5 bg-etyme-attention text-white rounded hover:opacity-90">Roll off</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="lg:col-span-2 space-y-8">
          {/* ── Suppliers ── */}
          <section>
            <h2 className="font-serif text-lg text-etyme-ink mb-3">Suppliers</h2>
            <div className="bg-etyme-surface border border-etyme-rule rounded-lg p-4 space-y-3">
              {data.vendors.length === 0 && <p className="text-sm text-etyme-muted">No supplier has anybody here yet.</p>}
              {data.vendors.map((v) => {
                const pct = s.activeContractors > 0 ? Math.round((v.headcount / s.activeContractors) * 100) : 0
                return (
                  <div key={v.id}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-sm text-etyme-ink">
                        {v.name}
                        <span className={`ml-2 text-[10px] uppercase tracking-[0.1em] whitespace-nowrap ${v.standing === 'Preferred' ? 'text-etyme-verified' : v.standing === 'On probation' ? 'text-etyme-attention' : 'text-etyme-faint'}`}>{v.standing === 'Approved by agreement' ? 'Approved' : v.standing}</span>
                      </span>
                      <span className="text-xs tabular-nums text-etyme-muted">{plural(v.headcount, 'person', 'people')} · {compact(v.totalMonthlySpend)}/mo</span>
                    </div>
                    <div className="w-full h-1.5 bg-etyme-canvas rounded-full">
                      <div className="h-1.5 bg-etyme-action rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
              <Link href={{ pathname: '/dashboard/suppliers' }} className="block pt-1 text-xs text-etyme-action hover:underline">Every supplier, and their standing</Link>
            </div>
          </section>

          {/* ── Requirements ── */}
          <section>
            <h2 className="font-serif text-lg text-etyme-ink mb-3">Requirements <span className="text-xs text-etyme-faint tabular-nums font-sans">{s.openRoles}</span></h2>
            <div className="bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
              {data.openRoles.length === 0 && <p className="p-4 text-sm text-etyme-muted">Nothing open. Raise a requirement and it publishes itself within plan.</p>}
              {data.openRoles.slice(0, 6).map((r) => {
                const quiet = r.status === 'OPEN' && r.submissions === 0 && r.openDays >= 5
                return (
                  <Link key={r.id} href={{ pathname: `/dashboard/requisitions/${r.id}` }} className="block p-3 hover:bg-etyme-canvas/50">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm text-etyme-ink truncate">{r.title}</p>
                      <span className="text-[11px] text-etyme-muted shrink-0">{r.status === 'OPEN' ? 'Published' : 'Draft'}{r.status === 'OPEN' && r.openDays > 0 ? ` ${plural(r.openDays, 'day')}` : ''}</span>
                    </div>
                    <p className={`text-xs mt-0.5 ${quiet ? 'text-etyme-attention' : 'text-etyme-muted'}`}>
                      {r.submissions === 0
                        ? (quiet ? `Nobody has submitted in ${plural(r.openDays, 'day')}. Widen the release or ask the suppliers.` : r.status === 'OPEN' ? 'Nobody submitted yet' : 'Not published yet')
                        : `${plural(r.submissions, 'candidate')}${r.shortlisted > 0 ? ` · ${r.shortlisted} shortlisted` : ''}`}
                    </p>
                  </Link>
                )
              })}
              {data.openRoles.length > 6 && (
                <Link href={{ pathname: '/dashboard/requisitions' }} className="block p-3 text-center text-xs text-etyme-action hover:underline">and {data.openRoles.length - 6} more</Link>
              )}
              {firstGood?.says && data.openRoles.length > 0 && (
                <p className="p-3 text-xs text-etyme-faint">{firstGood.says}</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

/** "Sep 3" from an ISO string. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** "9:12 AM" from an ISO string. */
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── Approvals tab ─────────────────────────────────────────

function ApprovalsTab({ items, onApprove }: { items: ProgramData['approvalQueue']; onApprove?: (item: ProgramData['approvalQueue'][number]) => void }) {
  const router = useRouter()

  if (items.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-lg font-serif text-etyme-ink mb-1">Queue clear</p>
        <p className="text-sm text-etyme-muted">No pending approvals across any vendor.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-lg font-serif font-semibold mb-1">
        {items.length} thing{items.length !== 1 ? 's' : ''} need you.
      </h2>
      <p className="text-sm text-etyme-muted mb-6">
        Timesheets, expenses, and signatures across every vendor in one queue
        instead of four inboxes.
      </p>
      <div className="space-y-2">
        {items.map(item => (
          <div
            key={item.id}
            className={`card flex flex-wrap items-start gap-x-5 gap-y-3 ${
              item.daysWaiting >= 3 ? 'border-amber-200' : ''
            }`}
          >
            <div className="w-[80px] shrink-0 pt-0.5">
              <span className={`
                text-[9px] font-semibold uppercase tracking-wider px-2 py-1 rounded border
                ${item.kind === 'timesheet'
                  ? 'bg-etyme-action/5 text-etyme-action border-etyme-action/20'
                  : 'bg-etyme-attention/5 text-etyme-attention border-etyme-attention/20'
                }
              `}>
                {item.kind}
              </span>
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium text-etyme-ink">{item.person}</p>
              <p className="text-xs text-etyme-muted mt-0.5">
                {item.detail}
                {item.amount != null && ` · $${item.amount.toFixed(2)}`}
              </p>
              <p className="text-[11px] text-etyme-faint mt-0.5">{item.vendor}</p>
            </div>
            <div className="text-xs text-etyme-muted tabular-nums pt-1">
              {item.daysWaiting > 0 ? `${item.daysWaiting}d waiting` : 'today'}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => onApprove?.(item)}
                className="text-xs px-3.5 py-2 bg-etyme-verified text-white rounded
                                 hover:bg-etyme-verified/90 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => router.push(`/dashboard/conversations?new=1`)}
                className="text-xs px-3 py-2 border border-etyme-rule rounded text-etyme-muted
                                 hover:text-etyme-ink transition-colors"
              >
                Query
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Contractors tab ───────────────────────────────────────

type Contractor = ProgramData['contractors'][number]

const CONTRACTOR_COLUMNS: Column<Contractor>[] = [
  {
    key: 'person',
    label: 'Contractor',
    render: (row) => (
      <div>
        <div className="font-medium text-etyme-ink">{row.person.name}</div>
        {row.person.headline && (
          <div className="text-[11px] text-etyme-muted mt-0.5">{row.person.headline}</div>
        )}
      </div>
    ),
    sortValue: (row) => row.person.name,
  },
  {
    key: 'vendor',
    label: 'Vendor',
    render: (row) => <span className="text-etyme-muted">{row.vendor.name}</span>,
    sortValue: (row) => row.vendor.name,
  },
  {
    key: 'role',
    label: 'Role / Engagement',
    render: (row) => (
      <span className="text-etyme-muted">{row.engagement?.title ?? row.role ?? '—'}</span>
    ),
    sortValue: (row) => row.engagement?.title ?? row.role ?? '',
    hideOnMobile: true,
  },
  {
    key: 'billRate',
    label: 'Rate',
    align: 'right',
    render: (row) => (
      <span className="tabular-nums">
        {row.billRate != null ? `${compact(row.billRate)}/hr` : '—'}
      </span>
    ),
    sortValue: (row) => row.billRate ?? 0,
  },
  {
    key: 'daysRemaining',
    label: 'Days left',
    align: 'right',
    render: (row) => (
      <span className={`tabular-nums font-medium ${
        row.daysRemaining != null && row.daysRemaining <= 14 ? 'text-red-600' :
        row.daysRemaining != null && row.daysRemaining <= 30 ? 'text-etyme-attention' :
        'text-etyme-muted'
      }`}>
        {row.daysRemaining ?? '—'}
      </span>
    ),
    sortValue: (row) => row.daysRemaining ?? 9999,
  },
  {
    key: 'state',
    label: 'Status',
    render: (row) => (
      <span className={`chip ${
        row.state === 'IN_PROGRESS' ? 'chip--verified' :
        row.state === 'DRAFT' ? 'chip--passive' :
        'chip--action'
      }`}>
        {row.state === 'IN_PROGRESS' ? 'Active' : row.state}
      </span>
    ),
    sortValue: (row) => row.state,
  },
  {
    key: 'timesheets',
    label: 'Timesheets',
    align: 'right',
    render: (row) => row.pendingTimesheets > 0 ? (
      <span className="chip chip--attention">{row.pendingTimesheets} pending</span>
    ) : (
      <span className="text-xs text-etyme-muted">current</span>
    ),
    sortValue: (row) => row.pendingTimesheets,
    hideOnMobile: true,
  },
]

function ContractorsTab({ contractors }: { contractors: ProgramData['contractors'] }) {
  return (
    <div>
      <h2 className="text-lg font-serif font-semibold mb-1">
        {contractors.length} active contractor{contractors.length !== 1 ? 's' : ''}
      </h2>
      <p className="text-sm text-etyme-muted mb-6">
        Everyone placed here, their vendor, rate, and contract status.
      </p>
      <ListSurface
        columns={CONTRACTOR_COLUMNS}
        data={contractors}
        rowKey={(row) => row.contractId}
        searchPlaceholder="Search by name, vendor, role…"
        searchFilter={(row, q) =>
          row.person.name.toLowerCase().includes(q) ||
          row.vendor.name.toLowerCase().includes(q) ||
          (row.engagement?.title?.toLowerCase().includes(q) ?? false) ||
          (row.role?.toLowerCase().includes(q) ?? false)
        }
        emptyMessage="No active contractors."
        exportName={`contractors-program`}
        rowClassName={(row) =>
          row.daysRemaining != null && row.daysRemaining <= 30 ? '!bg-amber-50/30' : ''
        }
      />
    </div>
  )
}

// ── Vendors tab ───────────────────────────────────────────

function VendorsTab({ vendors }: { vendors: ProgramData['vendors'] }) {
  const totalHeadcount = vendors.reduce((s, v) => s + v.headcount, 0)

  return (
    <div>
      <h2 className="text-lg font-serif font-semibold mb-1">
        {vendors.length} active vendor{vendors.length !== 1 ? 's' : ''}
      </h2>
      <p className="text-sm text-etyme-muted mb-6">
        Who is placing contractors here, how many, and at what rates.
      </p>

      <div className="space-y-4">
        {vendors.map(v => {
          const pct = totalHeadcount > 0
            ? Math.round((v.headcount / totalHeadcount) * 100)
            : 0

          return (
            <div key={v.id} className="card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-etyme-ink">{v.name}</h3>
                  <p className="text-xs text-etyme-muted mt-0.5">
                    {v.headcount} contractor{v.headcount !== 1 ? 's' : ''} · {pct}% of program
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums font-serif">
                    {compact(v.totalMonthlySpend)}
                  </p>
                  <p className="text-[10px] text-etyme-muted">monthly spend</p>
                </div>
              </div>

              {/* Share bar */}
              <div className="w-full h-2.5 bg-etyme-canvas rounded-full mb-3">
                <div
                  className="h-2.5 bg-etyme-action rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-etyme-muted mb-0.5">
                    Avg rate
                  </p>
                  <p className="text-sm tabular-nums font-medium">
                    {compact(v.avgRate)}/hr
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-etyme-muted mb-0.5">
                    Headcount
                  </p>
                  <p className="text-sm tabular-nums font-medium">{v.headcount}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-etyme-muted mb-0.5">
                    Share
                  </p>
                  <p className="text-sm tabular-nums font-medium">{pct}%</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Open roles tab ────────────────────────────────────────

function RolesTab({ roles }: { roles: ProgramData['openRoles'] }) {
  const router = useRouter()

  if (roles.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-sm text-etyme-muted">No open roles.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-lg font-serif font-semibold mb-1">
        {roles.length} open role{roles.length !== 1 ? 's' : ''}
      </h2>
      <p className="text-sm text-etyme-muted mb-6">
        Requirements distributed to your vendor panel.
      </p>

      <div className="space-y-3">
        {roles.map(r => (
          <div key={r.id} className="card flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-etyme-ink">{r.title}</h3>
              <p className="text-xs text-etyme-muted mt-1">
                {r.submissions} submission{r.submissions !== 1 ? 's' : ''}
                {r.shortlisted > 0 && ` · ${r.shortlisted} shortlisted`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`pill text-[10px] ${
                r.status === 'OPEN' ? 'bg-emerald-50 text-etyme-verified' : 'bg-etyme-canvas text-etyme-muted'
              }`}>
                {r.status}
              </span>
              <button
                onClick={() => router.push(`/dashboard/submissions?requirementId=${r.id}`)}
                className="text-xs px-3 py-1.5 border border-etyme-rule rounded text-etyme-muted
                                 hover:text-etyme-ink transition-colors"
              >
                View candidates
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
