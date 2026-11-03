/**
 * What a firm is told when it sends a document request again: "Sent
 * again" only where an email actually left (release walk three,
 * 2026-11-03: Brightmoor's HR read "Sent again to
 * rajesh.iyer@seed.etyme.invalid" on a deployment with no email key).
 *
 * An email leaves only where the deployment has a sender
 * (`mailLeaves`) and the address is not a reserved demo one
 * (`demoAddress`). Anywhere else the sentence says so, and that the link
 * is kept on the notices of whoever pressed Send again, so they pass it
 * on themselves; and where the person has an account, that they read it
 * in Etyme when they sign in, because that notice is written either way.
 *
 * Pure: the caller says whether mail leaves and whether the person has an
 * account; nothing here reads the environment or the database.
 */
import { demoAddress } from '@/lib/notification-delivery'
import { NO_MAIL_HERE } from './mail-leaves'

export interface ResentFacts {
  /** `mailLeaves()` on this deployment. */
  leaves: boolean
  /** The address the request went to. */
  address: string
  /** Whether that address belongs to somebody with an Etyme account, who is told in Etyme too. */
  hasAccount: boolean
  /** "the I-9 and the NDA". */
  waitingOn: string
  /** "Dec 3, 2026": the day the link closes. */
  until: string
}

/** Whether the email itself goes: a sender here, and an address that can receive it. */
export function resendEmailLeaves(f: Pick<ResentFacts, 'leaves' | 'address'>): boolean {
  return f.leaves && !demoAddress(f.address)
}

/** The one sentence the firm reads after Send again. */
export function resentSays(f: ResentFacts): string {
  if (resendEmailLeaves(f)) {
    return `Sent again to ${f.address}, waiting on ${f.waitingOn}. The link is open until ${f.until}.`
  }
  const why = f.leaves
    ? `${f.address} is a demo address, so no email went to it`
    : `${NO_MAIL_HERE}, so no email went to ${f.address}`
  const inApp = f.hasAccount ? ' They read it in Etyme when they sign in.' : ''
  return `${why}. The link is kept on your notices: send it to them yourself. It is open until ${f.until}, waiting on ${f.waitingOn}.${inApp}`
}
