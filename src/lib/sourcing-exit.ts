/**
 * Sourced contacts are scaffolding, and this is the demolition plan.
 *
 * ── What they are for ────────────────────────────────────────────────
 *
 * Not a product. A bought list of people, sitting outside the app,
 * solving two problems that only exist while the network is small: it
 * brings traffic, and it gives a vendor with a thin bench something to
 * work when they are short of contracts. Both problems disappear once
 * enough vendors are here, because then the network is the supply.
 *
 * ── That it ends is the design, not an aspiration ────────────────────
 *
 * The target is a thousand vendors and roughly two years, and then every
 * line of this is deleted. A feature nobody plans to remove becomes
 * load-bearing by accident: something references it, then something
 * references that, and by the time anybody wants it gone it is holding
 * up the building.
 *
 * So three things are true by construction rather than by intention:
 *
 *   The dependency arrow points one way. A sourced contact graduates
 *   into a Person, a ConsultantProfile and a BenchListing at the moment
 *   somebody answers and grants one. Nothing in the core may point back.
 *   `__tests__/invariants/sourcing-is-removable.test.ts` fails on the
 *   commit that breaks that, which is the only moment it is cheap.
 *
 *   Ranking makes it lose on purpose. A vendor's own contacts outrank
 *   sourced ones ten to one, so the pool is always the last resort and
 *   its share of real work only ever falls.
 *
 *   Graduation eats the pool. Every person who joins a bench leaves it,
 *   so success is measured by the thing shrinking. A sourcing feature
 *   that is growing is failing.
 *
 * ── Why this file exists at all ──────────────────────────────────────
 *
 * Because "we will remove it later" is not a plan and never happens.
 * Removal needs a number somebody can look at, so this turns it into
 * one: how many vendors are here, and how much of the live bench still
 * comes from the bought list. When the second number is near zero the
 * feature is already dead and deleting it is bookkeeping.
 */

/** The network size at which the pool has done its job. */
export const VENDOR_TARGET = 1000

/**
 * The share of live bench listings still traceable to the bought list,
 * below which the pool is no longer doing anything.
 *
 * Five per cent rather than zero. A handful of long-tenured people who
 * originally came from the list will still be on a bench years later,
 * and waiting for a true zero is waiting forever.
 */
export const SOURCED_SHARE_FLOOR = 0.05

export interface Reach {
  /** Vendors with at least one live bench listing of their own. */
  activeVendors: number
  /** Live bench listings whose consultant first arrived as a sourced contact. */
  listingsFromSourced: number
  /** Live bench listings altogether. */
  listingsTotal: number
}

export type Stage = 'CARRYING' | 'FADING' | 'READY'

export interface Verdict {
  stage: Stage
  /** What fraction of the working bench still traces back to the list. */
  sourcedShare: number
  /** One sentence, for a person deciding. */
  says: string
}

/**
 * Whether the scaffolding can come down.
 *
 * Both conditions, not either. A small sourced share with forty vendors
 * means the list is not working, which is a reason to fix it rather than
 * to remove it — and removing it then would take away the only thing
 * feeding a network too small to feed itself.
 */
export function readyToRemove(r: Reach): Verdict {
  const share = r.listingsTotal === 0 ? 0 : r.listingsFromSourced / r.listingsTotal
  const bigEnough = r.activeVendors >= VENDOR_TARGET
  const quiet = share <= SOURCED_SHARE_FLOOR

  if (bigEnough && quiet) {
    return {
      stage: 'READY',
      sourcedShare: share,
      says:
        `${r.activeVendors} vendors are working their own benches and ${pct(share)} of live ` +
        `listings still trace back to the bought list. It has done its job. Delete it.`,
    }
  }

  if (bigEnough) {
    return {
      stage: 'FADING',
      sourcedShare: share,
      says:
        `${r.activeVendors} vendors, but ${pct(share)} of live listings still come from the ` +
        `bought list. The network is big enough; the habit has not shifted yet.`,
    }
  }

  if (quiet && r.listingsTotal > 0) {
    // The failure worth naming. Removing it here would take away the only
    // thing feeding a network too small to feed itself.
    return {
      stage: 'CARRYING',
      sourcedShare: share,
      says:
        `Only ${r.activeVendors} vendors, and just ${pct(share)} of listings come from the ` +
        `bought list — so it is not doing the job it exists for. Fix it, do not remove it.`,
    }
  }

  return {
    stage: 'CARRYING',
    sourcedShare: share,
    says:
      `${r.activeVendors} of ${VENDOR_TARGET} vendors. The bought list is carrying ${pct(share)} ` +
      `of the live bench, which is what it is for while the network is this small.`,
  }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}
