/**
 * What a placement with no buy line says, and the door that writes one.
 *
 * The tester's retest of 2026-11-03: Rajesh Iyer's placement at Northbend
 * read "No buy line behind this placement" and offered nothing, so no pay
 * line, no week and no bill could follow. The award writes no pay line
 * where nobody has said what the firm pays the person (`buySide` in
 * lib/award): a rate the award invented would be a number nobody stands
 * behind, and a $0 line says the firm employs the person for nothing. The
 * line is written on the terms page instead, where the firm's contract
 * manager states the pay (an employee is told, not asked) — and nothing
 * on the placement led there. This is that lead.
 *
 * Pure: the route reads the facts, this decides the words and the door.
 */

export interface PayLineFacts {
  /** The reader's side of the line: only the firm that pays the person reads its pay line. */
  readerIsSupplier: boolean
  /** A buy line is linked behind this placement. */
  hasBuyLine: boolean
  /** The terms' own sentence (`termsOnRecordFor`), where hop 0 is not on record. */
  termsSays: string | null
  /** Whether hop 0 is on record. */
  onRecord: boolean
  /** The reader's firm is the one that holds the person (hop 0). */
  readerIsHopZeroFirm: boolean
  /** The reader holds the contract manager's permission there. */
  readerHoldsContractDesk: boolean
  /** The submission the hop-0 firm made, whose terms page states the pay. */
  hopZeroSubmissionId: string | null
  personName: string
  firmName: string
}

export interface PayLineView {
  /** Null where there is nothing to say: a buy line stands, or the reader is not the supplier. */
  says: string | null
  door: { href: string; label: string } | null
}

export function payLineView(f: PayLineFacts): PayLineView {
  if (!f.readerIsSupplier || f.hasBuyLine) return { says: null, door: null }
  const why = f.termsSays ?? `${f.firmName} has not said how it engages ${f.personName} or what it pays them.`
  const lead = `No buy line behind this placement, so there is no pay line to run payroll from and no week to bill. ${why}`
  if (f.readerIsHopZeroFirm && f.hopZeroSubmissionId && !f.onRecord) {
    if (f.readerHoldsContractDesk) {
      return { says: lead, door: { href: `/dashboard/submissions/${f.hopZeroSubmissionId}/terms`, label: `State ${f.personName}’s pay` } }
    }
    // The terms route's own words for a seat without the desk.
    return { says: `${lead} Stating ${f.personName}’s terms is for the contract manager at ${f.firmName}.`, door: null }
  }
  return { says: lead, door: null }
}
