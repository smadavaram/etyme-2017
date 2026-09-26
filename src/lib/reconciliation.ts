/**
 * Our books against theirs, with every break named.
 *
 * A reconciliation that ends in a bare difference gets redone next month
 * from zero, because a number with no names in it teaches nobody
 * anything. So the output here is a break list — each line says what it
 * is, how much, and why it does not match — and the difference is only
 * ever the sum of the named breaks plus one honest remainder.
 */

export interface OurLine {
  id: string
  amountCents: number
  on: string // yyyy-mm-dd
  ref?: string | null
  memo?: string | null
}

export interface TheirLine {
  amountCents: number
  on: string
  ref?: string | null
}

export type BreakKind =
  /** We have it, they do not — usually timing: sent and not yet landed. */
  | 'OURS_ONLY'
  /** They have it, we do not — a charge nobody recorded, or their error. */
  | 'THEIRS_ONLY'
  /** Same reference, different amount. The one worth a phone call first. */
  | 'AMOUNT_DIFFERS'

export interface Break {
  kind: BreakKind
  amountCents: number
  ref?: string | null
  says: string
}

export interface Reconciliation {
  oursCents: number
  theirsCents: number
  differenceCents: number
  matchedCents: number
  breaks: Break[]
  /** True where the named breaks fully explain the difference. */
  explained: boolean
  says: string
}

/**
 * Match by reference first, then by exact amount on the same day.
 *
 * Never fuzzier. A near-amount near-date "match" that is actually two
 * different transactions hides both of them, which is worse than two
 * honest breaks.
 */
export function reconcile(ours: OurLine[], theirs: TheirLine[]): Reconciliation {
  const oursTotal = ours.reduce((n, l) => n + l.amountCents, 0)
  const theirsTotal = theirs.reduce((n, l) => n + l.amountCents, 0)

  const theirsLeft = [...theirs]
  const breaks: Break[] = []
  let matched = 0

  const take = (pred: (t: TheirLine) => boolean): TheirLine | null => {
    const i = theirsLeft.findIndex(pred)
    return i === -1 ? null : theirsLeft.splice(i, 1)[0]
  }

  for (const o of ours) {
    // Reference match wins, even when the amount differs — that pairing
    // is the phone call, and losing it would file one real dispute as
    // two unrelated mysteries.
    const byRef = o.ref ? take((t) => !!t.ref && t.ref === o.ref) : null
    if (byRef) {
      if (byRef.amountCents === o.amountCents) {
        matched += o.amountCents
      } else {
        breaks.push({
          kind: 'AMOUNT_DIFFERS',
          amountCents: o.amountCents - byRef.amountCents,
          ref: o.ref,
          says:
            `${o.ref}: we say ${money(o.amountCents)}, they say ${money(byRef.amountCents)}. ` +
            `Same transaction, ${money(Math.abs(o.amountCents - byRef.amountCents))} apart — ` +
            `this one is a phone call, not a journal entry.`,
        })
      }
      continue
    }

    const byAmount = take((t) => t.amountCents === o.amountCents && t.on === o.on)
    if (byAmount) {
      matched += o.amountCents
      continue
    }

    breaks.push({
      kind: 'OURS_ONLY',
      amountCents: o.amountCents,
      ref: o.ref ?? null,
      says:
        `${money(o.amountCents)} on ${o.on}${o.ref ? ` (${o.ref})` : ''} is in our books ` +
        `and not on their statement. Usually timing — sent and not yet landed.`,
    })
  }

  for (const t of theirsLeft) {
    breaks.push({
      kind: 'THEIRS_ONLY',
      amountCents: t.amountCents,
      ref: t.ref ?? null,
      says:
        `${money(t.amountCents)} on ${t.on}${t.ref ? ` (${t.ref})` : ''} is on their statement ` +
        `and nowhere in ours. A charge nobody recorded, or their error — find out which.`,
    })
  }

  const difference = oursTotal - theirsTotal
  const explainedBy = breaks.reduce(
    (n, b) =>
      n + (b.kind === 'OURS_ONLY' ? b.amountCents : b.kind === 'THEIRS_ONLY' ? -b.amountCents : b.amountCents),
    0
  )
  const explained = explainedBy === difference

  return {
    oursCents: oursTotal,
    theirsCents: theirsTotal,
    differenceCents: difference,
    matchedCents: matched,
    breaks,
    explained,
    says:
      difference === 0 && breaks.length === 0
        ? `Reconciled to the cent: ${money(oursTotal)} both sides.`
        : explained
          ? `${money(Math.abs(difference))} apart, fully explained by ${breaks.length} named break${breaks.length === 1 ? '' : 's'}.`
          : `${money(Math.abs(difference))} apart and the named breaks do not fully explain it. ` +
            `Something is double-counted or missing on one side — do not sign this off.`,
  }
}

function money(cents: number): string {
  const n = Math.abs(cents) / 100
  return `${cents < 0 ? '-' : ''}$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
