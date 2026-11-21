/**
 * The second check's words and numbers, with no import at all, so a
 * browser page reads the same sentences the routes answer with
 * (lib/identity/second-check-rules holds the rules over them).
 */

/** The platform key the authenticator app's secret is sealed under, and the proof with it. */
export const SECOND_CHECK_KEY_ENV = 'ETYME_SECOND_CHECK_KEY'

/** How long a proof stands, from the check that made it. */
export const PROOF_SECONDS = 120
/** How long a passkey's challenge stands, from the moment it was asked for. */
export const CHALLENGE_SECONDS = 120
/** How long the screen that adds a passkey or app may take, once allowed. */
export const ADDING_SECONDS = 600
/** The same window as a first password (FIRST_PASSWORD_MINUTES in lib/password-door). */
export const FIRST_FACTOR_MINUTES = 15
/** Five failed checks in 15 minutes and the person waits. */
export const FAILURES_ALLOWED = 5
export const FAILURE_WINDOW_MINUTES = 15

/** Where a person adds and removes her own: the account menu's line opens it. */
export const SECOND_CHECK_HREF = { page: '/dashboard/settings/second-check', api: '/api/settings/second-check' } as const
export const SECOND_CHECK_PLACE = 'Second check, in your account menu'

/**
 * Every act a proof may be made for, and how a sentence names it. A proof
 * names one of these and one subject; a check asked for anything else is
 * refused. Slice S1 holds only the second check's own acts. The acts that
 * release money join in slice S2, each by its own line here.
 */
export const CHECK_ACTS = {
  'second_check.add': 'add a passkey or authenticator app',
  'second_check.remove': 'remove a passkey or authenticator app',
  'second_check.reset': 'reset a colleague’s second check',
  /** Record 99: an Owner shows a full tax ID, for that view only. */
  'sensitive.reveal': 'show a full tax ID',
} as const
export type CheckAct = keyof typeof CHECK_ACTS

export function isCheckAct(v: unknown): v is CheckAct {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CHECK_ACTS, v)
}

// ── The sentences ────────────────────────────────────────────────────

export const SAYS = {
  notReady:
    'This Etyme deployment is not set up for a second check yet, so nothing can be added here. Write to support@etyme.com.',
  signInAgain:
    `To add your first passkey or authenticator app, sign in again first. It needs a sign-in within the last ${FIRST_FACTOR_MINUTES} minutes.`,
  checkFirst: 'You already have a passkey or authenticator app. Check with it first, then add another.',
  noneYet: `You have no passkey or authenticator app yet. Add one under ${SECOND_CHECK_PLACE}.`,
  oneAppOnly: 'You already have an authenticator app. Remove it first to add a new one.',
  codeShape: 'Type the six digits your authenticator app shows.',
  codeWrong: 'That code is not right. Type the six digits your authenticator app shows now.',
  codeUsed: 'That code was already used. Wait for the next one and type it.',
  passkeyFailed: 'Your passkey did not confirm it is you. Try again, or use your authenticator app.',
  passkeyUnknown: 'That passkey is not one you added here. Use another, or your authenticator app.',
  passkeyElsewhere: 'That passkey was made for another Etyme address. Use it there, or add one here.',
  wait: `${FAILURES_ALLOWED} checks failed in the last ${FAILURE_WINDOW_MINUTES} minutes. Wait ${FAILURE_WINDOW_MINUTES} minutes, then try again.`,
  addingLapsed: 'That took too long. Start adding it again.',
  noProof: 'This needs a second check first.',
  proofLapsed: 'That check is more than two minutes old. Check again.',
  proofUsed: 'That check was already used once. Check again for this.',
  proofElsewhere: 'That check was made for something else. Check again for this.',
  unknownAct: 'Etyme does not ask a second check for that.',
} as const
