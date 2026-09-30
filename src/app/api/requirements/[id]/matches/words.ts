/**
 * What a matching run says, with the count and the noun agreeing.
 * "Found 1 matching candidates" read as a system that did not look at
 * what it found. Beside the route; no database.
 */
export function matchesFoundSays(count: number, topScore: number | null): string {
  if (count === 0) return 'Nobody matched. Try broader skills or a wider rate range.'
  const who = count === 1 ? '1 person matches' : `${count} people match`
  return `${who} this job.${topScore != null ? ` The best fit scores ${topScore} out of 100.` : ''}`
}

/** "3 matches for “HCM integration lead”" — the notice title. */
export function matchesTitle(count: number, title: string): string {
  return `${count} ${count === 1 ? 'match' : 'matches'} for “${title}”`
}
