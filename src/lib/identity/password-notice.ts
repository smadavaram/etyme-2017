import { notify } from '@/lib/notify'
import { emailSender } from '@/lib/senders'
import { formatDay } from '@/lib/format-date'

/**
 * Telling a person a password was set or changed on their account from
 * the account menu (fault 5, 2026-11-12): in the app always, and by email
 * where email leaves this deployment. A notice of its own rather than the
 * password door's account mail, because the person may not be the one
 * who did it, and the app is where they will see it. Never carries the
 * password, never a link, and never a reason to undo the change: a
 * notice that cannot be written is let go.
 */
export async function tellPasswordSet(personId: string, changed: boolean, now: Date = new Date()): Promise<void> {
  try {
    await notify({
      personId,
      type: 'SYSTEM',
      title: changed ? 'Your Etyme password was changed' : 'A password was set on your Etyme account',
      body:
        `${changed ? 'Your password was changed' : 'A password was set'} on ${formatDay(now)} from your account menu. ` +
        'If this was not you, sign in, choose a new password, sign out everywhere, and write to support@etyme.com.',
      channel: emailSender() !== null ? 'EMAIL' : 'IN_APP',
    })
  } catch {
    // The password is set; a notice that could not be written does not change that.
  }
}
