/**
 * A firm's own view of a person on its bench listing (the Tapin walk,
 * 2026-10-29).
 *
 * Tapin asked Anika Shah, who already had an account, onto its bench and
 * typed her skills, her title and where she works. All of it was thrown
 * away, because the ask is made on her own record and her own profile is
 * hers. So what a firm types is kept as the firm's view, on the listing
 * (`BenchListing.firmHeadline`, `firmSkills`, `firmLocation`, `firmNotes`),
 * and never written onto `ConsultantProfile`. The firm reads its own view
 * first and the person's own words where it said nothing; no other firm
 * ever reads it.
 *
 * Pure: no database.
 */

export interface TypedAboutPerson {
  headline?: string | null
  skills?: readonly string[] | null
  location?: string | null
  notes?: string | null
}

export interface FirmView {
  firmHeadline: string | null
  firmSkills: string[]
  firmLocation: string | null
  firmNotes: string | null
}

const clean = (s: string | null | undefined) => (typeof s === 'string' && s.trim() ? s.trim() : null)

/** What the firm typed, as the listing's columns. Nothing typed is null and an empty list. */
export function firmViewOf(t: TypedAboutPerson | null | undefined): FirmView {
  const seen = new Set<string>()
  const skills: string[] = []
  for (const raw of t?.skills ?? []) {
    const s = typeof raw === 'string' ? raw.trim() : ''
    if (!s || seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    skills.push(s)
  }
  return {
    firmHeadline: clean(t?.headline),
    firmSkills: skills,
    firmLocation: clean(t?.location),
    firmNotes: clean(t?.notes),
  }
}

/** Whether the firm typed anything about the person at all. */
export function firmTypedAnything(v: FirmView): boolean {
  return Boolean(v.firmHeadline || v.firmSkills.length || v.firmLocation || v.firmNotes)
}

/**
 * What the firm reads about a person: its own view where it said
 * something, the person's own words where it did not. The person's own
 * are kept beside, so an editor of her profile never starts from the
 * firm's words.
 */
export function readAsTheFirm(
  own: { headline: string | null; skills: string[]; location: string | null },
  listing: Partial<FirmView> | null | undefined
) {
  return {
    headline: listing?.firmHeadline ?? own.headline,
    skills: listing?.firmSkills?.length ? listing.firmSkills : own.skills,
    location: listing?.firmLocation ?? own.location,
    notes: listing?.firmNotes ?? null,
    own,
  }
}

// ── Who may change a person's own record (the second Tapin walk) ───────
//
// `PATCH /api/consultants/:id` wrote what a firm typed straight onto the
// person's own profile: Tapin could change the title, skills, free date,
// lowest rate, work authorization and even the name of somebody who has
// an account of their own, and every other firm that lists her read
// Tapin's words as hers. So the route asks `profileEditPlan` first:
//
//  - the person themselves changes their own record;
//  - a firm changes the record only while it is the firm's to keep: the
//    person has no account of their own, and no other firm lists them,
//    so nothing it writes reaches another firm;
//  - otherwise what the firm types about them (a title, skills, a place,
//    a note) is kept on its own bench listing, and their name, work
//    authorization, free date, lowest rate and visibility are refused in
//    a sentence, with nothing written.
//
// The sentence never says why the record is theirs. "Somebody else lists
// her" would tell one firm about another firm's bench.

/** What only the person, or a firm keeping a record nobody else has, may change. */
export const PERSON_FIELDS = ['name', 'workAuth', 'rateFloor', 'availableFrom', 'visibility'] as const
/** What a firm types about a person, each kept on its listing as `firm…`. */
export const FIRM_VIEW_FIELDS = ['headline', 'skills', 'location', 'notes'] as const

type PersonField = (typeof PERSON_FIELDS)[number]

const FIELD_WORD: Record<PersonField, string> = {
  name: 'name',
  workAuth: 'work authorization',
  rateFloor: 'lowest rate',
  availableFrom: 'free date',
  visibility: 'visibility',
}

/**
 * Whether somebody has an account of their own: a password, a sign-in on
 * record, or the company-less seat a person is given on signing in
 * (lib/own-seat). An invitation, a listing or a seat a firm gave them is
 * not an account. Pure.
 */
export function hasOwnAccount(a: { passwordSet: boolean; signIns: number; ownSeats: number }): boolean {
  return a.passwordSet || a.signIns > 0 || a.ownSeats > 0
}

/** Whose record this is to change, from the firm's side: its own to keep, or theirs. Pure. */
export function recordKeptBy(o: { ownAccount: boolean; otherFirms: number }): 'FIRM' | 'THEM' {
  return !o.ownAccount && o.otherFirms === 0 ? 'FIRM' : 'THEM'
}

/** "free date and lowest rate", in the order the fields are listed. */
function fieldList(fields: readonly PersonField[]): string {
  const words = PERSON_FIELDS.filter((f) => fields.includes(f)).map((f) => FIELD_WORD[f])
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** The refusal for a firm changing what is the person's own. */
export function theirsToChangeSays(o: { name: string; firm: string; fields: readonly PersonField[] }): string {
  const list = fieldList(o.fields)
  const verb = o.fields.length === 1 ? 'is' : 'are'
  return (
    `${o.name}’s ${list} ${verb} theirs to change, not ${o.firm}’s. ` +
    'What you type about them is kept on your bench listing: a title, skills, a place and a note.'
  )
}

/** The refusal where the firm has no listing to keep its words on. */
export function noListingSays(o: { name: string; firm: string; theirs: boolean }): string {
  return o.theirs
    ? `${o.name}’s profile is theirs to change, not ${o.firm}’s, and ${o.firm} has no bench listing for them to keep your words on.`
    : `A note is kept on your bench listing, and ${o.firm} has no bench listing for ${o.name}.`
}

/** The line above the editor where the record is theirs, and what saving says. */
export function keptOnListingSays(name: string): string {
  return `${name}’s own profile, free date and lowest rate are theirs to change. What you type here is kept on your bench listing and read on your list.`
}
export function savedOnListingSays(name: string): string {
  return `Saved on your bench listing. ${name}’s own profile is unchanged.`
}
export const SAVED_ON_RECORD_SAYS = 'Saved. Matching reads it the next time it runs.'

export type ProfileEdit =
  | {
      ok: true
      /** Write the person's own profile (and their name). */
      profile: boolean
      /** Write the firm's own view on its listing. */
      listing: boolean
      says: string
    }
  | { ok: false; code: 'THEIRS_TO_CHANGE' | 'NO_LISTING'; says: string; field: string }

/**
 * What one edit may write, and where. Pure: the route counts the facts
 * and does what this says.
 *
 * `fields` are the editable keys the request carries. Nothing is written
 * when anything is refused: half an edit is a record nobody asked for.
 */
export function profileEditPlan(o: {
  isSubject: boolean
  ownAccount: boolean
  /** Other firms with a listing for this person that was not taken back. */
  otherFirms: number
  /** Whether this firm has a listing for them that was not taken back. */
  hasListing: boolean
  name: string
  firm: string
  fields: readonly string[]
}): ProfileEdit {
  const person = PERSON_FIELDS.filter((f) => o.fields.includes(f))
  const view = FIRM_VIEW_FIELDS.filter((f) => o.fields.includes(f))
  const typed = view.filter((f) => f !== 'notes')

  // Their own record, from their own seat. A note is a firm's, not theirs.
  if (o.isSubject) return { ok: true, profile: person.length + typed.length > 0, listing: false, says: SAVED_ON_RECORD_SAYS }

  if (recordKeptBy(o) === 'FIRM') {
    if (view.includes('notes') && !o.hasListing) {
      return { ok: false, code: 'NO_LISTING', says: noListingSays({ name: o.name, firm: o.firm, theirs: false }), field: 'notes' }
    }
    return { ok: true, profile: person.length + typed.length > 0, listing: o.hasListing && view.length > 0, says: SAVED_ON_RECORD_SAYS }
  }

  if (person.length > 0) {
    return { ok: false, code: 'THEIRS_TO_CHANGE', says: theirsToChangeSays({ name: o.name, firm: o.firm, fields: person }), field: person[0] }
  }
  if (!o.hasListing) {
    return { ok: false, code: 'NO_LISTING', says: noListingSays({ name: o.name, firm: o.firm, theirs: true }), field: view[0] ?? 'headline' }
  }
  return { ok: true, profile: false, listing: view.length > 0, says: savedOnListingSays(o.name) }
}

/**
 * The listing columns for the firm-view fields a request carries, and
 * only those: a field not sent is left as it was. Cleaned the way
 * `firmViewOf` cleans an ask. Pure.
 */
export function firmViewPatch(body: Record<string, unknown>): Partial<FirmView> {
  const out: Partial<FirmView> = {}
  const v = firmViewOf({
    headline: typeof body.headline === 'string' ? body.headline : null,
    skills: Array.isArray(body.skills) ? (body.skills as string[]) : [],
    location: typeof body.location === 'string' ? body.location : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
  })
  if ('headline' in body) out.firmHeadline = v.firmHeadline
  if ('skills' in body) out.firmSkills = v.firmSkills
  if ('location' in body) out.firmLocation = v.firmLocation
  if ('notes' in body) out.firmNotes = v.firmNotes
  return out
}

/**
 * What the editor sends where the record is theirs: the firm's title,
 * skills, place and note, typed as text. Pure, so the browser and the
 * test read one rule.
 */
export function firmViewEditBody(typed: { headline: string; skills: string; location: string; notes: string }): {
  headline: string | null
  skills: string[]
  location: string | null
  notes: string | null
} {
  const v = firmViewOf({ headline: typed.headline, skills: typed.skills.split(','), location: typed.location, notes: typed.notes })
  return { headline: v.firmHeadline, skills: v.firmSkills, location: v.firmLocation, notes: v.firmNotes }
}
