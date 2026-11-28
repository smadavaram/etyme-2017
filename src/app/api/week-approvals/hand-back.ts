/**
 * What "Approve by email" answers when this deployment cannot email the
 * link (walks fdg and fdf, 2026-11-14).
 *
 * No one-time link or token is ever shown, copied, returned in a reply or
 * logged: a link that works once is the approver's signature, and a copy
 * in the sender's hands is a way to sign for them. So where no email can
 * leave, the reply says nothing was sent and that email must be set up
 * first, and carries no link.
 *
 * The one exception is the simulation and the tests, which have no
 * mailbox to read a link out of (simulation, 2026-10-20). They set
 * `ETYME_TEST_HANDS_BACK_APPROVAL_LINKS=1`. It is off by default, it is
 * never set on a deployment, and it is ignored on Vercel's production.
 *
 * Pure. The route reads whether email is set up and writes the log.
 */
export interface HandBack {
  /** The link itself, only where the test switch is on. */
  link: string | null
  /** What the person reads. */
  says: string
}

export const HAND_BACK_SWITCH = 'ETYME_TEST_HANDS_BACK_APPROVAL_LINKS'

type Env = Record<string, string | undefined>

/** Whether the simulation or a test asked for the link in the reply. Never on production. */
export function handsBackLinks(env: Env = process.env): boolean {
  return env[HAND_BACK_SWITCH] === '1' && env.VERCEL_ENV !== 'production'
}

export function notSentSays(approverName: string): string {
  return `Nothing was sent to ${approverName}, because email is not set up here. Set up email first, or attach the approval instead.`
}

export function linkHandedBack(input: { emailSetUp: boolean; url: string; approverName: string; env?: Env }): HandBack | null {
  if (input.emailSetUp) return null
  return { link: handsBackLinks(input.env) ? input.url : null, says: notSentSays(input.approverName) }
}
