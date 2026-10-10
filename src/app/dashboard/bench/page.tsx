'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import type { Route } from 'next'
import { range, compact } from '@/lib/money-display'
import { readBench, submitLink, BURN_READ_BY, benchSubtitle, mayBrowseBench, benchClosedSays, benchPageClosed, listingRates, TIER_WORD, type Free } from '@/lib/bench-filter'
import { readJson } from '@/lib/read-response'
import { useCompanyKind, useSession } from '@/components/session-provider'
import { OurBench } from './our-bench'
import { WhatWeNeed, WhatPartnersNeed } from './what-we-need'
import { BenchProfit } from './bench-profit'
import { mayReadBenchProfit, type HolidayAnswerRow } from '@/lib/bench-profit'
import { mayChangeBenchPay } from '@/lib/bench-holiday-switch'
import { useHolidaySwitches, HolidaySwitchCell } from './holiday-switch'
import { usePageSection } from '@/components/page-section'
import { hasPermission } from '@/lib/permissions'
import { READS_PAY } from '@/lib/money/pay-visibility'
import { useRouter, useSearchParams } from 'next/navigation'
import { ListSurface, type Column } from '@/components/list-surface'
import { FilterChips, Stat, FormMessage } from '@/components/ui'

/**
 * Bench — working surface for the company's consultant bench.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows. User finds and acts fast."
 *
 * Shows retained and marketing bench listings with skills, availability,
 * work auth, rates. Uses the DataTable component (UX Stress Test #3).
 *
 * Phase 1: fetches from /api/bench, renders in the shared DataTable.
 */

// ── Types ────────────────────────────────────────────

interface ConsultantOption {
  id: string
  personId: string
  name: string
  email: string
  headline: string | null
}

interface BenchEntry {
  id: string
  tier: 'RETAINED' | 'MARKETING'
  /** INVITED · GRANTED · DECLINED — whether they agreed to be marketed. */
  consent?: string
  consultantId: string
  personId: string
  name: string
  email: string
  headline: string | null
  skills: string[]
  location: string | null
  workAuth: string | null
  rateMin: number | null
  rateMax: number | null
  availableFrom: string | null
  /** When they are free, read off the work by the route (`whenFree`). */
  free: Free | null
  /** The stay they chose on this bench, in a line. */
  stay: string | null
  /** NOBODY · FIRM_ONLY · NETWORK — from the consent and the tier. */
  reach: string | null
  reachSays: string | null
  grantedAt: string
  /** Whose bench this listing actually lives on. Always your own company
   *  in scope=company; a partner's, in scope=network. */
  companyId: string
  companyName: string
  /** On Partner bench: why the reader may not ask — already theirs (`alreadyOursSays`). */
  oursSays: string | null
}

/**
 * Your own team, or the network you have a real relationship with.
 * `/api/bench` already carries both (scope=company | scope=network) —
 * this page only ever asked for the first. "network" here is
 * deliberately MARKETING-tier only, from active counterparties: a
 * partner's RETAINED bench is theirs to keep private, and a company
 * with no partners added under Your suppliers sees an honest empty
 * state, not a wall error.
 */
type BenchScope = 'company' | 'payroll' | 'network'

/**
 * One row of the firm's own roster — the people it employs.
 *
 * Not a listing, and deliberately not the same shape as one. CLAUDE.md:
 * "Not a `BenchListing` — that is a consultant consenting to be sold;
 * this is an employer's roster." So there is no tier, no rate band and no
 * visibility here: a roster row carries what somebody is *on*, and
 * `mayMarket` — which is false for everybody who granted no listing, and
 * is read off the API rather than guessed on the screen.
 */
interface RosterEntry {
  personId: string
  name: string
  email: string | null
  seat: string | null
  practice: string | null
  skills: string[]
  location: string | null
  workAuth: string | null
  listed: boolean
  standing: 'ON_PROJECT' | 'STARTING_SOON' | 'BETWEEN_PROJECTS' | 'NOT_ON_THE_RECORD'
  says: string
  freeForDays: number | null
  on: string | null
  free: boolean
  mayMarket: boolean
  marketSays: string
}

interface RosterSummaryData {
  total: number
  onProject: number
  startingSoon: number
  betweenProjects: number
  notOnTheRecord: number
  skillsKnown: number
  skillsUnknown: number
  marketable: number
  says: string
}

interface BurnData {
  burn: { daily: number; weekly: number; monthly: number; toDate: number }
  benchSize: number
  benchSizeTotal: number
  retained: { count: number; dailyBurn: number }
  marketing: { count: number; dailyBurn: number }
  openRequirements: number
  entries: Array<{
    personId: string
    personName: string
    headline: string | null
    skills: string[]
    tier: string
    payRate: number
    dailyCost: number
    weeklyCost: number
    monthlyCost: number
    contractType: string
    daysOnBench: number
    totalBurnToDate: number
    availableFrom: string | null
  }>
}

type TierFilter = 'all' | 'RETAINED' | 'MARKETING'
type AvailFilter = 'all' | 'now' | 'soon' | 'later'

// ── Helpers ──────────────────────────────────────────

function workAuthLabel(auth: string | null): string {
  const labels: Record<string, string> = {
    US_CITIZEN: 'US Citizen',
    GC: 'Green Card',
    H1B: 'H-1B',
    OPT: 'OPT',
    GBP_SW: 'Skilled Worker',
    EAD: 'EAD',
    TN: 'TN Visa',
    L1: 'L-1',
  }
  return auth ? labels[auth] ?? auth : '—'
}

/**
 * Who sees this person, read from the listing — the consent they gave and
 * the tier the firm chose — and never from `ConsultantProfile.visibility`.
 * That field is one value per person, set by whichever vendor last
 * touched it, and it read "Internal" on somebody who had agreed to be
 * marketed and was already on a partner's bench.
 */
function reachChip(reach: string | null): { text: string; cls: string } {
  switch (reach) {
    case 'NETWORK':   return { text: 'Your network', cls: 'chip--verified' }
    case 'FIRM_ONLY': return { text: 'Only you',     cls: 'chip--passive' }
    case 'NOBODY':    return { text: 'Nobody',       cls: 'chip--attention' }
    default:          return { text: '—',            cls: 'chip--passive' }
  }
}

/**
 * When they are free, as the route read it off the work (`whenFree` in
 * lib/bench-filter) — the one answer Bench profit, the matches and the
 * training page read too. This page used to read the profile's own free
 * date, which nobody keeps, and so said "Unknown" over people another
 * tab said were on the bench today.
 */
function availabilityStatus(free: Free | null): { text: string; cls: string; group: AvailFilter } {
  if (!free) return { text: 'Free date not on record', cls: 'text-etyme-faint', group: 'later' }
  switch (free.state) {
    case 'NOW':
      return { text: free.says, cls: 'text-etyme-verified font-medium', group: 'now' }
    case 'FROM': {
      const days = free.on ? Math.ceil((Date.parse(`${free.on}T00:00:00Z`) - Date.now()) / 86_400_000) : Infinity
      return { text: free.says, cls: days <= 14 ? 'text-etyme-attention font-medium' : 'text-etyme-muted', group: days <= 14 ? 'soon' : 'later' }
    }
    case 'PLACED':
      return { text: free.says, cls: 'text-etyme-muted', group: 'later' }
    default:
      return { text: free.says, cls: 'text-etyme-faint', group: 'later' }
  }
}

/**
 * Bench rates are stored in cents, and this used to render them raw — a
 * consultant asking $110/hr appeared on the bench as "$11000". Every other
 * screen divided by a hundred; this one forgot, and nothing caught it
 * because a plain number carries no unit.
 */
function formatRate(min: number | null, max: number | null): string {
  return range(min, max)
}

// ── Add Bench Listing Modal ─────────────────────────

/**
 * Add somebody to your bench, at a rate.
 *
 * Somebody added on Consultants is already asked to join your bench, so
 * the search here marks them as on it rather than offering them as new —
 * the tester picked such a person, typed a rate and was refused as a
 * duplicate with the rate lost (2026-10-01). Choosing them now saves the
 * rate onto the listing they already have.
 */
function AddBenchListingModal({ onClose, onCreated, listed }: {
  onClose: () => void
  onCreated: (msg: string) => void
  /** Your own listings, by consultant: the listing and what the person said. */
  listed: Map<string, { listingId: string; consent: string | null }>
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ConsultantOption[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedConsultant, setSelectedConsultant] = useState<ConsultantOption | null>(null)
  const [tier, setTier] = useState<'RETAINED' | 'MARKETING'>('MARKETING')
  const [rateMin, setRateMin] = useState('')
  const [rateMax, setRateMax] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Debounced consultant search
  function handleSearchChange(value: string) {
    setSearchQuery(value)
    setSelectedConsultant(null)
    setError(null)

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

    if (value.trim().length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/consultants?q=${encodeURIComponent(value.trim())}&limit=10`)
        if (res.ok) {
          const body = await res.json()
          const results = (body.data?.consultants ?? []).map((c: any) => ({
            id: c.id,
            personId: c.personId,
            name: c.person?.name ?? c.name ?? 'Unknown',
            email: c.person?.email ?? c.email ?? '',
            headline: c.headline ?? null,
          }))
          setSearchResults(results)
          setShowDropdown(results.length > 0)
        }
      } catch {
        // Silently fail — user can retry
      } finally {
        setSearching(false)
      }
    }, 300)
  }

  function selectConsultant(c: ConsultantOption) {
    setSelectedConsultant(c)
    setSearchQuery(c.name)
    setShowDropdown(false)
    setError(null)
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedConsultant) {
      setError('Choose the person from the search results.')
      return
    }

    const rates = listingRates({ min: rateMin, max: rateMax }, null)
    if (!rates.ok) {
      setError(rates.says)
      return
    }
    const minVal = rates.rateMin
    const maxVal = rates.rateMax
    const already = listed.get(selectedConsultant.id)

    setSubmitting(true)
    setError(null)

    try {
      const res = already
        ? await fetch(`/api/bench/listings/${already.listingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rateMin: minVal, rateMax: maxVal }),
          })
        : await fetch('/api/bench/listings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              consultantId: selectedConsultant.id,
              tier,
              rateMin: minVal,
              rateMax: maxVal,
            }),
          })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error?.message ?? 'Nothing was saved. Try again.')
        return
      }

      const body = await res.json()
      onCreated(body.data?.message ?? `${selectedConsultant.name} is on your bench.`)
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-lg mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Add to bench</h2>
          <button onClick={onClose} className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4">
            <FormMessage tone="error">{error}</FormMessage>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Consultant search */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Consultant *</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchResults.length > 0 && !selectedConsultant && setShowDropdown(true)}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder="Search by name or email…"
              autoComplete="off"
            />
            {searching && (
              <div className="absolute right-3 top-[30px] text-[11px] text-etyme-faint animate-pulse">
                Searching…
              </div>
            )}
            {selectedConsultant && (
              <div className="mt-1.5 flex items-center gap-2 px-3 py-2 bg-etyme-canvas rounded-lg">
                <div className="w-6 h-6 rounded-full bg-etyme-action/10 text-etyme-action
                                text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                  {selectedConsultant.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-etyme-ink truncate">{selectedConsultant.name}</p>
                  <p className="text-[11px] text-etyme-faint truncate">
                    {listed.has(selectedConsultant.id)
                      ? `Already on your bench${listed.get(selectedConsultant.id)?.consent === 'INVITED' ? ', not answered yet' : ''}. The rate below is saved on that listing.`
                      : selectedConsultant.headline ?? selectedConsultant.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedConsultant(null); setSearchQuery('') }}
                  className="ml-auto text-etyme-muted hover:text-etyme-ink p-0.5"
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}

            {/* Search results dropdown */}
            {showDropdown && !selectedConsultant && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-etyme-rule rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectConsultant(c)}
                    className="w-full text-left px-3 py-2.5 hover:bg-etyme-canvas flex items-center gap-2
                               border-b border-etyme-rule/50 last:border-0 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-etyme-action/10 text-etyme-action
                                    text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                      {c.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-etyme-ink truncate">{c.name}</p>
                      <p className="text-[11px] text-etyme-faint truncate">
                        {listed.has(c.id) ? 'Already on your bench — choose to set their rate' : c.headline ?? c.email}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tier — only for somebody new; a listing's tier moves from its row. */}
          {!(selectedConsultant && listed.has(selectedConsultant.id)) && (
          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Who sees them *</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as 'RETAINED' | 'MARKETING')}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
            >
              <option value="MARKETING">{TIER_WORD.MARKETING} — the firms you work with see them once they agree</option>
              <option value="RETAINED">{TIER_WORD.RETAINED} — only you; you carry them between assignments</option>
            </select>
          </div>
          )}

          {/* Rate range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Rate min ($/hr)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rateMin}
                onChange={(e) => setRateMin(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg tabular-nums
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="e.g. 75"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Rate max ($/hr)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rateMax}
                onChange={(e) => setRateMax(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg tabular-nums
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="e.g. 95"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !selectedConsultant} className="btn-primary disabled:opacity-50">
              {submitting ? 'Saving…' : selectedConsultant && listed.has(selectedConsultant.id) ? 'Save rate' : 'Add to bench'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────

export default function BenchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const companyKind = useCompanyKind()

  // An integrator, a prime or a program office staffs work mostly from
  // its own payroll, so that is where its Bench page opens. Teleworld
  // Solutions read a bare screen under "Your own team" while holding five
  // live employee seats, because this page only ever asked for listings.
  //
  // A link may name the tab (`?scope=payroll` from a roll-off notice), and
  // that beats the default for the firm's kind.
  const asked = searchParams.get('scope')
  const opensOn: BenchScope =
    asked === 'company' || asked === 'payroll' || asked === 'network'
      ? asked
      : companyKind === 'GSI' || companyKind === 'MSP' || companyKind === 'CONSULTANT_CORP'
        ? 'payroll'
        : 'company'
  const session = useSession()
  // The section on the reader's own menu, not the company's whole one
  // (round seven: a desk-less seat read a section its menu lacks).
  const section = usePageSection('/dashboard/bench')

  const [scope, setScope] = useState<BenchScope>(opensOn)
  const [scopeChosen, setScopeChosen] = useState(false)
  // Bench profit (2026-09-30): the owner's, the admin's and the finance
  // desk's, and drawn for nobody else — the same rule the route refuses by.
  const readsProfit = mayReadBenchProfit({
    companyName: session.company?.name ?? 'your firm',
    companyKind: session.company?.kind ?? null,
    roleName: session.roleName,
    consultantSeat: session.contextType === 'CONSULTANT',
  }).ok
  // A seat that reads people opens on the bench; the finance desk, which
  // reads bench profit and no people, opens on bench profit; a client
  // reads neither (`mayBrowseBench`).
  const readsBench = hasPermission(session.permissions, 'consultants.read')
  const clientRefused = mayBrowseBench({
    companyKind: session.company?.kind ?? companyKind ?? null,
    scope: 'company',
    // A client's seat that opens no job request is not told to press Find
    // matches on one (sign-up walk round six, 14). Asked only once the
    // session has answered, so a loading seat is not refused early.
    opensJobRequests: session.loading ? undefined : hasPermission(session.permissions, 'requirements.read'),
    companyName: session.company?.name ?? null,
  })
  const [profitOpen, setProfitOpen] = useState(asked === 'profit')
  // A link to ?scope=profit opens it for anybody, so a seat that may not
  // read it is shown the route's own sentence rather than a different tab
  // in silence (bench tester, 2026-10-01). The tab is drawn only for the
  // desks that read it.
  const showProfit = clientRefused.ok && (profitOpen || (!readsBench && readsProfit && session.company != null))
  // The holiday switch on each row of Our bench (2026-10-03): the owner's,
  // the admin's and the finance desk's at a firm with a bench, the same
  // three desks the route lets turn it, and drawn for nobody else.
  const turnsHolidays = mayChangeBenchPay({
    companyName: session.company?.name ?? 'your firm',
    companyKind: session.company?.kind ?? null,
    roleName: session.roleName,
    consultantSeat: session.contextType === 'CONSULTANT',
  }).ok
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [rosterSays, setRosterSays] = useState<RosterSummaryData | null>(null)
  const [entries, setEntries] = useState<BenchEntry[]>([])
  /** Your own listings, kept from the last read of your own bench, for the Add to bench search. */
  const [ownListed, setOwnListed] = useState<Map<string, { listingId: string; consent: string | null }>>(new Map())
  // Whose chosen stay ran out: shown, not vanished (bench tester, 2026-09-30).
  const [ended, setEnded] = useState<{ listingId: string; name: string; says: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const [availFilter, setAvailFilter] = useState<AvailFilter>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [burnData, setBurnData] = useState<BurnData | null>(null)
  const [burnLoading, setBurnLoading] = useState(true)
  const [busyRow, setBusyRow] = useState<string | null>(null)
  const ourIds = scope === 'company' ? entries.map((e) => e.personId) : scope === 'payroll' ? roster.map((r) => r.personId) : []
  const holiday = useHolidaySwitches(ourIds, turnsHolidays && (scope === 'company' || scope === 'payroll'))
  const holidayTurned = async (said: { ok: boolean; text: string }) => {
    setToast({ message: said.text, type: said.ok ? 'success' : 'error' })
    setTimeout(() => setToast(null), 6000)
    await holiday.reload()
  }

  // Guards against a slower "your team" response landing after a faster
  // "your network" one (or the reverse) and silently overwriting it —
  // whichever scope was requested last wins, not whichever request
  // happened to finish last.
  const requestId = useRef(0)

  // The session arrives after the first render, so the opening tab is
  // corrected once — and never after the reader has chosen one themselves.
  useEffect(() => {
    if (!scopeChosen) setScope(opensOn)
  }, [opensOn, scopeChosen])

  // Open modal from ?new=1 link
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowAddModal(true)
      router.replace('/dashboard/bench')
    }
  }, [searchParams, router])

  const fetchBench = useCallback(async (forScope: BenchScope) => {
    const thisRequest = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/bench?scope=${forScope}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()

      // The firm's own roster. A different question with a different
      // consent behind it, so it is a different shape and is never mixed
      // into the listings below.
      if (forScope === 'payroll') {
        const rows: RosterEntry[] = Array.isArray(body.data?.roster) ? body.data.roster : []
        if (thisRequest !== requestId.current) return
        setRoster(rows)
        setRosterSays(body.data?.summary ?? null)
        setEntries([])
        return
      }

      // One door. This page flattened the answer by hand and the training
      // page flattened it differently, under a key the route never sent —
      // so the two screens on one menu disagreed about the same firm's
      // bench for the life of both. `readBench` is that one door, and it
      // refuses to read a shape it does not understand rather than
      // returning an empty list that counts to nought.
      const reading = readBench(body)
      if (!reading.ok) {
        throw new Error(reading.why)
      }

      const flat: BenchEntry[] = reading.rows.map((r) => ({
        id: r.listingId,
        tier: r.tier,
        consultantId: r.consultantId,
        personId: r.personId,
        name: r.name,
        email: r.email ?? '',
        headline: r.headline,
        skills: r.skills,
        location: r.location,
        workAuth: r.workAuth,
        rateMin: r.rateMin,
        rateMax: r.rateMax,
        availableFrom: r.availableFrom,
        free: r.free,
        stay: r.stay,
        reach: r.reach,
        reachSays: r.reachSays,
        grantedAt: r.grantedAt,
        consent: r.consent ?? undefined,
        companyId: r.companyId,
        companyName: r.companyName,
        oursSays: r.oursSays ?? null,
      }))

      // A tab clicked twice in quick succession fires two requests; only
      // the most recent one is allowed to write state, whichever answers
      // first.
      if (thisRequest !== requestId.current) return
      setRoster([])
      setRosterSays(null)
      setEntries(flat)
      if (forScope === 'company') {
        setOwnListed(new Map(flat.map((e) => [e.consultantId, { listingId: e.id, consent: e.consent ?? null }])))
      }
      setEnded(Array.isArray(body.data?.ended) ? body.data.ended : [])
    } catch (err: any) {
      if (thisRequest !== requestId.current) return
      setError(err.message)
      setEntries([])
      setRoster([])
    } finally {
      if (thisRequest === requestId.current) setLoading(false)
    }
  }, [])

  // Nothing is asked of the route that it would refuse: a client and a
  // seat that reads no people are told in a sentence instead.
  const asksBench = readsBench && clientRefused.ok
  useEffect(() => {
    if (!asksBench) { setLoading(false); return }
    fetchBench(scope)
  }, [fetchBench, scope, asksBench])

  // What the bench costs is read by the desks that read pay. Asked for
  // only where the seat holds it, so a desk without it never fires a
  // request the route refuses — it is told whose number it is instead.
  const readsPay = hasPermission(session.permissions, READS_PAY)
  useEffect(() => {
    if (!readsPay) { setBurnLoading(false); return }
    let cancelled = false
    async function fetchBurn() {
      setBurnLoading(true)
      try {
        const res = await fetch('/api/bench/burn')
        if (res.ok) {
          const body = await res.json()
          if (!cancelled) setBurnData(body.data ?? null)
        }
        // 403 = user lacks cost permission — silently hide the panel
      } catch {
        // Network error — silently hide
      } finally {
        if (!cancelled) setBurnLoading(false)
      }
    }
    fetchBurn()
    return () => { cancelled = true }
  }, [readsPay])

  // ── Filtered data ──────────────────────────────────

  const filtered = useMemo(() => {
    let result = entries
    if (tierFilter !== 'all') {
      result = result.filter((e) => e.tier === tierFilter)
    }
    if (availFilter !== 'all') {
      result = result.filter((e) => availabilityStatus(e.free).group === availFilter)
    }
    return result
  }, [entries, tierFilter, availFilter])

  // ── Stats ──────────────────────────────────────────

  const stats = useMemo(() => {
    // Counted by what the person said, not by the tier the firm chose: a
    // listing nobody has answered markets nobody, and is "Invited, waiting".
    const agreed = (e: BenchEntry) => !e.consent || e.consent === 'GRANTED'
    const retained = entries.filter((e) => agreed(e) && e.tier === 'RETAINED').length
    const marketing = entries.filter((e) => agreed(e) && e.tier === 'MARKETING').length
    const waiting = entries.filter((e) => e.consent === 'INVITED').length
    const availNow = entries.filter((e) => availabilityStatus(e.free).group === 'now').length
    const availSoon = entries.filter((e) => availabilityStatus(e.free).group === 'soon').length
    return { total: entries.length, retained, marketing, waiting, availNow, availSoon }
  }, [entries])

  // ── Columns ────────────────────────────────────────

  const columns: Column<BenchEntry>[] = [
    {
      key: 'name',
      label: 'Consultant',
      render: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-etyme-action/10 text-etyme-action
                            text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {row.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-etyme-ink truncate">{row.name}</p>
              {/* Never another firm's person's contact (`benchSubtitle`). */}
              <p className="text-[11px] text-etyme-faint truncate">{benchSubtitle(row, scope === 'company')}</p>
            </div>
          </div>
        </div>
      ),
      sortValue: (row) => row.name,
      width: 'min-w-[200px]',
    },
    // Only in network scope — every row is your own company otherwise,
    // and a column that always says the same thing is not information.
    ...(scope === 'network'
      ? [
          {
            key: 'company',
            label: 'Supplier',
            render: (row: BenchEntry) => (
              <span className="text-[12px] text-etyme-ink">{row.companyName}</span>
            ),
            sortValue: (row: BenchEntry) => row.companyName,
            hideOnMobile: true,
          } as Column<BenchEntry>,
        ]
      : []),
    {
      key: 'skills',
      label: 'Skills',
      render: (row) => (
        <div className="flex flex-wrap gap-1 max-w-[240px]">
          {row.skills.slice(0, 3).map((s) => (
            <span key={s} className="chip chip--passive text-[9px]">{s}</span>
          ))}
          {row.skills.length > 3 && (
            <span className="text-[10px] text-etyme-faint">+{row.skills.length - 3}</span>
          )}
        </div>
      ),
      sortValue: (row) => row.skills[0] ?? '',
      hideOnMobile: true,
    },
    {
      key: 'workAuth',
      label: 'Work Auth',
      render: (row) => (
        <span className="text-[12px] text-etyme-muted">{workAuthLabel(row.workAuth)}</span>
      ),
      sortValue: (row) => row.workAuth ?? '',
      hideOnMobile: true,
    },
    {
      key: 'location',
      label: 'Location',
      render: (row) => (
        <span className="text-[12px] text-etyme-muted truncate max-w-[120px] block">
          {row.location ?? '—'}
        </span>
      ),
      sortValue: (row) => row.location ?? '',
      hideOnMobile: true,
    },
    {
      key: 'rate',
      label: 'Rate',
      align: 'right',
      render: (row) => (
        <span className="text-[12px] text-etyme-ink tabular-nums">
          {formatRate(row.rateMin, row.rateMax)}
        </span>
      ),
      sortValue: (row) => row.rateMin ?? row.rateMax ?? 0,
    },
    {
      key: 'availability',
      label: 'Available',
      render: (row) => {
        const status = availabilityStatus(row.free)
        return <span className={`text-[12px] ${status.cls}`}>{status.text}</span>
      },
      sortValue: (row) => (row.free?.state === 'NOW' ? 0 : row.free?.on ? Date.parse(row.free.on) : Infinity),
    },
    // On a partner's bench everybody is shown to partners — that is how
    // they got here — so the column would say one thing on every row, in
    // the other firm's words. Placed people say so under Available.
    ...(scope === 'network' ? [] : [{
      key: 'tier',
      label: 'Listed as',
      render: (row: BenchEntry) => (
        row.consent && row.consent !== 'GRANTED' ? (
          // Said here rather than at the submission.
          //
          // The gate refuses to put somebody forward on an unanswered
          // invitation, and without this the row looked exactly like a
          // consented one — so the refusal arrived later, at the moment
          // of submitting, phrased as a surprise. A recruiter should
          // know before they build a shortlist around somebody.
          <span className="chip chip--attention text-[9px]">
            {row.consent === 'INVITED' ? 'Not answered yet' : 'Declined'}
          </span>
        ) : (
        <div>
          <span className={`chip text-[9px] ${row.tier === 'RETAINED' ? 'chip--verified' : 'chip--action'}`}>
            {TIER_WORD[row.tier]}
          </span>
          {/* How long they chose to stay, so the firm sees who is about to drop off. */}
          {row.stay && <p className="text-[10px] text-etyme-muted mt-1">{row.stay}</p>}
        </div>
        )
      ),
      sortValue: (row: BenchEntry) => row.tier,
    } as Column<BenchEntry>]),
    {
      key: 'reach',
      label: 'Who sees them',
      render: (row) => {
        const { text, cls } = reachChip(row.reach)
        return (
          <span className={`chip text-[9px] ${cls}`} title={row.reachSays ?? undefined}>
            {text}
          </span>
        )
      },
      sortValue: (row) => row.reach ?? '',
      hideOnMobile: true,
    },
    // Whether they are paid for a public holiday on the bench, and the
    // switch for it — on your own bench, for the three desks only.
    ...(scope === 'company' && turnsHolidays
      ? [
          {
            key: 'holidays',
            label: 'Holidays',
            sortable: false,
            hideOnMobile: true,
            render: (row: BenchEntry) => (
              <HolidaySwitchCell personId={row.personId} answer={holiday.answers.get(row.personId)} onTurned={holidayTurned} />
            ),
          } as Column<BenchEntry>,
        ]
      : []),
    // What a firm can do about the row, said as the thing it does.
    //
    // On your own bench: move the listing between retained and marketing.
    // Before 2026-09-28 the tier was written once, at creation, and never
    // again — so somebody added as Retained could never reach a partner.
    //
    // On a partner's: ask the person to let you represent them too. The
    // partner's listing is the partner's consent; yours is a second
    // question the person answers, never an inheritance.
    ...(scope === 'company'
      ? [
          {
            key: 'actions',
            label: '',
            render: (row: BenchEntry) =>
              row.consent === 'INVITED' ? (
                // Not answered: send it again, or copy the link to send yourself.
                <span className="flex gap-2 whitespace-nowrap">
                  <button onClick={(e) => { e.stopPropagation(); nudge(row.id, false) }} disabled={busyRow === row.id}
                    className="text-[11px] text-etyme-action hover:underline disabled:opacity-40">Resend</button>
                  <button onClick={(e) => { e.stopPropagation(); nudge(row.id, true) }} disabled={busyRow === row.id}
                    className="text-[11px] text-etyme-action hover:underline disabled:opacity-40">Copy link</button>
                </span>
              ) : row.consent === 'DECLINED' || row.reach === 'NOBODY' ? null : (
                <button
                  onClick={(e) => { e.stopPropagation(); changeTier(row) }}
                  disabled={busyRow === row.id}
                  className="text-[11px] text-etyme-action hover:underline disabled:opacity-40 whitespace-nowrap"
                >
                  {row.tier === 'RETAINED' ? 'Show to your network' : 'Keep to yourself'}
                </button>
              ),
          } as Column<BenchEntry>,
        ]
      : scope === 'network'
        ? [
            {
              key: 'actions',
              label: '',
              render: (row: BenchEntry) => row.oursSays ? (
                // Already the reader's: asking would go round the partner
                // or ask twice (`alreadyOursSays`).
                <span className="text-[11px] text-etyme-muted whitespace-nowrap">{row.oursSays}</span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); askToRepresent(row) }}
                  disabled={busyRow === row.id}
                  className="text-[11px] text-etyme-action hover:underline disabled:opacity-40 whitespace-nowrap"
                >
                  Ask to represent
                </button>
              ),
            } as Column<BenchEntry>,
          ]
        : []),
  ]

  // Resend an unanswered invitation, ask an ended stay to renew, or copy
  // the link (POST /api/bench/listings/:id/nudge). The link asks; only the
  // person's yes grants anything.
  async function nudge(listingId: string, copyOnly: boolean) {
    setBusyRow(listingId)
    try {
      const res = await fetch(`/api/bench/listings/${listingId}/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyOnly }),
      })
      const body = await readJson(res)
      if (copyOnly && body.data?.url) {
        try { await navigator.clipboard.writeText(body.data.url) } catch { /* shown below instead */ }
      }
      setToast({ message: copyOnly ? `${body.data?.says ?? 'Copied.'} ${body.data?.url ?? ''}` : body.data?.says ?? 'Sent.', type: 'success' })
      setTimeout(() => setToast(null), 6000)
    } catch (e: any) {
      setToast({ message: e.message, type: 'error' })
    } finally {
      setBusyRow(null)
    }
  }

  async function changeTier(row: BenchEntry) {
    setBusyRow(row.id)
    try {
      const res = await fetch(`/api/bench/listings/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: row.tier === 'RETAINED' ? 'MARKETING' : 'RETAINED' }),
      })
      const body = await readJson(res)
      setToast({ message: body.data?.message ?? 'Saved.', type: 'success' })
      await fetchBench(scope)
    } catch (e: any) {
      setToast({ message: e.message, type: 'error' })
    } finally {
      setBusyRow(null)
      setTimeout(() => setToast(null), 5000)
    }
  }

  async function askToRepresent(row: BenchEntry) {
    setBusyRow(row.id)
    try {
      const res = await fetch('/api/bench/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultantId: row.consultantId, tier: 'MARKETING' }),
      })
      await readJson(res)
      setToast({
        message: `${row.name} has been asked. They are on your bench once they say yes, and you can put them forward then.`,
        type: 'success',
      })
    } catch (e: any) {
      setToast({ message: e.message, type: 'error' })
    } finally {
      setBusyRow(null)
      setTimeout(() => setToast(null), 6000)
    }
  }

  // ── Render ─────────────────────────────────────────

  function handleListingCreated(msg: string) {
    setToast({ message: msg, type: 'success' })
    setTimeout(() => setToast(null), 3500)
    // Adding a listing always adds to your own bench — switch back to it
    // so the new row is somewhere the visitor can actually see it.
    setScope('company')
    fetchBench('company')
  }

  // Signed in at no company — a candidate on her own: the bench is a
  // company's, and the sentence says so alone, with no "People who granted
  // you a listing" over it and no firm she does not have (round six, 9).
  // And a seat at a company that may not open the page — a client, or a
  // supplier's or an integrator's seat with no bench desk — reads its one
  // sentence the same way, with no heading or prose over it (round seven, 6).
  const closed = benchPageClosed({
    loading: session.loading,
    company: session.company ?? null,
    client: clientRefused,
    readsBench,
    readsProfit,
  })
  if (closed) {
    return <p role="status" className="text-[14px] text-etyme-muted py-8">{closed}</p>
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="eyebrow mb-2">{section ?? ''}</div>
          <h1 className="headline-serif text-heading text-etyme-ink mb-1">
            Bench
          </h1>
          <p className="text-body-sm text-etyme-muted">
            {!clientRefused.ok
              ? null
              : showProfit
              ? 'What your bench cost, and whether the work paid it back.'
              : scope === 'company'
              ? 'People who granted you a listing — retained and marketing. Their consent is what lets you market them.'
              : scope === 'payroll'
                ? 'People you employ, and what each of them is on. You need no listing to staff your own — and nothing here markets them.'
                : 'People the firms you work with are marketing, who agreed to it. To put one forward yourself, ask to represent them — they answer, not their firm.'}
          </p>
        </div>
        {asksBench && scope !== 'payroll' && !showProfit && (
          <button onClick={() => setShowAddModal(true)} className="btn-primary mt-3 shrink-0">
            Add to bench
          </button>
        )}
      </div>

      {/* Three benches, never merged, because three different consents sit
          behind them. On your bench: somebody granted you a listing. On
          your payroll: you employ them and the employment is the consent
          — CLAUDE.md, "Not a `BenchListing` ... this is an employer's
          roster." Your network: a supplier chose to show you theirs.
          A GSI holds all three hats at once (src/lib/persona.ts). */}
      {!clientRefused.ok && (
        <p role="status" className="panel text-body-sm text-etyme-ink mb-6">{clientRefused.says}</p>
      )}

      {clientRefused.ok && (readsBench || readsProfit) && (
      <div className="flex items-center gap-1 bg-etyme-canvas rounded-md p-0.5 mb-6 w-fit">
        {((readsBench ? [
          // The founder's words, 2026-09-30: a firm's own people are "Our
          // bench" and the people partner firms offer it are "Partner
          // bench". A firm's own people come by two consents — a listing
          // they granted, or their employment — so Our bench is two tabs,
          // each saying which.
          { key: 'company', label: 'Our bench \u00b7 listed' },
          { key: 'payroll', label: 'Our bench \u00b7 employed' },
          { key: 'network', label: 'Partner bench' },
        ] : []) as { key: BenchScope; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setScopeChosen(true); setScope(key); setProfitOpen(false) }}
            className={`px-3.5 py-1.5 text-[12px] font-medium rounded transition-colors ${
              scope === key && !showProfit
                ? 'bg-white text-etyme-ink shadow-sm'
                : 'text-etyme-muted hover:text-etyme-ink'
            }`}
          >
            {label}
          </button>
        ))}
        {readsProfit && (
          <button
            onClick={() => setProfitOpen(true)}
            className={`px-3.5 py-1.5 text-[12px] font-medium rounded transition-colors ${
              showProfit ? 'bg-white text-etyme-ink shadow-sm' : 'text-etyme-muted hover:text-etyme-ink'
            }`}
          >
            Bench profit
          </button>
        )}
      </div>
      )}

      {showProfit && <BenchProfit />}

      {clientRefused.ok && !readsBench && !showProfit && (
        <p role="status" className="panel text-body-sm text-etyme-ink mb-6">
          {benchClosedSays(session.company?.name)}
        </p>
      )}

      <div className={showProfit || !asksBench ? 'hidden' : undefined}>

      {/* Stats row */}
      {scope !== 'payroll' && !loading && entries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          <Stat label="Total" value={stats.total} />
          <Stat label={TIER_WORD.RETAINED} value={stats.retained} tone="verified" />
          <Stat label={scope === 'network' ? 'Shown to you' : TIER_WORD.MARKETING} value={stats.marketing} />
          <Stat label="Invited, waiting" value={stats.waiting} tone="attention" />
          <Stat label="Free now" value={stats.availNow} tone="verified" />
          <Stat label="Free within 14 days" value={stats.availSoon} tone="attention" />
        </div>
      )}

      {/* Bench burn panel — visible only if the user has cost permission.
          Burn is about people a firm pays to sit on a bench, which is the
          listing side; a roster's own cost is payroll and not this number. */}
      {scope !== 'payroll' && burnData && burnData.benchSize > 0 && (
        <BenchBurnPanel data={burnData} />
      )}
      {scope !== 'payroll' && !readsPay && (
        <p className="text-[12px] text-etyme-muted mb-6">{BURN_READ_BY}</p>
      )}

      {/* Our bench, for the firm's managers and HR: who is coming off a
          project, who is between projects, and the moves between the
          firm's own projects (lib/internal-moves). Above the roster, which
          is everybody and what each is on. */}
      {scope === 'payroll' && (
        <div className="mb-8">
          <OurBenchGate firmName={session.company?.name ?? 'your firm'} permissions={session.permissions} roleName={session.roleName} />
        </div>
      )}

      {/* "What we need" at the top of Partner bench, and what the firms
          we trade with ask for at the top of Our bench (BenchWant). */}
      {scope === 'network' && (
        <WhatWeNeed onSaid={(said) => { setToast({ message: said.text, type: said.ok ? 'success' : 'error' }); setTimeout(() => setToast(null), 6000) }} />
      )}
      {scope === 'company' && <WhatPartnersNeed />}

      {scope === 'company' && ended.length > 0 && (
        <section className="mb-6 bg-etyme-surface border border-etyme-rule rounded-lg divide-y divide-etyme-rule">
          <p className="px-4 py-2 text-[11px] uppercase tracking-wide text-etyme-muted">Stay ended</p>
          {ended.map((e) => (
            <div key={e.listingId} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] text-etyme-ink"><span className="font-medium">{e.name}</span> · {e.says}</span>
              <span className="flex gap-3">
                <button onClick={() => nudge(e.listingId, false)} disabled={busyRow === e.listingId}
                  className="text-[12px] text-etyme-action hover:underline disabled:opacity-40">Ask to renew</button>
                <button onClick={() => nudge(e.listingId, true)} disabled={busyRow === e.listingId}
                  className="text-[12px] text-etyme-action hover:underline disabled:opacity-40">Copy link</button>
              </span>
            </div>
          ))}
        </section>
      )}

      {scope === 'payroll' ? (
        <RosterSurface
          rows={roster}
          summary={rosterSays}
          loading={loading}
          error={error}
          onNeedsListing={(says) => {
            setToast({ message: says, type: 'error' })
            setTimeout(() => setToast(null), 6000)
          }}
          holidays={turnsHolidays ? { answers: holiday.answers, onTurned: holidayTurned } : null}
        />
      ) : (
      /* DataTable */
      <ListSurface
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        selectable
        searchFilter={(row, q) =>
          row.name.toLowerCase().includes(q) ||
          (scope === 'company' && row.email.toLowerCase().includes(q)) ||
          row.skills.some((s) => s.toLowerCase().includes(q)) ||
          (row.headline?.toLowerCase().includes(q) ?? false) ||
          (row.location?.toLowerCase().includes(q) ?? false) ||
          row.companyName.toLowerCase().includes(q)
        }
        searchPlaceholder={
          scope === 'company'
            ? 'Search by name, skill, location…'
            : 'Search by name, skill, location, supplier…'
        }
        emptyMessage={scope === 'company' ? 'No consultants on bench.' : 'Nothing shared yet.'}
        emptyDetail={
          scope === 'company'
            ? 'Import consultant data or add them manually to start building your bench.'
            : 'Add a firm under Your suppliers. Anybody it markets who has agreed to be marketed shows up here — nobody does until then.'
        }
        exportName="etyme-bench"
        bulkActions={(selected) => (
          <>
            <button
              onClick={() => {
                const count = selected.size
                setToast({ message: `Share ${count} consultant${count !== 1 ? 's' : ''} — coming soon`, type: 'success' })
                setTimeout(() => setToast(null), 3000)
              }}
              className="chip chip--action text-[10px] hover:opacity-80"
            >
              Share ({selected.size})
            </button>
            <button
              onClick={() => {
                // Who was chosen travels to the form (`submitLink`); more
                // than one, or somebody who has not agreed, is said here.
                const chosen = filtered.filter((r) => selected.has(r.id))
                const go = submitLink(chosen)
                if (go.ok) {
                  router.push(go.href as Route)
                } else {
                  setToast({ message: go.says, type: 'error' })
                  setTimeout(() => setToast(null), 6000)
                }
              }}
              className="chip chip--verified text-[10px] hover:opacity-80"
            >
              Submit ({selected.size})
            </button>
          </>
        )}
        filters={
          <div className="flex items-center gap-3 flex-wrap">
            {/* Tier filter */}
            <FilterChips<TierFilter>
              label="Who the firm markets"
              options={[
                { key: 'all', label: 'All' },
                { key: 'RETAINED', label: TIER_WORD.RETAINED },
                { key: 'MARKETING', label: TIER_WORD.MARKETING },
              ]}
              value={tierFilter}
              onChange={setTierFilter}
            />

            {/* Availability filter */}
            <FilterChips<AvailFilter>
              label="When they are free"
              options={[
                { key: 'all', label: 'Any' },
                { key: 'now', label: 'Now' },
                { key: 'soon', label: '≤14d' },
              ]}
              value={availFilter}
              onChange={setAvailFilter}
            />

            {(tierFilter !== 'all' || availFilter !== 'all') && (
              <button
                onClick={() => { setTierFilter('all'); setAvailFilter('all') }}
                className="text-[11px] text-etyme-action hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        }
      />
      )}
      </div>

      {/* Add bench listing modal */}
      {showAddModal && (
        <AddBenchListingModal
          listed={ownListed}
          onClose={() => setShowAddModal(false)}
          onCreated={handleListingCreated}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-up ${
          toast.type === 'success'
            ? 'bg-etyme-verified text-white'
            : 'bg-etyme-danger text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ── The employer's roster ───────────────────────────

/**
 * The people this firm employs, and what each of them is on.
 *
 * ── Why this is a separate surface and not a filter ──────────────────
 *
 * Because it is a different question with a different consent behind it.
 * A bench row exists because somebody granted a listing; a roster row
 * exists because the firm employs them. CLAUDE.md is explicit that
 * conflating the two is the bug: "Not a `BenchListing` — that is a
 * consultant consenting to be sold; this is an employer's roster."
 *
 * So there is no Share and no Submit here. A firm may still put its own
 * W2 in front of a client — it is INTERNAL, the employment is the consent
 * and the employee is told — but that happens from the role, under the
 * submit door's own rules, and offering it as a bulk action on a list of
 * people would make a roster into a shop window. Where somebody has not
 * granted a listing, the row says so in a sentence rather than greying a
 * control out with no words.
 *
 * ── And the number nobody can stand behind is not shown ──────────────
 *
 * "Free to allocate" counts only people whose last assignment ended.
 * Somebody with no contract on the record here is neither free nor busy —
 * the firm's own owner holds an employee seat like everybody else — and
 * counting unknown as free would have put him on a capacity figure.
 */
function RosterSurface({
  rows,
  summary,
  loading,
  error,
  onNeedsListing,
  holidays,
}: {
  rows: RosterEntry[]
  summary: RosterSummaryData | null
  loading: boolean
  error: string | null
  onNeedsListing: (says: string) => void
  /** The holiday switch per row, for the owner, admin and finance desks; null for everybody else. */
  holidays?: { answers: Map<string, HolidayAnswerRow>; onTurned: (said: { ok: boolean; text: string }) => void } | null
}) {
  const standingChip = (r: RosterEntry): { text: string; cls: string } => {
    switch (r.standing) {
      case 'ON_PROJECT':       return { text: 'On a project', cls: 'chip--action' }
      case 'STARTING_SOON':    return { text: 'Starting soon', cls: 'chip--passive' }
      case 'BETWEEN_PROJECTS': return { text: 'Between projects', cls: 'chip--attention' }
      default:                 return { text: 'Nothing on record', cls: 'chip--passive' }
    }
  }

  const columns: Column<RosterEntry>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (row) => (
        <div>
          <p className="text-[13px] font-medium text-etyme-ink">{row.name}</p>
          <p className="text-[11px] text-etyme-muted">{row.seat ?? 'No seat named'}</p>
        </div>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: 'standing',
      label: 'Where they are',
      render: (row) => {
        const { text, cls } = standingChip(row)
        return (
          <div>
            <span className={`chip text-[9px] ${cls}`}>{text}</span>
            <p className="text-[11px] text-etyme-muted mt-1">{row.says}</p>
          </div>
        )
      },
      sortValue: (row) => row.standing,
    },
    {
      key: 'free',
      label: 'Days free',
      render: (row) =>
        row.freeForDays == null ? (
          <span className="text-etyme-faint">—</span>
        ) : (
          <span className="text-[12px] tabular-nums text-etyme-attention font-medium">{row.freeForDays}</span>
        ),
      sortValue: (row) => row.freeForDays ?? -1,
    },
    {
      key: 'skills',
      label: 'Skills',
      render: (row) =>
        row.skills.length === 0 ? (
          // Reported, never filled in. A firm that cannot describe its own
          // engineer has a record problem, and hiding it is how the
          // Training page came to report nought skilled people.
          <span className="text-[11px] text-etyme-faint">None on record</span>
        ) : (
          <div className="flex gap-1 flex-wrap">
            {row.skills.slice(0, 3).map((s) => (
              <span key={s} className="chip chip--passive text-[9px]">{s}</span>
            ))}
            {row.skills.length > 3 && (
              <span className="text-[10px] text-etyme-faint">+{row.skills.length - 3}</span>
            )}
          </div>
        ),
      sortValue: (row) => row.skills.length,
      hideOnMobile: true,
    },
    {
      key: 'practice',
      label: 'Practice',
      render: (row) => (
        <span className="text-[11px] text-etyme-muted">{row.practice ?? '—'}</span>
      ),
      sortValue: (row) => row.practice ?? '',
      hideOnMobile: true,
    },
    {
      key: 'listing',
      label: 'Marketable',
      render: (row) =>
        row.mayMarket ? (
          <span className="chip chip--verified text-[9px]">Listed</span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onNeedsListing(row.marketSays) }}
            className="text-[11px] text-etyme-muted hover:text-etyme-ink underline decoration-dotted"
          >
            No listing
          </button>
        ),
      sortValue: (row) => (row.mayMarket ? 0 : 1),
    },
    // Whether they are paid for a public holiday on the bench. An
    // integrator pays its own people by default, so the row reads "On by
    // default" and offers to switch one person off.
    ...(holidays
      ? [
          {
            key: 'holidays',
            label: 'Holidays',
            sortable: false,
            hideOnMobile: true,
            render: (row: RosterEntry) => (
              <HolidaySwitchCell personId={row.personId} answer={holidays.answers.get(row.personId)} onTurned={holidays.onTurned} />
            ),
          } as Column<RosterEntry>,
        ]
      : []),
  ]

  return (
    <>
      {summary && !loading && (
        <div className="panel mb-6">
          <p className="text-body-sm text-etyme-ink">{summary.says}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <Stat label="On your payroll" value={summary.total} />
            <Stat label="On a project" value={summary.onProject} tone="verified" />
            <Stat label="Free to allocate" value={summary.betweenProjects} tone="attention" />
            <Stat label="Nothing on record" value={summary.notOnTheRecord} />
          </div>
          {summary.skillsUnknown > 0 && (
            <p className="text-[12px] text-etyme-muted mt-3">
              {summary.skillsUnknown} of {summary.total}{' '}
              {summary.skillsUnknown === 1 ? 'has' : 'have'} no skills on record, so nothing can be
              matched to a job for them yet.
            </p>
          )}
        </div>
      )}

      <ListSurface<RosterEntry>
        columns={columns}
        data={rows}
        rowKey={(row) => row.personId}
        loading={loading}
        error={error}
        searchFilter={(row, q) =>
          row.name.toLowerCase().includes(q) ||
          (row.email ?? '').toLowerCase().includes(q) ||
          (row.seat ?? '').toLowerCase().includes(q) ||
          (row.practice ?? '').toLowerCase().includes(q) ||
          row.skills.some((sk) => sk.toLowerCase().includes(q))
        }
        searchPlaceholder="Search by name, seat, practice, skill…"
        emptyMessage="Nobody is on your payroll here yet."
        emptyDetail="Invite your team under Users & permissions, and you can staff them on client work without asking them for a bench listing — the employment is the consent."
        exportName="etyme-payroll"
      />
    </>
  )
}

// ── Bench burn panel ────────────────────────────────

/**
 * Bench burn dashboard — the daily cost of having unplaced consultants.
 *
 * CLAUDE.md: "a vendor with 10 bench-paid consultants at $40/hr
 *             burns $3,200/day. Proactive matching reduces that to near-zero.
 *             This endpoint turns that abstract cost into a visible number."
 *
 * Decision surface: uses serif headline numbers, reasoning on click,
 * clay/attention tone for cost, verified/green for opportunities.
 */
function BenchBurnPanel({ data }: { data: BurnData }) {
  const [expanded, setExpanded] = useState(false)

  const fmtDollars = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toLocaleString()}`
  const fmtDollarsFull = (n: number) => `$${n.toLocaleString()}`

  // Top 3 highest-cost bench sitters
  const topBurners = data.entries.slice(0, 3)

  return (
    <div className="panel mb-6 overflow-hidden">
      <div className="px-5 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="stat-label text-[9px] mb-0.5">Bench Cost</div>
            <h3 className="text-base font-serif font-medium text-etyme-ink">
              Bench Burn
            </h3>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-etyme-action hover:underline"
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        </div>

        {/* Burn stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <div className="stat-label text-[9px] mb-0.5">Daily Burn</div>
            <div className="text-2xl font-serif font-medium text-etyme-attention tabular-nums">
              {fmtDollarsFull(data.burn.daily)}
            </div>
            <div className="text-[10px] text-etyme-faint">per working day</div>
          </div>
          <div>
            <div className="stat-label text-[9px] mb-0.5">Weekly</div>
            <div className="text-xl font-serif font-medium text-etyme-ink tabular-nums">
              {fmtDollars(data.burn.weekly)}
            </div>
            <div className="text-[10px] text-etyme-faint">5-day week</div>
          </div>
          <div>
            <div className="stat-label text-[9px] mb-0.5">Monthly</div>
            <div className="text-xl font-serif font-medium text-etyme-ink tabular-nums">
              {fmtDollars(data.burn.monthly)}
            </div>
            <div className="text-[10px] text-etyme-faint">22 working days</div>
          </div>
          <div>
            <div className="stat-label text-[9px] mb-0.5">Total to Date</div>
            <div className="text-xl font-serif font-medium text-etyme-attention tabular-nums">
              {fmtDollars(data.burn.toDate)}
            </div>
            <div className="text-[10px] text-etyme-faint">since bench start</div>
          </div>
        </div>

        {/* Tier breakdown */}
        <div className="flex items-center gap-6 text-[12px]">
          <div className="flex items-center gap-1.5">
            <span className="chip chip--verified text-[9px]">{TIER_WORD.RETAINED}</span>
            <span className="text-etyme-muted">
              {data.retained.count} · {fmtDollarsFull(data.retained.dailyBurn)}/day
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="chip chip--action text-[9px]">{TIER_WORD.MARKETING}</span>
            <span className="text-etyme-muted">
              {data.marketing.count} · {fmtDollarsFull(data.marketing.dailyBurn)}/day
            </span>
          </div>
          {data.openRequirements > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-etyme-verified font-medium">
                {data.openRequirements} open requirement{data.openRequirements !== 1 ? 's' : ''}
              </span>
              <span className="text-etyme-faint">for matching</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded: top bench sitters by cost */}
      {expanded && topBurners.length > 0 && (
        <div className="border-t border-etyme-rule">
          <div className="px-5 py-3">
            <div className="stat-label text-[9px] mb-2">Highest Daily Cost</div>
            <div className="space-y-2">
              {topBurners.map((e, i) => (
                <div key={e.personId} className="flex items-center gap-3 text-[12px]">
                  <span className="w-4 text-etyme-faint font-mono text-[10px]">{i + 1}</span>
                  <div className="w-6 h-6 rounded-full bg-etyme-attention/10 text-etyme-attention
                                  text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                    {e.personName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-etyme-ink">{e.personName}</span>
                    {e.headline && (
                      <span className="text-etyme-faint ml-1.5 hidden md:inline">· {e.headline}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 tabular-nums">
                    <span className="text-etyme-muted">
                      {compact(e.payRate)}/hr
                    </span>
                    <span className="text-etyme-attention font-medium">
                      {fmtDollarsFull(e.dailyCost)}/day
                    </span>
                    <span className="text-etyme-faint text-[11px] hidden md:inline">
                      {e.daysOnBench}d on bench
                    </span>
                    <span className="text-etyme-attention/70 text-[11px] hidden lg:inline">
                      {fmtDollars(e.totalBurnToDate)} burned
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Visual burn bar */}
      {data.burn.daily > 0 && (
        <div className="border-t border-etyme-rule px-5 py-3">
          <div className="flex items-center gap-2 text-[10px] text-etyme-faint mb-1">
            <span>Retained share of daily burn</span>
          </div>
          <div className="h-2 rounded-full bg-etyme-canvas overflow-hidden flex">
            <div
              className="h-full bg-etyme-verified rounded-l-full transition-all"
              style={{ width: `${Math.round((data.retained.dailyBurn / data.burn.daily) * 100)}%` }}
            />
            <div
              className="h-full bg-etyme-action rounded-r-full transition-all"
              style={{ width: `${Math.round((data.marketing.dailyBurn / data.burn.daily) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Our bench is read by the firm's managers and HR only; everybody else
 * who opens this tab reads the roster below without it, rather than a
 * refusal in the middle of their own page.
 */
function OurBenchGate({ firmName, permissions, roleName }: { firmName: string; permissions: readonly string[]; roleName: string | null }) {
  const manager = hasPermission(permissions, 'assignments.write')
  const hr = roleName === 'HR' || roleName === 'HR Partner'
  if (!manager && !hr) return null
  return <OurBench firmName={firmName} />
}
