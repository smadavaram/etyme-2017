import { notify } from '@/lib/notify'
import { emailSender } from '@/lib/senders'
import { formatDay } from '@/lib/format-date'
import { PASSWORD_NOTICE_TITLES } from '@/lib/password-words'

/**
 * Telling a person a password was set or changed on their account: in the
 * app always, and by email where email leaves this deployment. A notice of
 * its own rather than the password door's account mail, because the person
 * may not be the one who did it, and the app is where they will see it.
 * Never carries the password, never a link, and never a reason to undo the
 * change: a notice that cannot be written is let go.
 *
 * Two ways a password is set (2026-11-16): from the account menu while
 * signed in (fault 5, 2026-11-12), and from a one-time link (a reset, an
 * invitation, a firm's sign-in link, a link Etyme's staff issued). Before,
 * only the menu told her, so a password set from a link that reached the
 * wrong hands was set in silence.
 */
export type PasswordSetFrom =
  | { by: 'MENU' }
  /** `firmName`: the firm whose seat the link was made for; null for her own "Forgot your password". */
  | { by: 'LINK'; firmName: string | null }

/** What the notice says. Pure, so every sentence is a test. */
export function passwordNoticeSays(a: { changed: boolean; on: Date; from: PasswordSetFrom; mailLeaves: boolean }): { title: string; body: string } {
  const title = a.changed ? PASSWORD_NOTICE_TITLES.changed : PASSWORD_NOTICE_TITLES.set
  const what = a.changed ? 'Your password was changed' : 'A password was set'
  if (a.from.by === 'MENU') {
    return {
      title,
      body:
        `${what} on ${formatDay(a.on)} from your account menu. ` +
        'If this was not you, sign in, choose a new password, sign out everywhere, and write to support@etyme.com.',
    }
  }
  const how = a.from.firmName
    ? `using a one-time link for your seat at ${a.from.firmName}`
    : 'using a one-time link sent to your email'
  // "Forgot your password" needs email to leave; where it cannot, staff reset it.
  const ifNotYou = a.mailLeaves
    ? 'If this was not you, choose Forgot your password on the sign-in page to set a new one, and write to support@etyme.com.'
    : 'If this was not you, write to support@etyme.com and ask for your password to be reset.'
  return { title, body: `${what} on your Etyme account on ${formatDay(a.on)}, ${how}. ${ifNotYou}` }
}

export async function tellPasswordSet(
  personId: string,
  changed: boolean,
  now: Date = new Date(),
  from: PasswordSetFrom = { by: 'MENU' },
): Promise<void> {
  try {
    const mailLeaves = emailSender() !== null
    const { title, body } = passwordNoticeSays({ changed, on: now, from, mailLeaves })
    await notify({ personId, type: 'SYSTEM', title, body, channel: mailLeaves ? 'EMAIL' : 'IN_APP' })
  } catch {
    // The password is set; a notice that could not be written does not change that.
  }
}
