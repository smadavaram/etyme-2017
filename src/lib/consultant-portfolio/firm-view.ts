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
