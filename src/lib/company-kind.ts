/**
 * What kind of company this is, changed after sign-up.
 *
 * Found by the founder on production, 2026-11-02: Tapin signed up as
 * "Own company", a one-person firm, so its Owner read the seven-link
 * solopreneur menu and greeting and could not run a bench of hundreds.
 * Settings showed the type as a word, and nothing changed it.
 *
 * So the Owner, and only the Owner, may change the type among the
 * choices sign-up offers. The change is refused, in a sentence, only
 * where work on the record depends on the old type; everywhere else it
 * goes through, and the menu, the greeting, the chips and the setup
 * checklist follow it, because each of them reads the kind on every
 * request and stores nothing about it.
 *
 * Pure: no database. The facts come from `app/api/settings/kind`.
 */
import { COMPANY_TYPES } from '@/lib/onboarding'

// ── The choices ───────────────────────────────────────────────────────

export interface KindChoice {
  /** The sign-up key, and every other key that saves the same answer. */
  key: string
  keys: readonly string[]
  kind: string
  posture: string | null
  label: string
  blurb: string
}

/**
 * The sign-up's own choices, one per answer the record can tell apart.
 *
 * Sign-up offers Sub-vendor and Bench supplier, and both are stored the
 * same way (kind VENDOR, posture BENCH), so here they are one choice.
 * Two radio buttons that save the same answer is a form whose answer is
 * thrown away (CLAUDE.md, "Zero training").
 */
export const KIND_CHOICES: readonly KindChoice[] = (() => {
  const out: KindChoice[] = []
  for (const t of COMPANY_TYPES) {
    const posture = t.posture ?? null
    const same = out.find((c) => c.kind === t.kind && c.posture === posture)
    if (same) {
      same.keys = [...same.keys, t.key]
      same.label = `${same.label} or ${t.label.charAt(0).toLowerCase()}${t.label.slice(1)}`
      same.blurb = 'You keep a bench, or supply people through a prime vendor, and bill the firm above you.'
      continue
    }
    out.push({ key: t.key, keys: [t.key], kind: t.kind, posture, label: t.label, blurb: t.blurb })
  }
  return out
})()

/** The choice a key names, any of the keys that save it. */
export function choiceByKey(key: unknown): KindChoice | null {
  if (typeof key !== 'string') return null
  return KIND_CHOICES.find((c) => c.keys.includes(key)) ?? null
}

/**
 * The choice a company already is. A kind with one choice is that
 * choice whatever its posture says; a firm formed before postures were
 * written (VENDOR with none) is none of them until somebody chooses.
 */
export function choiceOf(kind: string | null | undefined, posture: string | null | undefined): KindChoice | null {
  const ofKind = KIND_CHOICES.filter((c) => c.kind === kind)
  if (ofKind.length === 1) return ofKind[0]
  return ofKind.find((c) => c.posture === (posture ?? null)) ?? null
}

// ── What the record holds that a type depends on ──────────────────────

/** A live line another firm pays this one on for the work of one of its own people. */
export interface OwnWorkLine {
  buyer: string
  person: string
}

export interface KindFacts {
  /**
   * Live lines another firm pays this one on for the work of somebody
   * seated here. At a one-person firm that is the Owner's own work, and
   * the line reads its papers as from the worker's own company
   * (`shapeOf` in lib/document-requirements).
   */
  ownWorkLines: readonly OwnWorkLine[]
  /** Live lines another firm pays this one on for somebody not seated here. */
  othersWorkLines: number
  /** Everybody but the Owner who holds a seat here, by name. */
  otherSeats: readonly string[]
  /** Live bench listings here: all of them, and those of people other than the Owner. */
  benchListings: { all: number; others: number }
  /** Live lines this firm bills as the supplier: all, and those for people other than the Owner. */
  sellLines: { all: number; others: number }
  /** Job requests this firm raised that are still open. */
  openJobs: number
  /** Live lines this firm pays as the client. */
  linesAsClient: number
  /** Seats in this firm's program held by other firms. */
  seatsGranted: number
  /** Live lines this firm pays a supplier or a worker on. */
  linesAsPayer: number
  /** Seats this firm holds in clients' programs. */
  seatsHeld: number
  /** People this firm has put forward on jobs still open. */
  openSubmissions: number
  /** Whether anybody here ever turned the bench holiday switch (lib/bench-holiday-switch). */
  benchHolidayTurned: boolean
}

export const NO_KIND_FACTS: KindFacts = {
  ownWorkLines: [], othersWorkLines: 0, otherSeats: [],
  benchListings: { all: 0, others: 0 }, sellLines: { all: 0, others: 0 },
  openJobs: 0, linesAsClient: 0, seatsGranted: 0, linesAsPayer: 0, seatsHeld: 0,
  openSubmissions: 0, benchHolidayTurned: false,
}

// ── The verdict ───────────────────────────────────────────────────────

export type KindVerdict = { ok: true } | { ok: false; status: 403 | 409 | 422; says: string }

const SOLO = 'CONSULTANT_CORP'

function n(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function list(names: readonly string[], most = 3): string {
  const shown = names.slice(0, most)
  const rest = names.length - shown.length
  const all = rest > 0 ? [...shown, `${rest} more`] : shown
  if (all.length <= 1) return all.join('')
  return `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`
}

/** "a prime vendor", "an MSP", "an integrator". */
export function aChoice(c: Pick<KindChoice, 'label'>): string {
  const word = c.label.replace(/\s*\(.*\)$/, '')
  const lower = /^[A-Z]{2,}/.test(word) ? word : word.charAt(0).toLowerCase() + word.slice(1)
  return `${/^[aeiouAEIOU]|^MSP/.test(lower) ? 'an' : 'a'} ${lower}`
}

/**
 * Whether this change of type may go through, and if not, why, in one
 * sentence that says what on the record depends on the old type.
 *
 * Refused only where a record would break:
 *  - leaving a one-person firm while another firm pays it on a live line
 *    for the work of somebody seated here: that line reads its papers as
 *    the worker's own company's, and a supplier's would be asked instead
 *    (an agreement and good standing) in the middle of the work;
 *  - becoming a one-person firm while anybody else is seated, listed or
 *    working here: a one-person firm is one person;
 *  - leaving a client while it has open job requests, contractors on
 *    site or an MSP seated in its program;
 *  - becoming a client while it sells: a client never sells;
 *  - leaving an MSP while it holds a seat in a client's program;
 *  - becoming an MSP while it places or pays anybody: an MSP does neither.
 * Every other change between the supplier types goes through.
 */
export function kindChangeVerdict(i: {
  firm: string
  from: { kind: string; posture: string | null }
  to: KindChoice
  isOwner: boolean
  ownerName?: string | null
  facts: KindFacts
}): KindVerdict {
  const { firm, from, to, facts: f } = i
  if (!i.isOwner) {
    return {
      ok: false,
      status: 403,
      says: `Only the Owner of ${firm}${i.ownerName ? `, ${i.ownerName},` : ''} changes what kind of company it is.`,
    }
  }
  const now = choiceOf(from.kind, from.posture)
  if (now && now.key === to.key) {
    return { ok: false, status: 422, says: `${firm} is already ${aChoice(to)}.` }
  }

  if (from.kind === SOLO && to.kind !== SOLO && f.ownWorkLines.length > 0) {
    const l = f.ownWorkLines[0]
    const more = f.ownWorkLines.length > 1 ? ` (and ${n(f.ownWorkLines.length - 1, 'other line', 'other lines')})` : ''
    return {
      ok: false,
      status: 409,
      says:
        `${l.buyer} pays ${firm} for ${l.person}’s own work on a running line${more}, and that line asks for papers ` +
        `as from ${l.person}’s own company. As ${aChoice(to)}, ${firm} would be asked a supplier’s papers instead, ` +
        `an agreement and good standing, in the middle of the work. Change the type once that line ends.`,
    }
  }

  if (to.kind === SOLO && from.kind !== SOLO) {
    const others = f.otherSeats.length + f.benchListings.others + f.sellLines.others
    if (others > 0) {
      const what: string[] = []
      if (f.otherSeats.length) what.push(`${list(f.otherSeats)} ${f.otherSeats.length === 1 ? 'holds a seat' : 'hold seats'} here`)
      if (f.benchListings.others) what.push(`${n(f.benchListings.others, 'person is', 'people are')} on your bench`)
      if (f.sellLines.others) what.push(`${n(f.sellLines.others, 'person works', 'people work')} through ${firm} on a running line`)
      return {
        ok: false,
        status: 409,
        says: `A one-person firm is one person, and ${list(what, 3)}. Keep ${firm} as it is, or end that work first.`,
      }
    }
  }

  if (from.kind === 'CLIENT' && to.kind !== 'CLIENT' && (f.openJobs || f.linesAsClient || f.seatsGranted)) {
    const what: string[] = []
    if (f.openJobs) what.push(`${n(f.openJobs, 'job request is', 'job requests are')} still open`)
    if (f.linesAsClient) what.push(`${n(f.linesAsClient, 'contractor is', 'contractors are')} on site`)
    if (f.seatsGranted) what.push(`${n(f.seatsGranted, 'MSP holds a seat', 'MSPs hold seats')} in your program`)
    return {
      ok: false,
      status: 409,
      says: `${firm} is a client on the record: ${list(what)}. A client keeps its type while that work is open.`,
    }
  }

  if (to.kind === 'CLIENT' && from.kind !== 'CLIENT' && (f.sellLines.all || f.benchListings.all || f.openSubmissions)) {
    const what: string[] = []
    if (f.sellLines.all) what.push(`${firm} bills ${n(f.sellLines.all, 'running line', 'running lines')}`)
    if (f.benchListings.all) what.push(`${n(f.benchListings.all, 'person is', 'people are')} on its bench`)
    if (f.openSubmissions) what.push(`${n(f.openSubmissions, 'person it put forward is', 'people it put forward are')} still being considered`)
    return {
      ok: false,
      status: 409,
      says: `A client buys and never sells, and ${list(what)}. Change the type once that work ends.`,
    }
  }

  if (from.kind === 'MSP' && to.kind !== 'MSP' && f.seatsHeld) {
    return {
      ok: false,
      status: 409,
      says: `${firm} holds ${n(f.seatsHeld, 'seat', 'seats')} in a client’s program as its MSP. Give the seat back first, then change the type.`,
    }
  }

  if (to.kind === 'MSP' && from.kind !== 'MSP' && (f.sellLines.all || f.linesAsPayer || f.benchListings.all)) {
    const what: string[] = []
    if (f.sellLines.all) what.push(`${firm} bills ${n(f.sellLines.all, 'running line', 'running lines')}`)
    if (f.linesAsPayer) what.push(`pays ${n(f.linesAsPayer, 'running line', 'running lines')}`)
    if (f.benchListings.all) what.push(`has ${n(f.benchListings.all, 'person', 'people')} on its bench`)
    return {
      ok: false,
      status: 409,
      says: `An MSP places nobody and pays nobody, and ${list(what)}. Change the type once that work ends.`,
    }
  }

  return { ok: true }
}

/**
 * What the screen says once the type has changed: what follows it, the
 * roles added, and the two things the record now reads differently.
 */
export function kindChangedSays(i: {
  firm: string
  from: { kind: string }
  to: KindChoice
  rolesAdded: readonly string[]
  facts: Pick<KindFacts, 'othersWorkLines' | 'benchHolidayTurned'>
}): string {
  const parts = [
    `${i.firm} is now ${aChoice(i.to)}. Your menu, Ask Etyme and the setup checklist follow it from the next screen, and nothing you answered before has changed.`,
  ]
  if (i.rolesAdded.length) {
    parts.push(`${n(i.rolesAdded.length, 'role was', 'roles were')} added for the work ${aChoice(i.to)} does: ${list(i.rolesAdded, 6)}.`)
  }
  if (i.from.kind === SOLO && i.facts.othersWorkLines > 0) {
    parts.push(
      `${n(i.facts.othersWorkLines, 'line another firm pays you on now asks', 'lines other firms pay you on now ask')} for a supplier’s papers, ` +
        'not an own company’s.'
    )
  }
  const wasIntegrator = i.from.kind === 'GSI'
  const isIntegrator = i.to.kind === 'GSI'
  if (!i.facts.benchHolidayTurned && wasIntegrator !== isIntegrator && (i.to.kind === 'VENDOR' || i.to.kind === 'GSI')) {
    parts.push(
      isIntegrator
        ? 'Public holidays on your bench are now paid by default, as an integrator’s are. Turn it off on Bench pay if you do not pay them.'
        : 'Public holidays on your bench are no longer paid by default. Turn it on for the people you pay them to on Bench pay.'
    )
  }
  return parts.join(' ')
}
