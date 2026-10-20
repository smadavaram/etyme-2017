/**
 * The one-time approval link, handed to the person who asked for it when
 * this deployment cannot email it (simulation, 2026-10-20).
 *
 * `POST /api/week-approvals` mints a link for the client's approver and
 * emails it. With no email key set up, the email does not leave, and the
 * link was thrown away: nobody could ever open it, so no firm before its
 * email was set up — and no simulation — could use "Approve by email" at
 * all. The person who asked for it is the one who would forward it, so the
 * link goes back to them, said plainly, and only then.
 *
 * Never where email is set up: there the link goes to the approver and
 * only to the approver, because a link that works once is the approver's
 * signature, and a copy in the sender's hands is a way to sign for them.
 * A send that was attempted and failed is not "no email": it is retried
 * by asking again, and the link stays out of the answer.
 *
 * Pure. The route reads whether email is set up and writes the log.
 */
export interface HandBack {
  /** The link itself. */
  link: string
  /** What the person reads beside it. */
  says: string
}

export function linkHandedBack(input: { emailSetUp: boolean; url: string; approverName: string }): HandBack | null {
  if (input.emailSetUp) return null
  return {
    link: input.url,
    says:
      `Email is not set up here, so the link was not sent to ${input.approverName}. ` +
      `Here it is for you to send them yourself. It works once, and only for this week.`,
  }
}
