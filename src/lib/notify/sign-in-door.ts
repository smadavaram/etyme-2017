import { sign, read } from '@/lib/signed-link'
import { mailedUrl } from '@/lib/app-url'

/**
 * The sign-in door's link: `/answer/sign-in/<token>`, signed, naming the
 * notice the firm's sign-in link was kept on and nothing else
 * (2026-11-16; the rules are in `lib/notify/sign-in-link`).
 *
 * The token carries only the notice's id. Who the link is for, which firm
 * made it, when, and whether a newer one replaced it are all read off the
 * notice at use, so a link cannot be edited to name somebody else and an
 * old one dies when a new one is made. What the door does is decided at
 * use (`enterSignInDoor` in sign-in-link-door), never when the link is made,
 * so the link the firm copies is the same for every address.
 */

/** `SIGN_IN_DOOR`, so a bench invitation or a reply token cannot be posted here instead. */
const KIND = 'SIGN_IN_DOOR'

export function signInDoorToken(noticeId: string): string {
  return sign(KIND, [noticeId])
}

export function readSignInDoor(token: string | undefined | null): { noticeId: string } | null {
  const parts = read(KIND, token)
  if (!parts || !parts[0]) return null
  return { noticeId: parts[0] }
}

/**
 * The link itself, on the app's one address (the same reading the
 * password door's own links use), or empty where no signing secret is set.
 */
export function signInDoorUrl(noticeId: string): string {
  try {
    return `${mailedUrl().replace(/\/+$/, '')}/answer/sign-in/${signInDoorToken(noticeId)}`
  } catch {
    return ''
  }
}
