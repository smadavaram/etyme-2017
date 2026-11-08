/**
 * What the bench and consultant screens post, and what their routes read
 * from it, in one place both sides use.
 *
 * The founder's I-9 bug (2026-11-01): a route refused for a field no screen
 * offered, so nobody could ever answer it. A test of the rule passed and a
 * test of the screen passed; what broke was the join. So each of supply's
 * forms builds its body here, the screen posts exactly that, the route
 * reads it with the reader here, and
 * __tests__/invariants/every-question-has-a-field.test.ts fills in every
 * field each form draws, builds the body, and runs the route's own rules
 * on it. A refusal that names a field the form never drew fails there.
 *
 * The forms: Add consultant (the bench ask, `POST /api/consultants`), Add
 * to bench (`POST /api/bench/listings`), the consultant drawer's editor
 * (`PATCH /api/consultants/:id`), the person's own stay and yes (`PATCH
 * /api/me/benches`, `POST /api/me/benches/:id/respond`), and asking
 * somebody to check in (`POST /api/bench/listings/:id/nudge`).
 *
 * Pure, and safe in the browser: it imports only bench-filter's own pure
 * helpers, which the same screens already import.
 */

import { addSkillTags } from '@/lib/bench-filter'
import { minorPerUnit } from '@/lib/money'

/** A refusal for one field, in the route's words. */
export interface FieldRefusal {
  ok: false
  code: string
  message: string
  field: string
}

/** The work authorization codes a form offers and a route accepts. */
export const WORK_AUTH_CODES = ['US_CITIZEN', 'GC', 'H1B', 'OPT', 'GBP_SW', 'EAD', 'TN', 'L1'] as const

// ── Add consultant: the bench ask ───────────────────────────────────────

/** What the Add consultant form holds, as typed. */
export interface AddConsultantTyped {
  name: string
  email: string
  headline: string
  skills: readonly string[]
  /** A skill typed and not yet ended with Enter is still a skill. */
  skillDraft: string
  location: string
  workAuth: string
  tier: string
  termsEngagementType: string
  /** Dollars an hour, as typed. */
  termsPay: string
  notes: string
}

/** Every field the Add consultant form draws, by the name its body carries. */
export const ADD_CONSULTANT_FIELDS = [
  'name', 'email', 'headline', 'skills', 'location', 'workAuth', 'tier',
  'rateMin', 'rateMax', 'termsEngagementType', 'termsPayRateCents', 'notes',
] as const

/** The body Add consultant posts. The rates come in cents from `listingRates`, which the form checks first. */
export function addConsultantBody(
  form: AddConsultantTyped,
  rates: { rateMin: number | null; rateMax: number | null },
  /** The firm's currency; the pay typed is turned into minor units by its own exponent. */
  currency: string = 'USD'
) {
  return {
    name: form.name,
    email: form.email,
    headline: form.headline || null,
    skills: addSkillTags(form.skills, form.skillDraft),
    location: form.location || null,
    workAuth: form.workAuth || null,
    tier: form.tier,
    rateMin: rates.rateMin,
    rateMax: rates.rateMax,
    // Whole units an hour typed, minor units sent, by the currency's own
    // exponent (whole dong stays whole dong). The route checks it with
    // the terms page's own rule and says what is wrong.
    termsEngagementType: form.termsEngagementType || null,
    termsPayRateCents: form.termsPay.trim()
      ? Number.isFinite(Number(form.termsPay)) ? Math.round(Number(form.termsPay) * minorPerUnit(currency)) : form.termsPay
      : null,
    notes: form.notes.trim() || null,
  }
}

/**
 * The fields `POST /api/consultants` checks before it asks anybody: a
 * name, an address, skills as a list, a tier, a work authorization it
 * knows. What `askOntoBench` refuses after this (a rate under the
 * person's own floor, the stated terms) is read by its own rules.
 */
export function readAddConsultant(body: Record<string, unknown>): { ok: true } | FieldRefusal {
  const { name, email, skills = [], tier = 'MARKETING', workAuth } = body
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return { ok: false, code: 'VALIDATION', message: 'name is required (min 2 characters)', field: 'name' }
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return { ok: false, code: 'VALIDATION', message: 'A valid email is required', field: 'email' }
  }
  if (!Array.isArray(skills)) {
    return { ok: false, code: 'VALIDATION', message: 'skills must be an array of strings', field: 'skills' }
  }
  const validTiers = ['RETAINED', 'MARKETING']
  if (typeof tier !== 'string' || !validTiers.includes(tier)) {
    return { ok: false, code: 'VALIDATION', message: `tier must be one of: ${validTiers.join(', ')}`, field: 'tier' }
  }
  if (workAuth && !(WORK_AUTH_CODES as readonly unknown[]).includes(workAuth)) {
    return { ok: false, code: 'VALIDATION', message: `workAuth must be one of: ${WORK_AUTH_CODES.join(', ')}`, field: 'workAuth' }
  }
  return { ok: true }
}

// ── Add to bench: somebody already on Etyme, onto this firm's bench ─────

/** Every field Add to bench draws, by the name its body carries: the person picked from the search, who sees them, the range. */
export const ADD_TO_BENCH_FIELDS = ['consultantId', 'tier', 'rateMin', 'rateMax'] as const

/** The body Add to bench posts. The rates come in cents from `listingRates`, which the form checks first. */
export function addToBenchBody(
  consultantId: string,
  tier: 'RETAINED' | 'MARKETING',
  rates: { rateMin: number | null; rateMax: number | null }
) {
  return { consultantId, tier, rateMin: rates.rateMin, rateMax: rates.rateMax }
}

/**
 * The fields `POST /api/bench/listings` checks before it looks anybody
 * up: a person, a tier, and a range that is not upside down. What it
 * refuses after that (a top rate under the person's own floor, the stated
 * terms) is read by its own rules.
 */
export function readAddToBench(body: Record<string, unknown>):
  | { ok: true; consultantId: string; tier: 'RETAINED' | 'MARKETING'; rateMin: unknown; rateMax: unknown }
  | FieldRefusal {
  const { consultantId, tier = 'MARKETING', rateMin, rateMax } = body
  if (!consultantId || typeof consultantId !== 'string') {
    return { ok: false, code: 'VALIDATION', message: 'consultantId is required', field: 'consultantId' }
  }
  const validTiers = ['RETAINED', 'MARKETING']
  if (typeof tier !== 'string' || !validTiers.includes(tier)) {
    return { ok: false, code: 'VALIDATION', message: `tier must be one of: ${validTiers.join(', ')}`, field: 'tier' }
  }
  if (rateMin != null && rateMax != null) {
    const min = parseInt(String(rateMin), 10)
    const max = parseInt(String(rateMax), 10)
    if (min > max) {
      return { ok: false, code: 'VALIDATION', message: 'rateMin cannot exceed rateMax', field: 'rateMin' }
    }
  }
  return { ok: true, consultantId, tier: tier as 'RETAINED' | 'MARKETING', rateMin, rateMax }
}

// ── The consultant drawer's editor ──────────────────────────────────────

/**
 * Which fields the drawer draws, by whose record it is (`recordKeptBy`):
 * what matching reads where the firm keeps the record (the lowest rate
 * only for a role that reads pay), and the firm's own view where the
 * record is theirs and the firm has a listing to keep it on. The bodies
 * are `profileEditBody` (lib/bench-filter) and `firmViewEditBody`
 * (./firm-view).
 */
export function profileEditorFields(o: { keptBy: 'FIRM' | 'THEM'; listed: boolean; mayRate: boolean }): string[] {
  if (o.keptBy === 'FIRM') return o.mayRate ? ['skills', 'availableFrom', 'rateFloor'] : ['skills', 'availableFrom']
  return o.listed ? ['headline', 'skills', 'location', 'notes'] : []
}

/** What `PATCH /api/consultants/:id` reads from a body, each field checked as it is read. */
export interface ProfileEditRead {
  ok: true
  /** The profile's own columns, as the route writes them. */
  updateData: Record<string, unknown>
  /** A new name, where one was sent. */
  personUpdate: { name: string } | null
  /** Whether a note was sent. */
  notesSent: boolean
  /** Every editable field the body carries. */
  fields: string[]
}

export function readProfileEdit(body: Record<string, unknown>): ProfileEditRead | FieldRefusal {
  const updateData: Record<string, unknown> = {}
  for (const field of ['headline', 'skills', 'location', 'workAuth', 'rateFloor', 'availableFrom', 'visibility'] as const) {
    if (!(field in body)) continue
    const value = body[field]
    if (field === 'skills') {
      if (!Array.isArray(value)) {
        return { ok: false, code: 'VALIDATION', message: 'skills must be an array of strings', field: 'skills' }
      }
      updateData.skills = value.map((s) => String(s).trim()).filter(Boolean)
    } else if (field === 'rateFloor') {
      updateData.rateFloor = value != null ? parseInt(String(value), 10) : null
    } else if (field === 'availableFrom') {
      updateData.availableFrom = value ? new Date(String(value)) : null
    } else if (field === 'visibility') {
      const validVisibility = ['INTERNAL', 'FEED', 'CLIENT_VISIBLE', 'VERIFIED']
      if (typeof value !== 'string' || !validVisibility.includes(value)) {
        return { ok: false, code: 'VALIDATION', message: `visibility must be one of: ${validVisibility.join(', ')}`, field: 'visibility' }
      }
      updateData.visibility = value
    } else if (field === 'workAuth') {
      if (value !== null && !(WORK_AUTH_CODES as readonly unknown[]).includes(value)) {
        return { ok: false, code: 'VALIDATION', message: `workAuth must be one of: ${WORK_AUTH_CODES.join(', ')}`, field: 'workAuth' }
      }
      updateData.workAuth = value
    } else {
      updateData[field] = typeof value === 'string' ? value.trim() : value
    }
  }

  const personUpdate =
    'name' in body && typeof body.name === 'string' && body.name.trim().length >= 2 ? { name: body.name.trim() } : null
  const notesSent = 'notes' in body && (body.notes === null || typeof body.notes === 'string')

  return {
    ok: true,
    updateData,
    personUpdate,
    notesSent,
    fields: [...Object.keys(updateData), ...(personUpdate ? ['name'] : []), ...(notesSent ? ['notes'] : [])],
  }
}

// ── The person's own stay, and their yes ────────────────────────────────

/** The stay picker on Who has you: how long they stay on one bench. Null is until they cancel. */
export function stayBody(listingId: string, stayDays: number | null) {
  return { listingId, stayDays }
}

/**
 * Their answer to a firm that asked. A yes carries the stay chosen beside
 * it, whether they may be shown in matches beyond the firm, and the terms
 * printed beside the button, which the yes agrees and nothing else.
 */
export function answerBody(
  said: 'ACCEPT' | 'DECLINE',
  o?: { stayDays: number | null; showInMatches: boolean; terms: { engagementType: string; payRateCents: number } | null }
) {
  if (said === 'DECLINE' || !o) return { said }
  return {
    said,
    stayDays: o.stayDays,
    showInMatches: o.showInMatches,
    termsSeen: o.terms ? { engagementType: o.terms.engagementType, payRateCents: o.terms.payRateCents } : null,
  }
}

// ── Asking somebody to check in ─────────────────────────────────────────

/** Ask them to confirm they are free and at what rate, or only copy the link. Nothing is typed. */
export function nudgeBody(copyOnly: boolean) {
  return { copyOnly }
}
