/**
 * What a rate actually has to be to win, from our own submissions.
 *
 * The outcome loop is the slow one — weeks, not minutes — and it is the
 * one that makes the product get better instead of staying still. It was
 * captured this morning and it did not turn: rejection reasons went into
 * the database and nothing anywhere read them back.
 *
 * This is the arrow from OUTCOME back to TRIAGE. Rate is the commonest
 * reason a submission dies, and it is the one reason where the answer is
 * knowable in advance — because we watched fourteen other people get
 * rejected at that client above $120.
 *
 * ── Why our own data and not a market report ─────────────────────────
 *
 * A published salary survey says what a job title pays somewhere. It does
 * not say what this client accepted last quarter through this kind of
 * chain. Only the submissions do, and they are ours.
 *
 * It is also the single thing here that compounds and the only one nobody
 * can buy — and eventually the thing a consultant will keep their own
 * record current in order to see.
 *
 * ── Why it warns and never blocks ────────────────────────────────────
 *
 * A benchmark is a description of what has happened, not a rule. A vendor
 * bidding above it may have a reason — a scarce skill, an incumbent, a
 * relationship. A check that stops them gets overridden until nobody reads
 * any of them, so this one says the number and the sample size and gets
 * out of the way.
 */

/** Below this many observations, say so instead of quoting a figure. */
export const ENOUGH = 5

/** How far back a rate is still worth learning from. */
export const WINDOW_DAYS = 180

export interface Observation {
  /** Cents per hour that was actually submitted. */
  rateCents: number
  /** Whether the client took it seriously. */
  survived: boolean
  skills: string[]
  location: string | null
  at: Date
}

export interface Band {
  p25: number
  p50: number
  p75: number
  /** How many observations it is built from. Always shown with the figure. */
  sample: number
  /** How many of those were rejected on rate. */
  lostOnRate: number
  /** Said on screen, sample size and all. */
  says: string
}

/**
 * Percentile of a sorted list, by nearest rank.
 *
 * Nearest rank rather than interpolated on purpose: an interpolated
 * percentile invents a rate nobody was ever paid, and this is a number
 * somebody is about to quote to a client.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#/.]/g, '')
}

/**
 * Does this observation belong to the question being asked.
 *
 * Any overlapping skill, and the same place where a place is given. Loose
 * on purpose — a benchmark built from three exactly-matching submissions
 * is worse than one built from twenty nearly-matching ones, because the
 * first quotes a figure and the second knows it is a range.
 */
export function relevant(
  o: Observation,
  q: { skills: string[]; location: string | null }
): boolean {
  if (q.skills.length > 0) {
    const mine = o.skills.map(norm)
    const hit = q.skills.map(norm).some((want) =>
      mine.some((have) => have.includes(want) || want.includes(have))
    )
    if (!hit) return false
  }

  if (q.location && o.location) {
    // "Denver, CO (Hybrid)" and "Denver CO" are the same market. Remote is
    // its own market and matches only itself.
    const a = norm(q.location)
    const b = norm(o.location)
    const remoteA = a.includes('remote')
    const remoteB = b.includes('remote')
    if (remoteA !== remoteB) return false
    if (!remoteA && !a.includes(b.slice(0, 6)) && !b.includes(a.slice(0, 6))) return false
  }

  return true
}

/**
 * What has actually cleared, for work like this.
 *
 * Built only from submissions the client did not throw out on rate. A
 * benchmark that includes the rejections is a record of what people asked
 * for, which is the number that got them rejected.
 */
export function band(
  all: Observation[],
  q: { skills: string[]; location: string | null },
  now: Date
): Band | null {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000)
  const pool = all.filter((o) => o.at >= since && relevant(o, q))

  const cleared = pool.filter((o) => o.survived).map((o) => o.rateCents).sort((a, b) => a - b)
  const lostOnRate = pool.length - cleared.length

  if (cleared.length === 0) {
    return null
  }

  const p25 = percentile(cleared, 25)
  const p50 = percentile(cleared, 50)
  const p75 = percentile(cleared, 75)

  return {
    p25,
    p50,
    p75,
    sample: cleared.length,
    lostOnRate,
    says: saying(p25, p50, p75, cleared.length, lostOnRate, q),
  }
}

function saying(
  p25: number,
  p50: number,
  p75: number,
  sample: number,
  lostOnRate: number,
  q: { skills: string[]; location: string | null }
): string {
  const what = q.skills.slice(0, 2).join(' and ') || 'work like this'
  const where = q.location ? ` in ${q.location}` : ''
  const d = (c: number) => `$${Math.round(c / 100)}`

  if (sample < ENOUGH) {
    // A confident band off three submissions is worse than no band. Say
    // the number of observations rather than a percentile nobody should
    // rely on.
    return `Only ${sample} ${what} submission${sample === 1 ? '' : 's'}${where} have got past a client so far — not enough to say what the going rate is.`
  }

  const lost = lostOnRate > 0 ? ` ${lostOnRate} more were rejected on rate.` : ''
  return `${what}${where} cleared between ${d(p25)} and ${d(p75)}, median ${d(p50)}, from ${sample} real submissions.${lost}`
}

export interface Warning {
  /** Whether to say anything at all. */
  say: boolean
  /** ABOVE · BELOW · null when it is inside the band. */
  where: 'ABOVE' | 'BELOW' | null
  text: string
}

/**
 * What to tell a recruiter about the rate they are about to quote.
 *
 * Above the top quartile, say what has actually cleared. Well below the
 * bottom, say that too — a vendor leaving twenty dollars an hour on the
 * table is a slower failure than losing the role, and nothing in the
 * product tells them today.
 *
 * Silent inside the band. A tool that comments on every rate is a tool
 * whose comments get ignored.
 */
export function warnAbout(rateCents: number, b: Band | null): Warning {
  if (!b || b.sample < ENOUGH) {
    return { say: false, where: null, text: '' }
  }

  const d = (c: number) => `$${Math.round(c / 100)}`

  if (rateCents > b.p75) {
    return {
      say: true,
      where: 'ABOVE',
      text: `You are quoting ${d(rateCents)}. Nothing above ${d(b.p75)} has cleared here in ${b.sample} submissions${b.lostOnRate > 0 ? `, and ${b.lostOnRate} were rejected on rate` : ''}. Worth a reason.`,
    }
  }

  if (rateCents < b.p25) {
    return {
      say: true,
      where: 'BELOW',
      text: `You are quoting ${d(rateCents)}, under the ${d(b.p25)} the bottom quartile clears at. Fine if deliberate — otherwise there is room.`,
    }
  }

  return { say: false, where: null, text: '' }
}

/**
 * The same figure, said to the consultant.
 *
 * The one thing nobody else will give them. Consultants negotiate blind;
 * give them the number and they will keep their own record current without
 * being asked, which is the freshness loop paying for itself.
 *
 * No client is ever named, and no single submission is identifiable — the
 * figure is only shown at all once there are enough observations behind it
 * for one person's rate not to be visible in it.
 */
export function forTheConsultant(b: Band | null, q: { skills: string[]; location: string | null }): string | null {
  if (!b || b.sample < ENOUGH) return null

  const what = q.skills.slice(0, 2).join(' and ')
  const where = q.location ? ` in ${q.location}` : ''
  const d = (c: number) => `$${Math.round(c / 100)}`

  return `${what} roles${where} paid between ${d(b.p25)} and ${d(b.p75)} an hour last quarter, based on ${b.sample} real submissions.`
}
