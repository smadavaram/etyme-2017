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
  /** That bill is a draft nobody has sent yet. */
  onOurDraft?: boolean
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

  // On a draft of ours nobody has sent: the draft is named, and what to do
  // with it, because the generic "already on a bill" left the person with
  // no way forward (release walk, 2026-10-18).
  const onDraft = sorted.filter((w) => w.onOurBill && w.onOurDraft)
  const drafts = new Map<string, WeekNotBillable[]>()
  for (const w of onDraft) drafts.set(w.onOurBill!, [...(drafts.get(w.onOurBill!) ?? []), w])
  for (const [number, ws] of drafts) {
    parts.push(
      `${list(ws.map(whose))} ${ws.length === 1 ? 'is' : 'are'} on draft bill ${number}, which has not been sent. ` +
        `Send it or withdraw it.`
    )
  }

  // Signed and already on one of our bills.
  const billed = sorted.filter((w) => w.clientSigned && w.onOurBill && !w.onOurDraft)
  if (billed.length > 0) {
    const numbers = [...new Set(billed.map((w) => w.onOurBill!))]
    parts.push(
      `${list(billed.map(whose))} ${billed.length === 1 ? 'is' : 'are'} already on ` +
        `${numbers.length === 1 ? `bill ${numbers[0]}` : `bills ${list(numbers)}`}.`
    )
  }

  // Anything this does not have words for is counted, never dropped.
  const said = new Set([...unsigned, ...notSent, ...sentBack, ...onDraft, ...billed])
  const other = sorted.filter((w) => !said.has(w))
  if (other.length > 0) {
    parts.push(`${list(other.map(whose))} cannot be billed yet.`)
  }

  const head = unsigned.length > 0 || notSent.length > 0 || sentBack.length > 0
    ? 'Nothing can be billed until the client signs the week.'
    : 'Nothing is left to bill.'
  return `${head} ${parts.join(' ')}`
}

/**
 * The weeks of a period that are already on one of our sent bills, in
 * one sentence, or null where none are. Read where a period asked for has
 * nothing left to bill, so a person who asks a second time is told which
 * bill already carries the weeks rather than only that nothing is left
 * (the-picker-does-not-lie, 2026-11-11: two people asking for one month
 * at once, the second told nothing about the first one's bill).
 */
export function alreadyBilledSays(weeks: WeekNotBillable[]): string | null {
  const billed = [...weeks]
    .filter((w) => w.onOurBill && !w.onOurDraft)
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
  if (billed.length === 0) return null
  const numbers = [...new Set(billed.map((w) => w.onOurBill!))]
  return (
    `${list(billed.map(whose))} ${billed.length === 1 ? 'is' : 'are'} already on ` +
    `${numbers.length === 1 ? `bill ${numbers[0]}` : `bills ${list(numbers)}`}.`
  )
}

// ── Which step a firm's bill waits on (Area E, 2026-11-14) ─────────────
//
// The tester opened Bills at a supplier with nothing to bill and read one
// condition on the page ("a bill is made from the weeks your client has
// approved") and another in the dialog ("no engagement it can bill"). The
// route now decides the one missing step, in order, and the page and the
// dialog both print its answer, so they cannot disagree.

/** The words of the act that makes a bill, on the dialog and every sentence here. */
export const RAISE_A_BILL = 'Raise a bill'

/** Where Record a placement opens its dialog. */
export const RECORD_A_PLACEMENT_HREF = '/dashboard/contracts?new=1'

export interface BillStepLink {
  href: string
  label: string
}

export interface BillWaitsOn {
  /** Something can be billed now: the button is drawn and the dialog lists it. */
  canBill: boolean
  /** The missing step, where nothing can be billed. */
  says: string | null
  /** The act that unblocks it, for a seat that may open the page and do the act. */
  link: BillStepLink | null
}

export interface BillWaitsInput {
  companyName: string
  /** False for a firm that bills no placement of its own: a client, or an MSP. */
  billsPlacements: boolean
  /** Names on the firm's own placements, not cancelled, in a stable order. */
  placed: ReadonlyArray<{ personName: string; started: boolean; paused?: boolean }>
  /** The firm runs a client's program (an MSP) and supplies nobody itself. */
  runsPrograms?: boolean
  /**
   * Each engagement the firm may bill under, with what a dry run of the
   * one generator found: `noHours` where it found no hours to bill at all,
   * null where something can be billed or the dialog has its own sentence.
   */
  engagements: ReadonlyArray<{
    people: readonly string[]
    noHours: {
      weeks: WeekNotBillable[]
      /**
       * `noApproverAt` is the client's name where it is not on Etyme and
       * nobody there who approves hours is recorded yet, so the attach on
       * the week would be refused until somebody is added under Contacts.
       */
      waitingWeek: { id: string; clientOnEtyme: boolean; noApproverAt?: string | null } | null
    } | null
  }>
  /** The seat may record a placement; else `whoRecords` names who does. */
  mayRecord: boolean
  whoRecords: string | null
  /** The seat may attach a client's approval on a week; else `whoAttaches` names who does. */
  mayAttach: boolean
  whoAttaches: string | null
  /** The seat may add a contact under Contacts. */
  mayAddContact?: boolean
}

/** Kept as the last word, for every case the steps below have no words for. */
export function noEngagementSays(companyName: string): string {
  return (
    `${companyName} has no engagement it can bill right now. A bill is ` +
    'raised by the firm that supplied the people, against its own live placements — ' +
    'so there is nothing here until this firm has one.'
  )
}

/**
 * An MSP runs a client's program and places nobody, so it is the supplier
 * on no placement. Etyme raises no bill for its own program fee.
 */
export function runsProgramsSays(companyName: string): string {
  return (
    `${companyName} is not the supplier on any placement, so it has nothing to bill. ` +
    'Etyme does not raise a bill for an MSP’s own fee.'
  )
}

/** Where a contact at a client is added. */
export const CONTACTS_HREF = '/dashboard/contacts'

/**
 * The fact, in the week page's own words (its refusal of the attach,
 * `approverIsKnownAtClient`), so the Bills page says it before the first press.
 */
export function noApproverRecordedSays(clientName: string): string {
  return `${clientName} is not on Etyme, and nobody there who approves hours is recorded yet.`
}

/** The first step where nobody at a client off Etyme who approves hours is recorded. */
export function addTheApproverSays(clientName: string): string {
  return `Add the person at ${clientName} who approves hours, under Contacts.`
}

/** The second step, once that person is recorded. */
export const THEN_ATTACH_SAYS = 'Then attach the client’s approval on the week.'

const ready: BillWaitsOn = { canBill: true, says: null, link: null }

/** "Priya Rao has" / "Priya Rao and Omar Haddad have" */
function haveOrHas(names: string[]): string {
  return `${list(names)} ${names.length === 1 ? 'has' : 'have'}`
}

function unique(names: Iterable<string>): string[] {
  return [...new Set([...names].filter(Boolean))]
}

/**
 * The one step a firm's next bill waits on, in order: somebody placed,
 * the placement started, the week filed, the client's approval on it, and
 * the week not already on a bill. Pure: the route reads the facts.
 */
export function waitsOnSays(a: BillWaitsInput): BillWaitsOn {
  if (a.engagements.some((e) => e.noHours === null)) return ready

  if (a.engagements.length === 0) {
    if (!a.billsPlacements) {
      return { canBill: false, says: a.runsPrograms ? runsProgramsSays(a.companyName) : noEngagementSays(a.companyName), link: null }
    }
    if (a.placed.length === 0) {
      const head = 'Nobody is placed yet, so there is nothing to bill. A bill is made from the weeks a client approved.'
      return a.mayRecord
        ? { canBill: false, says: head, link: { href: RECORD_A_PLACEMENT_HREF, label: 'Record a placement' } }
        : { canBill: false, says: a.whoRecords ? `${head} ${a.whoRecords}` : head, link: null }
    }
    const waiting = unique(a.placed.filter((p) => !p.started).map((p) => p.personName))
    // A paused placement is one the firm has: say it is paused and where it
    // is resumed, never that the firm has no engagement.
    const paused = unique(a.placed.filter((p) => p.started && p.paused).map((p) => p.personName))
    if (waiting.length > 0 || paused.length > 0) {
      const steps: string[] = []
      if (waiting.length > 0) {
        steps.push(
          `${list(waiting.map((n) => `${n}’s placement`))} ${waiting.length === 1 ? 'has' : 'have'} not started yet, ` +
            'so no week can be filed or billed. A placement starts from Contracts.'
        )
      }
      if (paused.length > 0) {
        steps.push(
          `${list(paused.map((n) => `${n}’s placement`))} ${paused.length === 1 ? 'is' : 'are'} paused, ` +
            'so no week can be filed or billed. A paused placement is resumed from Contracts.'
        )
      }
      const head = steps.join(' ')
      return a.mayRecord
        ? { canBill: false, says: head, link: { href: '/dashboard/contracts', label: 'Open Contracts' } }
        : { canBill: false, says: a.whoRecords ? `${head} ${a.whoRecords}` : head, link: null }
    }
    return { canBill: false, says: noEngagementSays(a.companyName), link: null }
  }

  // Every engagement read, and none holds hours to bill.
  const notFiled = unique(a.engagements.filter((e) => e.noHours!.weeks.length === 0).flatMap((e) => e.people))
  const weeks = a.engagements.flatMap((e) => e.noHours!.weeks)
  const parts: string[] = []
  if (weeks.length > 0) parts.push(nothingToBillSays(weeks))
  if (notFiled.length > 0) {
    parts.push(
      `${haveOrHas(notFiled)} not filed a week yet${weeks.length === 0 ? ', so there is nothing to bill' : ''}. ` +
        'Only the person who worked files hours, from their own page.'
    )
  }
  if (parts.length === 0) return { canBill: false, says: noEngagementSays(a.companyName), link: null }

  // The week to open, where its approval is attached by hand: a client on
  // Etyme signs in Etyme, and the sentence already names it.
  const week = a.engagements.map((e) => e.noHours!.waitingWeek).find((w) => w && !w.clientOnEtyme) ?? null
  // Nobody at that client who approves hours is recorded, so the attach
  // would be refused: the first step is adding that person, then the week.
  if (week && week.noApproverAt) {
    parts.push(noApproverRecordedSays(week.noApproverAt), addTheApproverSays(week.noApproverAt))
    if (a.mayAttach) parts.push(THEN_ATTACH_SAYS)
    else if (a.whoAttaches) parts.push(a.whoAttaches)
    return {
      canBill: false,
      says: parts.join(' '),
      link: a.mayAddContact ? { href: CONTACTS_HREF, label: 'Open Contacts' } : null,
    }
  }
  if (week && a.mayAttach) {
    return { canBill: false, says: parts.join(' '), link: { href: `/dashboard/weeks/${week.id}`, label: 'Attach the client’s approval' } }
  }
  if (week && a.whoAttaches) parts.push(a.whoAttaches)
  return { canBill: false, says: parts.join(' '), link: null }
}
