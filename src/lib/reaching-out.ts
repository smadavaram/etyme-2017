/**
 * What we say to a company that has never heard of us.
 *
 * The whole "bring your network" motion rests on one email landing well.
 * A supplier who opens it and sees a platform invitation deletes it; a
 * supplier who sees that a client sent them a role opens the link.
 *
 * So the subject line names the client and the role, never the product.
 * "Calder Manufacturing sent you a role" gets opened. "You have been
 * invited to Etyme" does not, and the difference is the whole business.
 *
 * ── Why the text is here and not in the route ────────────────────────
 *
 * Because it is the part most likely to be wrong and the part easiest to
 * test. A route that builds its own strings gets them changed by
 * whoever is nearest, and nobody notices the day it starts saying
 * something worse.
 */

export interface Invite {
  supplierName: string
  contactName: string | null
  clientName: string
  /** Roles already waiting for them. Zero is a real and different case. */
  rolesWaiting: number
  /** The first role's title, where there is one. */
  firstRole: string | null
  claimUrl: string
}

export interface Letter {
  subject: string
  body: string
}

/**
 * The invitation itself.
 *
 * Short on purpose. A recruiter reads the subject, the first line, and
 * the link — everything after that is for the two per cent who want to
 * know what they are clicking, and it is three sentences for them.
 */
export function inviteLetter(i: Invite): Letter {
  const hello = i.contactName ? `${i.contactName.split(' ')[0]},` : 'Hello,'

  const subject =
    i.rolesWaiting > 0 && i.firstRole
      ? `${i.clientName}: ${i.firstRole}`
      : `${i.clientName} added ${i.supplierName} to their supplier list`

  const opening =
    i.rolesWaiting === 0
      ? `${i.clientName} has added ${i.supplierName} to their supplier list on Etyme. ` +
        `Their roles will come straight to you as they open.`
      : i.rolesWaiting === 1
        ? `${i.clientName} has sent ${i.supplierName} a role: ${i.firstRole}.`
        : `${i.clientName} has sent ${i.supplierName} ${i.rolesWaiting} roles, ` +
          `starting with ${i.firstRole}.`

  const body = [
    hello,
    '',
    opening,
    '',
    i.rolesWaiting > 0
      ? 'You can answer it from this link — paste a CV and send. No account to set up, no bench to build first:'
      : 'Take your account here so their roles reach you:',
    i.claimUrl,
    '',
    'Etyme is where they manage their contract staff. Your bench, your rates and',
    'your client relationships stay yours, they are not shared with other suppliers,',
    'and you can export everything whenever you want.',
    '',
    `If this is not the right person at ${i.supplierName}, forward it on — the link`,
    'only works for an address at your own company.',
  ].join('\n')

  return { subject, body }
}

/**
 * The nudge, a few days later.
 *
 * Sent once and only where nothing came back. A second chase reads as a
 * mailing list, and the whole point is that this is not one.
 */
export function nudgeLetter(i: Invite): Letter {
  return {
    subject: `Still open: ${i.firstRole ?? 'a role'} at ${i.clientName}`,
    body: [
      i.contactName ? `${i.contactName.split(' ')[0]},` : 'Hello,',
      '',
      `${i.clientName} is still looking for somebody on ${i.firstRole ?? 'this role'}, ` +
        `and nothing has come from ${i.supplierName} yet.`,
      '',
      'Answer it here, or decline it — a decline is genuinely useful to them and',
      'takes one click:',
      i.claimUrl,
      '',
      'If it is not one you can fill, saying so is worth more to them than silence,',
      'and it counts in your favour rather than against it.',
    ].join('\n'),
  }
}

/** How long before a nudge is worth sending. */
export const NUDGE_AFTER_DAYS = 3

/**
 * Whether to nudge at all.
 *
 * Never twice, never before the client has actually sent them something,
 * and never once they have answered. Each of those produces an email
 * somebody resents, and resentment is expensive on a channel this thin.
 */
export function shouldNudge(
  invite: { sentAt: Date; remindedAt: Date | null; state: string },
  rolesWaiting: number,
  submissionsReceived: number,
  now: Date
): { yes: boolean; why: string } {
  if (invite.state === 'ACCEPTED') return { yes: false, why: 'They already took the account.' }
  if (invite.remindedAt) return { yes: false, why: 'Already nudged once. Twice is a mailing list.' }
  if (rolesWaiting === 0) return { yes: false, why: 'Nothing is waiting for them to answer.' }
  if (submissionsReceived > 0) return { yes: false, why: 'They have already sent somebody.' }

  const days = (now.getTime() - invite.sentAt.getTime()) / 86_400_000
  if (days < NUDGE_AFTER_DAYS) {
    return { yes: false, why: `Sent ${Math.floor(days)} days ago. Give it ${NUDGE_AFTER_DAYS}.` }
  }

  return { yes: true, why: `${Math.floor(days)} days, a role waiting, and nothing back.` }
}
