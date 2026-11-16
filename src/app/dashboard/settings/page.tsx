'use client'

import { OwnerGateLine } from '@/components/owner-gate-line'
import type { OwnerLine } from '@/lib/owner-gate'
import Link from 'next/link'
import type { Route } from 'next'
import { readJson } from '@/lib/read-response'
import { usePageSection } from '@/components/page-section'
import { kindWord, postureWord } from '@/lib/parties'
import { KIND_CHOICES, choiceOf } from '@/lib/company-kind'

import { useEffect, useState, useCallback } from 'react'
import { plainDate } from '@/lib/plain-date'
import type { HolidaySeedOffer } from '@/lib/pay-dates'
import { BenchPaySection } from './bench-pay/bench-pay'
import { TEAMS_LINK_HOW_TO } from '@/lib/notify/teams-link'
import { TEAMS_NOT_CONFIRMED } from '@/lib/team-structure/directory/words'
// The week and payroll panels are one component each, drawn here and on
// the setup's "How you work" step, so the two can never ask differently.
import { WeekPanel } from '@/components/settings/week-panel'
import { PayrollPanel, goToFirstPayDay } from '@/components/settings/payroll-panel'
import { AskEtymePanel } from '@/components/settings/ask-etyme-panel'
import { Chip, ErrorState, FormMessage, Lbl, LoadingState, PageHead, Panel } from '@/components/ui'
import { SubmitButton } from '@/components/ui/form'
import { MODEL_CARD_SUBTITLE, ONLY_OWNER_OR_ADMIN, TYPE_UNCHANGED, wallSays, accountWord } from '@/components/settings/settings-says'
import { NOTHING_CHANGED } from '@/components/settings/panel-bits'
import { levelOf } from '@/lib/access-grant'

/**
 * How this company is set up.
 *
 * This is the floor everything else stands on, and it was missing. A
 * company signed up and received one role called Owner and nothing else —
 * no cycle calendar, so nothing was ever due; no holidays, so dates only
 * avoided weekends; no cost centers, so every requisition was spend
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
  /** What the saved link is worth: works, needs a new link, or none (lib/notify/teams-link). */
  teams: { state: 'NONE' | 'WORKS' | 'NEEDS_NEW_LINK'; says: string }
  networkVerifiedAt: string | null
  /** Who last changed the type, and when; null until anybody did. */
  typeSet: { by: string | null; at: string } | null
  /** The website the firm typed in Setup → Your company, or null. */
  website?: string | null
}
interface Role {
  id: string
  name: string
  permissions: string[]
  isDefault: boolean
  /** Every seat not ended that holds it, invited and paused included. */
  heldBy: number
  withAccess: number
  invited: number
  paused: number
  /** "2 with access · 3 invited", or "nobody holds this yet" (lib/company-seats). */
  heldWords: string
  /** What it can do against the whole catalog (lib/company-roles). */
  canDo: { everything: boolean; count: number; of: number; words: string; list: string[] }
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
interface ShiftPolicy {
  hours: string
  pay: string
  bill: string
}
interface CycleShift {
  policy: ShiftPolicy
  categories: { key: keyof ShiftPolicy; label: string; covers: string }[]
  directions: { value: string; label: string; means: string }[]
}
interface Settings {
  wall?: Wall
  company: Company
  roles: Role[]
  locations: Location[]
  holidays: Holiday[]
  /** The one-press sets, each with whether its days are all on the calendar already (fix list G4). */
  holidayOffers?: (HolidaySeedOffer & { complete: boolean; says: string | null })[]
  costCenters: CostCenter[]
  /** Who approves a job request, from the one count Approvals reads too (E4). */
  approvalWords: { approvals: string; costCenters: string }
  templatePack: Pack | null
  /** Where the company has no calendar of its own: what is true, and the one it may set (api/settings/no-calendar). */
  noCalendar?: { says: string[]; offer: { id: string; label: string } | null; firstDayAt?: number | null } | null
  cycleShift: CycleShift
  canEdit: boolean
  /** The type is the Owner's to change, and nobody else's (lib/company-kind). */
  canChangeType?: boolean
  /** Beside the type for a reader who may not change it (lib/owner-gate). */
  typeLine?: OwnerLine | null
  /** The company's people, counted once: "6 people: 3 with access · 3 invited". */
  people?: string
  /** How people join this company, from what the code does (lib/join-words). Null for a one-person firm. */
  joins?: string | null
}

// ── Bits ─────────────────────────────────────────────

// Panel and Lbl are the shared ones (components/ui); the tabs are drawn
// inside one column that spaces them, so no panel here carries its own margin.

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-etyme-faint py-3">{children}</p>
}

/** Where a change of type keeps its sentence across the reload that redraws the menu. */
const TYPE_CHANGED_KEY = 'etyme.settings.typeChanged'

// Locations left on 2026-11-13 (the founder's first-day list, fault 20):
// it was the Sites pill said twice. Roles stays: it is the only screen that
// lists what each role can do.
const TABS = ['Company', 'Walls', 'Address', 'Roles', 'Approvals', 'Holidays', 'Cost centers', 'Cycles', 'Ask Etyme', 'Bench pay'] as const
/** Only a firm that carries people between projects has bench pay to set. */
const BENCH_KINDS = ['VENDOR', 'GSI']
type Tab = (typeof TABS)[number]
/**
 * A tab named in the address opens on arrival, so a sentence elsewhere can
 * link to one ("turn it on under Settings" lands on the model switch:
 * MODEL_SWITCH_HREF in lib/model-boundary). The slug is the tab's own
 * name, lower case, spaces as hyphens: ?tab=ask-etyme.
 */
function tabFromAddress(search: string): Tab | null {
  const want = new URLSearchParams(search).get('tab')
  if (!want) return null
  return TABS.find((t) => t.toLowerCase().replace(/\s+/g, '-') === want.toLowerCase()) ?? null
}

// ── Page ─────────────────────────────────────────────

export default function SettingsPage() {
  // The section this page sits under on the reader's own menu, never a
  // word typed by hand (sign-up walk, round four, item 13).
  const section = usePageSection('/dashboard/settings')
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
      const body = await readJson(res)
      setData(body.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // The tab the address names, read once on arrival (window, not
  // useSearchParams, so the page needs no Suspense boundary).
  useEffect(() => {
    const named = tabFromAddress(window.location.search)
    if (named) setTab(named)
  }, [])

  // A change of type is said after the reload that redraws the menu.
  useEffect(() => {
    try {
      const said = window.sessionStorage.getItem(TYPE_CHANGED_KEY)
      if (said) {
        window.sessionStorage.removeItem(TYPE_CHANGED_KEY)
        setFlash(said)
      }
    } catch {}
  }, [])

  async function send(path: string, method: string, payload?: unknown) {
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      const res = await fetch(path, {
        method,
        ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
      })
      const body = await readJson(res)
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

  if (loading) return <LoadingState says="Opening your setup…" />
  if (!data) {
    return <ErrorState says={error ?? 'Could not load settings.'} action={{ label: 'Try again', onClick: () => load() }} />
  }

  const { company, canEdit } = data

  return (
    <>
      {/* Where the facts came from is said once, on the Company tab,
          the way it actually happened (howYouCameIn). This line said
          "from your email domain" above it to firms that signed up with
          a password or were brought in by a client (round six, problem 17). */}
      <PageHead
        eyebrow={section}
        title={`How ${company.name} is set up`}
        subtitle="Everything here can be changed, except a verified domain."
      />

      {canEdit && (
        <p className="mb-5 text-[13px] text-etyme-muted">
          {/* The setup checklist (2026-10-28): every item, done, skipped or to do. */}
          <Link href={'/dashboard/settings/setup' as any} className="text-etyme-action-press">Setup checklist</Link>
          {' '}— your company, addresses, sites, the people in charge, papers, bank details and your domain, one at a time.
          {/* Owners is a pill of its own under People since 2026-11-13. */}
        </p>
      )}

      {!canEdit && (
        <div className="mb-5 rounded-md border border-etyme-rule bg-etyme-canvas p-3">
          <p className="text-[13px] text-etyme-ink">
            You can read this but not change it. Your company’s Owner or an Admin changes
            settings — ask whoever gave you your role.
          </p>
        </div>
      )}

      {flash && <div className="mb-5"><FormMessage tone="ok">{flash}</FormMessage></div>}
      {error && <div className="mb-5"><FormMessage tone="error">{error}</FormMessage></div>}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-5">
        {TABS.filter((t) => t !== 'Bench pay' || BENCH_KINDS.includes(company.kind)).map((t) => (
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

      {/* Every panel a tab draws sits 20px above the next — the same
          margin the setup panels (components/settings/panel-bits) carry, so
          the two kinds stack evenly on one tab. */}
      <div className="[&>*]:mb-5">
      {tab === 'Company' && <CompanyTab data={data} send={send} busy={busy} openModel={() => setTab('Ask Etyme')} />}
      {tab === 'Walls' && <WallsTab data={data} send={send} busy={busy} />}
      {tab === 'Address' && <AddressTab send={send} busy={busy} />}
      {tab === 'Roles' && <RolesTab data={data} send={send} busy={busy} />}
      {tab === 'Approvals' && <ApprovalsTab send={send} busy={busy} openTab={setTab} />}
      {tab === 'Holidays' && <HolidaysTab data={data} send={send} busy={busy} />}
      {tab === 'Cost centers' && <CostCentersTab data={data} send={send} busy={busy} openTab={setTab} />}
      {tab === 'Cycles' && <CyclesTab data={data} send={send} busy={busy} />}
      {tab === 'Ask Etyme' && <AskEtymePanel />}
      {tab === 'Bench pay' && <BenchPaySection />}
      </div>
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
                className="mt-1 accent-etyme-ink"
                checked={w.outsideAccess === o.value}
                // Never greyed, so the chosen one reads as chosen to every
                // reader (fix list G6); a press that may not change it does nothing.
                aria-disabled={busy || !data.canEdit || undefined}
                onChange={() => { if (!busy && data.canEdit && w.outsideAccess !== o.value) send('/api/settings', 'PATCH', { outsideAccess: o.value }) }}
              />
              <span>
                <span className="text-[14px] text-etyme-ink">{o.label}</span>
                <span className="block text-[13px] text-etyme-muted max-w-prose">{o.blurb}</span>
              </span>
            </label>
          ))}
        </div>
        {!data.canEdit && <p className="mt-3 text-[12px] text-etyme-muted">{ONLY_OWNER_OR_ADMIN}</p>}

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
                      {r.heldBy === 0 ? 'nobody with access yet' : `${r.heldBy} with access`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel
        title={`One ${accountWord(data.company.kind).one} seeing another`}
        subtitle={`Whether a person attached to one ${accountWord(data.company.kind).one} can read the work of the others. Attaching people on Team structure is what builds the wall.`}
      >
        <label className="flex items-center gap-2 text-[14px] text-etyme-ink cursor-pointer">
          <input
            type="checkbox"
            className="accent-etyme-ink"
            checked={w.accountWalls}
            aria-disabled={busy || !data.canEdit || undefined}
            onChange={() => { if (!busy && data.canEdit) send('/api/settings', 'PATCH', { accountWalls: !w.accountWalls }) }}
          />
          Keep each {accountWord(data.company.kind).one}&rsquo;s work to that {accountWord(data.company.kind).one}
        </label>
        {/* What it does today, at the control (fix list G3): the state, who
            it limits, and exactly which screens it covers. */}
        <p className="mt-2 text-[13px] text-etyme-ink">{wallSays(data.company.kind, w.accountWalls).state}</p>
        <p className="mt-1 text-[13px] text-etyme-muted">
          {wallSays(data.company.kind, w.accountWalls).covers}{' '}
          {data.canEdit
            ? <Link href={'/dashboard/settings/team-structure' as Route} className="text-etyme-action-press">Attach people on Team structure</Link>
            : ONLY_OWNER_OR_ADMIN}
        </p>
      </Panel>
    </>
  )
}

// ── Company ──────────────────────────────────────────

/**
 * How this company came in, and so who joins it — said the way it
 * actually happened. It told a firm that signed up with a password "It
 * came from your identity provider" over a domain reading "—" (sign-up
 * walk, round five, problem 20).
 */
function howYouCameIn(c: Pick<Company, 'slug' | 'domain' | 'domainVerified'>, joins: string | null | undefined): string {
  // How people join is one sentence read from what the doors do
  // (lib/join-words), never a copy typed here.
  const came = c.domain && c.domainVerified
    ? `Your domain, ${c.domain}, was verified when your company signed in with its work account. It is not editable.`
    : `Your company's Etyme address is ${c.slug}.etyme.com, and it has no verified domain.`
  return joins ? `${came} ${joins}` : came
}

function CompanyTab({ data, send, busy, openModel }: { data: Settings; send: SendFn; busy: boolean; openModel: () => void }) {
  const c = data.company
  const [name, setName] = useState(c.name)
  const [currency, setCurrency] = useState(c.currency)
  const [teams, setTeams] = useState(c.teamsWebhookUrl ?? '')

  return (
    <>
      <Panel
        title="Who you are"
        subtitle={howYouCameIn(c, data.joins)}
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
            <Link href="/dashboard/settings/domain" className="mt-1 inline-block text-[12.5px] text-etyme-action underline-offset-2 hover:underline">
              {c.domainVerified ? 'Your domain' : 'Connect your domain'}
            </Link>
          </div>
          <div>
            <Lbl>Type</Lbl>
            {/* Words, not the column. This printed "CONSULTANT_CORP" at
                a nurse's own corporation and "VENDOR · BENCH" at a
                bench firm — the register's vocabulary on the one screen
                a firm opens to check we know who they are. */}
            <p className="mt-1 text-sm text-etyme-ink">
              {kindWord(c.kind as any)}
              {postureWord(c.supplierPosture) ? ` · ${postureWord(c.supplierPosture)}` : ''}
            </p>
            {c.typeSet && (
              <p className="mt-0.5 text-[12px] text-etyme-muted">
                Changed{c.typeSet.by ? ` by ${c.typeSet.by}` : ''} on {plainDate(c.typeSet.at)}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 border-t border-etyme-rule pt-3">
          <Lbl>Website</Lbl>
          {/* Kept in one place, typed in Setup → Your company (fix list A6). */}
          <p className="mt-1 text-[13px] text-etyme-ink">
            {c.website ? c.website : 'None typed yet.'}{' '}
            {data.canEdit
              ? <Link href={'/dashboard/settings/setup/company' as Route} className="text-etyme-action-press">Change it in Setup → Your company</Link>
              : <span className="text-etyme-muted">The Owner or an Admin types it in Setup → Your company.</span>}
          </p>
        </div>

        {data.canEdit && (
          <SubmitButton
            type="button"
            className="mt-4"
            onClick={() => send('/api/settings', 'PATCH', { name, currency })}
            pending={busy}
            disabled={name === c.name && currency === c.currency}
            whyDisabled={NOTHING_CHANGED}
          >
            Save
          </SubmitButton>
        )}
      </Panel>

      <TypePanel data={data} busy={busy} />

      {/* Beside the type, because the founder looked here for it
          (2026-11-03): the switch itself is the Ask Etyme tab's. */}
      {data.canEdit && (
        <Panel title="Ask Etyme and the model" subtitle={MODEL_CARD_SUBTITLE}>
          <a
            href="/dashboard/settings?tab=ask-etyme"
            onClick={(e) => { e.preventDefault(); openModel(); window.history.replaceState(null, '', '/dashboard/settings?tab=ask-etyme') }}
            className="text-[13px] text-etyme-action-press"
          >
            Open the switch
          </a>
        </Panel>
      )}

      <Panel
        title="Where your people already are"
        subtitle="With a Teams channel set, notifications for this company post there. Without one they fall back to email — and where there is no email either, the notification says so rather than sitting in the app pretending it was sent."
      >
        <label className="block">
          <Lbl>Teams Workflows link</Lbl>
          <input
            value={teams}
            onChange={(e) => setTeams(e.target.value)}
            placeholder="https://….logic.azure.com/workflows/…"
            disabled={!data.canEdit}
            className="w-full mt-1 px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm disabled:opacity-60"
          />
        </label>
        <p className="text-[12px] text-etyme-muted mt-2">{TEAMS_LINK_HOW_TO} {TEAMS_NOT_CONFIRMED}</p>
        <p className={`text-[12px] mt-2 ${c.teams.state === 'NEEDS_NEW_LINK' ? 'text-etyme-attention' : c.teams.state === 'WORKS' ? 'text-etyme-verified' : 'text-etyme-muted'}`}>
          {c.teams.says}
        </p>
        {data.canEdit && (
          <SubmitButton
            type="button"
            className="mt-3"
            onClick={() => send('/api/settings', 'PATCH', { teamsWebhookUrl: teams.trim() || null })}
            pending={busy}
            // Nothing typed and nothing saved means there is nothing to do.
            // A "Remove channel" button with no channel to remove is a
            // control that lies about what it does. The same link again
            // changes nothing either.
            disabled={(!teams.trim() && !c.teamsWebhookUrl) || teams.trim() === (c.teamsWebhookUrl ?? '')}
            whyDisabled={!teams.trim() && !c.teamsWebhookUrl ? 'Paste a Teams Workflows link above first.' : NOTHING_CHANGED}
          >
            {teams.trim() ? 'Save channel' : 'Remove channel'}
          </SubmitButton>
        )}
      </Panel>
    </>
  )
}

// ── What kind of company ─────────────────────────────
//
// The founder's Tapin, 2026-11-02: it signed up as a one-person firm and
// had no way to become the bench vendor it is. The Owner chooses among
// sign-up's own choices; the route refuses, in a sentence, only where work
// on the record depends on the old type. A saved change reloads the page,
// so the menu drawn beside it is the new type's.

function TypePanel({ data, busy }: { data: Settings; busy: boolean }) {
  const c = data.company
  const now = choiceOf(c.kind, c.supplierPosture)
  const [chosen, setChosen] = useState<string>(now?.key ?? '')
  const [saving, setSaving] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  if (!data.canChangeType) {
    if (!data.canEdit) return null
    return (
      <Panel title="What kind of company you are">
        <p className="text-sm text-etyme-ink">{now?.label ?? kindWord(c.kind as any)}</p>
        <OwnerGateLine line={data.typeLine} className="mt-2" />
      </Panel>
    )
  }

  async function save() {
    setSaving(true)
    setRefused(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: chosen }),
      })
      const body = await readJson(res)
      try { window.sessionStorage.setItem(TYPE_CHANGED_KEY, body.data?.message ?? 'Saved.') } catch {}
      window.location.reload()
    } catch (e: any) {
      setRefused(e.message)
      setSaving(false)
    }
  }

  return (
    <Panel
      title="What kind of company you are"
      subtitle="Your menu, Ask Etyme and the setup checklist follow this. Your roles, people, papers and setup answers stay as they are."
    >
      <div className="space-y-3">
        {KIND_CHOICES.map((k) => (
          <label key={k.key} className="flex gap-3 items-start cursor-pointer">
            <input
              type="radio"
              name="companyType"
              className="mt-1"
              checked={chosen === k.key}
              disabled={busy || saving}
              onChange={() => setChosen(k.key)}
            />
            <span>
              <span className="text-[14px] text-etyme-ink">{k.label}</span>
              {now?.key === k.key && <span className="ml-2 text-[12px] text-etyme-muted">what you are now</span>}
              <span className="block text-[13px] text-etyme-muted max-w-prose">{k.blurb}</span>
            </span>
          </label>
        ))}
      </div>
      {refused && <div className="mt-4"><FormMessage tone="error">{refused}</FormMessage></div>}
      <SubmitButton
        type="button"
        className="mt-4"
        onClick={save}
        pending={busy || saving}
        pendingLabel="Changing…"
        disabled={!chosen || chosen === now?.key}
        // Said beside it, never a button greyed without words (fix list A6). Only the Owner
        // reads this button; anybody else reads who may, above.
        whyDisabled={TYPE_UNCHANGED}
      >
        Change type
      </SubmitButton>
    </Panel>
  )
}

// ── Roles ────────────────────────────────────────────

function RolesTab({ data, send, busy }: { data: Settings; send: SendFn; busy: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const [why, setWhy] = useState<string | null>(null)

  return (
    <Panel
      title="Roles"
      subtitle={`What somebody can do here. These were chosen for what your company is. Changing a role changes what everyone holding it can do, immediately.${data.people ? ` ${data.people}.` : ''}`}
    >
      <div className="divide-y divide-etyme-rule">
        {data.roles.map((r) => (
          <div key={r.id} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[14px] text-etyme-ink font-medium">{r.name}</span>
                {/* The level Users & permissions draws beside a role, from the
                    same reader: its label, its why on hover, and on a tap. */}
                <button type="button" onClick={() => setWhy(why === r.id ? null : r.id)}
                  aria-expanded={why === r.id} aria-label={levelOf(r.name, r.permissions).why}
                  className="ml-2 align-middle rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-etyme-action">
                  <Chip tone={levelOf(r.name, r.permissions).key === 'CRITICAL' ? 'attention' : 'passive'} title={levelOf(r.name, r.permissions).why}>
                    {levelOf(r.name, r.permissions).label}
                  </Chip>
                </button>
                <span className="ml-2 text-[12px] text-etyme-faint tabular-nums">
                  {r.heldWords}
                </span>
                {why === r.id && <p className="mt-1 text-[12px] text-etyme-muted break-words">{levelOf(r.name, r.permissions).why}</p>}
              </div>
              <button
                onClick={() => setOpen(open === r.id ? null : r.id)}
                className="text-[12px] text-etyme-action shrink-0"
              >
                {open === r.id ? 'Hide' : `Permissions: ${r.canDo.words}`}
              </button>
            </div>
            {open === r.id && r.canDo.count === 0 && (
              <p className="mt-2 text-[12.5px] text-etyme-muted">Sees their own work and their own hours, nothing else. Give a person another role from Users &amp; permissions to let them do more.</p>
            )}
            {open === r.id && r.canDo.count > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {r.canDo.list.slice().sort().map((p) => (
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

// ── Holidays ─────────────────────────────────────────

function HolidaysTab({ data, send, busy }: { data: Settings; send: SendFn; busy: boolean }) {
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  // The rest of this year, then next year (lib/pay-dates, holidaySeedOffers),
  // each offered only while some of its days are missing (fix list G4).
  const offers = data.holidayOffers ?? []
  const missing = offers.filter((o) => !o.complete)
  const already = offers.filter((o) => o.complete && o.says)

  return (
    <Panel
      title="Holiday calendar"
      subtitle="Cycle dates shift off weekends and off these days. An empty calendar means due dates land on public holidays and nobody notices until a billing run fires on Christmas Day."
      action={
        data.canEdit && missing.length > 0 ? (
          <span className="flex flex-wrap gap-2">
            {missing.map((o) => (
              <button
                key={o.year}
                onClick={() => send('/api/settings/holidays', 'POST', { seedYear: o.year, country: 'US', ...(o.from ? { from: o.from } : {}) })}
                disabled={busy}
                className="px-3 py-1.5 rounded border border-etyme-rule text-[12px] text-etyme-ink disabled:opacity-50"
              >
                {o.label}
              </button>
            ))}
          </span>
        ) : null
      }
    >
      {already.length > 0 && (
        <div className="mb-3 space-y-0.5">
          {already.map((o) => <p key={o.year} className="text-[12px] text-etyme-muted">{o.says}</p>)}
        </div>
      )}
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
          <SubmitButton
            type="button"
            className="mt-3"
            onClick={async () => {
              const r = await send('/api/settings/holidays', 'POST', { date, name })
              if (r) { setDate(''); setName('') }
            }}
            pending={busy}
            disabled={!date || !name.trim()}
            whyDisabled={!date && !name.trim() ? 'Choose a date and name the day first.' : !date ? 'Choose a date first.' : 'Name the day first.'}
          >
            Add
          </SubmitButton>
        </div>
      )}
    </Panel>
  )
}

// ── Cost centers ─────────────────────────────────────

function CostCentersTab({ data, send, busy, openTab }: { data: Settings; send: SendFn; busy: boolean; openTab: (t: Tab) => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [gl, setGl] = useState('')

  return (
    <Panel
      title="Cost centers"
      subtitle="Who owns the spend. A job request names the cost center it is charged to. Use the same code your own accounting system uses."
    >
      {/* The same count Approvals reads, so the two tabs say one thing (E4). */}
      <p className="text-[13px] text-etyme-ink mb-4">
        {data.approvalWords.costCenters}{' '}
        <TabLink to="Approvals" openTab={openTab}>See Approvals</TabLink>
      </p>
      {data.costCenters.length === 0 ? null : (
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
          <Lbl>Add a cost center</Lbl>
          <div className="grid sm:grid-cols-3 gap-2 mt-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MFG-FIN-4100"
              className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm font-mono" />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Manufacturing Finance"
              className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm" />
            <input value={gl} onChange={(e) => setGl(e.target.value)} placeholder="GL 6120"
              className="px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm font-mono" />
          </div>
          <SubmitButton
            type="button"
            className="mt-3"
            onClick={async () => {
              const r = await send('/api/settings/cost-centers', 'POST', { code, name, glAccount: gl || null })
              if (r) { setCode(''); setName(''); setGl('') }
            }}
            pending={busy}
            disabled={!code.trim() || !name.trim()}
            whyDisabled={!code.trim() && !name.trim() ? 'Type a code and a name first.' : !code.trim() ? 'Type a code first.' : 'Type a name first.'}
          >
            Add
          </SubmitButton>
        </div>
      )}
    </Panel>
  )
}

// ── Cycles ───────────────────────────────────────────

function CyclesTab({ data, send, busy }: { data: Settings; send: SendFn; busy: boolean }) {
  const pack = data.templatePack
  return (
    <>
    <Panel
      title="Your cycle calendar"
      subtitle="Chosen at sign-up from where you are and what you do. It decides when timesheets are due, when bills can be raised, and when payroll runs — every date a contract produces comes from here."
    >
      {!pack ? (
        <div className="space-y-2">
          {(data.noCalendar?.says ?? []).map((line, i) => (
            <p key={line} className="text-[13px] text-etyme-ink">
              {line}
              {/* Scrolls to the box on this page (E5), drawn only for a seat that may set it. */}
              {data.noCalendar?.firstDayAt === i && (
                <>
                  {' '}
                  <a
                    href="/dashboard/settings?tab=cycles#first-pay-day"
                    className="text-etyme-action-press underline"
                    onClick={(e) => { e.preventDefault(); window.history.replaceState(null, '', '/dashboard/settings?tab=cycles#first-pay-day'); goToFirstPayDay() }}
                  >
                    Set it below
                  </a>
                </>
              )}
            </p>
          ))}
          {data.noCalendar?.offer && (
            <SubmitButton
              type="button"
              className="mt-1"
              onClick={() => send(`/api/companies/${data.company.id}/template-pack`, 'POST', { pack: data.noCalendar!.offer!.id })}
              pending={busy}
            >
              Use the “{data.noCalendar.offer.label}” calendar
            </SubmitButton>
          )}
        </div>
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
    <WeekPanel canEdit={data.canEdit} />
    <PayrollPanel canEdit={data.canEdit} />
    <WeekendShiftPanel data={data} send={send} busy={busy} />
    </>
  )
}

// ── Weekends and holidays ────────────────────────────
//
// Founder, 2026-09-17: "If Sat or Sun — company can have settings to do
// before weekend or after weekend."
//
// Three questions, not six and not one. A firm that pays on the Friday
// before still bills on the Monday after, so one answer for the whole
// company cannot state even what we ship by default; a knob per cycle
// kind is how the 2017 engine reached four thousand commits.

function WeekendShiftPanel({ data, send, busy }: { data: Settings; send: SendFn; busy: boolean }) {
  const shift = data.cycleShift
  const field = (key: string) => `cycleShift${key.charAt(0).toUpperCase()}${key.slice(1)}`

  return (
    <Panel
      title="When a date lands on a weekend or a holiday"
      subtitle="Every date below is either moved to a working day or left where it falls. Payroll usually moves back — a Saturday pay day paid on the Monday pays after the work — and billing usually moves forward, because pulling a client's payment terms shorter is the surprise on that side. Those are the defaults; this is where you say otherwise."
    >
      <div className="divide-y divide-etyme-rule">
        {shift.categories.map((cat) => {
          const current = shift.policy[cat.key]
          return (
            <div key={cat.key} className="py-4 first:pt-0">
              <Lbl>{cat.label}</Lbl>
              <p className="text-[13px] text-etyme-muted mt-1">{cat.covers}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {shift.directions.map((d) => {
                  const chosen = d.value === current
                  return (
                    <button
                      key={d.value}
                      type="button"
                      title={d.means}
                      aria-pressed={chosen}
                      // The chosen one is never greyed: it reads as chosen to
                      // every reader (fix list G6). Pressing it changes nothing,
                      // so it sends nothing and writes no log row.
                      disabled={!chosen && (busy || !data.canEdit)}
                      onClick={() => { if (!chosen) send('/api/settings', 'PATCH', { [field(cat.key)]: d.value }) }}
                      className={`px-3 py-1.5 rounded text-[13px] border transition-colors ${
                        chosen
                          ? 'bg-etyme-ink text-white border-etyme-ink'
                          : 'bg-etyme-raised border-etyme-rule text-etyme-muted hover:text-etyme-ink disabled:opacity-50'
                      }`}
                    >
                      {d.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-[12px] text-etyme-faint mt-2">
                {shift.directions.find((d) => d.value === current)?.means}
              </p>
            </div>
          )
        })}
      </div>
      {!data.canEdit && <p className="text-[12px] text-etyme-muted pb-3">{ONLY_OWNER_OR_ADMIN}</p>}
      <p className="text-[12px] text-etyme-muted border-t border-etyme-rule pt-3 mt-1">
        Dates already written on a placement’s “What is due” list keep their dates. Placements recorded from now on take the new rule.
      </p>
    </Panel>
  )
}

// ── Approvals ────────────────────────────────────────

interface Rule {
  id: string
  name: string
  thresholdDollars: number | null
  kind?: string
  orgUnit?: { id: string; name: string } | null
  /** What the row applies to, from the route (ruleRowSays): its kind and its department. */
  says?: string
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

/** A link to another tab of this page, drawn as a link: every tab it names is drawn for every seat that reads Settings. */
function TabLink({ to, openTab, children }: { to: Tab; openTab: (t: Tab) => void; children: React.ReactNode }) {
  const href = `/dashboard/settings?tab=${to.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <a
      href={href}
      className="text-etyme-action-press underline"
      onClick={(e) => { e.preventDefault(); openTab(to); window.history.replaceState(null, '', href) }}
    >
      {children}
    </a>
  )
}

function ApprovalsTab({ send, busy, openTab }: { send: SendFn; busy: boolean; openTab: (t: Tab) => void }) {
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [summary, setSummary] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [addHref, setAddHref] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/approval-rules')
      const body = await readJson(res)
      setRules(body.data.rules)
      setSummary(body.data.summary)
      setCanEdit(body.data.canEdit)
      setAddHref(body.data.addHref ?? null)
    } catch (e: any) {
      setErr(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (err) {
    return (
      <Panel title="Who has to say yes">
        <ErrorState says={err} />
      </Panel>
    )
  }
  if (!rules) return <Panel title="Who has to say yes"><LoadingState compact says="Opening the approval rules…" /></Panel>

  const active = rules.filter((r) => r.isActive)

  return (
    <Panel
      title="Who has to say yes"
      subtitle="Above what value a job request waits for a person. Most should clear without one — governance slower than the workaround produces the workaround. Every change here is recorded with a name against it."
    >
      {/* Said once: the route's one sentence, from the count Cost centers reads too (E4). */}
      <p className="text-[13px] text-etyme-ink mb-4">
        {summary}{' '}
        <TabLink to="Cost centers" openTab={openTab}>See Cost centers</TabLink>
        {/* Rules are added on Program team: one link, for a seat that may open it and write one. */}
        {addHref && (
          <>
            {' · '}
            <Link href={addHref as Route} className="text-etyme-action-press underline">Add or change rules under Program team</Link>
          </>
        )}
      </p>

      {active.length === 0 ? null : (
        <div className="divide-y divide-etyme-rule">
          {active.map((r) => (
            <div key={r.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="text-[14px] text-etyme-ink">{r.name}</span>
                  <p className="text-[12px] text-etyme-muted">
                    {r.says ?? ''}{' '}
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
                          {plainDate(h.changedAt)}
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
      const body = await readJson(res)
      setData(body.data)
      setSub(body.data.subdomain)
    } catch (e: any) {
      setErr(e.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (err && !data) {
    return <Panel title="Your address"><ErrorState says={err} /></Panel>
  }
  if (!data) return <Panel title="Your address"><LoadingState compact says="Opening your address…" /></Panel>

  return (
    <>
      <Panel
        title="Your Etyme address"
        subtitle="The address your company signed up with. Changing it is safe — the old address keeps working and sends people to the new one, so nothing you have already sent breaks."
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
          <SubmitButton
            type="button"
            className="mt-3"
            onClick={async () => {
              const r = await send('/api/settings/address', 'PATCH', { subdomain: sub })
              if (r) load()
            }}
            pending={busy}
            disabled={!sub.trim() || sub === data.subdomain}
            whyDisabled={!sub.trim() ? 'Type the address you want first.' : 'This is your address now. Type a new one to change it.'}
          >
            Change my address
          </SubmitButton>
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
        subtitle="Point your own address here — talent.company.example, or your bare domain. Nothing serves until we can see a DNS record only you could have published, because anybody can type a domain into a form."
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
            <div className="flex flex-wrap items-start gap-2 mt-2">
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="talent.company.example"
                className="flex-1 min-w-[12rem] px-3 py-2 border border-etyme-rule rounded bg-etyme-raised text-sm font-mono"
              />
              <SubmitButton
                type="button"
                onClick={async () => {
                  const r = await send('/api/settings/address', 'POST', { domain })
                  if (r) { setDomain(''); load() }
                }}
                pending={busy}
                disabled={!domain.trim()}
                whyDisabled="Type the domain first."
              >
                Add
              </SubmitButton>
            </div>
          </div>
        )}
      </Panel>
    </>
  )
}
