/**
 * Two records, one firm.
 *
 * Two clients each list Cloudepa Systems. Neither knows the other did,
 * so there are two supplier shells with the same domain — and the second
 * person to sign in gets the one their own client created, not the one
 * their colleague already claimed.
 *
 * That is the right default. A merge that happens silently at sign-in is
 * how a firm loses a year of history, and guessing that two companies
 * with similar names are the same firm is how one supplier's rates end
 * up in another supplier's account.
 *
 * So joining is deliberate, it is proposed rather than performed, and
 * the person doing it sees exactly what will move before it moves.
 *
 * ── What may be joined, and what may not ─────────────────────────────
 *
 * Only where somebody can actually speak for both. In practice that is
 * one of two situations:
 *
 *   the same corporate domain, and at least one side unclaimed
 *   both claimed, and the person asking has a seat at both
 *
 * Two claimed companies with no overlapping people cannot be joined
 * here, however identical their names. That needs both firms to agree,
 * and this screen is not where that conversation happens.
 */

export interface Side {
  id: string
  name: string
  domain: string | null
  claimedAt: Date | null
  /** Whether the person asking has a seat here. */
  yours: boolean
  /** What would move. */
  counts: {
    submissions: number
    contracts: number
    invites: number
    people: number
  }
  /** The clients who listed this record. */
  listedBy: string[]
}

export type Refusal =
  | 'SAME_RECORD'
  | 'DIFFERENT_DOMAIN'
  | 'BOTH_CLAIMED_NOT_YOURS'
  | 'NOTHING_TO_MOVE'

export interface Verdict {
  ok: boolean
  refusal: Refusal | null
  /** Which record survives, and which is folded into it. */
  keep: Side | null
  fold: Side | null
  says: string
  /** Said before the button, not after. */
  moving: string[]
}

/**
 * Whether these two may be joined, and which way round.
 *
 * The claimed one survives. Somebody has signed in to it, colleagues may
 * have seats on it, and it is the record with a person standing behind
 * it — folding that into a shell created by a paste would be backwards.
 * Where both are claimed, the older one survives, because history is
 * harder to recreate than an account.
 */
export function canJoin(a: Side, b: Side): Verdict {
  if (a.id === b.id) {
    return no('SAME_RECORD', 'That is the same record twice.')
  }

  // A domain is the only evidence here that two records are one firm.
  // Names are not: two firms genuinely called Apex Staffing is an
  // ordinary Tuesday, and joining them would be the worst bug in this
  // product.
  // The domain is the only evidence, and it is required — not merely
  // preferred. An earlier version let any pair through as long as one
  // was unclaimed, which would have allowed folding an unrelated shell
  // into a real company on somebody's say-so.
  const sameDomain = a.domain != null && b.domain != null && a.domain === b.domain

  if (!sameDomain) {
    return no(
      'DIFFERENT_DOMAIN',
      a.domain == null || b.domain == null
        ? 'One of these has no domain on file, so there is nothing to say they are the same firm.'
        : 'These are on different domains. Nothing here says they are the same firm.'
    )
  }

  if (a.claimedAt != null && b.claimedAt != null && !(a.yours && b.yours)) {
    return no(
      'BOTH_CLAIMED_NOT_YOURS',
      'Both records have people signed in to them, and you are not one of them on both. ' +
        'Somebody with a seat at each has to do this.'
    )
  }

  const keep = survives(a, b)
  const fold = keep.id === a.id ? b : a

  const moving = whatMoves(fold)
  if (moving.length === 0) {
    return {
      ...no('NOTHING_TO_MOVE', `There is nothing on ${fold.name} to move.`),
      keep,
      fold,
    }
  }

  return {
    ok: true,
    refusal: null,
    keep,
    fold,
    says:
      `${fold.name} folds into ${keep.name}. ` +
      `${fold.listedBy.length > 0 ? `${fold.listedBy.join(' and ')} listed it; they keep their history.` : ''}`.trim(),
    moving,
  }
}

/**
 * Which record survives.
 *
 * Claimed beats unclaimed: somebody has signed in, colleagues may have
 * seats, and folding that into a shell created by a paste is backwards.
 * Where both are claimed, the older survives — history is harder to
 * recreate than an account.
 */
export function survives(a: Side, b: Side): Side {
  if (a.claimedAt != null && b.claimedAt == null) return a
  if (b.claimedAt != null && a.claimedAt == null) return b
  if (a.claimedAt && b.claimedAt) return a.claimedAt <= b.claimedAt ? a : b

  // Neither claimed. Keep whichever carries more, because that is less
  // to move and less to get wrong.
  return weight(a) >= weight(b) ? a : b
}

function weight(s: Side): number {
  return s.counts.submissions + s.counts.contracts + s.counts.invites
}

/**
 * What will move, in words, before anything moves.
 *
 * A confirmation dialog that says "this cannot be undone" and nothing
 * else is a dialog people click through. This one says what is in the
 * box.
 */
export function whatMoves(fold: Side): string[] {
  const out: string[] = []
  const { submissions, contracts, invites, people } = fold.counts

  if (submissions) out.push(`${submissions} submission${submissions === 1 ? '' : 's'}`)
  if (contracts) out.push(`${contracts} contract${contracts === 1 ? '' : 's'}`)
  if (invites) out.push(`${invites} role invitation${invites === 1 ? '' : 's'}`)
  if (people) out.push(`${people} seat${people === 1 ? '' : 's'}`)

  return out
}

/**
 * The sentence on the button.
 *
 * Names both firms and the direction. "Merge" alone has cost people
 * their data in every product that has ever offered it.
 */
export function buttonSays(v: Verdict): string {
  if (!v.ok || !v.keep || !v.fold) return 'Cannot join these'
  return `Fold ${v.fold.name} into ${v.keep.name}`
}

function no(refusal: Refusal, says: string): Verdict {
  return { ok: false, refusal, keep: null, fold: null, says, moving: [] }
}
