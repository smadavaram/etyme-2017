'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * How this company is set up.
 *
 * This is the floor everything else stands on, and it was missing. A
 * company signed up and received one role called Owner and nothing else —
 * no cycle calendar, so nothing was ever due; no holidays, so dates only
 * avoided weekends; no cost centres, so every requisition was spend
 * nobody owned and went to a human for approval.
 *
 * Sign-up now fills all of this in. This screen is where it gets
 * corrected, because a default is a starting point and not a decision
 * taken away.
 */

// ── Types ────────────────────────────────────────────

interface Company {
  id: string
  name: string
  slug: string
  domain: string | null
  domainVerified: boolean
  kind: string
  supplierPosture: string | null
  currency: string
  templatePack: string | null
  teamsWebhookUrl: string | null
  teamsConfigured: boolean
  networkVerifiedAt: string | null
}
interface Role {
  id: string
  name: string
  permissions: string[]
  isDefault: boolean
  heldBy: number
}
interface Location {
  id: string
  name: string
  city: string | null
  state: string | null
  country: string
  isRemote: boolean
  isPrimary: boolean
}
interface Holiday {
  id: string
  date: string
  name: string
}
interface CostCenter {
  id: string
  code: string
  name: string
  glAccount: string | null
}
interface Pack {
  id: string
  label: string
  cycleCount: number
  cycles: { kind: string; label: string; frequency: string }[]
}
interface Wall {
  outsideAccess: string
  accountWalls: boolean
  explanation: string
  canSeeOutside: { role: string; heldBy: number }[]
}
interface Settings {
  wall?: Wall
  company: Company
  roles: Role[]
  locations: Location[]
  holidays: Holiday[]
  costCenters: CostCenter[]
  templatePack: Pack | null
  canEdit: boolean
}

// ── Bits ─────────────────────────────────────────────

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium">{children}</div>
}

function Panel({ title, subtitle, children, action }: {
  title: string
  subtitle?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="bg-etyme-surface border border-etyme-rule rounded-lg p-5 mb-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-serif text-[19px] text-etyme-ink tracking-[-0.02em]">{title}</h2>
          {subtitle && <p className="text-[13px] text-etyme-muted mt-1 max-w-prose">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-etyme-faint py-3">{children}</p>
}

const TABS = ['Company', 'Walls', 'Address', 'Roles', 'Approvals', 'Locations', 'Holidays', 'Cost centres', 'Cycles'] as const
type Tab = (typeof TABS)[number]

// ── Page ─────────────────────────────────────────────

export default function SettingsPage() {
  const [data, setData] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('Company')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setData(body.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function send(path: string, method: string, payload?: unknown) {
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      const res = await fetch(path, {
        method,
        ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setFlash(body.data?.message ?? 'Saved.')
      await load()
      return body.data
    } catch (e: any) {
      setError(e.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="text-etyme-muted text-sm">Loading your setup…</p>
  }
  if (!data) {
    return <p className="text-etyme-attention text-sm">{error ?? 'Could not load settings.'}</p>
  }

  const { company, canEdit } = data

  return (
    <>
      <div className="page-head mb-6">
        <p className="eyebrow">Settings</p>
        <h1>How {company.name} is set up</h1>
        <p>
          Sign-up filled this in from your email domain and what your company does.
          Everything here can be changed.
        </p>
      </div>

      {!canEdit && (
        <div className="mb-5 rounded-md border border-etyme-rule bg-etyme-canvas p-3">
          <p className="text-[13px] text-etyme-ink">
            You can read this but not change it. Editing settings needs the settings.manage
            permission — ask whoever gave you your role.
          </p>
        </div>
      )}

      {flash && (
        <div className="mb-5 rounded-md border border-etyme-verified/30 bg-etyme-verified/5 p-3">
          <p className="text-[13px] text-etyme-verified">{flash}</p>
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-md border border-etyme-attention/30 bg-etyme-attention/5 p-3">
          <p className="text-[13px] text-etyme-attention">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded text-[13px] transition-colors ${
              tab === t
                ? 'bg-etyme-ink text-white'
                : 'bg-etyme-surface border border-etyme-rule text-etyme-muted hover:text-etyme-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Company' && <CompanyTab data={data} send={send} busy={busy} />}
      {tab === 'Walls' && <WallsTab data={data} send={send} busy={busy} />}
      {tab === 'Address' && <AddressTab send={send} busy={busy} />}
      {tab === 'Roles' && <RolesTab data={data} send={send} busy={busy} />}
      {tab === 'Approvals' && <ApprovalsTab send={send} busy={busy} />}
      {tab === 'Locations' && <LocationsTab data={data} send={send} busy={busy} />}
      {tab === 'Holidays' && <HolidaysTab data={data} send={send} busy={busy} />}
      {tab === 'Cost centres' && <CostCentersTab data={data} send={send} busy={busy} />}
      {tab === 'Cycles' && <CyclesTab data={data} />}
    </>
  )
}

type SendFn = (path: string, method: string, payload?: unknown) => Promise<any>

// ── Walls ────────────────────────────────────────────
//
// A staffing vendor lives in the market. A delivery firm with thirty
// thousand employees and a contractor desk of nine is the opposite, and
// the difference cannot be a product decision — it is this screen.

function WallsTab({ data, send, busy }: { data: Settings; send: SendFn; busy: boolean }) {
  const w = data.wall
  if (!w) return <Empty>Nothing to show.</Empty>

  const options: { value: string; label: string; blurb: string }[] = [
    {
      value: 'ALLOWED',
      label: 'Anybody who can read consultants',
      blurb: 'Right for a staffing firm, where looking outward is the job.',
    },
    {
      value: 'NAMED_ONLY',
      label: 'Only the roles below',
      blurb: 'Right for a delivery firm or an enterprise, where a handful of people hire contractors and the rest have no reason to see the market.',
    },
    {
      value: 'CLOSED',
      label: 'Nobody, whatever their role',
      blurb: 'Shuts the door without auditing every role. No role can reopen it.',
    },
  ]

  return (
    <>
      <Panel
        title="Who here can see outside this company"
        subtitle={w.explanation}
      >
        <div className="space-y-3">
          {options.map((o) => (
            <label key={o.value} className="flex gap-3 items-start cursor-pointer">
              <input
                type="radio"
                name="outsideAccess"
                className="mt-1"
                checked={w.outsideAccess === o.value}
                disabled={busy || !data.canEdit}
                onChange={() => send('/api/settings', 'PATCH', { outsideAccess: o.value })}
              />
              <span>
                <span className="text-[14px] text-etyme-ink">{o.label}</span>
                <span className="block text-[13px] text-etyme-muted max-w-prose">{o.blurb}</span>
              </span>
            </label>
          ))}
        </div>

        {w.outsideAccess !== 'CLOSED' && (
          <div className="mt-5 pt-4 border-t border-etyme-rule">
            <Lbl>Roles that can</Lbl>
            {w.canSeeOutside.length === 0 ? (
              <Empty>Nobody. Give a role network access and it appears here.</Empty>
            ) : (
              <div className="mt-2 space-y-1.5">
                {w.canSeeOutside.map((r) => (
                  <div key={r.role} className="flex items-baseline justify-between max-w-sm">
                    <span className="text-[14px] text-etyme-ink">{r.role}</span>
                    <span className="text-[12px] text-etyme-muted tabular-nums">
                      {r.heldBy} {r.heldBy === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel
        title="One client account seeing another"
        subtitle="Whether somebody attached to a client account can read the staffing, rates and rolloffs of the accounts next door. Attaching people to accounts is what builds the wall; anybody attached to none still sees the whole firm."
      >
        <label className="flex items-center gap-2 text-[14px] text-etyme-ink cursor-pointer">
          <input
            type="checkbox"
            checked={w.accountWalls}
            disabled={busy || !data.canEdit}
            onChange={() => send('/api/settings', 'PATCH', { accountWalls: !w.accountWalls })}
          />
          Keep each account&rsquo;s work to that account
        </label>
      </Panel>
    </>
  )
}

// ── Company ──────────────────────────────────────────

function CompanyTab({ data, send, busy }: { data: Settings; send: SendFn; busy: boolean }) {
  const c = data.company
  const [name, setName] = useState(c.name)
  const [currency, setCurrency] = useState(c.currency)
  const [teams, setTeams] = useState(c.teamsWebhookUrl ?? '')

  return (
    <>
      <Panel
        title="Who you are"
        subtitle="Your domain is not editable. It came from your identity provider and it is what decides who joins this company automatically."
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <Lbl>Company name</Lbl>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!data.canEdit}
              className="w-full mt-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm disabled:opacity-60"
            />
          </label>
          <label className="block">
            <Lbl>Currency</Lbl>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              disabled={!data.canEdit}
              className="w-full mt-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm disabled:opacity-60"
            />
          </label>
          <div>
            <Lbl>Domain</Lbl>
            <p className="mt-1 text-sm text-etyme-ink">
              {c.domain ?? '—'}{' '}
              {c.domainVerified && <span className="text-etyme-verified text-[12px]">verified</span>}
            </p>
          </div>
          <div>
            <Lbl>Type</Lbl>
            <p className="mt-1 text-sm text-etyme-ink">
              {c.kind}
              {c.supplierPosture ? ` · ${c.supplierPosture}` : ''}
            </p>
          </div>
        </div>

        {data.canEdit && (
          <button
            onClick={() => send('/api/settings', 'PATCH', { name, currency })}
            disabled={busy}
            className="mt-4 px-4 py-2 rounded bg-etyme-action text-white text-[13px] font-medium disabled:opacity-50"
          >
            Save
          </button>
        )}
      </Panel>

      <Panel
        title="Where your people already are"
        subtitle="With a Teams channel set, notifications for this company post there. Without one they fall back to email — and where there is no email either, the notification says so rather than sitting in the app pretending it was sent."
      >
        <label className="block">
          <Lbl>Teams channel webhook</Lbl>
          <input
            value={teams}
            onChange={(e) => setTeams(e.target.value)}
            placeholder="https://…"
            disabled={!data.canEdit}
            className="w-full mt-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm disabled:opacity-60"
          />
        </label>
        <p className="text-[12px] text-etyme-muted mt-2">
          {c.teamsConfigured
            ? 'Set up. Business notifications post to Teams.'
            : 'Not set up. Business notifications fall back to email.'}
        </p>
        {data.canEdit && (
          <button
            onClick={() => send('/api/settings', 'PATCH', { teamsWebhookUrl: teams.trim() || null })}
            // Nothing typed and nothing saved means there is nothing to do.
            // A "Remove channel" button with no channel to remove is a
            // control that lies about what it does.
            disabled={busy || (!teams.trim() && !c.teamsConfigured)}
            className="mt-3 px-4 py-2 rounded bg-etyme-action text-white text-[13px] font-medium disabled:opacity-40"
          >
            {teams.trim() ? 'Save channel' : 'Remove channel'}
          </button>
        )}
      </Panel>
    </>
  )
}

// ── Roles ────────────────────────────────────────────

function RolesTab({ data, send, busy }: { data: Settings; send: SendFn; busy: boolean }) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <Panel
      title="Roles"
      subtitle="What somebody can do here. These were chosen for what your company is — a client gets Hiring Manager, a supplier gets Recruiter. Changing a role changes what everyone holding it can do, immediately."
    >
      <div className="divide-y divide-etyme-rule">
        {data.roles.map((r) => (
          <div key={r.id} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <span className="text-[14px] text-etyme-ink font-medium">{r.name}</span>
                <span className="ml-2 text-[12px] text-etyme-faint tabular-nums">
                  {r.heldBy === 0 ? 'nobody holds this' : `${r.heldBy} person${r.heldBy === 1 ? '' : 's'}`}
                </span>
              </div>
              <button
                onClick={() => setOpen(open === r.id ? null : r.id)}
                className="text-[12px] text-etyme-action shrink-0"
              >
                {open === r.id ? 'Hide' : `${r.permissions.length} permissions`}
              </button>
            </div>
            {open === r.id && (
              <div className="mt-2 flex flex-wrap gap-1">
                {r.permissions.slice().sort().map((p) => (
                  <span key={p} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-etyme-canvas text-etyme-muted">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {data.roles.length === 0 && <Empty>No roles. That should not be possible — tell somebody.</Empty>}
    </Panel>
  )
}

// ── Locations ────────────────────────────────────────

function LocationsTab({ data, send, busy }: { data: Settings; send: SendFn; busy: boolean }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')

  return (
    <Panel
      title="Where people work"
      subtitle="This matters more than it looks. Tenure is counted at a place and tax follows a place, so a contract with no location cannot answer either question."
      action={null}
    >
      <div className="divide-y divide-etyme-rule mb-4">
        {data.locations.map((l) => (
          <div key={l.id} className="py-2.5 flex items-baseline justify-between gap-3">
            <div>
              <span className="text-[14px] text-etyme-ink">{l.name}</span>
              {l.isPrimary && <span className="ml-2 text-[11px] text-etyme-verified">primary</span>}
              {l.isRemote && <span className="ml-2 text-[11px] text-etyme-muted">remote</span>}
              <p className="text-[12px] text-etyme-faint">
                {[l.city, l.state, l.country].filter(Boolean).join(', ')}
              </p>
            </div>
            {data.canEdit && !l.isPrimary && (
              <div className="flex gap-3 shrink-0">
                <button
                  onClick={() => send('/api/settings/locations', 'PATCH', { id: l.id, isPrimary: true })}
                  disabled={busy}
                  className="text-[12px] text-etyme-action"
                >
                  Make primary
                </button>
                <button
                  onClick={() => send(`/api/settings/locations?id=${l.id}`, 'DELETE')}
                  disabled={busy}
                  className="text-[12px] text-etyme-attention"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {data.locations.length === 0 && <Empty>No locations yet.</Empty>}

      {data.canEdit && (
        <div className="border-t border-etyme-rule pt-4">
          <Lbl>Add a work site</Lbl>
          <div className="grid sm:grid-cols-3 gap-2 mt-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lakewood HQ"
              className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm" />
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lakewood"
              className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm" />
            <input value={state} onChange={(e) => setState(e.target.value)} placeholder="CO"
              className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm" />
          </div>
          <button
            onClick={async () => {
              const r = await send('/api/settings/locations', 'POST', { name, city, state })
              if (r) { setName(''); setCity(''); setState('') }
            }}
            disabled={busy || !name.trim()}
            className="mt-3 px-4 py-2 rounded bg-etyme-action text-white text-[13px] font-medium disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </Panel>
  )
}

// ── Holidays ─────────────────────────────────────────

function HolidaysTab({ data, send, busy }: { data: Settings; send: SendFn; busy: boolean }) {
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const nextYear = new Date().getFullYear() + 1

  return (
    <Panel
      title="Holiday calendar"
      subtitle="Cycle dates shift off weekends and off these days. An empty calendar means due dates land on public holidays and nobody notices until an invoice run fires on Christmas Day."
      action={
        data.canEdit ? (
          <button
            onClick={() => send('/api/settings/holidays', 'POST', { seedYear: nextYear, country: 'US' })}
            disabled={busy}
            className="px-3 py-1.5 rounded border border-etyme-rule text-[12px] text-etyme-ink disabled:opacity-50"
          >
            Add US holidays for {nextYear}
          </button>
        ) : null
      }
    >
      {data.holidays.length === 0 ? (
        <Empty>
          Nothing in the calendar. Every cycle date is currently computed against weekends only.
        </Empty>
      ) : (
        <div className="grid sm:grid-cols-2 gap-x-6">
          {data.holidays.map((h) => (
            <div key={h.id} className="py-1.5 flex items-baseline justify-between gap-3 border-b border-etyme-rule/60">
              <span className="text-[13px] text-etyme-ink">{h.name}</span>
              <span className="flex items-center gap-3 shrink-0">
                <span className="text-[12px] text-etyme-muted tabular-nums">{h.date}</span>
                {data.canEdit && (
                  <button
                    onClick={() => send(`/api/settings/holidays?id=${h.id}`, 'DELETE')}
                    disabled={busy}
                    className="text-[11px] text-etyme-attention"
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.canEdit && (
        <div className="border-t border-etyme-rule pt-4 mt-4">
          <Lbl>Add a day of your own</Lbl>
          <div className="grid sm:grid-cols-2 gap-2 mt-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm" />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company shutdown"
              className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm" />
          </div>
          <button
            onClick={async () => {
              const r = await send('/api/settings/holidays', 'POST', { date, name })
              if (r) { setDate(''); setName('') }
            }}
            disabled={busy || !date || !name.trim()}
            className="mt-3 px-4 py-2 rounded bg-etyme-action text-white text-[13px] font-medium disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </Panel>
  )
}

// ── Cost centres ─────────────────────────────────────

function CostCentersTab({ data, send, busy }: { data: Settings; send: SendFn; busy: boolean }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [gl, setGl] = useState('')

  return (
    <Panel
      title="Cost centres"
      subtitle="Who owns the spend. A requisition with no cost centre is spend nobody owns, so it goes to a human for approval — which is why a company with none routes everything to a human. The code must match your ERP exactly; the coded invoice export posts straight into it."
    >
      {data.costCenters.length === 0 ? (
        <Empty>
          None yet. Every requisition will be routed for approval because nobody owns the budget.
        </Empty>
      ) : (
        <div className="divide-y divide-etyme-rule mb-4">
          {data.costCenters.map((cc) => (
            <div key={cc.id} className="py-2.5 flex items-baseline justify-between gap-3">
              <div>
                <span className="text-[13px] font-mono text-etyme-ink">{cc.code}</span>
                <span className="ml-3 text-[13px] text-etyme-muted">{cc.name}</span>
              </div>
              <span className="flex items-center gap-3 shrink-0">
                {cc.glAccount && (
                  <span className="text-[12px] font-mono text-etyme-faint">GL {cc.glAccount}</span>
                )}
                {data.canEdit && (
                  <button
                    onClick={() => send(`/api/settings/cost-centers?id=${cc.id}`, 'DELETE')}
                    disabled={busy}
                    className="text-[12px] text-etyme-attention"
                  >
                    Retire
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.canEdit && (
        <div className="border-t border-etyme-rule pt-4">
          <Lbl>Add a cost centre</Lbl>
          <div className="grid sm:grid-cols-3 gap-2 mt-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MFG-FIN-4100"
              className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm font-mono" />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Manufacturing Finance"
              className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm" />
            <input value={gl} onChange={(e) => setGl(e.target.value)} placeholder="GL 6120"
              className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm font-mono" />
          </div>
          <button
            onClick={async () => {
              const r = await send('/api/settings/cost-centers', 'POST', { code, name, glAccount: gl || null })
              if (r) { setCode(''); setName(''); setGl('') }
            }}
            disabled={busy || !code.trim() || !name.trim()}
            className="mt-3 px-4 py-2 rounded bg-etyme-action text-white text-[13px] font-medium disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </Panel>
  )
}

// ── Cycles ───────────────────────────────────────────

function CyclesTab({ data }: { data: Settings }) {
  const pack = data.templatePack
  return (
    <Panel
      title="Your cycle calendar"
      subtitle="Chosen at sign-up from where you are and what you do. It decides when timesheets are due, when invoices generate, and when payroll runs — every date a contract produces comes from here."
    >
      {!pack ? (
        <Empty>
          No template pack. Contracts will generate no due dates at all, so nothing will ever be
          owed or chased. This should not happen — tell somebody.
        </Empty>
      ) : (
        <>
          <p className="text-[14px] text-etyme-ink mb-3">
            {pack.label}{' '}
            <span className="text-[12px] text-etyme-faint tabular-nums">
              · {pack.cycleCount} kinds of due date
            </span>
          </p>
          <div className="grid sm:grid-cols-2 gap-x-6">
            {pack.cycles.map((c) => (
              <div key={c.kind} className="py-1.5 flex items-baseline justify-between gap-3 border-b border-etyme-rule/60">
                <span className="text-[13px] text-etyme-ink">{c.label}</span>
                <span className="text-[11px] text-etyme-muted shrink-0">{c.frequency.toLowerCase()}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}

// ── Approvals ────────────────────────────────────────

interface Rule {
  id: string
  name: string
  thresholdDollars: number | null
  rank: number
  isActive: boolean
  approver: { id: string; name: string; primaryEmail: string }
  authoredBy: { id: string; name: string } | null
  history: {
    id: string
    action: string
    reason: string | null
    notes: string[]
    changedBy: string
    changedAt: string
  }[]
}

function ApprovalsTab({ send, busy }: { send: SendFn; busy: boolean }) {
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [summary, setSummary] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/approval-rules')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setRules(body.data.rules)
      setSummary(body.data.summary)
      setCanEdit(body.data.canEdit)
    } catch (e: any) {
      setErr(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (err) {
    return (
      <Panel title="Who has to say yes" subtitle="">
        <p className="text-[13px] text-etyme-attention">{err}</p>
      </Panel>
    )
  }
  if (!rules) return <Panel title="Who has to say yes"><Empty>Loading…</Empty></Panel>

  const active = rules.filter((r) => r.isActive)

  return (
    <Panel
      title="Who has to say yes"
      subtitle="Above what value a requisition waits for a person. Most should clear without one — governance slower than the workaround produces the workaround. Every change here is recorded with a name against it."
    >
      <p className="text-[13px] text-etyme-ink mb-4">{summary}</p>

      {active.length === 0 ? (
        <Empty>No rules. Every requisition clears without approval.</Empty>
      ) : (
        <div className="divide-y divide-etyme-rule">
          {active.map((r) => (
            <div key={r.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="text-[14px] text-etyme-ink">{r.name}</span>
                  <p className="text-[12px] text-etyme-muted">
                    {r.thresholdDollars === null
                      ? 'applies to everything'
                      : `above $${r.thresholdDollars.toLocaleString()}`}{' '}
                    · goes to {r.approver.name}
                    {r.authoredBy ? ` · written by ${r.authoredBy.name}` : ''}
                  </p>
                </div>
                <span className="flex items-center gap-3 shrink-0">
                  {r.history.length > 0 && (
                    <button onClick={() => setOpen(open === r.id ? null : r.id)} className="text-[12px] text-etyme-action">
                      {open === r.id ? 'Hide' : `${r.history.length} change${r.history.length === 1 ? '' : 's'}`}
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={async () => {
                        const last = active.length === 1
                        const reason = last
                          ? window.prompt('This is your last rule. Everything will clear without approval. Why?')
                          : ''
                        if (last && !reason) return
                        await send(`/api/settings/approval-rules?id=${r.id}&reason=${encodeURIComponent(reason ?? '')}`, 'DELETE')
                        load()
                      }}
                      disabled={busy}
                      className="text-[12px] text-etyme-attention"
                    >
                      Switch off
                    </button>
                  )}
                </span>
              </div>

              {open === r.id && (
                <div className="mt-2 pl-3 border-l-2 border-etyme-rule">
                  {r.history.map((h) => (
                    <div key={h.id} className="py-1.5">
                      <p className="text-[12px] text-etyme-ink">
                        {h.action.toLowerCase()} by {h.changedBy}
                        <span className="text-etyme-faint tabular-nums ml-2">
                          {h.changedAt.slice(0, 10)}
                        </span>
                      </p>
                      {h.reason && <p className="text-[12px] text-etyme-muted">{h.reason}</p>}
                      {h.notes.map((n, i) => (
                        <p key={i} className="text-[11px] text-etyme-attention">{n}</p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ── Address ──────────────────────────────────────────

interface DnsRecord {
  type: string
  name: string
  value: string
  instruction?: string
  note?: string
}
interface CustomDomain {
  id: string
  domain: string
  state: string
  isPrimary: boolean
  addedBy: string
  verifiedAt: string | null
  lastCheckNote: string | null
  records: DnsRecord[]
}
interface Previous {
  id: string
  subdomain: string
  url: string
  releasedAt: string
  note: string
}
interface Address {
  subdomain: string
  url: string
  previousAddresses: Previous[]
  customDomains: CustomDomain[]
  canEdit: boolean
}

function Record({ r }: { r: DnsRecord }) {
  return (
    <div className="bg-etyme-canvas rounded p-3 mt-2">
      <div className="grid sm:grid-cols-[70px_1fr] gap-x-3 gap-y-1 text-[12px]">
        <span className="text-etyme-faint">Type</span>
        <span className="font-mono text-etyme-ink">{r.type}</span>
        <span className="text-etyme-faint">Name</span>
        <span className="font-mono text-etyme-ink break-all">{r.name}</span>
        <span className="text-etyme-faint">Value</span>
        <span className="font-mono text-etyme-ink break-all">{r.value}</span>
      </div>
      {(r.instruction || r.note) && (
        <p className="text-[12px] text-etyme-muted mt-2">{r.instruction ?? r.note}</p>
      )}
    </div>
  )
}

function AddressTab({ send, busy }: { send: SendFn; busy: boolean }) {
  const [data, setData] = useState<Address | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sub, setSub] = useState('')
  const [domain, setDomain] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/address')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      setData(body.data)
      setSub(body.data.subdomain)
    } catch (e: any) {
      setErr(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (err && !data) {
    return <Panel title="Your address"><p className="text-[13px] text-etyme-attention">{err}</p></Panel>
  }
  if (!data) return <Panel title="Your address"><Empty>Loading…</Empty></Panel>

  return (
    <>
      <Panel
        title="Your Etyme address"
        subtitle="Guessed from your email domain when you signed up. Changing it is safe — the old address keeps working and sends people to the new one, so nothing you have already sent breaks."
      >
        <div className="flex items-center gap-2">
          <input
            value={sub}
            onChange={(e) => setSub(e.target.value.toLowerCase())}
            disabled={!data.canEdit}
            className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm font-mono disabled:opacity-60"
          />
          <span className="text-[14px] text-etyme-muted font-mono">.etyme.com</span>
        </div>

        {data.canEdit && (
          <button
            onClick={async () => {
              const r = await send('/api/settings/address', 'PATCH', { subdomain: sub })
              if (r) load()
            }}
            disabled={busy || !sub.trim() || sub === data.subdomain}
            className="mt-3 px-4 py-2 rounded bg-etyme-action text-white text-[13px] font-medium disabled:opacity-40"
          >
            Change my address
          </button>
        )}

        {data.previousAddresses.length > 0 && (
          <div className="mt-5 pt-4 border-t border-etyme-rule">
            <Lbl>Addresses you used before</Lbl>
            <div className="mt-2 space-y-1.5">
              {data.previousAddresses.map((p) => (
                <div key={p.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-mono text-etyme-muted">{p.subdomain}.etyme.com</span>
                  <span className="text-[12px] text-etyme-verified shrink-0">still works</span>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-etyme-muted mt-2">
              These are kept forever and never given to another company, so an old link can never
              land on somebody else&rsquo;s data.
            </p>
          </div>
        )}
      </Panel>

      <Panel
        title="A domain you own"
        subtitle="Point your own address here — talent.yourcompany.com, or your bare domain. Nothing serves until we can see a DNS record only you could have published, because anybody can type a domain into a form."
      >
        {data.customDomains.length === 0 ? (
          <Empty>None yet. Your Etyme address is the only way in.</Empty>
        ) : (
          <div className="space-y-4 mb-5">
            {data.customDomains.map((d) => (
              <div key={d.id} className="border border-etyme-rule rounded-lg p-4 bg-etyme-raised">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <span className="text-[14px] font-mono text-etyme-ink">{d.domain}</span>
                    {d.isPrimary && <span className="ml-2 text-[11px] text-etyme-verified">serving</span>}
                  </div>
                  <span className={`text-[12px] shrink-0 ${
                    d.state === 'VERIFIED' ? 'text-etyme-verified' : 'text-etyme-attention'
                  }`}>
                    {d.state === 'VERIFIED' ? 'verified' : 'waiting on DNS'}
                  </span>
                </div>

                {d.lastCheckNote && (
                  <p className="text-[12px] text-etyme-muted mt-1">{d.lastCheckNote}</p>
                )}

                {d.records.map((r, i) => <Record key={i} r={r} />)}

                {data.canEdit && (
                  <div className="flex gap-3 mt-3">
                    <button
                      onClick={async () => {
                        await send('/api/settings/address', 'POST', { checkId: d.id })
                        load()
                      }}
                      disabled={busy}
                      className="px-3 py-1.5 rounded border border-etyme-rule text-[12px] text-etyme-ink disabled:opacity-50"
                    >
                      Check it now
                    </button>
                    <button
                      onClick={async () => {
                        await send(`/api/settings/address?id=${d.id}`, 'DELETE')
                        load()
                      }}
                      disabled={busy}
                      className="text-[12px] text-etyme-attention"
                    >
                      Stop using it
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {data.canEdit && (
          <div className="border-t border-etyme-rule pt-4">
            <Lbl>Add a domain</Lbl>
            <div className="flex gap-2 mt-2">
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="talent.yourcompany.com"
                className="flex-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm font-mono"
              />
              <button
                onClick={async () => {
                  const r = await send('/api/settings/address', 'POST', { domain })
                  if (r) { setDomain(''); load() }
                }}
                disabled={busy || !domain.trim()}
                className="px-4 py-2 rounded bg-etyme-action text-white text-[13px] font-medium disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </Panel>
    </>
  )
}
