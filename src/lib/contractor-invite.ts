import { NO_MAIL_HERE } from '@/lib/notify/mail-leaves'

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
 *
 * `mail` is whether an email can leave this deployment (`mailLeaves` in
 * lib/notify/mail-leaves), asked by every caller rather than assumed:
 * the row said "has been sent a link" on a deployment where nothing could
 * be sent (the Tapin walks), and the hiring manager waited on an answer
 * from somebody who had never heard of the ask.
 */
export function says(invite: Invite, opts: { mail: boolean }): { now: string; next: string | null } {
  const first = invite.name.split(' ')[0]
  switch (invite.state) {
    case 'ASKED':
      return {
        now: opts.mail
          ? `${first} has been sent a link and has not answered yet.`
          : `The ask for ${first} shows in Etyme. ${NO_MAIL_HERE}, so ${first} has not been sent the link.`,
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
          next: `Recommend ${named} as a supplier and it goes through your approvals, or pick one of your own firms to take ${first} on.`,
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
          : `${first} named a firm you do not have yet. It is going through your supplier approvals.`,
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

/**
 * What the hiring manager reads the moment the ask is made.
 *
 * "Will hear from you by email" only where the letter went: an email can
 * leave this deployment and the provider took it. Where none can leave,
 * the ask is saved and shows in Etyme, and the sentence says the person
 * has not been told; where one could and this one did not go, it says why.
 */
export function askedSays(a: { first: string; companyName: string; sent: boolean; mail: boolean; note?: string | null }): string {
  const after =
    `${a.companyName} contracts through suppliers, so when they answer you will ` +
    `either see the firm that represents them, or be asked to pick one to take them on.`
  if (a.sent) return `${a.first} has been asked, and will hear from you by email. ${after}`
  if (!a.mail) return `The ask for ${a.first} is saved and shows in Etyme. ${NO_MAIL_HERE}, so ${a.first} has not been told. ${after}`
  const why = (a.note ?? '').trim().replace(/[.\s]+$/, '')
  return `The ask for ${a.first} is saved and shows in Etyme, but the email did not go${why ? `: ${why}` : ''}. ${after}`
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

/**
 * Which of the client's own suppliers may take somebody on, and why not.
 *
 * The approval is the act: a firm the client approved, through onboarding
 * or by holding it on its register, is offered whether or not Procurement
 * has set its standing yet. A standing is set later from Suppliers, and
 * null means nobody has rated the firm, never that it is not approved
 * (the coordinator's call, 2026-11-03, reversible by the founder in a
 * sentence). Only a firm explicitly on probation, still a prospect, or
 * blocked is held back, and each says why in a sentence beside its name,
 * because a choice greyed out with no reason is the fault the founder's
 * tester found.
 *
 * The screen's picker, the PATCH route's `pick` and the person's own link
 * all read this one rule, so the three cannot disagree.
 */
export type SupplierChoice = { offered: true; why: null } | { offered: false; why: string }

export function supplierChoice(f: {
  name: string
  tier: string | null
  status: string | null
  /** Whether a live block stands on the firm here, with its reason where one was given. */
  blocked: boolean
  blockedReason: string | null
}): SupplierChoice {
  if (f.blocked || f.status === 'BLOCKED') {
    const why = (f.blockedReason ?? '').trim().replace(/[.\s]+$/, '')
    return { offered: false, why: `${f.name} is blocked here${why ? `: ${why}` : ''}. Lift the block under Suppliers first.` }
  }
  if (f.tier === 'PROBATION') {
    return { offered: false, why: `${f.name} is on probation; Procurement sets its standing under Suppliers.` }
  }
  if (f.status === 'PROSPECT') {
    return { offered: false, why: `${f.name} is not approved yet; it goes through your supplier approvals under Suppliers.` }
  }
  return { offered: true, why: null }
}

/** Said where the client has no supplier that may take somebody on. */
export const NO_SUPPLIER_TO_PICK = 'No approved suppliers yet. Approve one under Suppliers, then ask.'
