/**
 * Somebody the client's own team already knows.
 *
 * ── The gap this closes ──────────────────────────────────────────────
 *
 * The contractor register is built from submissions. That is right: a
 * person is on it because a firm put them in front of this client, and
 * the alternative — a list of whatever somebody typed in — is the empty
 * People tab all over again.
 *
 * It leaves out the case a hiring manager hits most often, which is
 * somebody they already know. The analyst who finished here last year.
 * A referral from a colleague. A name from a conference. Every one of
 * them is refused by "Ask for them" with *that person has not been put
 * in front of you*, which is true, and useless, and sends the
 * conversation back to email — the workaround trap.
 *
 * ── What it may not become ───────────────────────────────────────────
 *
 * Not a bench. Etyme places nobody, and the client must never be the
 * one employing them — co-employment is the exposure this whole product
 * exists to measure, and a client that hires direct through a tool its
 * suppliers also use has been handed the worst of both.
 *
 * So an invitation always ends with a *supplier* holding the paper, and
 * there are exactly three ways it can. All three are offered and all
 * three are honored, because a form whose answer is thrown away is its
 * own bug:
 *
 *   ON_BENCH   they are already on a supplier this client has approved
 *              — that supplier is asked, on the thread for the role
 *   OTHER_FIRM they name a firm this client does not have — the firm
 *              walks the four desks, recommended by whoever invited them
 *   NOBODY     nobody represents them — the client picks one of its own
 *              approved suppliers to take them on
 *
 * Until one of those settles, they sit on Contractors as Pending with
 * the step in words, exactly as a firm does on Suppliers.
 */

export const INVITE_STATES = [
  'ASKED',
  'NEEDS_SUPPLIER',
  'REPRESENTED',
  'JOINED',
  'DECLINED',
  'WITHDRAWN',
] as const
export type InviteState = (typeof INVITE_STATES)[number]

/** What the client reads on the row. Their words, never the state name. */
export const STATE_WORD: Record<InviteState, string> = {
  ASKED: 'Asked',
  NEEDS_SUPPLIER: 'Needs a supplier',
  REPRESENTED: 'With their supplier',
  JOINED: 'On your network',
  DECLINED: 'Not interested',
  WITHDRAWN: 'Withdrawn',
}

/** How they answered the one question that decides the routing. */
export type Represents = 'ON_BENCH' | 'OTHER_FIRM' | 'NOBODY'

export interface Answer {
  interested: boolean
  represents: Represents | null
  /** The firm they named, when it is not one this client already has. */
  firmName: string | null
  /** The firm they picked, when it is. */
  firmCompanyId: string | null
  note: string | null
  at: string
}

export interface Invite {
  state: InviteState
  name: string
  answer: Answer | null
  supplierName: string | null
}

/**
 * What is happening, and what the client does next — one sentence each.
 *
 * A code is for the machine. Somebody reading a queue of eight people
 * needs to know which of them is waiting on *them*.
 */
export function says(invite: Invite): { now: string; next: string | null } {
  const first = invite.name.split(' ')[0]
  switch (invite.state) {
    case 'ASKED':
      return {
        now: `${first} has been sent a link and has not answered yet.`,
        next: null,
      }
    case 'NEEDS_SUPPLIER': {
      // Two answers land here and they need different words. A firm
      // this client does not have is a procurement decision — the
      // client starts the four desks, never the contractor, or naming
      // a firm on the link would be a way to put it into somebody
      // else's supplier pipeline.
      const named = invite.answer?.firmName
      if (named) {
        return {
          now: `${first} is represented by ${named}, which is not one of your suppliers.`,
          next: `Recommend ${named} as a supplier and it walks your desks, or pick one of your own firms to take ${first} on.`,
        }
      }
      return {
        now: `${first} is interested and no firm represents them.`,
        next: `Pick one of your suppliers to take ${first} on. You contract through suppliers, not directly.`,
      }
    }
    case 'REPRESENTED':
      return {
        now: invite.supplierName
          ? `${invite.supplierName} represents ${first} and has been asked to put them forward.`
          : `${first} named a firm you do not have yet. It is walking your supplier desks.`,
        next: null,
      }
    case 'JOINED':
      return { now: `${first} has been put forward and is on your network.`, next: null }
    case 'DECLINED':
      return { now: `${first} is not looking at the moment.`, next: null }
    case 'WITHDRAWN':
      return { now: `This ask was withdrawn.`, next: null }
  }
}

export type Step = { label: string; status: 'done' | 'now' | 'next' | 'off' }

/** The row's progress, the way the supplier chain shows its four desks. */
export function stepsOf(state: InviteState): Step[] {
  if (state === 'DECLINED' || state === 'WITHDRAWN') {
    return [
      { label: 'Asked', status: 'done' },
      { label: state === 'DECLINED' ? 'Not interested' : 'Withdrawn', status: 'now' },
      { label: 'Represented', status: 'off' },
      { label: 'On your network', status: 'off' },
    ]
  }
  const order: InviteState[] = ['ASKED', 'NEEDS_SUPPLIER', 'REPRESENTED', 'JOINED']
  const labels = ['Asked', 'Answered', 'Represented', 'On your network']
  // NEEDS_SUPPLIER and REPRESENTED are both "answered"; the difference
  // is whether a firm is holding them, which the next step carries.
  const at = state === 'NEEDS_SUPPLIER' ? 1 : order.indexOf(state)
  return labels.map((label, i) => ({
    label,
    status: i < at ? 'done' : i === at ? 'now' : 'next',
  }))
}

export type Verdict = { ok: true } | { ok: false; code: string; message: string }

/**
 * Whether this client may ask this person at all.
 *
 * Blocked is a block: a person the client barred does not come back
 * through a side door, and the refusal says so rather than failing
 * quietly. Somebody already on the register does not need an
 * invitation — they need "Ask for them", and the refusal says which.
 */
export function mayInvite(input: {
  email: string
  name: string
  blockedReason: string | null
  alreadyOnRegister: boolean
  openInviteState: InviteState | null
}): Verdict {
  const first = input.name.split(' ')[0] || 'They'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return {
      ok: false,
      code: 'EMAIL',
      message: 'An email address is how they hear about this. Check the one you typed.',
    }
  }
  if (input.blockedReason) {
    return {
      ok: false,
      code: 'BLOCKED',
      message:
        `${input.name} is blocked here — ${input.blockedReason.replace(/\.$/, '')}. ` +
        'Lift the block first, then ask them.',
    }
  }
  if (input.alreadyOnRegister) {
    return {
      ok: false,
      code: 'ALREADY_HERE',
      message:
        `${input.name} is already on your network — a supplier has put them in front of you. ` +
        'Open their page and use "Ask for them" instead.',
    }
  }
  if (input.openInviteState && input.openInviteState !== 'WITHDRAWN' && input.openInviteState !== 'DECLINED') {
    return {
      ok: false,
      code: 'ALREADY_ASKED',
      message: `${first} has already been asked. Read where it got to on Contractors, under Pending.`,
    }
  }
  return { ok: true }
}

/**
 * Where an answer takes it.
 *
 * Only a firm the client has already approved carries it straight
 * through. A firm the client does not have is not a shortcut into its
 * supplier register — that register is what Procurement, HR and Finance
 * spent four desks deciding — so it waits for the client the same way
 * "nobody represents me" does.
 */
export function stateAfterAnswer(answer: {
  interested: boolean
  represents: Represents | null
}): InviteState {
  if (!answer.interested) return 'DECLINED'
  return answer.represents === 'ON_BENCH' ? 'REPRESENTED' : 'NEEDS_SUPPLIER'
}

/** A link is dead once the ask is settled, the same rule the supplier link follows. */
export function linkIsOpen(state: InviteState): boolean {
  return state === 'ASKED'
}
