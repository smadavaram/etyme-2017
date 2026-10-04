/**
 * A prime puts forward somebody its network offered it.
 *
 * ── The break this answers ────────────────────────────────────────────
 *
 * Break #4 of the founder's lifecycle walk. Computer Systems opens Bench →
 * Your network and reads Grace Lindqvist, whom Techpeple offered its
 * network: a marketing-tier listing she granted Techpeple. Northbend
 * Athletic has released a requisition to Computer Systems. Computer
 * Systems cannot put her on it. The submit door looked for a listing
 * *Computer Systems* holds and, finding none, said "The consultant must
 * grant a listing first" — which she had, to the firm that offered her.
 * The only road left was Techpeple going round its prime to the client,
 * which is the one thing a prime–sub relationship exists to prevent.
 *
 * ── Whose consent it is ───────────────────────────────────────────────
 *
 * The consultant's, given to the sub-vendor, and nobody else's. The
 * invariant is unchanged: a submission needs a live listing the consultant
 * granted. What changes is which listing is read. The sub-vendor showing
 * a marketing-tier listing to its network is the sub-vendor offering the
 * person upward — the trade's hotlist — and the chain already rests on
 * exactly that consent when a sub submits to a prime and the prime sends
 * the person on (`forward/route.ts`). Adopting is that same chain, started
 * from the prime's desk.
 *
 * So every wall the sub-vendor would meet still stands, asked about the
 * sub-vendor: her consent to it, whether she asks first, the client's
 * do-not-submit list, and whoever already holds her there. A retained
 * listing is the sub-vendor's to keep private and is no offer at all.
 *
 * ── Why it is two rows ────────────────────────────────────────────────
 *
 * The award reads the rung below off `parentSubmissionId` and buys from
 * whoever is on it. One row from the prime with nobody below would be
 * awarded as the prime's own payroll — a W2 leg for somebody it does not
 * employ, and a sub-vendor who is never paid. So the hop below is written
 * with it: the sub-vendor to the prime at the rate the prime says it
 * agreed, on the prime's own record of the client's role, already sent
 * on. The client reads the prime's row and nothing under it.
 *
 * Pure. No database here; the route reads the facts and this decides.
 */

import { submissionKind, type Kind } from './kind'

/** One firm's listing on the person, as the prime's desk can know it. */
export interface Offer {
  companyId: string
  companyName: string
  /** RETAINED · MARKETING. Only marketing is shown to a network. */
  tier: string
  /** INVITED · GRANTED · DECLINED — the consultant's answer to that firm. */
  state: string
  revokedAt: Date | null
  /** Whether the firm is on the prime's network: an active counterparty, either way round. */
  onOurNetwork: boolean
}

export type AdoptVerdict =
  | { ok: true; offeredBy: { companyId: string; companyName: string } }
  | {
      ok: false
      code: 'NOT_OFFERED' | 'NOT_OFFERED_TO_NETWORK' | 'NOT_ON_YOUR_NETWORK' | 'NO_CONSENT' | 'WHICH_SUPPLIER' | 'NO_PAY_RATE'
      says: string
      /** Present on WHICH_SUPPLIER: the firms that did offer them. */
      options?: Array<{ companyId: string; companyName: string }>
    }

/** Whether this listing is an offer to this prime, and if not, why not. */
function standing(o: Offer): 'LIVE' | 'RETAINED' | 'OFF_NETWORK' | 'NO_CONSENT' {
  if (o.revokedAt || o.state !== 'GRANTED') return 'NO_CONSENT'
  if (!o.onOurNetwork) return 'OFF_NETWORK'
  if (o.tier !== 'MARKETING') return 'RETAINED'
  return 'LIVE'
}

/**
 * May the prime put this person forward on the strength of a supplier's
 * offer, and which supplier is it.
 *
 * In order: which firm, then the rate. The rate is asked last so the
 * sentence can name the firm it is paid to.
 */
export function networkOffer(input: {
  personName: string
  /** The prime. */
  ourName: string
  offers: Offer[]
  /** The supplier the prime named, where it named one. */
  requested: string | null
  /** What the prime pays that supplier for the person, in cents an hour. */
  payRateCents: number | null
}): AdoptVerdict {
  const { personName: who, ourName: us } = input
  const live = input.offers.filter((o) => standing(o) === 'LIVE')

  let chosen: Offer | undefined
  if (input.requested) {
    const named = input.offers.find((o) => o.companyId === input.requested)
    if (!named) {
      return {
        ok: false,
        code: 'NOT_OFFERED',
        says: `That firm has not offered ${who} to ${us}. Choose ${who} from a supplier that has, on Bench → Your network.`,
      }
    }
    const why = standing(named)
    if (why !== 'LIVE') return refusal(why, named, who, us)
    chosen = named
  } else if (live.length === 1) {
    chosen = live[0]
  } else if (live.length > 1) {
    return {
      ok: false,
      code: 'WHICH_SUPPLIER',
      says:
        `${live.map((o) => o.companyName).join(' and ')} have each offered ${who} to ${us}. ` +
        `Say which of them you are buying ${who} from; the other is not told.`,
      options: live.map((o) => ({ companyId: o.companyId, companyName: o.companyName })),
    }
  } else {
    // Nobody live. Say the nearest reason, so a recruiter is told what to
    // ask for rather than that something somewhere is wrong.
    const nearest =
      input.offers.find((o) => standing(o) === 'RETAINED') ??
      input.offers.find((o) => standing(o) === 'OFF_NETWORK') ??
      null
    if (nearest) return refusal(standing(nearest), nearest, who, us)
    return {
      ok: false,
      code: 'NOT_OFFERED',
      says:
        `${who} has not agreed to be marketed by ${us}, and no supplier on your network has offered them to you. ` +
        `Ask ${who} for a bench listing, or ask the supplier who holds one to offer them to you.`,
    }
  }

  if (!input.payRateCents || input.payRateCents <= 0 || !Number.isInteger(input.payRateCents)) {
    return {
      ok: false,
      code: 'NO_PAY_RATE',
      says:
        `Say what ${chosen.companyName} charges you for ${who}, an hour. The award pays them that, ` +
        'and the client never sees it.',
    }
  }

  return { ok: true, offeredBy: { companyId: chosen.companyId, companyName: chosen.companyName } }
}

function refusal(why: ReturnType<typeof standing>, o: Offer, who: string, us: string): AdoptVerdict {
  switch (why) {
    case 'RETAINED':
      return {
        ok: false,
        code: 'NOT_OFFERED_TO_NETWORK',
        says:
          `${o.companyName} keeps ${who} on its own bench and has not offered them to its network. ` +
          `Ask ${o.companyName} to put ${who} forward to you on your job.`,
      }
    case 'OFF_NETWORK':
      return {
        ok: false,
        code: 'NOT_ON_YOUR_NETWORK',
        says: `${o.companyName} is not on ${us}’s network, so it has offered you nobody. Add it under Your suppliers first.`,
      }
    default:
      return {
        ok: false,
        code: 'NO_CONSENT',
        says: `${who} has not agreed to be marketed by ${o.companyName}, so ${o.companyName} cannot offer them to anybody.`,
      }
  }
}

/**
 * The two kinds, each computed from who holds the person — never taken
 * from the request.
 *
 * The prime holds no listing and does not employ them, so to the client
 * they are NETWORK: somebody another firm holds, whom the prime buys. The
 * hop below is the supplier's own submission, so its kind is what the
 * supplier's hold makes it — INTERNAL where the supplier employs them,
 * NETWORK for a marketing listing.
 */
export function adoptedKinds(supplier: { employsThem: boolean; listingTier: string }): { ours: Kind; below: Kind } {
  return {
    ours: submissionKind({ employedByUs: false, listingTier: null }),
    below: submissionKind({ employedByUs: supplier.employsThem, listingTier: supplier.listingTier }),
  }
}

/** What the person reads. Both firms named: the person is never kept in the dark. */
export function tellAdoptedPerson(i: {
  ourName: string
  supplierName: string
  clientName: string
  roleTitle: string
}): string {
  return (
    `${i.ourName} put you forward to ${i.clientName} for ${i.roleTitle}. ` +
    `${i.supplierName}, who you agreed may market you, offered you to them. ` +
    `If you did not want to be put forward there, tell ${i.supplierName}.`
  )
}

/**
 * What the supplier reads. It is owed the fact, the site — it must know
 * where its person works — and the rate the prime wrote down against it,
 * because a rate one side recorded and the other never saw is the wrong
 * number an award would pay. It is not owed the prime's price.
 */
export function tellSupplier(i: {
  ourName: string
  personName: string
  clientName: string
  roleTitle: string
  payRateCents: number
}): string {
  const rate = (i.payRateCents / 100).toFixed(i.payRateCents % 100 === 0 ? 0 : 2)
  return (
    `${i.ourName} put ${i.personName}, whom you offered your network, forward to ${i.clientName} for ${i.roleTitle}. ` +
    `You are on it as their supplier at $${rate} an hour, the rate ${i.ourName} says it agreed with you — ` +
    `if that is wrong, tell them before anybody is awarded. What ${i.ourName} charges is theirs, and is not shown here.`
  )
}

/**
 * The supplier's walls, said to the prime.
 *
 * `maySubmit` is asked about the supplier, because it is the supplier's
 * consent and the supplier's hold, and it answers in the second person —
 * "you already represent", "your do-not-return list". Read out to the
 * prime those sentences are about the wrong firm. And one of them must
 * not reach the prime at all: a supplier's own do-not-return list is the
 * supplier's record, so the prime is told the supplier cannot offer the
 * person and not why.
 *
 * Returns null where the supplier's verdict passes the person.
 */
export function supplierWallSays(
  v: { ok: true } | { ok: false; code: string; message: string },
  i: { supplierName: string; personName: string; clientName: string }
): { code: string; says: string; held: boolean } | null {
  if (v.ok) return null
  switch (v.code) {
    case 'ASK_FIRST':
      return {
        code: 'ASK_FIRST',
        held: false,
        says:
          `${i.personName} asks ${i.supplierName} before being put forward to a new client. ` +
          `Ask ${i.supplierName} to ask them about ${i.clientName}; once they agree, put them forward.`,
      }
    case 'ON_OUR_DNR_LIST':
    case 'NO_LISTING':
      return {
        code: 'NOT_OFFERED',
        held: false,
        says: `${i.supplierName} cannot offer ${i.personName} at the moment. Ask ${i.supplierName}.`,
      }
    case 'HELD_ELSEWHERE':
      return { code: 'HELD_ELSEWHERE', held: true, says: v.message }
    default:
      // BLOCKED and anything added later: the sentence is already neutral
      // and names nobody, so it is passed as it is.
      return { code: v.code, held: false, says: v.message }
  }
}

/** Our own do-not-return list, which the supplier's verdict cannot see. */
export function ourBarSays(): string {
  return (
    'Somebody here put this person on your do-not-return list, so they are not to be put ' +
    'forward again, whoever offers them. Lift the bar with a reason first if that has changed.'
  )
}
