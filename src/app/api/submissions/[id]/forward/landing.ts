/**
 * Where a forwarded candidate lands on the destination's books.
 *
 * ── The break this answers ───────────────────────────────────────────
 *
 * A client raises a requisition, has it approved and sends it to two
 * suppliers: a sub-vendor, and a prime that works it through its own
 * subs. The sub-vendor submits straight onto the requisition and the
 * client sees the candidate there. The prime receives a candidate from
 * its own sub and presses "Send on" — and the forward route wrote a
 * brand-new requirement at the client, a copy of the prime's record of
 * the role, OPEN and auto-approved, and put the candidate on that. The
 * client's own requisition never showed the prime's candidate, the
 * client's list gained a role nobody there had raised, and an award on
 * the copy carried no cost center, no hiring manager and no seat count.
 * "Prime to client never arrives, sub-vendor to client does."
 *
 * The copy was the right answer for one case only: a destination that
 * never sent this firm a role at all, so there is nothing on its books
 * to land on. Where the destination did send the forwarder a role, the
 * candidate goes onto that role — the one it approved and chose this
 * firm for.
 *
 * ── How the role is found, in order ──────────────────────────────────
 *
 *   1. The forwarder named one. It must be a role of the destination's
 *      that the forwarder was sent; anything else is refused, because a
 *      role id somebody types is not a role somebody was given.
 *   2. The forwarder's own record was copied from one of the
 *      destination's roles (`mirroredFromId`, followed upward).
 *   3. The destination sent the forwarder exactly one live role — or
 *      several, and exactly one carries the same title as the
 *      forwarder's record.
 *   4. Several, and nothing decides between them: the forwarder is
 *      asked which, by title. Guessing would put a candidate in front
 *      of the wrong hiring manager.
 *   5. None at all: the copy, as before.
 *
 * Pure, so every branch is a sentence in a test.
 */

export interface RoleSent {
  /** The destination's role this firm was sent. */
  requirementId: string
  title: string
}

export interface LandingFacts {
  destinationName: string
  /** The forwarder's own record of the role the candidate came in on. */
  source: { id: string; title: string }
  /**
   * The source's ancestry through `mirroredFromId`, nearest first, each
   * with the company whose books it is on.
   */
  ancestors: Array<{ id: string; companyId: string }>
  destinationId: string
  /** Live roles the destination sent the forwarder — invitation not declined, closed or expired. */
  sent: RoleSent[]
  /** A role the forwarder named, where it named one. */
  requested: string | null
}

export type Landing =
  | { kind: 'REQUISITION'; requirementId: string; because: string }
  | { kind: 'COPY' }
  | { kind: 'CHOOSE'; says: string; options: RoleSent[] }
  | { kind: 'REFUSE'; says: string }

const same = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

export function landingFor(f: LandingFacts): Landing {
  if (f.requested) {
    const named = f.sent.find((r) => r.requirementId === f.requested)
    const upward = f.ancestors.find((a) => a.id === f.requested && a.companyId === f.destinationId)
    if (named || upward) {
      return { kind: 'REQUISITION', requirementId: f.requested, because: 'named by the sender' }
    }
    return {
      kind: 'REFUSE',
      says: `${f.destinationName} did not send you that job, so nobody can be put forward on it from here.`,
    }
  }

  const upward = f.ancestors.find((a) => a.companyId === f.destinationId)
  if (upward) {
    return { kind: 'REQUISITION', requirementId: upward.id, because: 'the job your record was copied from' }
  }

  if (f.sent.length === 1) {
    return { kind: 'REQUISITION', requirementId: f.sent[0].requirementId, because: 'the one job they sent you' }
  }

  if (f.sent.length > 1) {
    const titled = f.sent.filter((r) => same(r.title, f.source.title))
    if (titled.length === 1) {
      return { kind: 'REQUISITION', requirementId: titled[0].requirementId, because: 'the job they sent you under the same title' }
    }
    return {
      kind: 'CHOOSE',
      options: f.sent,
      says:
        `${f.destinationName} sent you ${f.sent.length} jobs: ` +
        f.sent.map((r) => `“${r.title}”`).join(', ') +
        '. Say which one this candidate is for.',
    }
  }

  return { kind: 'COPY' }
}
