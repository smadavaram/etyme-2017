'use client'

import { useEffect, useState, useCallback } from 'react'
import { compact } from '@/lib/money-display'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ListSurface, type Column } from '@/components/list-surface'
import { hasPermission } from '@/lib/permissions'
import { useSession } from '@/components/session-provider'
import { ProfileEditor } from './profile-editor'
import { wordFor, listingRates, ADD_TIER_OPTION, savingSays, addSkillTags } from '@/lib/bench-filter'
import { usePageSection } from '@/components/page-section'
import { ENGAGEMENT_WORDS } from '@/lib/award/hire-terms'
import { RefusedState, LoadingState } from '@/components/ui'

/**
 * Consultants working surface — the company's talent pool.
 *
 * CLAUDE.md design system:
 *   Working surfaces: "Tables, search, filters, bulk, density"
 *   "Tabular figures, tight rows"
 *   "User finds and acts fast"
 *
 * Consultants live on the sell side — retained and marketing bench.
 * The page surfaces availability, skills, work auth, and tier at a glance.
 * Row click opens a detail drawer (right-side slide).
 */

// ── Types ──────────────────────────────────────────────────

interface Consultant {
  id: string
  personId: string
  name: string
  email: string
  headline: string | null
  skills: string[]
  location: string | null
  workAuth: string | null
  availableFrom: string | null
  visibility: string
  tier: string | null
  rateMin: number | null
  rateMax: number | null
  /** Cents an hour, where this seat reads pay. */
  rateFloor?: number | null
}

// ── Add Consultant Modal ───────────────────────────────────

function AddConsultantModal({ onClose, onCreated }: { onClose: () => void; onCreated: (says: string) => void }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    headline: '',
    // Tags, not comma text: a skill is ended by Enter or a comma and
    // removed with its ×. The draft is what is typed and not yet a tag.
    skills: [] as string[],
    skillDraft: '',
    location: '',
    workAuth: '',
    // Adding somebody also asks them to join your bench — said on the
    // form, with the choice of who sees them and at what rate, rather
    // than done in silence (bench tester, 2026-10-01).
    tier: 'MARKETING' as 'MARKETING' | 'RETAINED',
    rateMin: '',
    rateMax: '',
    // What the firm would pay them when it places them, if it knows
    // already (2026-10-06). Optional; they read it beside their yes.
    termsEngagementType: '' as '' | 'W2' | 'IND_1099',
    termsPay: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  /**
   * Checked here rather than left to the browser.
   *
   * `type="email" required` looks like free validation and is not: the
   * browser refuses to submit, `handleSubmit` never runs, and the error
   * banner below never fires. Inside a modal on a phone the native bubble
   * has nowhere to appear, so the button simply does nothing and says
   * nothing — which is what a real person hit.
   */
  function problems(): Record<string, string> {
    const p: Record<string, string> = {}

    if (form.name.trim().length < 2) {
      p.name = 'A name, so somebody can be told who this is about.'
    }

    const email = form.email.trim()
    if (!email) {
      p.email = 'An email — this is how they are invited and how they sign in.'
    } else if (!email.includes('@') || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
      // Names it, because "invalid email" leaves somebody staring at a
      // field they have already read twice.
      p.email = `"${email}" is not an email address. It needs an @ and a domain — jane@acme.com.`
    }

    return p
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const found = problems()
    setFieldErrors(found)
    if (Object.keys(found).length > 0) {
      setError(Object.values(found)[0])
      return
    }

    const rates = listingRates({ min: form.rateMin, max: form.rateMax }, null)
    if (!rates.ok) {
      setError(rates.says)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/consultants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          headline: form.headline || null,
          // A skill typed and not yet ended with Enter is still a skill.
          skills: addSkillTags(form.skills, form.skillDraft),
          location: form.location || null,
          workAuth: form.workAuth || null,
          tier: form.tier,
          rateMin: rates.rateMin,
          rateMax: rates.rateMax,
          // Dollars an hour typed, minor units sent. The route checks it
          // with the terms page's own rule and says what is wrong.
          termsEngagementType: form.termsEngagementType || null,
          termsPayRateCents: form.termsPay.trim()
            ? Number.isFinite(Number(form.termsPay)) ? Math.round(Number(form.termsPay) * 100) : form.termsPay
            : null,
        }),
      })

      if (!res.ok) {
        // Parsed inside the failure branch, so an empty body threw
        // from the error handler itself and the message below never
        // ran.
        const body = await res.json().catch(() => ({}) as any)
        setError(body.error?.message ?? 'Failed to create consultant')
        // The API says which field it refused. Showing it beside the
        // field beats a banner the eye has already skipped.
        if (body.error?.field) {
          setFieldErrors({ [body.error.field]: body.error.message })
        }
        return
      }

      const body = await res.json().catch(() => ({}) as any)
      onCreated(body.data?.message ?? `${form.name.trim()} is added.`)
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
          <h2 className="text-lg font-semibold">Add consultant</h2>
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

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* One column on a phone.
              Side by side, "Full name" and "Email" read as first name and
              last name to anybody moving fast — which is exactly what
              happened: a surname typed into the email field, and a button
              that then did nothing. */}
          <div className="grid grid-cols-1 sm:grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Full name *</label>
              {/* required says so to a screen reader; noValidate on the
                  form keeps the browser from refusing silently, so
                  problems() still runs and says the sentence. */}
              <input
                type="text"
                required
                aria-required="true"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                aria-invalid={!!fieldErrors.name}
                className={`w-full px-3 py-2 text-sm border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action
                           ${fieldErrors.name ? 'border-etyme-attention' : 'border-etyme-rule'}`}
                placeholder="Jane Smith — first and last"
              />
              {fieldErrors.name && (
                <p className="mt-1 text-[12px] text-etyme-attention">{fieldErrors.name}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Email *</label>
              {/* type=email for the phone keyboard. The checking is
                  ours — see problems() — because the browser's version
                  refuses silently inside a modal. */}
              <input
                type="email"
                required
                aria-required="true"
                inputMode="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                aria-invalid={!!fieldErrors.email}
                className={`w-full px-3 py-2 text-sm border rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action
                           ${fieldErrors.email ? 'border-etyme-attention' : 'border-etyme-rule'}`}
                placeholder="jane@acme.com"
              />
              {fieldErrors.email && (
                <p className="mt-1 text-[12px] text-etyme-attention">{fieldErrors.email}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-etyme-muted mb-1">Headline</label>
            <input
              type="text"
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              placeholder="ICU travel nurse, or validation engineer"
            />
          </div>

          <div>
            <label htmlFor="add-skills" className="block text-xs font-semibold text-etyme-muted mb-1">Skills</label>
            <div className="w-full px-2 py-1.5 border border-etyme-rule rounded-lg bg-white flex flex-wrap gap-1.5
                            focus-within:ring-2 focus-within:ring-etyme-action/20 focus-within:border-etyme-action">
              {form.skills.map((skill) => (
                <span key={skill} className="chip chip--passive inline-flex items-center gap-1">
                  {skill}
                  <button
                    type="button"
                    aria-label={`Remove ${skill}`}
                    onClick={() => setForm({ ...form, skills: form.skills.filter((s) => s !== skill) })}
                    className="text-etyme-muted hover:text-etyme-ink"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                id="add-skills"
                type="text"
                value={form.skillDraft}
                onChange={(e) => {
                  const typed = e.target.value
                  // A comma ends a skill, typed or pasted.
                  if (typed.includes(',')) {
                    setForm({ ...form, skills: addSkillTags(form.skills, typed), skillDraft: '' })
                  } else {
                    setForm({ ...form, skillDraft: typed })
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Enter ends a skill here; it does not save the form.
                    e.preventDefault()
                    setForm({ ...form, skills: addSkillTags(form.skills, form.skillDraft), skillDraft: '' })
                  } else if (e.key === 'Backspace' && !form.skillDraft && form.skills.length > 0) {
                    setForm({ ...form, skills: form.skills.slice(0, -1) })
                  }
                }}
                onBlur={() => {
                  if (form.skillDraft.trim()) {
                    setForm({ ...form, skills: addSkillTags(form.skills, form.skillDraft), skillDraft: '' })
                  }
                }}
                className="flex-1 min-w-[8rem] px-1 py-0.5 text-sm focus:outline-none"
                placeholder={form.skills.length === 0 ? 'Type a skill, then Enter — ICU nursing, GMP validation' : ''}
              />
            </div>
            <p className="mt-1 text-[12px] text-etyme-muted">Press Enter or a comma after each skill.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
                placeholder="Dallas, TX"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-etyme-muted mb-1">Work authorization</label>
              <select
                value={form.workAuth}
                onChange={(e) => setForm({ ...form, workAuth: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              >
                <option value="">Select…</option>
                <option value="US_CITIZEN">US Citizen</option>
                <option value="GC">Green Card</option>
                <option value="H1B">H-1B</option>
                <option value="OPT">OPT</option>
                <option value="EAD">EAD</option>
                <option value="TN">TN</option>
                <option value="L1">L-1</option>
                <option value="GBP_SW">UK Skilled Worker</option>
              </select>
            </div>
          </div>

          {/* Their bench listing: who sees them once they say yes, and at what rate. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="add-tier" className="block text-xs font-semibold text-etyme-muted mb-1">Who sees them</label>
              <select
                id="add-tier"
                value={form.tier}
                onChange={(e) => setForm({ ...form, tier: e.target.value as 'MARKETING' | 'RETAINED' })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              >
                <option value="MARKETING">{ADD_TIER_OPTION.MARKETING}</option>
                <option value="RETAINED">{ADD_TIER_OPTION.RETAINED}</option>
              </select>
            </div>
            <div>
              <label htmlFor="add-rate-min" className="block text-xs font-semibold text-etyme-muted mb-1">Lowest rate ($/hr)</label>
              <input id="add-rate-min" type="number" min="0" step="0.01" value={form.rateMin}
                onChange={(e) => setForm({ ...form, rateMin: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg tabular-nums" />
            </div>
            <div>
              <label htmlFor="add-rate-max" className="block text-xs font-semibold text-etyme-muted mb-1">Highest rate ($/hr)</label>
              <input id="add-rate-max" type="number" min="0" step="0.01" value={form.rateMax}
                onChange={(e) => setForm({ ...form, rateMax: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg tabular-nums" />
            </div>
          </div>
          {/* Pay terms, optional. Only the two a person added here can
              have: "through their own company" needs their company on
              record first, and "employed by another firm" is that firm's
              to put forward. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="add-terms-type" className="block text-xs font-semibold text-etyme-muted mb-1">How you would pay them (optional)</label>
              <select
                id="add-terms-type"
                value={form.termsEngagementType}
                onChange={(e) => setForm({ ...form, termsEngagementType: e.target.value as '' | 'W2' | 'IND_1099' })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg bg-white
                           focus:outline-none focus:ring-2 focus:ring-etyme-action/20 focus:border-etyme-action"
              >
                <option value="">Not decided yet</option>
                <option value="W2">{ENGAGEMENT_WORDS.W2}</option>
                <option value="IND_1099">{ENGAGEMENT_WORDS.IND_1099}</option>
              </select>
            </div>
            <div>
              <label htmlFor="add-terms-pay" className="block text-xs font-semibold text-etyme-muted mb-1">Their pay ($/hr)</label>
              <input id="add-terms-pay" type="number" min="0" step="0.01" value={form.termsPay}
                onChange={(e) => setForm({ ...form, termsPay: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-etyme-rule rounded-lg tabular-nums" />
              {fieldErrors.termsPayRateCents && <p className="text-xs text-etyme-attention mt-1">{fieldErrors.termsPayRateCents}</p>}
            </div>
          </div>
          <p className="text-xs text-etyme-muted">
            If you fill these in, they see them when they are asked and agree them by saying yes.
          </p>

          {/* Said plainly, right above the one button, because saving
              sends an email (outside review, 2026-10-05). */}
          <p className="text-sm text-etyme-ink pt-2">{savingSays(form.name)}</p>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? 'Adding…' : 'Add and ask them'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Consultant Detail Drawer ───────────────────────────────

interface DrawerContract {
  id: string
  side: string
  state: string
  clientName: string | null
  rate: number
  startDate: string
  endDate: string | null
}

interface DrawerSubmission {
  id: string
  requirementTitle: string
  clientName: string
  state: string
  rate: number
  submittedAt: string
}

interface RateProgressionData {
  progression: Array<{
    date: string
    payRate: number | null
    billRate: number | null
    margin: number | null
    marginPercent: number | null
    contractType: string
    state: string
    client: string | null
    vendor: string | null
    currency: string
  }>
  /** Said when the pay on these points was withheld from this reader. */
  payWithheldSays?: string | null
  summary: {
    totalPlacements: number
    firstRate: number | null
    currentRate: number | null
    rateGrowth: number | null
    currency: string
  }
}

function ConsultantDrawer({ consultant, onClose, mayEdit, mayRate, onSaved }: {
  consultant: Consultant
  onClose: () => void
  /** The seat may change the person's record (`consultants.write`). */
  mayEdit: boolean
  /** The seat reads pay, so may set the lowest rate they take. */
  mayRate: boolean
  onSaved: () => void
}) {
  const [contracts, setContracts] = useState<DrawerContract[]>([])
  const [submissions, setSubmissions] = useState<DrawerSubmission[]>([])
  const [rateProgression, setRateProgression] = useState<RateProgressionData | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(true)

  useEffect(() => {
    async function fetchActivity() {
      setLoadingActivity(true)
      try {
        // Fetch sell + buy contracts, submissions, and rate progression in parallel
        const [sellRes, buyRes, submissionsRes, rateRes] = await Promise.all([
          fetch(`/api/contracts?side=sell&personId=${consultant.personId}`).catch(() => null),
          fetch(`/api/contracts?side=buy&personId=${consultant.personId}`).catch(() => null),
          fetch(`/api/submissions?personId=${consultant.personId}`).catch(() => null),
          fetch(`/api/consultants/${consultant.id}/rate-progression`).catch(() => null),
        ])

        const allContracts: DrawerContract[] = []

        // Show sell contracts (client engagements) — these are the meaningful ones
        if (sellRes?.ok) {
          const body = await sellRes.json()
          for (const c of body.data?.contracts ?? []) {
            allContracts.push({
              id: c.id,
              side: 'sell',
              state: c.state,
              clientName: c.clientCompany?.name ?? null,
              rate: c.billRate,
              startDate: c.startDate,
              endDate: c.endDate ?? null,
            })
          }
        }

        // Also add buy contracts that have a different context (bench/internal)
        if (buyRes?.ok) {
          const body = await buyRes.json()
          for (const c of body.data?.contracts ?? []) {
            // Only show bench/internal buy contracts — active buy contracts
            // paired with a sell contract are redundant in the drawer
            if (['BENCH_PAID', 'INTERNAL', 'TRAINING'].includes(c.state)) {
              allContracts.push({
                id: c.id,
                side: 'buy',
                state: c.state,
                clientName: c.state === 'BENCH_PAID' ? 'Bench' : c.state === 'TRAINING' ? 'Training' : 'Internal',
                rate: c.payRate,
                startDate: c.startDate,
                endDate: c.endDate ?? null,
              })
            }
          }
        }

        setContracts(allContracts)

        if (submissionsRes?.ok) {
          const body = await submissionsRes.json()
          const raw = body.data?.submissions ?? []
          setSubmissions(raw.slice(0, 5).map((s: any) => ({
            id: s.id,
            requirementTitle: s.requirement?.title ?? 'Unknown',
            clientName: s.toCompany?.name ?? s.fromCompany?.name ?? 'Unknown',
            state: s.status ?? s.state,
            rate: s.billRate,
            submittedAt: s.submittedAt ?? s.createdAt,
          })))
        }

        // Rate progression — Addendum D §D.3.3
        if (rateRes?.ok) {
          const body = await rateRes.json()
          if (body.data) {
            setRateProgression(body.data)
          }
        }
      } catch {
        // Silently fail — activity section is supplementary
      } finally {
        setLoadingActivity(false)
      }
    }
    fetchActivity()
  }, [consultant.personId])

  const activeContracts = contracts.filter(c =>
    ['IN_PROGRESS', 'VERIFIED', 'PENDING_VERIFICATION'].includes(c.state)
  )
  const pastContracts = contracts.filter(c =>
    ['ENDED', 'CANCELLED'].includes(c.state)
  )

  function contractStateLabel(state: string): string {
    const labels: Record<string, string> = {
      IN_PROGRESS: 'Active',
      VERIFIED: 'Verified',
      PENDING_VERIFICATION: 'Pending',
      DRAFT: 'Draft',
      ENDED: 'Ended',
      CANCELLED: 'Cancelled',
      BENCH_PAID: 'Bench',
      PAUSED: 'Paused',
    }
    return labels[state] ?? state
  }

  function submissionStateChip(state: string): { label: string; cls: string } {
    switch (state) {
      case 'PLACED': return { label: 'Placed', cls: 'chip--verified' }
      case 'SHORTLISTED': return { label: 'Shortlisted', cls: 'chip--action' }
      case 'INTERVIEW': return { label: 'Interview', cls: 'chip--action' }
      case 'SUBMITTED': return { label: 'Submitted', cls: 'chip--attention' }
      case 'REJECTED': return { label: 'Rejected', cls: 'chip--passive' }
      case 'OFFERED': return { label: 'Offered', cls: 'chip--verified' }
      default: return { label: state, cls: 'chip--passive' }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white h-full shadow-xl overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-etyme-rule flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{consultant.name}</h2>
            {consultant.headline && (
              <p className="text-[13px] text-etyme-muted mt-0.5">{consultant.headline}</p>
            )}
          </div>
          <button onClick={onClose} className="text-etyme-muted hover:text-etyme-ink p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Skills, free date and rate floor, editable where the seat may
              (bench tester, 2026-09-30: there was no screen for it). */}
          {mayEdit && (
            <ProfileEditor
              consultantId={consultant.id}
              skills={consultant.skills}
              availableFrom={consultant.availableFrom}
              rateFloor={consultant.rateFloor ?? null}
              mayRate={mayRate}
              onSaved={onSaved}
            />
          )}

          {/* Contact */}
          <div>
            <p className="eyebrow mb-2">Contact</p>
            <p className="text-sm">{consultant.email}</p>
          </div>

          {/* Skills */}
          <div>
            <p className="eyebrow mb-2">Skills</p>
            {consultant.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {consultant.skills.map((skill) => (
                  <span key={skill} className="chip chip--action">{skill}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-etyme-muted">No skills listed</p>
            )}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-1 sm:grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="eyebrow mb-1">Location</p>
              <p className="text-sm">{consultant.location ?? 'Not specified'}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Work auth</p>
              <p className="text-sm">{formatWorkAuth(consultant.workAuth)}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Tier</p>
              <p className="text-sm">{wordFor(consultant.tier)}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Visibility</p>
              <span className={`chip ${
                consultant.visibility === 'VERIFIED' ? 'chip--verified' :
                consultant.visibility === 'FEED' ? 'chip--action' :
                'chip--passive'
              }`}>
                {consultant.visibility === 'INTERNAL' ? wordFor('INTERNAL_ONLY') : wordFor(consultant.visibility)}
              </span>
            </div>
          </div>

          {/* Availability + Rate row */}
          <div className="grid grid-cols-1 sm:grid-cols-1 sm:grid-cols-2 gap-4">
            {consultant.availableFrom && (
              <div>
                <p className="eyebrow mb-1">Available from</p>
                <p className="text-sm">
                  {new Date(consultant.availableFrom) <= new Date() ? (
                    <span className="flex items-center gap-1.5">
                      <span className="evidence-dot" />
                      <span className="text-etyme-verified font-medium">Now</span>
                    </span>
                  ) : (
                    <span className="tabular-nums">{new Date(consultant.availableFrom).toLocaleDateString()}</span>
                  )}
                </p>
              </div>
            )}
            {consultant.rateMin != null && (
              <div>
                <p className="eyebrow mb-1">Rate range</p>
                <p className="text-sm tabular-nums">
                  ${consultant.rateMin}/hr
                  {consultant.rateMax != null && ` – $${consultant.rateMax}/hr`}
                </p>
              </div>
            )}
          </div>

          {/* Divider */}
          <hr className="border-etyme-rule" />

          {/* Active Contracts */}
          <div>
            <p className="eyebrow mb-2">
              Active contracts
              {!loadingActivity && <span className="text-etyme-faint"> ({activeContracts.length})</span>}
            </p>
            {loadingActivity ? (
              <LoadingState says="Reading their contracts…" compact />
            ) : activeContracts.length === 0 ? (
              <p className="text-sm text-etyme-muted">No active contracts</p>
            ) : (
              <div className="space-y-2">
                {activeContracts.map(c => (
                  <div key={c.id} className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-etyme-ink">
                        {c.clientName ?? 'Unknown'}
                      </span>
                      <span className="text-sm tabular-nums text-etyme-ink">
                        {compact(c.rate)}/hr
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="chip chip--verified text-[10px]">
                        {contractStateLabel(c.state)}
                      </span>
                      <span className="text-[11px] tabular-nums text-etyme-faint">
                        {new Date(c.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        {c.endDate && ` – ${new Date(c.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past contracts */}
          {!loadingActivity && pastContracts.length > 0 && (
            <div>
              <p className="eyebrow mb-2">
                Past contracts <span className="text-etyme-faint">({pastContracts.length})</span>
              </p>
              <div className="space-y-1.5">
                {pastContracts.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-sm text-etyme-muted">
                    <span>{c.clientName ?? 'Unknown'}</span>
                    <span className="tabular-nums text-[12px]">
                      {new Date(c.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      {c.endDate && ` – ${new Date(c.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rate Progression — Addendum D §D.3.3 */}
          {!loadingActivity && rateProgression && rateProgression.progression.length > 0 && (
            <>
              <hr className="border-etyme-rule" />
              <div>
                <p className="eyebrow mb-2">
                  Rate progression
                  {rateProgression.summary.rateGrowth != null && (
                    <span className={`ml-2 text-[11px] font-medium ${
                      rateProgression.summary.rateGrowth > 0 ? 'text-etyme-verified' :
                      rateProgression.summary.rateGrowth < 0 ? 'text-etyme-attention' :
                      'text-etyme-muted'
                    }`}>
                      {rateProgression.summary.rateGrowth > 0 ? '+' : ''}
                      {rateProgression.summary.rateGrowth}%
                    </span>
                  )}
                </p>
                {rateProgression.payWithheldSays && (
                  <p className="text-[12px] text-etyme-muted mb-2">{rateProgression.payWithheldSays}</p>
                )}
                {/* Summary stat row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  {rateProgression.summary.firstRate != null && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">First</p>
                      <p className="text-sm font-serif tabular-nums">{compact(rateProgression.summary.firstRate)}/hr</p>
                    </div>
                  )}
                  {rateProgression.summary.currentRate != null && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Current</p>
                      <p className="text-sm font-serif tabular-nums font-medium">{compact(rateProgression.summary.currentRate)}/hr</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-etyme-faint">Placements</p>
                    <p className="text-sm font-serif tabular-nums">{rateProgression.summary.totalPlacements}</p>
                  </div>
                </div>
                {/* Timeline */}
                <div className="space-y-1.5">
                  {rateProgression.progression.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px]">
                      <span className="tabular-nums text-etyme-faint w-[70px] shrink-0">
                        {new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </span>
                      <span className={`chip ${
                        p.state === 'IN_PROGRESS' ? 'chip--verified' :
                        p.state === 'ENDED' ? 'chip--passive' :
                        'chip--attention'
                      } text-[10px]`}>
                        {p.state === 'IN_PROGRESS' ? 'Active' : p.state === 'ENDED' ? 'Ended' : p.state}
                      </span>
                      {p.payRate != null && (
                        <span className="tabular-nums text-etyme-ink font-medium">
                          {compact(p.payRate)}/hr
                        </span>
                      )}
                      {p.billRate != null && (
                        <span className="tabular-nums text-etyme-faint">
                          (bill: {compact(p.billRate)})
                        </span>
                      )}
                      {p.client && (
                        <span className="text-etyme-muted truncate">{p.client}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Recent submissions */}
          {!loadingActivity && submissions.length > 0 && (
            <>
              <hr className="border-etyme-rule" />
              <div>
                <p className="eyebrow mb-2">
                  Recent submissions <span className="text-etyme-faint">({submissions.length})</span>
                </p>
                <div className="space-y-2">
                  {submissions.map(s => {
                    const chip = submissionStateChip(s.state)
                    return (
                      <div key={s.id} className="bg-etyme-canvas rounded-lg px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-etyme-ink truncate mr-2">
                            {s.requirementTitle}
                          </span>
                          <span className={`chip ${chip.cls} text-[10px] shrink-0`}>
                            {chip.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-etyme-muted">
                            {s.clientName}
                          </span>
                          {s.rate != null && s.rate > 0 && (
                            <span className="text-[11px] tabular-nums text-etyme-faint">
                              {compact(s.rate)}/hr
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {/* Empty state for no activity */}
          {!loadingActivity && activeContracts.length === 0 && pastContracts.length === 0 && submissions.length === 0 && (
            <p className="text-sm text-etyme-faint text-center py-2">
              No contract or submission history yet.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────

function formatWorkAuth(auth: string | null): string {
  if (!auth) return 'Not specified'
  const labels: Record<string, string> = {
    US_CITIZEN: 'US Citizen',
    GC: 'Green Card',
    H1B: 'H-1B',
    OPT: 'OPT',
    EAD: 'EAD',
    TN: 'TN',
    L1: 'L-1',
    GBP_SW: 'UK Skilled Worker',
  }
  return labels[auth] ?? auth
}

// ── Page ───────────────────────────────────────────────────

export default function ConsultantsPage() {
  const router = useRouter()
  const session = useSession()
  const readerKind = session.company?.kind ?? null
  // The section on the reader's own menu (round seven).
  const section = usePageSection('/dashboard/consultants')
  const searchParams = useSearchParams()
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  /** What adding somebody did, said once it is done. */
  const [added, setAdded] = useState<string | null>(null)
  const [selected, setSelected] = useState<Consultant | null>(null)
  const [hasCostPermission, setHasCostPermission] = useState(false)
  /**
   * How many people this firm employs who are not consultant records.
   *
   * `/api/consultants` reads `ConsultantProfile`, which exists only once
   * somebody has been onboarded as a consultant. An integrator's own W2
   * has no such row and needs none — the employment is the consent to
   * staff them — so Teleworld Solutions read "TOTAL 0 consultants" while
   * holding five live employee seats.
   *
   * Their home is the payroll tab on Bench, which is where the roster is
   * computed. What this page owes them is to stop reporting a confident
   * nought over five real people, and to say where they are.
   */
  const [onPayroll, setOnPayroll] = useState<number | null>(null)
  /**
   * Whether the list has answered. The counters read "Total 0" while the
   * read was out and above a refusal, a nought nobody had counted (sign-up
   * walk round four, 21). They wait for an answer and go on a refusal.
   */
  const [counted, setCounted] = useState(false)
  /**
   * The door's own sentence when it refused this seat. A refusal is the
   * whole answer: no "Add consultant", no Feed/Table/Export toolbar and no
   * empty table under it (sign-up walk round five, 11).
   */
  const [refused, setRefused] = useState<string | null>(null)
  /**
   * Whether the door has answered at least once. Until it has, the page is
   * a loading line and nothing else: "Add consultant" and the Feed/Table/
   * Export toolbar drawn before the first read are furniture a refused seat
   * sees and then loses (sign-up walk round six, 14). A later reload, after
   * somebody is added, keeps the page standing.
   */
  const [firstRead, setFirstRead] = useState(false)

  // Open the add modal when navigated with ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowAdd(true)
      router.replace('/dashboard/consultants', { scroll: false })
    }
  }, [searchParams, router])

  const fetchConsultants = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/consultants')
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}))
        setRefused(body.error?.message ?? 'Consultants are not part of your seat. Ask your company\'s owner if you need them.')
        setConsultants([])
        setCounted(false)
        return
      }
      setRefused(null)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }

      const body = await res.json()
      // API returns nested person object; flatten for the table
      const mapped = (body.data?.consultants ?? []).map((c: any) => ({
        ...c,
        name: c.person?.name ?? c.name ?? 'Unknown',
        email: c.person?.email ?? c.email ?? '',
        tier: c.listings?.[0]?.tier ?? c.tier ?? null,
        rateMin: c.listings?.[0]?.rateMin ?? c.rateMin ?? null,
        rateMax: c.listings?.[0]?.rateMax ?? c.rateMax ?? null,
      }))
      setConsultants(mapped)
      setCounted(true)
      // The seat's own permissions: the list answer does not carry them, so
      // an owner holding everything read "Restricted" over their own people.
      setHasCostPermission(hasPermission(session.permissions, 'consultants.cost'))

      // Asked separately and never merged into the table above: a roster
      // is not a set of listings and must not be read as one.
      const payroll = await fetch('/api/bench?scope=payroll')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
      const total = payroll?.data?.summary?.total
      setOnPayroll(typeof total === 'number' ? total : null)
    } catch (err: any) {
      setError(err.message)
      setConsultants([])
      setCounted(false)
    } finally {
      setLoading(false)
      setFirstRead(true)
    }
  }, [session.permissions])

  useEffect(() => {
    fetchConsultants()
  }, [fetchConsultants])

  // ── Stats ──────────────────────────────────────────
  const retainedCount = consultants.filter((c) => c.tier === 'RETAINED').length
  const availableNow = consultants.filter(
    (c) => c.availableFrom && new Date(c.availableFrom) <= new Date()
  ).length

  // ── Column definitions ─────────────────────────────
  const columns: Column<Consultant>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (row) => (
        <div>
          <p className="font-medium text-etyme-ink">{row.name}</p>
          <p className="text-[11px] text-etyme-faint">{row.email}</p>
        </div>
      ),
      sortValue: (row) => row.name,
      width: 'min-w-[180px]',
    },
    {
      key: 'skills',
      label: 'Skills',
      render: (row) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {row.skills.slice(0, 3).map((skill) => (
            <span key={skill} className="chip chip--action">{skill}</span>
          ))}
          {row.skills.length > 3 && (
            <span className="chip chip--passive">+{row.skills.length - 3}</span>
          )}
        </div>
      ),
      sortable: false,
      hideOnMobile: true,
    },
    {
      key: 'location',
      label: 'Location',
      render: (row) => (
        <span className="text-etyme-muted">{row.location ?? '—'}</span>
      ),
      sortValue: (row) => row.location ?? '',
      hideOnMobile: true,
    },
    {
      key: 'workAuth',
      label: 'Work auth',
      render: (row) => (
        row.workAuth ? (
          <span className="chip chip--passive">{formatWorkAuth(row.workAuth)}</span>
        ) : (
          <span className="text-etyme-faint">—</span>
        )
      ),
      sortValue: (row) => row.workAuth ?? '',
      hideOnMobile: true,
    },
    {
      key: 'rate',
      label: 'Pay rate',
      render: (row) => (
        hasCostPermission ? (
          row.rateMin != null ? (
            <span className="tabular-nums">
              ${Math.round(row.rateMin / 100)}<span className="text-etyme-faint">/hr</span>
            </span>
          ) : (
            <span className="text-etyme-faint">—</span>
          )
        ) : (
          <span className="text-etyme-faint text-[11px]">Read by the pay desks</span>
        )
      ),
      sortValue: (row) => row.rateMin ?? 0,
      align: 'right' as const,
    },
    {
      key: 'availability',
      label: 'Availability',
      render: (row) => (
        row.availableFrom ? (
          new Date(row.availableFrom) <= new Date() ? (
            <span className="flex items-center gap-1.5">
              <span className="evidence-dot" />
              <span className="text-[12px] text-etyme-verified font-medium">Now</span>
            </span>
          ) : (
            <span className="text-[12px] tabular-nums text-etyme-muted">
              {new Date(row.availableFrom).toLocaleDateString()}
            </span>
          )
        ) : (
          <span className="text-etyme-faint">—</span>
        )
      ),
      sortValue: (row) =>
        row.availableFrom ? new Date(row.availableFrom).getTime() : Infinity,
    },
    {
      key: 'tier',
      label: 'Tier',
      render: (row) => (
        row.tier ? (
          <span className={`chip ${
            row.tier === 'RETAINED' ? 'chip--verified' : 'chip--attention'
          }`}>
            {wordFor(row.tier)}
          </span>
        ) : (
          <span className="text-etyme-faint">—</span>
        )
      ),
      sortValue: (row) => row.tier ?? '',
    },
  ]

  // A refused seat reads the sentence and nothing else — the same shape
  // as Past contractors and Supplier scorecards (round four, 21).
  if (refused) {
    return <RefusedState says={refused} />
  }

  // Nothing until the first read: the door may yet refuse this seat.
  if (!firstRead) {
    return <LoadingState says="Opening your consultants…" />
  }

  // ── Search filter ──────────────────────────────────
  const searchFilter = (row: Consultant, q: string) =>
    row.name.toLowerCase().includes(q) ||
    row.email.toLowerCase().includes(q) ||
    row.skills.some((s) => s.toLowerCase().includes(q)) ||
    (row.location ?? '').toLowerCase().includes(q) ||
    (row.headline ?? '').toLowerCase().includes(q) ||
    (row.workAuth ?? '').toLowerCase().includes(q)

  return (
    <>
      {/* Head — prototype pattern: eyebrow + serif h1 + prose subtitle + actions */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
        <div className="page-head">
          {/* The section this page sits under on the reader's own menu —
              drawn only once the session says who is reading. A guessed
              kind is a supplier's eyebrow on a client's page while the
              session loads (sign-up walk round three, 16). */}
          {readerKind != null && (
            <p className="eyebrow">{section ?? ''}</p>
          )}
          <h1>Consultants</h1>
          {readerKind != null && (
            <p>Consultant records — the people on your bench, kept to you or shown to your partners, with skills, availability and work authorization at a glance.</p>
          )}
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary self-start md:mt-3 md:shrink-0">
          Add consultant
        </button>
      </div>

      {added && (
        <p role="status" className="panel text-body-sm text-etyme-ink mb-6">
          {added}{' '}
          <button className="text-etyme-action hover:underline" onClick={() => setAdded(null)}>Close</button>
        </p>
      )}

      {/* The people this page cannot see, said rather than left as a zero. */}
      {!loading && onPayroll != null && onPayroll > 0 && (
        <div className="panel mb-6">
          <p className="text-body-sm text-etyme-ink">
            {onPayroll} {onPayroll === 1 ? 'person is' : 'people are'} on your payroll and
            {onPayroll === 1 ? ' is' : ' are'} not counted here. You need no bench listing to
            staff your own — the employment is the consent — so they are on your payroll rather
            than in this list.
          </p>
          <Link href="/dashboard/bench" className="btn-secondary mt-3 inline-block">
            See who is on your payroll →
          </Link>
        </div>
      )}

      {/* Stats row — only once the list has answered */}
      {counted && !error && (
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Total</p>
          <p className="stat-value text-etyme-ink">{consultants.length}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">consultant records</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Retained</p>
          <p className="stat-value text-etyme-verified">{retainedCount}</p>
          <p className="text-[11px] text-etyme-faint mt-0.5">on bench</p>
        </div>
        <div className="panel flex-1 min-w-[140px]">
          <p className="stat-label">Available now</p>
          <p className={`stat-value ${availableNow > 0 ? 'text-etyme-verified' : 'text-etyme-ink'}`}>
            {availableNow}
          </p>
          <p className="text-[11px] text-etyme-faint mt-0.5">ready to deploy</p>
        </div>
      </div>
      )}

      {/* Data table */}
      <ListSurface<Consultant>
        columns={columns}
        data={consultants}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        searchFilter={searchFilter}
        searchPlaceholder="Search by name, email, skill, location, or work auth…"
        emptyMessage="No consultant records."
        emptyDetail="A consultant record exists once somebody grants you a bench listing. People you employ need none — they are on your payroll, under Bench."
        onRowClick={(row) => setSelected(row)}
        exportName="consultants"
        defaultPageSize={20}
      />

      {/* Footer count */}
      {!loading && consultants.length > 0 && (
        <p className="text-xs text-etyme-faint mt-3 tabular-nums">
          {consultants.length} consultant{consultants.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Modals */}
      {showAdd && <AddConsultantModal onClose={() => setShowAdd(false)} onCreated={(says) => { setAdded(says); fetchConsultants() }} />}
      {selected && (
        <ConsultantDrawer
          consultant={selected}
          onClose={() => setSelected(null)}
          mayEdit={hasPermission(session.permissions, 'consultants.write')}
          mayRate={hasPermission(session.permissions, 'consultants.cost')}
          onSaved={() => { void fetchConsultants() }}
        />
      )}
    </>
  )
}
