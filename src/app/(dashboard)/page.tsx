import { EtymeClockMark } from '@/components/logo'

export const metadata = {
  title: 'Dashboard',
}

/** Stat card for the dashboard grid */
function StatCard({
  label,
  value,
  detail,
  color = 'blue',
}: {
  label: string
  value: string
  detail?: string
  color?: 'blue' | 'green' | 'amber' | 'purple'
}) {
  const colors = {
    blue: 'bg-etyme-blue/5 text-etyme-blue',
    green: 'bg-emerald-50 text-etyme-green',
    amber: 'bg-amber-50 text-etyme-amber',
    purple: 'bg-purple-50 text-etyme-purple',
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-etyme-muted">
          {label}
        </span>
        <span className={`pill text-[10px] ${colors[color]}`}>
          Live
        </span>
      </div>
      <div className="text-2xl font-semibold tabular-nums mb-0.5">{value}</div>
      {detail && <div className="text-xs text-etyme-muted">{detail}</div>}
    </div>
  )
}

/** Module card for BUILD.md week progress */
function ModuleCard({
  title,
  week,
  status,
  items,
}: {
  title: string
  week: string
  status: 'ready' | 'building' | 'planned'
  items: string[]
}) {
  const statusStyles = {
    ready: 'bg-emerald-50 text-etyme-green border-emerald-200',
    building: 'bg-amber-50 text-etyme-amber border-amber-200',
    planned: 'bg-slate-50 text-etyme-muted border-slate-200',
  }

  const statusLabels = {
    ready: 'Ready',
    building: 'Building',
    planned: 'Planned',
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className={`pill border ${statusStyles[status]}`}>
          {statusLabels[status]}
        </span>
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-etyme-muted mb-2">
        {week}
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2 text-xs text-etyme-muted">
            <span className="evidence-dot" style={{ opacity: status === 'planned' ? 0.3 : 1 }} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Dashboard</h1>
          <p className="text-sm text-etyme-muted mt-1">
            Cloudepa · SAP/ERP Staffing · System of Record
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 text-sm font-medium rounded-lg border border-etyme-border
                             hover:bg-white transition-colors">
            Import data
          </button>
          <button className="px-4 py-2 text-sm font-medium rounded-lg bg-etyme-ink text-white
                             hover:bg-etyme-navy transition-colors">
            New requirement
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active assignments" value="0" detail="Per-assignment billing starts here" color="blue" />
        <StatCard label="On bench" value="0" detail="Bench burn: $0/day" color="amber" />
        <StatCard label="Releasing soon" value="0" detail="Next 28 days" color="purple" />
        <StatCard label="Open requirements" value="0" detail="Awaiting submissions" color="green" />
      </div>

      {/* Decision Queue */}
      <div className="card mb-8">
        <div className="flex items-center gap-2 mb-4">
          <EtymeClockMark size={18} />
          <h2 className="text-sm font-semibold">Decision queue</h2>
          <span className="pill bg-etyme-ground text-etyme-muted text-[10px]">
            0 pending
          </span>
        </div>
        <div className="text-center py-8">
          <p className="text-sm text-etyme-muted">
            Nothing needs your attention right now.
          </p>
          <p className="text-xs text-etyme-muted/60 mt-1">
            Rolloff events, compliance blocks, and rate approvals will appear here.
          </p>
        </div>
      </div>

      {/* Build Progress — the modules from BUILD.md */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Build progress</h2>
        <span className="text-xs text-etyme-muted">4-week plan from BUILD.md</span>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <ModuleCard
          title="Identity & Onboarding"
          week="Week 1"
          status="building"
          items={[
            'NextAuth (Microsoft, Google, Email)',
            'Company creation with slug + 7 roles',
            'Template packs (contract types, cycles)',
          ]}
        />
        <ModuleCard
          title="Data Import"
          week="Week 2"
          status="planned"
          items={[
            'Upload + AI column mapping',
            'Review table with inline fixes',
            'Commit with progressive visibility',
          ]}
        />
        <ModuleCard
          title="Supply & Demand"
          week="Week 3"
          status="planned"
          items={[
            'Requirements + Claude parsing',
            'Matching with factors + unknowns',
            'Submissions with both ledgers',
          ]}
        />
        <ModuleCard
          title="Work & Money"
          week="Week 4"
          status="planned"
          items={[
            'Assignments + cycle generation',
            'Timesheets + approval',
            'Rolloff scan + automation log',
          ]}
        />
      </div>

      {/* Automation Log */}
      <div className="card">
        <h2 className="text-sm font-semibold mb-1">Automation log</h2>
        <p className="text-xs text-etyme-muted mb-4">
          Every action the system takes unprompted, with a plain-English reason and an honest reversible flag.
        </p>
        <div className="text-center py-6">
          <p className="text-xs text-etyme-muted/60">
            No automated actions yet. The log begins when the first requirement is distributed.
          </p>
        </div>
      </div>
    </>
  )
}
