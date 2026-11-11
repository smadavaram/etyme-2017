/**
 * The words Settings → Sign-in draws (founder, 2026-11-11). Plain, the
 * trade's, and the founder's own sentence for directory only. Pure, so the
 * screen and a test read one list.
 */

export const SIGN_IN_SCREEN_MODES = [
  { mode: 'SSO_ONLY', label: 'Your company’s directory only' },
  { mode: 'INVITE_ONLY', label: 'Invited people only' },
  { mode: 'HYBRID', label: 'Both' },
] as const

export function modeOptionSays(mode: string): string {
  switch (mode) {
    case 'SSO_ONLY':
      return 'Your people sign in only through your company’s directory. Etyme creates no passwords for them, and removing them in your directory removes them here.'
    case 'INVITE_ONLY':
      return 'Nobody joins by your domain. An Owner or Admin invites each person, who signs in with Google, Microsoft or an email and password.'
    case 'HYBRID':
      return 'Your people sign in through your company’s directory, and an Owner or Admin may also invite people on public addresses. Those seats never pay, bill, sign or award.'
    default:
      return ''
  }
}

const EVENT_WORDS: Record<string, string> = {
  SSO_CONFIGURED: 'Directory set',
  DOMAIN_VERIFIED: 'Domain verified',
  USER_PROVISIONED: 'Seated',
  USER_DEPROVISIONED: 'Removed',
  GROUP_ROLE_MAPPED: 'Group mapped',
  LOGIN_SUCCEEDED: 'Signed in',
  LOGIN_REFUSED_SSO_ONLY: 'Refused: directory only',
  JOIN_REFUSED_BY_POLICY: 'Refused',
  INVITE_SENT: 'Invited',
  INVITE_ACCEPTED: 'Invitation accepted',
  MEMBERSHIP_REVOKED: 'Seat ended',
  AUTH_POLICY_CHANGED: 'Sign-in changed',
  SESSIONS_ENDED: 'Signed out everywhere',
}

export function eventWords(action: string): string {
  return EVENT_WORDS[action] ?? action
}

export function sourceWords(source: string | null): string {
  switch (source) {
    case 'SCIM': return 'added by your directory'
    case 'JIT': return 'seated on first directory sign-in'
    case 'INVITE': return 'invited'
    case 'MANUAL': return 'added by hand'
    default: return 'seated before this was recorded'
  }
}
