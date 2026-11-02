import { NO_MAIL_HERE } from '@/lib/notify/mail-leaves'

/**
 * The line over the ask form. "They hear from you by email" only where an
 * email can leave; where none can, the ask shows in Etyme and they are
 * not told (the Tapin walks: the line promised a letter on a deployment
 * that could send none). Until the route has answered, no promise.
 */
export function askFormSays(mail: boolean | null): string {
  const who = 'Somebody you have worked with, or been referred.'
  if (mail === true) return `${who} They hear from you by email.`
  if (mail === false) return `${who} The ask shows in Etyme. ${NO_MAIL_HERE}, so they are not told yet.`
  return who
}
