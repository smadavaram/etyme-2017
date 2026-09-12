/**
 * What a real consultant's record looks like, taken from real ones.
 *
 * Skills, locations and rates lifted from two bench lists a recruiter
 * actually worked — 148 people, 134 distinct skill strings, 98
 * locations, rates clustering around $60/hr. Invented seed data has none
 * of that texture: it produces tidy three-word skills and round numbers,
 * and every filter and matcher built on top of it works beautifully
 * until it meets "Madcap Flare, HP ALM" and "San Jose - California"
 * next to "San Jose CA - California".
 *
 * ── Why the names and addresses are not real ─────────────────────────
 *
 * The identities are synthesised on purpose, and it is not squeamishness.
 * A seeded consultant carries a live BenchListing; the fortnightly
 * check-in queries every live listing and emails whoever is on it. A
 * real address in a seeded database plus a configured mail provider is
 * one cron run away from writing to a stranger who has never heard of
 * this company.
 *
 * So: the parts the engine reasons about are real, and the parts that
 * identify a person are not. The addresses sit on a domain that cannot
 * receive mail, which makes the failure loud rather than silent if one
 * ever escapes.
 *
 * ── Work authorisation ───────────────────────────────────────────────
 *
 * 49 of the 148 came from a tab named "H1's", which says H-1B, so that
 * is recorded. The other 99 came from a file named "GC_Citizens", which
 * names two different statuses and does not say which — so nothing is
 * recorded for them, and the ratio is kept here because a seed where
 * every record is complete teaches the wrong lesson about the data.
 */

/** Real skill strings, in the state they arrive in. */
export const SKILLS = [
  'Business Analyst',
  'QA',
  'Project Manager',
  'Java, J2EE',
  'IT Security, Compliance',
  'iOS',
  'Business Analyst/Project Manager',
  'Project Manager, Pharma',
  'Hadoop, HP ALM',
  'Madcap Flare, HP ALM',
  'Validation Engineer, Business Analyst',
  'Front End, HTML, CSS, Javascript, XML',
  'Salesforce Business Analyst',
  'QA Automation',
  'ETL Informatica',
  'Business Analyst/Sql',
  'Netezza/Network Security',
  'Web Developer/Project Management',
  'Network Security,Networking',
  '.Net, VB.Net, Visual Basic, C#',
  'PMP, Project Manager',
] as const

/**
 * Real locations, including the inconsistency.
 *
 * "San Jose - California" and "San Jose CA - California" are the same
 * place written two ways, and both are in the source. Tidying them here
 * would hide exactly the problem a location filter has to survive.
 */
export const LOCATIONS = [
  'San Francisco CA - California',
  'Sacramento CA - California',
  'San Jose CA - California',
  'San Jose - California',
  'Atlanta GA - Georgia',
  'Fremont CA - California',
  'Phoenix AZ - Arizona',
  'San Diego CA - California',
  'Sunnyvale CA - California',
  'Mesa, AZ',
  'Baltimore MD - Maryland',
  'Jersey City NJ - New Jersey',
] as const

/** Cents per hour. The real spread, not a round number. */
export const RATE_FLOOR_CENTS = { min: 3000, median: 6000, max: 14600 }

/**
 * Roughly a third have a work authorisation recorded.
 *
 * Matching the source rather than filling it in. A seed where everybody
 * has a status makes the "nothing is recorded, ask them" path — the one
 * that must never turn into a refusal — impossible to see.
 */
export const AUTH_RECORDED_IN = 3

/** Synthesised, and on a domain that cannot receive mail. */
export const FIRST = [
  'Priya', 'Marcus', 'Wei', 'Ana', 'Dmitri', 'Grace', 'Omar', 'Lena',
  'Tom', 'Ade', 'Rosa', 'Kenji', 'Sofia', 'Ivan', 'Nina', 'Hassan',
] as const

export const LAST = [
  'Iyer', 'Whitfield', 'Chen', 'Moreau', 'Petrov', 'Okafor', 'Haddad',
  'Novak', 'Bassett', 'Adeyemi', 'Alvarez', 'Tanaka', 'Rossi', 'Kaminski',
] as const

/** The domain seeded addresses use. Deliberately undeliverable. */
export const SEED_DOMAIN = 'seed.etyme.invalid'

export interface SeedProfile {
  name: string
  email: string
  skills: string[]
  location: string
  rateFloorCents: number
  workAuth: 'H1B' | null
}

/**
 * A consultant, built from the real distribution.
 *
 * Deterministic on `i`, so a failure at record 37 is the same record 37
 * next time.
 */
export function seedProfile(i: number): SeedProfile {
  const first = FIRST[i % FIRST.length]
  const last = LAST[Math.floor(i / FIRST.length) % LAST.length]
  const raw = SKILLS[i % SKILLS.length]
  const spread = RATE_FLOOR_CENTS.max - RATE_FLOOR_CENTS.min

  return {
    name: `${first} ${last}`,
    email: `${first}.${last}${i}`.toLowerCase() + `@${SEED_DOMAIN}`,
    // Split the way the source writes them, which is not always tidy.
    skills: raw.split(/[,/]/).map((s) => s.trim()).filter(Boolean),
    location: LOCATIONS[i % LOCATIONS.length],
    rateFloorCents: RATE_FLOOR_CENTS.min + ((i * 1700) % spread),
    workAuth: i % AUTH_RECORDED_IN === 0 ? 'H1B' : null,
  }
}
