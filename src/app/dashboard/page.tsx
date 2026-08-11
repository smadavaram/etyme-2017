import type { Metadata } from 'next'

/**
 * Vendor Dashboard — the "Today" view.
 *
 * CLAUDE.md design system:
 *   Decision surfaces: "Prose, reasoning, confidence, calm. 3–10 items.
 *   Serif headlines, generous space. User decides well and leaves."
 *
 * Shows: active contracts, pending actions, pipeline stats, bench.
 * Phase 1: static layout with sample data so the founder can see the UI.
 */

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default function DashboardPage() {
  return (
    <div className="animate-fade-in">
      {/* Hero — today's summary */}
      <div className="mb-8">
        <div className="eyebrow mb-2">Today · August 11</div>
        <h1 className="headline-serif text-heading text-etyme-ink mb-2">
          Good morning, Sharath
        </h1>
        <p className="text-body text-etyme-muted max-w-xl">
          3 timesheets pending approval, 2 contracts need verification documents,
          and 1 requirement invitation expires tomorrow.
        </p>
      </div>

      {/* Stat cards — the metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Active Contracts"
          value="24"
          subtitle="18 sell · 6 buy"
          tone="default"
        />
        <StatCard
          label="Pipeline"
          value="$42K"
          subtitle="monthly revenue"
          tone="default"
        />
        <StatCard
          label="Pending Actions"
          value="6"
          subtitle="3 timesheets · 2 docs · 1 expiring"
          tone="attention"
        />
        <StatCard
          label="On Bench"
          value="8"
          subtitle="3 available now"
          tone="verified"
        />
      </div>

      {/* Two-column layout: decision surface + working surface */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left — Pending actions (decision surface) */}
        <div className="lg:col-span-3">
          <div className="panel">
            <h2 className="headline-serif text-[18px] text-etyme-ink mb-4">
              Yours to decide
            </h2>

            <div className="space-y-0">
              <ActionItem
                title="Ravi Patel — Week of Aug 4"
                subtitle="Applied Materials · 40 hours · $6,000"
                status="pending"
                action="Approve"
              />
              <ActionItem
                title="Priya Sharma — Week of Aug 4"
                subtitle="Cisco Systems · 40 hours · $5,200"
                status="pending"
                action="Approve"
              />
              <ActionItem
                title="Ajay Kumar — Week of Aug 4"
                subtitle="Intel Corp · 32 hours · $3,840"
                status="anomaly"
                action="Review"
              />
              <ActionItem
                title="Insurance COI expires in 14 days"
                subtitle="General Liability · Hartford · Renew before Aug 25"
                status="attention"
                action="Renew"
              />
              <ActionItem
                title="SAP FICO Consultant — Deloitte"
                subtitle="$120–$140/hr · Remote · 12 months · Expires tomorrow"
                status="expiring"
                action="Respond"
              />
            </div>
          </div>
        </div>

        {/* Right — Bench + pipeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Bench snapshot */}
          <div className="panel">
            <h2 className="headline-serif text-[18px] text-etyme-ink mb-4">
              Bench
            </h2>
            <div className="space-y-2.5">
              <BenchItem name="Sanjay Reddy"   skill="SAP MM"       status="available"    days={12} />
              <BenchItem name="Meera Nair"     skill="SAP ABAP"     status="available"    days={5} />
              <BenchItem name="Kiran Desai"    skill="SAP BW"       status="interviewing" days={0} />
              <BenchItem name="Anita Gupta"    skill=".NET / Azure" status="training"     days={0} />
            </div>
          </div>

          {/* Contract pipeline */}
          <div className="panel">
            <h2 className="headline-serif text-[18px] text-etyme-ink mb-4">
              Contract Pipeline
            </h2>
            <div className="space-y-2.5">
              <PipelineRow label="Draft"                count={3}  color="faint" />
              <PipelineRow label="Pending Verification" count={2}  color="attention" />
              <PipelineRow label="Verified"             count={1}  color="action" />
              <PipelineRow label="In Progress"          count={18} color="verified" />
            </div>
          </div>

          {/* Profitability */}
          <div className="panel">
            <h2 className="headline-serif text-[18px] text-etyme-ink mb-3">
              Profitability
            </h2>
            <div className="flex items-baseline gap-2">
              <span className="stat-value text-etyme-verified">34%</span>
              <span className="text-body-sm text-etyme-faint">avg margin</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="stat-label">Sell Revenue</div>
                <div className="text-[16px] font-serif font-medium tabular-nums mt-0.5">$126K</div>
              </div>
              <div>
                <div className="stat-label">Buy Cost</div>
                <div className="text-[16px] font-serif font-medium tabular-nums mt-0.5">$83K</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Components ────────────────────────────

function StatCard({
  label, value, subtitle, tone,
}: {
  label: string
  value: string
  subtitle: string
  tone: 'default' | 'attention' | 'verified'
}) {
  const valueColor = {
    default:   'text-etyme-ink',
    attention: 'text-etyme-attention',
    verified:  'text-etyme-verified',
  }[tone]

  return (
    <div className="panel">
      <div className="stat-label mb-2">{label}</div>
      <div className={`stat-value ${valueColor}`}>{value}</div>
      <div className="text-[12px] text-etyme-faint mt-1">{subtitle}</div>
    </div>
  )
}

function ActionItem({
  title, subtitle, status, action,
}: {
  title: string
  subtitle: string
  status: 'pending' | 'anomaly' | 'attention' | 'expiring'
  action: string
}) {
  const dotClass = {
    pending:   'evidence-dot--pending',
    anomaly:   'evidence-dot--blocked',
    attention: 'evidence-dot--pending',
    expiring:  'evidence-dot--blocked',
  }[status]

  const chipClass = {
    pending:   'chip--action',
    anomaly:   'chip--danger',
    attention: 'chip--attention',
    expiring:  'chip--danger',
  }[status]

  return (
    <div className="flex items-start gap-3 py-3 border-b border-etyme-rule last:border-b-0">
      <span className={`evidence-dot ${dotClass} mt-1.5 flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-etyme-ink">{title}</div>
        <div className="text-[12px] text-etyme-muted mt-0.5">{subtitle}</div>
      </div>
      <span className={`chip ${chipClass} flex-shrink-0 mt-0.5`}>
        {action}
      </span>
    </div>
  )
}

function BenchItem({
  name, skill, status, days,
}: {
  name: string
  skill: string
  status: 'available' | 'interviewing' | 'training'
  days: number
}) {
  const chipClass = {
    available:    'chip--verified',
    interviewing: 'chip--action',
    training:     'chip--attention',
  }[status]

  const chipText = status === 'available' ? `${days}d` : status

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-7 h-7 rounded-full bg-etyme-action/10 text-etyme-action
                      text-[10px] font-bold flex items-center justify-center flex-shrink-0">
        {name.split(' ').map(n => n[0]).join('')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-etyme-ink truncate">{name}</div>
        <div className="text-[11px] text-etyme-faint">{skill}</div>
      </div>
      <span className={`chip ${chipClass}`}>{chipText}</span>
    </div>
  )
}

function PipelineRow({
  label, count, color,
}: {
  label: string
  count: number
  color: 'faint' | 'attention' | 'action' | 'verified'
}) {
  const barColor = {
    faint:     'bg-etyme-faint/30',
    attention: 'bg-etyme-attention/60',
    action:    'bg-etyme-action/60',
    verified:  'bg-etyme-verified/60',
  }[color]

  const maxWidth = Math.max(10, (count / 20) * 100)

  return (
    <div className="flex items-center gap-3">
      <div className="w-[140px] text-[12px] text-etyme-muted truncate">{label}</div>
      <div className="flex-1 h-[6px] bg-etyme-rule/50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${maxWidth}%` }}
        />
      </div>
      <div className="w-6 text-right text-[12px] font-medium text-etyme-ink tabular-nums">
        {count}
      </div>
    </div>
  )
}
