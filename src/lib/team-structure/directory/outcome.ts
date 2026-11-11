/**
 * What the screen says when Google sends the administrator back. The
 * callback redirects to Settings → Team structure with one short code in
 * the address, never a sentence, so nobody can put words on this screen
 * by sending somebody a link; the sentence is chosen here.
 *
 * No node import: the screen reads this file.
 */

export const GOOGLE_OUTCOMES = {
  connected: 'Google Workspace is connected, read only. Choose Google Workspace and preview what it would change; nothing changes until you say yes.',
  declined: 'Google Workspace was not connected: the consent on Google was cancelled. Nothing was kept.',
  expired: 'Google Workspace was not connected: the connection took too long or came from another window. Start again from Connect.',
  'not-yours': 'Google Workspace was not connected: it was started by another seat or for another company. The Owner or an Admin starts it again from here.',
  signin: 'Google Workspace was not connected: you were not signed in when Google sent you back. Sign in and start again from Connect.',
  off: 'Google Workspace cannot be connected on this deployment yet. Nothing was kept.',
  domain: 'Google Workspace was not connected: the domain is no longer verified for your company. Verify it under Settings, then connect again.',
  scope: 'Google Workspace was not connected: Google granted something other than read-only access to users, so Etyme kept nothing and asked Google to forget it. Start again and allow only "See info about users on your domain".',
  'no-refresh': 'Google Workspace was not connected: Google gave no lasting access, so nothing was kept. Start again from Connect.',
  workspace: 'Google Workspace was not connected: the account that allowed access cannot read users on your verified domain. Sign in to Google as an administrator of the Workspace that holds your domain.',
  exchange: 'Google Workspace was not connected: Google did not complete the connection. Nothing was kept; start again from Connect.',
  failed: 'Google Workspace was not connected: something went wrong on our side. Nothing was kept; try again.',
} as const

export type GoogleOutcome = keyof typeof GOOGLE_OUTCOMES

/** The sentence for a code in the address, or null for anything this file does not know. */
export function googleOutcomeSays(code: string | null | undefined): { says: string; no: boolean } | null {
  if (!code || !Object.prototype.hasOwnProperty.call(GOOGLE_OUTCOMES, code)) return null
  return { says: GOOGLE_OUTCOMES[code as GoogleOutcome], no: code !== 'connected' }
}
