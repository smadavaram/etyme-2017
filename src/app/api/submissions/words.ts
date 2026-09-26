/**
 * Why the submit door said no, in a sentence a recruiter can act on.
 *
 * The door answered `Requirement is DRAFT, not OPEN` — two machine
 * states in one line, and the second half of it a lie of omission: a
 * requisition sitting at DRAFT with its approval chain running is not a
 * draft anybody forgot to publish, it is a role three desks are still
 * reading. A supplier told "DRAFT" chases the client to publish
 * something the client cannot publish yet.
 *
 * CLAUDE.md: "A refusal says what is missing and what to do — never
 * `DOCUMENTS_BLOCK`. The code is for the machine; the sentence is the
 * product." So the code stays, and it gets narrower rather than wider:
 * NOT_OPEN said nothing about which of five situations the caller was
 * in, and the reasons are the one asset nobody can buy — a year of
 * NOT_PUBLISHED is a different fact about a client from a year of
 * ALREADY_FILLED.
 *
 * Beside the route rather than in src/lib because a new lib file needs
 * an owner adding in src/lib/domains.ts, which is the architect's call.
 * No database and no clock in here, so the tests run it directly.
 */

export interface DoorRefusal {
  /** The reason code. Machine-readable, countable, never free text. */
  code:
    | 'NOT_PUBLISHED'
    | 'AWAITING_APPROVAL'
    | 'CHANGES_WANTED'
    | 'ALREADY_FILLED'
    | 'WITHDRAWN'
    | 'CLOSED'
  /** What a person reads. */
  message: string
}

export interface DoorRow {
  title: string
  /** DRAFT · OPEN · FILLED · CLOSED · CANCELLED */
  status: string
  /** DRAFT · PENDING_APPROVAL · CHANGES_REQUESTED · APPROVED · AUTO_APPROVED · REJECTED */
  approvalState?: string | null
  /** Whose role it is, for the sentence. */
  buyerName?: string | null
  /** Present where the client said why it called the role off. */
  cancelReason?: string | null
}

/**
 * Why a role that is not open is not open — or null when it is.
 *
 * The approval state is read before the lifecycle status on a role that
 * has not been published, because it is the more useful of the two: the
 * status only says "not yet", and the approval state says who has it and
 * therefore how long "not yet" is likely to last.
 *
 * A published role that went back through approval keeps its own
 * sentence at the door (the PAUSED case in the route), because that one
 * is about a role the supplier is already working and has already been
 * told about.
 */
export function whyNotOpen(r: DoorRow): DoorRefusal | null {
  const status = String(r.status ?? '').toUpperCase()
  const approval = String(r.approvalState ?? '').toUpperCase()
  const buyer = r.buyerName?.trim() || 'the client'

  if (status === 'OPEN') return null

  if (status === 'FILLED') {
    return {
      code: 'ALREADY_FILLED',
      message:
        `${r.title} has been filled. Nothing more can be put forward for it — ` +
        'anybody you submitted has been told where they stand.',
    }
  }

  if (status === 'CANCELLED') {
    return {
      code: 'WITHDRAWN',
      message:
        `${buyer} withdrew ${r.title}` +
        (r.cancelReason ? `: ${r.cancelReason}.` : '.') +
        ' Nothing more can be put forward for it.',
    }
  }

  if (status === 'CLOSED') {
    // Two ways a role reaches CLOSED, and they are different news: an
    // approver refused it, or it was settled and taken off the list.
    if (approval === 'REJECTED') {
      return {
        code: 'CLOSED',
        message:
          `${r.title} was turned down inside ${buyer} and never opened. ` +
          'If it comes back it will reach you as a new role.',
      }
    }
    return {
      code: 'CLOSED',
      message:
        `${r.title} is closed. It is no longer being worked, so nothing more ` +
        'can be put forward for it.',
    }
  }

  // Everything left is a role that has not reached the market yet.
  if (approval === 'PENDING_APPROVAL') {
    return {
      code: 'AWAITING_APPROVAL',
      message:
        `${r.title} has not been published yet — it is still going through ` +
        `approval at ${buyer}. You will be told when it opens.`,
    }
  }

  if (approval === 'CHANGES_REQUESTED') {
    return {
      code: 'CHANGES_WANTED',
      message:
        `${r.title} has not been published yet — an approver at ${buyer} sent it ` +
        'back for changes. You will be told when it opens.',
    }
  }

  return {
    code: 'NOT_PUBLISHED',
    message:
      `${r.title} has not been published yet. ${buyer} has not released it to ` +
      'any supplier, so there is nothing to answer.',
  }
}
