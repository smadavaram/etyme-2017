/**
 * The hiring manager's one question at a start: "Is the person who started
 * the person you interviewed?"
 *
 * Decided by the founder, 2026-11-03 (candidate and supplier fraud:
 * collect and forward, and say what the record itself can see). A proxy
 * who is not the person interviewed is seen only by somebody who met
 * both, so the question goes to whoever is hiring, and the answer is
 * written with who said it and when (`SellContract.startIdentity*`). It is
 * never a verdict: a No is said to the client's HR and to the supplier in
 * one sentence, and the start is held until somebody looks (the
 * coordinator's call, reversible in a sentence).
 *
 * The question and the No's sentence are conversation's one wording
 * (`lib/notify/degree-and-start`), so the card, the route and the notice
 * cannot say it two ways.
 *
 * Pure: the route reads the rows. No database, no clock.
 */

import { START_QUESTION } from '@/lib/notify/degree-and-start'

export type StartIdentityRead =
  | { ok: true; confirmed: boolean }
  | { ok: false; field: 'confirmed'; says: string }

/** The answer as sent: Yes or No, nothing else. */
export function readStartIdentity(body: { confirmed?: unknown } | null | undefined): StartIdentityRead {
  const c = body?.confirmed
  if (c === true || c === false) return { ok: true, confirmed: c }
  return { ok: false, field: 'confirmed', says: `Answer Yes or No: ${START_QUESTION.charAt(0).toLowerCase()}${START_QUESTION.slice(1)}` }
}

/** What the person answering reads back. */
export function answeredSays(confirmed: boolean, personName: string): string {
  return confirmed
    ? `Recorded: the person who started is the ${personName} you interviewed.`
    : `Recorded: the person who started is not the ${personName} you interviewed. HR and the supplier are told, and the start is on hold.`
}
