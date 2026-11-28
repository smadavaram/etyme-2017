/**
 * Public-sector proposals (record 124, plugin 5): who may move a proposal
 * where. Pure. The agent drafts and chases; a person approves; a person
 * says they sent it. Etyme sends nothing, so SUBMITTED is only ever a
 * person's note that it happened outside.
 */

export type ProposalState = 'DRAFT' | 'NEEDS_PIECES' | 'READY_FOR_PERSON' | 'APPROVED' | 'SUBMITTED'
export type Mover = 'AGENT' | 'PERSON'

export const PIECE_KINDS = ['BENCH', 'COMPLIANCE', 'RATES', 'PAST_PERFORMANCE'] as const

/** What each mover may move a proposal to. The agent's list has no APPROVED and no SUBMITTED. */
const MOVES: Record<Mover, Partial<Record<ProposalState, readonly ProposalState[]>>> = {
  AGENT: {
    DRAFT: ['NEEDS_PIECES', 'READY_FOR_PERSON'],
    NEEDS_PIECES: ['READY_FOR_PERSON'],
    READY_FOR_PERSON: ['NEEDS_PIECES'],
  },
  PERSON: {
    DRAFT: ['NEEDS_PIECES', 'READY_FOR_PERSON'],
    NEEDS_PIECES: ['READY_FOR_PERSON'],
    READY_FOR_PERSON: ['NEEDS_PIECES', 'APPROVED'],
    APPROVED: ['SUBMITTED', 'READY_FOR_PERSON'],
  },
}

export function mayMove(by: Mover, from: ProposalState, to: ProposalState): boolean {
  return (MOVES[by][from] ?? []).includes(to)
}

/** A sentence for a refused move, or null where it is allowed. */
export function moveRefusal(by: Mover, from: ProposalState, to: ProposalState, missingPieces = 0): string | null {
  if (by === 'AGENT' && (to === 'APPROVED' || to === 'SUBMITTED')) {
    return 'The agent drafts and chases. A person approves, and a person sends it to the agency.'
  }
  if (!mayMove(by, from, to)) return `A proposal that is ${from.toLowerCase().replace(/_/g, ' ')} cannot go to ${to.toLowerCase().replace(/_/g, ' ')}.`
  if (to === 'APPROVED' && missingPieces > 0) {
    return `${missingPieces} ${missingPieces === 1 ? 'piece is' : 'pieces are'} still missing. Get ${missingPieces === 1 ? 'it' : 'them'} into the record, then approve.`
  }
  return null
}

/** What the state says to a person who has not seen Etyme before. */
export function stateSays(s: ProposalState): string {
  switch (s) {
    case 'DRAFT': return 'Draft'
    case 'NEEDS_PIECES': return 'Waiting on pieces'
    case 'READY_FOR_PERSON': return 'Ready for your yes'
    case 'APPROVED': return 'Approved, not yet sent'
    case 'SUBMITTED': return 'Sent to the agency'
  }
}
