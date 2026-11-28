/**
 * Record 133, the door and progress mechanics: a tenant's public site is the
 * entry to its learning site and the proof of what happened there. Learning
 * stays on /learn. Pure: no database, no React.
 *
 * What the door may say, and what it may not:
 * - A number is the record's own count, labeled as what it counts.
 * - A count under the floor reads "fewer than 5", so a small number can never
 *   point at one person. Zero reads nothing at all.
 * - No name is ever drawn. An individual is not drawn here at all.
 */

/** Below this many, the door says "fewer than 5" instead of the number. */
export const PROOF_FLOOR = 5

export type DoorCounts = {
  /** Per public course the tenant owns: how many people finished it. */
  completions: { courseId: string; title: string; finished: number }[]
  /** Badges earned on the tenant's record and not withdrawn. */
  badges: number
}

export type FeaturedCourse = { id: string; title: string; hours: number | null }

export type DoorLearn = {
  featured: FeaturedCourse[]
  /** Sentences, each one the record's count under the floor rule. Empty means the door shows no proof. */
  proof: string[]
  offer: string
}

/** "12", "fewer than 5", or null where there is nothing to say. */
export function floored(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null
  return n < PROOF_FLOOR ? `fewer than ${PROOF_FLOOR}` : String(Math.floor(n))
}

export function completionLine(title: string, finished: number): string | null {
  const said = floored(finished)
  if (!said) return null
  const cap = said.startsWith('fewer') ? 'Fewer' + said.slice(5) : said
  return `${cap} people finished ${title} on Etyme`
}

export function badgeLine(badges: number): string | null {
  const said = floored(badges)
  if (!said) return null
  const cap = said.startsWith('fewer') ? 'Fewer' + said.slice(5) : said
  return `${cap} badges earned on Etyme`
}

export function proofLines(c: DoorCounts): string[] {
  const out = c.completions.map((x) => completionLine(x.title, x.finished))
  out.push(badgeLine(c.badges))
  return out.filter((l): l is string => l !== null)
}

/**
 * The Owner's pick, in the Owner's order, kept only for courses that are the
 * tenant's own and public. A course taken down simply leaves the list.
 */
export function featuredIn(picked: readonly string[], available: FeaturedCourse[]): FeaturedCourse[] {
  const byId = new Map(available.map((c) => [c.id, c]))
  const seen = new Set<string>()
  const out: FeaturedCourse[] = []
  for (const id of picked) {
    const c = byId.get(id)
    if (c && !seen.has(id)) { seen.add(id); out.push(c) }
  }
  return out.slice(0, 6)
}

/**
 * What the door says to somebody looking at work. It is never a condition of
 * applying, it decides nothing about her, and a client reads none of it.
 */
export const DOOR_OFFER = 'Getting ready is optional and separate from applying. Nothing you do on the learning site is shown to a client.'
