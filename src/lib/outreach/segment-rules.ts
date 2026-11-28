/**
 * The audience builder's rules (record 135, advanced outreach, detection). Pure.
 *
 * A segment is a saved question about the firm's own record, never a copied
 * list: it is read again every time it is used, so a candidate who takes
 * back her yes, or a contact who unsubscribes, is out of it on the next
 * read. The axes are role (candidate, client, partner), skills, location,
 * relationship stage and past ledger activity. The last axis, consent, is
 * not a choice: only a consented audience is ever read (a candidate under
 * her own standing yes to updates, record 117; a contact at a firm traded
 * with, not unsubscribed, not bounced, record 116).
 *
 * Industry is named in the spec, but nothing on the record holds one, so a
 * segment cut by industry is refused in a sentence rather than answered
 * with a guess.
 */

export const SEGMENT_ROLES = ['CANDIDATE', 'CLIENT', 'PARTNER'] as const
export type SegmentRole = (typeof SEGMENT_ROLES)[number]
export const ROLE_LABELS: Record<SegmentRole, string> = { CANDIDATE: 'Candidates', CLIENT: 'Clients', PARTNER: 'Partners' }

/** A candidate's stage with the firm: on its list, in a course of its, or has finished one. */
export const CANDIDATE_STAGES = ['KEPT', 'TRAINING', 'FINISHED'] as const
/** A company's stage with the firm, as the register reads it. */
export const COMPANY_STAGES = ['ACTIVE', 'DORMANT'] as const
export const STAGE_LABELS: Record<string, string> = {
  KEPT: 'on your list', TRAINING: 'in a course of yours', FINISHED: 'finished a course of yours', ACTIVE: 'working with you now', DORMANT: 'gone quiet',
}

export interface SegmentDefinition {
  role: SegmentRole
  /** Candidates only: a person matches when any one of these is among her skills. */
  skills: string[]
  location: string | null
  stage: string | null
  /** Past ledger activity: something happened with her or them in the last N days. */
  activeWithinDays: number | null
  /** Past ledger activity: nothing has happened for at least N days. */
  quietForDays: number | null
  /** Always CONSENTED. Kept on the definition so a reader sees it said. */
  consent: 'CONSENTED'
}

export type SegmentRead = { ok: true; def: SegmentDefinition } | { ok: false; field: string; says: string }

const bad = (field: string, says: string): SegmentRead => ({ ok: false, field, says })
const days = (v: unknown): number | null | 'bad' => (v === undefined || v === null || v === '' ? null : typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 3650 ? v : 'bad')

/** What a person asked for as a definition, or the field and the sentence that is missing. Pure. */
export function readSegmentDefinition(raw: unknown): SegmentRead {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (!SEGMENT_ROLES.includes(b.role as SegmentRole)) return bad('role', 'Choose who the segment is: candidates, clients or partners.')
  const role = b.role as SegmentRole
  if (typeof b.industry === 'string' && b.industry.trim()) return bad('industry', 'No industry is recorded for a person or a company on your record yet, so a segment cannot be cut by it. Leave it out.')
  if (b.consent !== undefined && b.consent !== 'CONSENTED') return bad('consent', 'Only people who agreed to hear from you are ever in a segment. That cannot be changed.')
  const skills = Array.isArray(b.skills) ? b.skills.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean) : []
  if (skills.length > 0 && role !== 'CANDIDATE') return bad('skills', 'Skills are read from a candidate’s own profile. A company has none on your record, so leave them out for clients and partners.')
  if (skills.length > 20) return bad('skills', 'Name at most 20 skills.')
  const stage = typeof b.stage === 'string' && b.stage.trim() ? b.stage.trim().toUpperCase() : null
  const allowed: readonly string[] = role === 'CANDIDATE' ? CANDIDATE_STAGES : COMPANY_STAGES
  if (stage && !allowed.includes(stage)) return bad('stage', `For ${ROLE_LABELS[role].toLowerCase()}, the stage is one of: ${allowed.map((s) => s.toLowerCase()).join(', ')}.`)
  const within = days(b.activeWithinDays)
  const quiet = days(b.quietForDays)
  if (within === 'bad') return bad('activeWithinDays', 'Active within is a whole number of days, 1 to 3650.')
  if (quiet === 'bad') return bad('quietForDays', 'Quiet for is a whole number of days, 1 to 3650.')
  if (within !== null && quiet !== null) return bad('quietForDays', 'A segment is active within some days, or quiet for some days. It cannot be both.')
  const location = typeof b.location === 'string' && b.location.trim() ? b.location.trim() : null
  return { ok: true, def: { role, skills: [...new Set(skills.map((s) => s.toLowerCase()))], location, stage, activeWithinDays: within, quietForDays: quiet, consent: 'CONSENTED' } }
}

/** The segment's own words, for a card and a list. Pure. */
export function describeSegment(d: SegmentDefinition): string {
  const parts = [ROLE_LABELS[d.role]]
  if (d.stage) parts.push(STAGE_LABELS[d.stage] ?? d.stage.toLowerCase())
  if (d.skills.length) parts.push(`with ${d.skills.join(' or ')}`)
  if (d.location) parts.push(`in ${d.location}`)
  if (d.activeWithinDays) parts.push(`active in the last ${d.activeWithinDays} days`)
  if (d.quietForDays) parts.push(`quiet for ${d.quietForDays} days or more`)
  return `${parts.join(', ')}. Only people who agreed to hear from you.`
}

export interface SegFact {
  skills: readonly string[]
  location: string | null
  stage: string | null
  lastActivityAt: Date | null
}

const DAY = 86_400_000

/** Whether one candidate or company matches the axes. Consent is decided elsewhere, first. Pure. */
export function segmentMatches(d: SegmentDefinition, f: SegFact, today: Date): boolean {
  if (d.skills.length) {
    const has = new Set(f.skills.map((s) => s.trim().toLowerCase()))
    if (!d.skills.some((s) => has.has(s))) return false
  }
  if (d.location && !(f.location ?? '').toLowerCase().includes(d.location.toLowerCase())) return false
  if (d.stage && f.stage !== d.stage) return false
  const ageDays = f.lastActivityAt ? Math.floor((today.getTime() - f.lastActivityAt.getTime()) / DAY) : null
  if (d.activeWithinDays && (ageDays === null || ageDays > d.activeWithinDays)) return false
  if (d.quietForDays && ageDays !== null && ageDays < d.quietForDays) return false
  return true
}
