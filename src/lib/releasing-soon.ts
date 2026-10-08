import type { Permission } from '@/lib/permissions'
import { canReadBillRate } from '@/lib/permissions'
/**
 * People about to come free.
 *
 * The gap this fills is a fortnight wide and expensive. A consultant rolls
 * off on the 28th. Nobody outside their own vendor knows until the 29th,
 * when they appear on the bench — and bench time is the cost that decides
 * whether a staffing firm makes money.
 *
 * Client-side "ending soon" already exists: a program manager sees which
 * of their own contracts are running out. This is the other side of the
 * same fact, and it is worth much more: the person is still working, still
 * paid, and can be sold into their next engagement before there is a gap.
 *
 * Two things make this different from a bench listing, and both are the
 * point.
 *
 * **They are not available yet.** A listing that says "available" for
 * somebody working until the 28th wastes everybody's time. The date is the
 * headline, not a footnote.
 *
 * **The consultant has to have agreed.** CLAUDE.md is explicit that a
 * submission requires a live listing the consultant granted. Putting
 * somebody in a shop window because their contract has an end date would
 * be the same violation one step earlier.
 */

export interface RollingOff {
  contractId: string
  personId: string
  personName: string
  /** The vendor who employs them and would be selling them on. */
  vendorCompanyId: string
  vendorName: string
  /**
   * Where they are working now — for "done this before" credibility.
   *
   * Null to everybody but the firm that placed them. The consultant agreed
   * to be listed as coming free; they did not agree on behalf of the
   * client, whose competitors read this same list.
   */
  endClientName: string | null
  /**
   * The kind of place, when the name may not be said.
   *
   * "Finishing at an enterprise" carries most of the credibility and none
   * of the relationship. Better than a blank, which reads as somebody with
   * nothing to show.
   */
  endClientSector?: string | null
  endDate: Date
  /** Whether they have agreed to be shown before they are free. */
  consented: boolean
  /** What they do, as it would be searched for. */
  headline: string | null
  skills: string[]
  location: string | null
  /** Their own floor, in cents. Never shown below this. */
  rateFloorCents: number | null
  /** Whether an extension is already being discussed. */
  extensionLikely: boolean
}

export type Window = 'THIS_WEEK' | 'THIS_MONTH' | 'NEXT_QUARTER'

export interface Release {
  contractId: string
  personId: string
  personName: string
  vendorName: string
  vendorCompanyId: string
  headline: string | null
  skills: string[]
  location: string | null
  /** Days until they are free. Negative means they already are. */
  daysUntilFree: number
  freeOn: string
  window: Window
  /** The thing a buyer actually wants to know. */
  proven: string | null
  rateFloorCents: number | null
  /** Said plainly where it changes what a buyer should do. */
  caveat: string | null
}

const DAY = 86_400_000

/**
 * Who to show, and in what order.
 *
 * Ordered by when they come free rather than by fit, because this list is
 * answering "who can start when I need somebody" — and a perfect match
 * available in ninety days is not an answer to a gap starting Monday.
 */
export function releasing(rows: RollingOff[], now: Date, horizonDays = 90): Release[] {
  const out: Release[] = []

  for (const r of rows) {
    // Nobody appears without having agreed to. A contract end date is not
    // consent to be sold.
    if (!r.consented) continue

    const days = Math.ceil((r.endDate.getTime() - now.getTime()) / DAY)

    // Already free is the bench's job, not this list's. Showing them here
    // too would make both lists untrustworthy.
    if (days < 0) continue
    if (days > horizonDays) continue

    out.push({
      contractId: r.contractId,
      personId: r.personId,
      personName: r.personName,
      vendorName: r.vendorName,
      vendorCompanyId: r.vendorCompanyId,
      headline: r.headline,
      skills: r.skills,
      location: r.location,
      daysUntilFree: days,
      freeOn: r.endDate.toISOString().slice(0, 10),
      window: days <= 7 ? 'THIS_WEEK' : days <= 31 ? 'THIS_MONTH' : 'NEXT_QUARTER',
      // What they have actually been doing beats any claim on a profile.
      proven: r.endClientName
        ? `Finishing at ${r.endClientName}`
        : r.endClientSector
          ? `Finishing at ${r.endClientSector}`
          : null,
      rateFloorCents: r.rateFloorCents,
      // The one thing that would waste a buyer's time if it were hidden.
      caveat: r.extensionLikely
        ? 'Their current client is discussing an extension, so they may not come free.'
        : null,
    })
  }

  return out.sort((a, b) => a.daysUntilFree - b.daysUntilFree)
}

export interface PoolSummary {
  total: number
  thisWeek: number
  thisMonth: number
  nextQuarter: number
  /** How many carry a caveat, so the headline number is not oversold. */
  uncertain: number
  summary: string
}

/**
 * The number, said honestly.
 *
 * "Twelve releasing" where four are probably extending is a number that
 * gets somebody's hopes up and then costs them a phone call. The caveats
 * are counted into the sentence rather than hidden in the rows.
 */
export function summarize(releases: Release[]): PoolSummary {
  const thisWeek = releases.filter((r) => r.window === 'THIS_WEEK').length
  const thisMonth = releases.filter((r) => r.window === 'THIS_MONTH').length
  const nextQuarter = releases.filter((r) => r.window === 'NEXT_QUARTER').length
  const uncertain = releases.filter((r) => r.caveat !== null).length

  let summary: string
  if (releases.length === 0) {
    summary = 'Nobody is coming free in the next three months.'
  } else if (thisWeek > 0) {
    summary = `${thisWeek} free within the week, ${releases.length} within three months.`
  } else {
    summary = `${releases.length} coming free within three months, the first in ${releases[0].daysUntilFree} days.`
  }

  if (uncertain > 0) {
    summary += ` ${uncertain} may extend instead.`
  }

  return { total: releases.length, thisWeek, thisMonth, nextQuarter, uncertain, summary }
}

/**
 * Whether a person may be shown at all.
 *
 * The consent question, kept separate because it is the one that must
 * never be got wrong. A vendor cannot put somebody in a shop window
 * because their contract is ending; the consultant decides, the same way
 * they decide about a bench listing.
 */
export interface ConsentCheck {
  mayShow: boolean
  reason: string
}

export function mayShow(input: {
  hasLiveListing: boolean
  listingRevoked: boolean
  consultantOptedOut: boolean
}): ConsentCheck {
  if (input.consultantOptedOut) {
    return { mayShow: false, reason: 'They have asked not to be shown before their contract ends.' }
  }
  if (input.listingRevoked) {
    return { mayShow: false, reason: 'They withdrew their listing.' }
  }
  if (!input.hasLiveListing) {
    return {
      mayShow: false,
      // Named as an ask rather than a fault, because it is a conversation
      // the vendor has to have with the person, not a setting to flip.
      reason: 'They have not agreed to be listed. Ask them before their contract ends, not after.',
    }
  }
  return { mayShow: true, reason: 'They agreed to be listed.' }
}

// ── Who reads who is ending soon ─────────────────────────────────────

/**
 * The permissions any one of which opens the rolloff board — a supplier's
 * Rolloff and a client's Ending soon.
 *
 * Every desk that runs, staffs, approves, buys for or pays a program holds
 * one: people (`consultants.read`), placements (`assignments.write`), job
 * requests (`requirements.read`), utilization, or invoices. A delivery
 * engineer on the roster holds only his own work and hours
 * (`assignments.read`, `timesheets.read`) and none of these, so who else
 * is rolling off is not his to read. The sidebar reads this list as the
 * link's `needs`, so the menu and the route cannot disagree.
 */
export const ENDING_SOON_READERS = [
  'consultants.read', 'assignments.write', 'requirements.read', 'utilization.read', 'invoices.read',
] as const satisfies readonly Permission[]

/**
 * Bench check-ins are texts with the firm's bench consultants: read by the
 * desks that read people, and by nobody who reads only their own work.
 */
export const CHECK_IN_READERS = ['consultants.read'] as const satisfies readonly Permission[]

/** Said to a seat that holds none of them. */
export function notYoursToRead(surface: string, company: string | null | undefined): string {
  // Signed in at no company: there is no firm whose desks read it
  // (sign-up walk round six, 9).
  if (!company) {
    return `${surface} is a company’s page, and you are not signed in at a company. Your own work is under Your work.`
  }
  return `${surface} at ${company} is read by the desks that staff, run or pay its work. Your own work is on your own page.`
}

// ── The rate on an Ending soon card ──────────────────────────────────────
//
// The client tester, 2026-10-03, found every card printing
// "{compact(event.billRate)}/hr" — the page had lost its template — and
// the route sent the rate to every seat that could open the page. The
// price on a line is read under the field rule (lib/permissions,
// `canReadBillRate`): the firm it bills reads what it pays, and the
// supplier's own seats read it only with the price desk's permission.

export function rateOnEndingSoon(
  reader: { companyId: string | null; permissions: readonly string[] },
  line: { billRate: number; companyId: string; clientCompanyId: string }
): number | null {
  return canReadBillRate({
    permissions: reader.permissions,
    isClientOnMsa: reader.companyId !== null && reader.companyId === line.clientCompanyId,
  })
    ? line.billRate
    : null
}

// ── What a client does about somebody ending ─────────────────────────────
//
// The same tester: a client's Ending soon offered "Claim", "Back on bench"
// and "Lost" — the supplier's offboarding words, on buttons the supplier's
// routes refuse to a client. A client decides three things about a person
// whose contract is ending, and the page offers those.

export interface ClientEndingChoice {
  key: 'EXTEND' | 'BACKFILL' | 'LET_END'
  label: string
  /** Where it goes, or null where nothing needs doing. */
  href: string | null
}

export function clientEndingChoices(line: { sellContractId: string; endsOn: string }): ClientEndingChoice[] {
  return [
    { key: 'EXTEND', label: 'Extend 3 months', href: null },
    { key: 'BACKFILL', label: 'Backfill — raise a job request', href: '/dashboard/requirements?new=1' },
    { key: 'LET_END', label: `Or let it end on ${line.endsOn}. Nothing to do.`, href: null },
  ]
}

/**
 * Only the firm whose contract it is works its offboarding: claims it,
 * ticks its checklist, records what happened. The claim route asked who
 * was signed in and not where they sat, so anybody could claim any
 * firm's rolloff. The sentence is said to everybody else.
 */
export function mayWorkRolloff(
  reader: { companyId: string | null; isConsultantSeat: boolean },
  line: { companyId: string; companyName: string }
): { ok: true } | { ok: false; says: string } {
  if (!reader.isConsultantSeat && reader.companyId === line.companyId) return { ok: true }
  return {
    ok: false,
    says: `Only ${line.companyName} works this offboarding, because the contract is theirs.`,
  }
}
