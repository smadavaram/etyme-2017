/**
 * The fifth state: denied.
 *
 * ── Why this file exists ─────────────────────────────────────────────
 *
 * CLAUDE.md lists five states every screen owes a reader — loading,
 * empty, error, partial, denied — and denied was the only one nobody had
 * built. What a refused caller actually got was the app drawn around a
 * hole: a demo door that 404s sets no cookie, so `/dashboard/tenure`
 * rendered a consultant's sidebar reading "Your workspace · Consultant",
 * a headline reading "Cross-vendor tenure at …." with a literal ellipsis
 * where a company name belongs, five stats at zero, an "Add consultant"
 * button, and the string "Not authenticated" printed inside the table
 * body, over ten 401s in the console.
 *
 * That is four wrongs at once, and each is its own rule broken:
 *
 *  - a refusal drawn as an empty state, so the reader concludes the
 *    company has no contractors rather than that they are not signed in;
 *  - the system's words — "Not authenticated" is a status line, not a
 *    sentence — where CLAUDE.md requires "a refusal says what is missing
 *    and what to do", never a code;
 *  - a company name that never resolved, printed as `…` anyway, which is
 *    a screen asserting something it does not know;
 *  - controls offered to somebody the app has just refused. "Add
 *    consultant" is a button that will 401. A button the route will
 *    refuse is a button that lies, the same rule the nav already keeps.
 *
 * ── Where the sentences come from ────────────────────────────────────
 *
 * Mostly not from here. `whenThereIsNoSeat` in lib/api-context already
 * writes the four sentences for somebody signed in with no usable seat —
 * paused, ended, never had one, staff — and they are good sentences that
 * took a correction to get right. This file does not write them a second
 * time; it takes the refusal the identity door already produced and
 * decides what a *page* does with it, which is a heading, the sentence
 * verbatim, and the doors that are genuinely open to this reader.
 *
 * The one sentence that is new is the signed-out one, because no route
 * had to write it: an API answering 401 says "Not authenticated" to a
 * machine, and nothing had ever had to say it to a person.
 *
 * Pure, so every case can be read as a sentence without a database.
 */

/** A door that is actually open to somebody who has just been refused. */
export interface DeniedDoor {
  label: string
  href: string
  /** The one door drawn as the primary action. At most one is true. */
  primary?: boolean
}

export interface Denied {
  /** The machine's word, for the log and the test. Never drawn. */
  code: string
  /** What happened, in the reader's words. Four or five words. */
  heading: string
  /** What is missing and what to do. A sentence, never a code. */
  says: string
  /** Where they can actually go. Never a control the app would refuse. */
  doors: readonly DeniedDoor[]
}

/**
 * Turn the identity door's refusal into what a page shows.
 *
 * `code` and `message` are exactly what `getCallerContext` put in its
 * error body, so there is one answer to "why is this person not seated"
 * and the page and the API cannot drift apart on it.
 */
export function deniedFor(args: { code: string; message: string }): Denied {
  const { code, message } = args

  // Nobody is signed in. The common way to arrive here is a demo link
  // whose door is not open on this deployment: the door answers 404,
  // sets no cookie, and the browser is left on a dashboard URL with no
  // session behind it. So the sentence names that case rather than
  // assuming the reader typed the address.
  if (code === 'UNAUTHORIZED') {
    return {
      code,
      heading: 'You are not signed in',
      says:
        'There is nothing here to open until the app knows who you are. If you came ' +
        'through a demo link, that seat is not built on this deployment — pick one of ' +
        'the doors that is. Otherwise sign in and you will land back on your own work.',
      doors: [
        { label: 'Sign in', href: '/login', primary: true },
        { label: 'Look around the demo', href: '/demo' },
      ],
    }
  }

  // Signed in, but no Person row: somebody stopped halfway through
  // signing up. Not a refusal so much as an unfinished job, and the door
  // is the rest of it.
  if (code === 'NOT_FOUND') {
    return {
      code,
      heading: 'Your sign-in is not finished',
      says:
        'You are signed in, but there is no profile here yet, so nothing knows what to ' +
        'show you. Finishing setup takes a minute and puts your work in front of you.',
      doors: [{ label: 'Finish setting up', href: '/start', primary: true }],
    }
  }

  // The three seat cases. `whenThereIsNoSeat` already wrote each
  // sentence and each already says what to do and who can do it, so the
  // message is shown verbatim — rewriting it here is the second answer
  // to one question that this file exists to avoid.
  if (code === 'SUSPENDED') {
    return { code, heading: 'Your access is paused', says: message, doors: signOutOnly() }
  }
  if (code === 'ACCESS_ENDED') {
    return { code, heading: 'Your seat was removed', says: message, doors: signOutOnly() }
  }
  if (code === 'NO_SEAT') {
    return { code, heading: 'Nobody has given you a seat yet', says: message, doors: signOutOnly() }
  }

  // Anything else the identity door starts saying later. It still gets a
  // sentence and no controls, rather than the app drawn around a hole —
  // which is the whole point, and the reason this branch does not throw.
  return {
    code: code || 'DENIED',
    heading: 'This is not open to you',
    says:
      message ||
      'The app cannot work out what you should be able to see here, so it is showing ' +
      'you nothing rather than the wrong thing. Signing in again usually settles it.',
    doors: signOutOnly(),
  }
}

/**
 * The only door somebody already signed in has: be somebody else.
 *
 * Deliberately not "Go to the dashboard". The dashboard is the page that
 * just refused them, and offering it is the button that lies.
 */
function signOutOnly(): DeniedDoor[] {
  return [{ label: 'Sign in as somebody else', href: '/login', primary: true }]
}
