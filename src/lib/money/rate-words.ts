/**
 * Which rung's word a rate is said in, and who employs a person, from the
 * reader's own end of the chain.
 *
 * ── Why ──────────────────────────────────────────────────────────────
 *
 * The second Tapin walk (2026-10-31). Tapin, a sub-vendor, employs Ravi
 * on a W2 and bills Brightmoor Staffing, the prime, which bills Northbend
 * Athletic. Two screens said the trade backwards:
 *
 *   - Brightmoor read "BILL RATE" over what it pays Tapin. One number on
 *     one sell line is Tapin's bill rate and Brightmoor's cost; the word
 *     belongs to the end the reader stands at.
 *   - Brightmoor read "Brightmoor employs Ravi". It buys Ravi's time from
 *     Tapin; Tapin holds the W2. A firm employs a person only where its
 *     own buy line pays them by payroll, and a firm with no buy line on
 *     the record has said nothing about employment at all.
 *
 * Pure: no database, no React. The screens that say these sentences
 * read them from here.
 */

/** A sell line as a rate on it is read: who sells it, who pays it. */
export interface RatedLine {
  sellerId: string
  sellerName: string
  buyerId: string
  buyerName: string
}

export interface RateWord {
  /** The column or field label: "Bill rate" to the seller, "What you pay" to the buyer. */
  label: string
  /** The rung said in a sentence: "You bill Brightmoor Staffing" · "Tapin bills you". */
  says: string
}

/**
 * What the rate on a sell line is called, read from `readerCompanyId`'s
 * end. The seller bills at it; the buyer pays it. A reader at neither end
 * (a client reading the top rung through a seat, a site that is not the
 * payer) reads the neutral word and the two names.
 */
export function rateWordFor(line: RatedLine, readerCompanyId: string | null): RateWord {
  if (readerCompanyId && readerCompanyId === line.sellerId) {
    return { label: 'Bill rate', says: `You bill ${line.buyerName}` }
  }
  if (readerCompanyId && readerCompanyId === line.buyerId) {
    return { label: 'What you pay', says: `${line.sellerName} bills you` }
  }
  return { label: 'Rate', says: `${line.sellerName} bills ${line.buyerName}` }
}

/** "Ravi" from "Ravi Kumar"; the whole name where there is one word. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

/**
 * The chain under one firm's line for a person, in one sentence, or null
 * where the record says nothing about it.
 *
 *   buyLine      this firm's own buy line for the person: whom it pays.
 *                A vendor named on it means the firm buys the person's
 *                time from that vendor; no vendor means the firm pays
 *                them by payroll, which is employment.
 *   firmBelow    the firm below this one on the person's chain, where the
 *                record has one and the buy line does not name it.
 *
 * With neither, nothing is claimed: an absence of a buy line is not
 * employment, the same way a placement with no cost behind it has no
 * margin rather than a perfect one.
 */
export function chainUnderSays(a: {
  firmName: string
  personName: string
  buyLine: { vendorName: string | null } | null
  firmBelow?: string | null
}): string | null {
  const who = firstName(a.personName)
  const vendor = a.buyLine?.vendorName ?? null
  if (a.buyLine && vendor) return `${a.firmName} buys ${who}’s time from ${vendor}.`
  if (a.buyLine && !vendor && !a.firmBelow) return `${a.firmName} employs ${who} directly.`
  if (a.firmBelow) return `${a.firmName} buys ${who}’s time from ${a.firmBelow}.`
  return null
}
