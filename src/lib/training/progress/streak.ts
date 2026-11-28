/**
 * The weekly streak (record 133): the weeks she did any learning, kept as
 * ISO week keys on her own enrollment. A week without activity resets the
 * count quietly. Nothing is taken away: no points, no badge, no warning.
 */
const KEY = /^(\d{4})-W(\d{2})$/

/** ISO 8601 week of a day, UTC: "2026-W48". */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const year = t.getUTCFullYear()
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** The Thursday of a week key, which always sits inside that ISO year. */
function thursdayOf(k: string): Date | null {
  const m = KEY.exec(k)
  if (!m) return null
  const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4))
  const mondayWeek1 = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86_400_000)
  return new Date(mondayWeek1.getTime() + ((Number(m[2]) - 1) * 7 + 3) * 86_400_000)
}

const previous = (k: string): string => { const t = thursdayOf(k)!; return weekKey(new Date(t.getTime() - 7 * 86_400_000)) }

/** The weeks with activity, with this one added once. Kept to two years. */
export function recordWeek(weeks: readonly string[], now: Date): string[] {
  const set = new Set(weeks.filter((w) => KEY.test(w)))
  set.add(weekKey(now))
  return [...set].sort().slice(-104)
}

export interface Streak { current: number; longest: number; thisWeek: boolean }

export function streakOf(weeks: readonly string[], now: Date): Streak {
  const set = new Set(weeks.filter((w) => KEY.test(w)))
  const thisKey = weekKey(now)
  const thisWeek = set.has(thisKey)
  // This week may not have started yet: last week's run still stands until a whole week passes with nothing.
  let k = thisWeek ? thisKey : previous(thisKey)
  let current = 0
  while (set.has(k)) { current++; k = previous(k) }
  // A run starts at a week whose previous week is absent; follow it forward.
  const after = new Map<string, string>()
  for (const w of set) after.set(previous(w), w)
  let longest = 0
  for (const w of set) {
    if (set.has(previous(w))) continue
    let n = 0
    for (let x: string | undefined = w; x; x = after.get(x)) n++
    longest = Math.max(longest, n)
  }
  return { current, longest, thisWeek }
}

/** Plain words. Never a loss, a warning or a nudge. */
export function streakSays(s: Streak): string {
  if (s.current === 0) return s.longest > 0 ? `Your longest run is ${s.longest} ${s.longest === 1 ? 'week' : 'weeks'}. Any lesson starts a new one.` : 'Any lesson starts your first week.'
  return `${s.current} ${s.current === 1 ? 'week' : 'weeks'} in a row.`
}
