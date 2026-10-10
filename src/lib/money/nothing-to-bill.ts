/**
 * Why a bill could not be made, naming the week, the person and who has
 * to act first.
 *
 * A supplier's AR clerk pressed "Generate bill" on 2026-10-03 and read
 * "No approved timesheets left to bill for this engagement and period."
 * True, and useless: Omar Haddad's week of Sep 21 was sitting with
 * Northbend Athletic, unsigned, and nothing on the screen said so. A
 * refusal says what is missing and who can supply it (CLAUDE.md, "explain
 * in a sentence, not a code").
 *
 * A firm bills upward on the client's signature (the founder,
 * 2026-09-28), so the one signature that decides is the client's at the
 * top of the chain. No database, no clock.
 */

export interface WeekNotBillable {
  personName: string
  /** The first day of the week, as stored. */
  periodStart: Date
  /** OPEN · SUBMITTED · APPROVED · REJECTED — the week's own status. */
  status: string
  /** A live client signature stands on the week. */
  clientSigned: boolean
  /** The client whose signature the bill waits on. Null where nothing names it. */
  clientName: string | null
  /** The number of our own bill that already carries the week, where one does. */
  onOurBill: string | null
}

/** "Sep 21" — read in UTC, because a week's first day is a date and not a moment. */
function weekOf(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function plainDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** "Omar Haddad's week of Sep 21" */
function whose(w: WeekNotBillable): string {
  return `${w.personName}’s week of ${weekOf(w.periodStart)}`
}

/** Up to three, then "and 4 more". */
function list(items: string[]): string {
  if (items.length <= 3) {
    if (items.length <= 1) return items.join('')
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
  }
  const rest = items.length - 3
  return `${items.slice(0, 3).join(', ')} and ${rest} more`
}

/**
 * The refusal, in one or more short sentences.
 *
 * `weeks` is every week of hours on the engagement inside the dates
 * asked for, whatever its state. Nothing in it is billable, or this
 * would not have been asked.
 */
export function nothingToBillSays(
  weeks: WeekNotBillable[],
  asked: { start: Date | null; end: Date | null } = { start: null, end: null }
): string {
  const between =
    asked.start && asked.end
      ? ` between ${plainDay(asked.start)} and ${plainDay(asked.end)}`
      : asked.start
        ? ` from ${plainDay(asked.start)}`
        : asked.end
          ? ` up to ${plainDay(asked.end)}`
          : ''

  if (weeks.length === 0) {
    return `No hours are on record for this engagement${between}, so there is nothing to bill.`
  }

  const sorted = [...weeks].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
  const parts: string[] = []

  // Waiting on the client's signature — the one that decides. Grouped by
  // the client, because in a chain each engagement has one, and naming it
  // once reads better than once per week.
  const unsigned = sorted.filter((w) => !w.clientSigned && w.status === 'SUBMITTED')
  const byClient = new Map<string, WeekNotBillable[]>()
  for (const w of unsigned) {
    const k = w.clientName ?? ''
    byClient.set(k, [...(byClient.get(k) ?? []), w])
  }
  for (const [client, ws] of byClient) {
    const who = client || 'the client'
    parts.push(
      `${list(ws.map(whose))} ${ws.length === 1 ? 'is' : 'are'} waiting for ${who} to sign ${ws.length === 1 ? 'it' : 'them'}.`
    )
  }

  // Not sent yet — only the worker files their own week.
  const notSent = sorted.filter((w) => !w.clientSigned && w.status === 'OPEN')
  if (notSent.length > 0) {
    parts.push(
      `${list(notSent.map(whose))} ${notSent.length === 1 ? 'has' : 'have'} not been sent yet; ` +
        `only the worker sends their own week.`
    )
  }

  const sentBack = sorted.filter((w) => !w.clientSigned && w.status === 'REJECTED')
  for (const w of sentBack) {
    parts.push(`${w.clientName ?? 'The client'} sent ${whose(w)} back, so the worker has to send it again.`)
  }

  // Signed and already on one of our bills.
  const billed = sorted.filter((w) => w.clientSigned && w.onOurBill)
  if (billed.length > 0) {
    const numbers = [...new Set(billed.map((w) => w.onOurBill!))]
    parts.push(
      `${list(billed.map(whose))} ${billed.length === 1 ? 'is' : 'are'} already on ` +
        `${numbers.length === 1 ? `bill ${numbers[0]}` : `bills ${list(numbers)}`}.`
    )
  }

  // Anything this does not have words for is counted, never dropped.
  const said = new Set([...unsigned, ...notSent, ...sentBack, ...billed])
  const other = sorted.filter((w) => !said.has(w))
  if (other.length > 0) {
    parts.push(`${list(other.map(whose))} cannot be billed yet.`)
  }

  const head = unsigned.length > 0 || notSent.length > 0 || sentBack.length > 0
    ? 'Nothing can be billed until the client signs the week.'
    : 'Nothing is left to bill.'
  return `${head} ${parts.join(' ')}`
}
