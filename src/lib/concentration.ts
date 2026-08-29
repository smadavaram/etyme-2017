/**
 * One client, one supplier, one person.
 *
 * ── The exposure that appears on no report ───────────────────────────
 *
 * A staffing firm can be profitable on every assignment and still be one
 * phone call from closing, because two thirds of the revenue comes from
 * one client, or half the supply comes through one sub-vendor, or one
 * consultant is a fifth of the billing and has just been offered a
 * permanent job by the client he sits at.
 *
 * None of those show up in a margin report. They are not losses. They are
 * the shape of the book, and the shape is what decides whether a bad
 * quarter is survivable.
 *
 * ── Why the thresholds are data ──────────────────────────────────────
 *
 * A number buried in an `if` is a number nobody can argue with, which
 * sounds like a virtue and is not: the whole value of "forty per cent" is
 * that somebody sat down and decided it, and the next person can move it
 * knowing what it meant. So every threshold carries its meaning in plain
 * English and the role who has to act, and the screen prints both.
 *
 * ── Two contracts is not a concentration ─────────────────────────────
 *
 * The failure this file is written to avoid: a firm with two clients
 * being told it has a dangerous seventy per cent concentration. It has a
 * small book. Every new firm's first client is a hundred per cent of its
 * revenue and that is not a finding, it is arithmetic — so below a
 * minimum number of parties no share is reported at all, and the reason
 * is said out loud.
 *
 * ── Nothing here is named after an industry ──────────────────────────
 *
 * Clients, suppliers and people. A nursing agency, a validation
 * contractor and a software firm all have the same three, and none of the
 * thresholds refer to a skill, a rate card or a role.
 *
 * ── Units ────────────────────────────────────────────────────────────
 *
 * Minor units — cents, pence — where the unit is money, and whole people
 * where it is people. Two currencies are never added: a book billed in
 * dollars and euros has a share in each and a total in neither.
 */

/** What is being concentrated. */
export type Dimension = 'CLIENT' | 'SUPPLIER' | 'PERSON'

/** What the amounts are counted in. */
export type Unit = 'MONEY' | 'PEOPLE'

export interface Threshold {
  dimension: Dimension
  /** At or above this share of the whole, in per cent. */
  atOrAbovePct: number
  severity: 'NOTE' | 'WARN'
  /** Why it matters, in the words somebody would use out loud. */
  meaning: string
  /** The role who has to act on it. */
  owner: string
}

/**
 * The lines, and what each one means.
 *
 * Ordered worst first inside each dimension, because the first match
 * wins. Absolute rather than relative on purpose: these are statements
 * about whether the firm survives losing one relationship, and that does
 * not become safer because the book happens to be small. The small-book
 * case is handled by refusing to report at all, below.
 */
export const THRESHOLDS: Threshold[] = [
  {
    dimension: 'CLIENT',
    atOrAbovePct: 40,
    severity: 'WARN',
    meaning:
      'A client worth more than two fifths of the revenue owns the firm’s fate. Their ' +
      'procurement review is your business plan. This one should be named to somebody ' +
      'by name, not left as a figure on a screen.',
    owner: 'Controller',
  },
  {
    dimension: 'CLIENT',
    atOrAbovePct: 25,
    severity: 'NOTE',
    meaning:
      'A quarter of the revenue from one client is normal and worth watching. It becomes ' +
      'a problem quietly, by growing.',
    owner: 'Controller',
  },
  {
    dimension: 'SUPPLIER',
    atOrAbovePct: 50,
    severity: 'WARN',
    meaning:
      'Half the supply through one firm means their bad quarter is your delivery failure. ' +
      'You also have no second price to check the first one against.',
    owner: 'Procurement',
  },
  {
    dimension: 'SUPPLIER',
    atOrAbovePct: 30,
    severity: 'NOTE',
    meaning:
      'Nearly a third through one supplier. Fine while they are good, and worth having a ' +
      'second name for the day they are not.',
    owner: 'Procurement',
  },
  {
    dimension: 'PERSON',
    atOrAbovePct: 35,
    severity: 'WARN',
    meaning:
      'One person carrying more than a third of the billing means an illness, a ' +
      'resignation or a client hiring them directly is a revenue event, not an HR one.',
    owner: 'Bench operator',
  },
  {
    dimension: 'PERSON',
    atOrAbovePct: 25,
    severity: 'NOTE',
    meaning:
      'A quarter of the billing on one person. Worth knowing where their next contract ' +
      'goes, and whether anybody else could hold that seat.',
    owner: 'Bench operator',
  },
]

/**
 * How many parties there must be before a share means anything.
 *
 * Below this the answer is "you have a small book", which is a different
 * sentence and a truer one. People needs a higher floor than clients
 * because five consultants splitting the work evenly is twenty per cent
 * each and nothing has gone wrong.
 */
export const ENOUGH_TO_CONCENTRATE: Record<Dimension, number> = {
  CLIENT: 3,
  SUPPLIER: 3,
  PERSON: 5,
}

export interface Exposure {
  id: string
  name: string
  /** Minor units where the unit is money, whole people where it is people. */
  amountMinor: number
  /** Ignored where the unit is people. */
  currency?: string
}

export interface Breach {
  severity: 'NOTE' | 'WARN'
  atOrAbovePct: number
  meaning: string
  /** The role named on the threshold. */
  ownerRole: string
  /** The person holding it here, where one is named. */
  ownerName: string | null
  says: string
}

export interface Concentration {
  dimension: Dimension
  unit: Unit
  /** The largest party's share, or null where there is not enough to say. */
  topSharePct: number | null
  topName: string | null
  topAmountMinor: number | null
  /** The three largest together. Null below four parties, where it is all of it. */
  topThreeSharePct: number | null
  totalMinor: number | null
  currency: string | null
  /** Parties with something on them. */
  counted: number
  /** Parties dropped for having nothing on them. */
  ignored: number
  breach: Breach | null
  /** Never blocks. This is the shape of a book, not a rule anybody broke. */
  blocks: false
  says: string
  unknowns: string[]
}

/** Who holds each dimension here, where somebody is named. */
export type Owners = Partial<Record<Dimension, { name: string; role?: string }>>

export interface ConcentrationInput {
  dimension: Dimension
  unit: Unit
  exposures: Exposure[]
  owners?: Owners
}

const WORD: Record<Dimension, { one: string; many: string; of: string }> = {
  CLIENT: { one: 'client', many: 'clients', of: 'revenue' },
  SUPPLIER: { one: 'supplier', many: 'suppliers', of: 'supply' },
  PERSON: { one: 'person', many: 'people', of: 'billing' },
}

/**
 * One dimension of the book, and whether its shape is worth naming.
 *
 * Returns a null share rather than a confident one wherever the data
 * cannot carry it: too few parties, nothing billed, or two currencies.
 * A plausible wrong figure here is worse than a blank, because nobody
 * audits a reassuring one.
 */
export function concentration(input: ConcentrationInput): Concentration {
  const { dimension, unit, exposures, owners } = input
  const words = WORD[dimension]

  // Nothing on them is not a party. A supplier we bought nothing from is
  // not diversification, and counting them would dilute the share of the
  // one we did buy from.
  const live = exposures.filter((e) => e.amountMinor > 0)
  const ignored = exposures.length - live.length

  const base: Concentration = {
    dimension,
    unit,
    topSharePct: null,
    topName: null,
    topAmountMinor: null,
    topThreeSharePct: null,
    totalMinor: null,
    currency: null,
    counted: live.length,
    ignored,
    breach: null,
    blocks: false,
    says: '',
    unknowns: [],
  }

  if (live.length === 0) {
    return {
      ...base,
      says:
        unit === 'MONEY'
          ? `Nothing has been billed through any ${words.one} in this window, so there is ` +
            `no share to take. A zero here would read as safety.`
          : `No ${words.many} on the books in this window, so there is nothing to spread.`,
    }
  }

  // ── One currency, or none ───────────────────────────────────────────
  let currency: string | null = null
  if (unit === 'MONEY') {
    const currencies = Array.from(new Set(live.map((e) => e.currency ?? 'UNKNOWN')))
    if (currencies.length > 1) {
      return {
        ...base,
        says:
          `This book bills in ${currencies.join(' and ')}. Shares can be compared inside a ` +
          `currency and money cannot be added across them, so no figure is shown rather ` +
          `than a total in neither.`,
        unknowns: [
          `${currencies.length} currencies in one book. Ask for this one currency at a time.`,
        ],
      }
    }
    currency = currencies[0] === 'UNKNOWN' ? null : currencies[0]
  }

  const total = live.reduce((n, e) => n + e.amountMinor, 0)
  const sorted = [...live].sort((a, b) => b.amountMinor - a.amountMinor)
  const top = sorted[0]

  const enough = ENOUGH_TO_CONCENTRATE[dimension]

  if (live.length < enough) {
    return {
      ...base,
      totalMinor: total,
      currency,
      topName: top.name,
      topAmountMinor: top.amountMinor,
      says:
        `${live.length} ${live.length === 1 ? words.one : words.many} is a small book, not a ` +
        `concentration. ${top.name} is most of it, which is what the start looks like — ` +
        `a share is only worth reporting from ${enough} ${words.many} upwards.`,
      unknowns: [
        `Below ${enough} ${words.many} no share is reported, because the arithmetic would ` +
          `say something the book does not.`,
      ],
    }
  }

  const topSharePct = Math.round((top.amountMinor / total) * 100)
  const topThreeSharePct =
    live.length >= 4
      ? Math.round(
          (sorted.slice(0, 3).reduce((n, e) => n + e.amountMinor, 0) / total) * 100
        )
      : null

  const hit =
    THRESHOLDS.filter((t) => t.dimension === dimension)
      .sort((a, b) => b.atOrAbovePct - a.atOrAbovePct)
      .find((t) => topSharePct >= t.atOrAbovePct) ?? null

  const named = owners?.[dimension] ?? null

  const breach: Breach | null = hit
    ? {
        severity: hit.severity,
        atOrAbovePct: hit.atOrAbovePct,
        meaning: hit.meaning,
        ownerRole: named?.role ?? hit.owner,
        ownerName: named?.name ?? null,
        says: named
          ? `${named.name} (${named.role ?? hit.owner}) owns this one.`
          : `Nobody is named for this. It belongs to whoever does ${hit.owner.toLowerCase()} ` +
            `here — a figure on a screen with no name against it does not get acted on.`,
      }
    : null

  const unknowns: string[] = []
  if (ignored > 0) {
    unknowns.push(
      `${ignored} ${ignored === 1 ? words.one : words.many} had nothing on them and ` +
        `${ignored === 1 ? 'was' : 'were'} left out of the count.`
    )
  }

  return {
    ...base,
    topSharePct,
    topName: top.name,
    topAmountMinor: top.amountMinor,
    topThreeSharePct,
    totalMinor: total,
    currency,
    breach,
    says: shareSays(dimension, unit, top.name, topSharePct, live.length, topThreeSharePct),
    unknowns,
  }
}

function shareSays(
  dimension: Dimension,
  unit: Unit,
  topName: string,
  pct: number,
  parties: number,
  topThree: number | null
): string {
  const words = WORD[dimension]
  const measure =
    unit === 'MONEY'
      ? words.of
      : dimension === 'SUPPLIER'
        ? 'the people supplied'
        : 'the people placed'

  const head =
    dimension === 'PERSON'
      ? `${topName} is ${pct}% of the billing across ${parties} people.`
      : `${topName} is ${pct}% of ${measure} across ${parties} ${words.many}.`

  const tail =
    topThree == null
      ? ''
      : ` The largest three together are ${topThree}%.`

  return head + tail
}

// ── The three together ────────────────────────────────────────────────

export interface ConcentrationReport {
  parts: Concentration[]
  /** The one worth reading first. Null where none can be reported. */
  worst: Concentration | null
  warnings: number
  notes: number
  /** How many dimensions could not be reported on at all. */
  silent: number
  blocks: false
  says: string
}

const SEVERITY_RANK = { WARN: 0, NOTE: 1 } as const

/**
 * The three dimensions, ordered by which one should be read first.
 *
 * A dimension that could not be reported is counted and not hidden. Three
 * green ticks over a book too small to measure would be the most
 * comfortable wrong answer this product could give.
 */
export function concentrationReport(parts: Concentration[]): ConcentrationReport {
  const withBreach = parts.filter((p) => p.breach != null)
  const ordered = [...withBreach].sort((a, b) => {
    const s = SEVERITY_RANK[a.breach!.severity] - SEVERITY_RANK[b.breach!.severity]
    if (s !== 0) return s
    return (b.topSharePct ?? 0) - (a.topSharePct ?? 0)
  })

  const warnings = withBreach.filter((p) => p.breach!.severity === 'WARN').length
  const notes = withBreach.filter((p) => p.breach!.severity === 'NOTE').length
  const silent = parts.filter((p) => p.topSharePct == null).length

  const worst = ordered[0] ?? null

  return {
    parts: [
      ...ordered,
      ...parts.filter((p) => p.breach == null),
    ],
    worst,
    warnings,
    notes,
    silent,
    blocks: false,
    says:
      worst == null
        ? silent === parts.length
          ? 'Nothing here can be measured yet. That is a small book rather than a safe one.'
          : 'No single client, supplier or person is large enough to be worth naming.'
        : `${worst.says} ${worst.breach!.meaning}`,
  }
}
