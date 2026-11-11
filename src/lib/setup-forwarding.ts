/**
 * Automatic forwarding: the twelfth item of the setup checklist.
 *
 * The founder, 2026-11-11 ("Ok let's do it"): a company's mail
 * administrator sets one rule in the company's own mail system, so
 * business email reaches its Etyme forwarding address and nobody forwards
 * by hand, and nobody changes a setting in their own mailbox.
 *
 * What this does not change, said once: Etyme never reads a mailbox and
 * never asks for a mail permission. The rule is the company's own, set in
 * its own console, and it copies only what the rule matches. The intake's
 * security rules (`lib/email-intake`: a seated sender, SPF and DKIM, plain
 * text, nothing a record without a person's yes) are unchanged, and the
 * deployment switch `EMAIL_INTAKE_LIVE` is read, never set.
 *
 * Rules and words only, with no database in it. The address itself is
 * the intake's: made and replaced through `PATCH /api/settings/email-intake`,
 * shown once to the person who made it, and kept nowhere whole.
 */

import { NOT_OPEN_YET } from '@/lib/email-intake/live'

export type ForwardingStatus = 'NOT_OPEN' | 'DEMO' | 'OFF' | 'ON'

export interface ForwardingFacts {
  /** `EMAIL_INTAKE_LIVE` is exactly "1" on this deployment. */
  open: boolean
  /** A demo company cannot receive email. */
  demo: boolean
  /** The company turned forwarded email on. */
  enabled: boolean
  /** "<label>-…abcd@in.etyme.com", or null where no address was made. */
  addressHint: string | null
}

export interface ForwardingView {
  status: ForwardingStatus
  /** The one line about the address. */
  says: string
  /** The address's hint, only where the intake is open and on. Never the whole address. */
  addressHint: string | null
  /** Whether "Turn on and make the address" is drawn. */
  mayTurnOn: boolean
  /** Whether "Replace the address" is drawn. */
  mayReplace: boolean
  /** Whether "The rule is set" may be pressed: only where mail can arrive. */
  mayMarkDone: boolean
}

/**
 * What the item shows about the address. Where the intake is not open on
 * this deployment the item says so and shows no address at all, not even
 * a hint, because mail sent to it would not be received.
 */
export function forwardingView(f: ForwardingFacts): ForwardingView {
  if (!f.open) {
    return {
      status: 'NOT_OPEN',
      says: `${NOT_OPEN_YET} No address is shown until it is.`,
      addressHint: null, mayTurnOn: false, mayReplace: false, mayMarkDone: false,
    }
  }
  if (f.demo) {
    return {
      status: 'DEMO',
      says: 'A demo company cannot receive email, so it has no address.',
      addressHint: null, mayTurnOn: false, mayReplace: false, mayMarkDone: false,
    }
  }
  if (!f.enabled) {
    return {
      status: 'OFF',
      says: 'Forwarded email is off. Turn it on to make your address. It is shown once.',
      addressHint: null, mayTurnOn: true, mayReplace: false, mayMarkDone: false,
    }
  }
  return {
    status: 'ON',
    says: f.addressHint
      ? `Forwarded email is on. Your address is ${f.addressHint}. It was shown in full once, when it was made.`
      : 'Forwarded email is on.',
    addressHint: f.addressHint, mayTurnOn: false, mayReplace: true, mayMarkDone: true,
  }
}

/** The refusal when somebody says the rule is set where no mail can arrive. */
export const NOT_DONE_UNTIL_ON =
  'Automatic forwarding is done once forwarded email is on and the rule is set. Until then, skip it for now.'

// ── The words on the screen ──────────────────────────────────────────

/** Why, in two short lines. */
export const WHY: readonly string[] = [
  'Your mail administrator sets one rule for the company.',
  'Then nobody has to forward an email by hand.',
]

/** Who is kept and what happens to it, so the rule is set knowing. */
export function keptLine(companyName: string): string {
  return `Etyme keeps mail only from people seated at ${companyName}. Nothing becomes a record until a person says yes.`
}

export interface Recipe {
  system: string
  steps: readonly string[]
}

/**
 * The two recipes, side by side. Written generically on purpose: the
 * consoles move their menus, and a path we cannot check is a path that
 * sends an administrator to the wrong screen.
 */
export const RECIPES: readonly Recipe[] = [
  {
    system: 'Google Workspace',
    steps: [
      'Sign in to the Admin console as an administrator.',
      'Open the Gmail settings. Find the routing or compliance rules.',
      'Add a rule for outgoing mail to addresses outside your company.',
      'Limit it to your recruiting group, or to a word in the subject.',
      'In the rule’s actions, add a Bcc recipient: your Etyme address.',
      'Save the rule.',
    ],
  },
  {
    system: 'Microsoft 365',
    steps: [
      'Sign in to the Exchange admin center as an administrator.',
      'Open the mail flow rules.',
      'Add a rule for mail sent to people outside your organization.',
      'Limit it to your recruiting group, or to a word in the subject.',
      'Choose the action that adds a Bcc recipient: your Etyme address.',
      'Save the rule and turn it on.',
    ],
  },
]

export const CONSOLE_NOTE = 'The menu names may differ in your console.'

/** Keep it narrow: three short lines. */
export const NARROW: readonly string[] = [
  'Limit the rule to outgoing mail to outside addresses from your recruiting group, or to mail with a keyword in the subject.',
  'Tell your people the rule is on. Your mail policy may need a notice.',
  'A broad rule copies mail nobody meant to share.',
]

export const REPLACE_LINE = 'You can replace the address at any time. The old one stops working at once.'

/** How to check, without a test button. */
export function checkLine(open: boolean): string {
  return open
    ? 'To check: send one email that matches the rule. It appears as a card in Ask Etyme.'
    : 'To check: send one email that matches the rule. It appears as a card in Ask Etyme, once forwarded email is open here.'
}
