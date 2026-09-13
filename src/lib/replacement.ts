/**
 * Replacing the person on a placement.
 *
 * A consultant leaves mid-contract and the supplier puts somebody else
 * in the seat. The 2017 build had contract candidates for exactly this;
 * here BuyContractCandidate carried a REPLACED state nothing wrote, and
 * a sell contract has one person on it.
 *
 * The honest model: a replacement is a new contract on the same seat.
 * The old sell contract ends the day before; a new one starts on the
 * day, with the same client, rate, terms, purchase order and engagement;
 * the buy contract keeps running with the old candidate REPLACED and the
 * new one ACTIVE from the same day. Tenure, invoices and timesheets stay
 * with the person who earned them, which is the whole reason not to
 * overwrite a name.
 */

export type ReplaceVerdict =
  | { ok: true; endsOn: Date; startsOn: Date; says: string }
  | { ok: false; code: 'NOT_RUNNING' | 'SAME_PERSON' | 'NOT_ON_BENCH' | 'OUTSIDE_TERM' | 'TOO_FAR_BACK'; message: string }

const DAY = 86_400_000

export function mayReplace(input: {
  state: string
  startDate: Date
  endDate: Date | null
  from: Date
  now: Date
  outgoingName: string
  incomingName: string
  samePerson: boolean
  incomingOnBench: boolean
}): ReplaceVerdict {
  const { from, now } = input
  if (input.state !== 'IN_PROGRESS') {
    return { ok: false, code: 'NOT_RUNNING', message: `${input.outgoingName}'s contract is not running, so there is nobody to replace.` }
  }
  if (input.samePerson) {
    return { ok: false, code: 'SAME_PERSON', message: `${input.incomingName} is already the person on this contract.` }
  }
  if (!input.incomingOnBench) {
    return { ok: false, code: 'NOT_ON_BENCH', message: `${input.incomingName} is not on your bench. Add them, with their consent, and try again.` }
  }
  if (from.getTime() < now.getTime() - 14 * DAY) {
    return { ok: false, code: 'TOO_FAR_BACK', message: 'A replacement can be dated up to two weeks back, not further. Hours already signed belong to whoever worked them.' }
  }
  if (from.getTime() < input.startDate.getTime() || (input.endDate && from.getTime() > input.endDate.getTime())) {
    return { ok: false, code: 'OUTSIDE_TERM', message: 'The replacement date has to fall inside the contract.' }
  }
  const endsOn = new Date(from.getTime() - DAY)
  return {
    ok: true,
    endsOn,
    startsOn: from,
    says: `${input.incomingName} takes over from ${input.outgoingName} on ${from.toISOString().slice(0, 10)}. ${input.outgoingName}'s contract ends the day before; the client has been told.`,
  }
}
