import { amount, compact } from '@/lib/money-display'

/**
 * The answers to "what happens to the overtime?", in the words of the
 * side answering it.
 *
 * A client signing a week is deciding what it is billed; the worker's pay
 * is the employer's. "Pay them at the usual rate" on the client's screen
 * read as the client setting somebody's pay (tester, 2026-09-30). So the
 * side that is billed accepts the hours and reads what is added to its
 * bill; the side that pays reads what is added to the week's pay.
 *
 * Time off in place of overtime pay is offered only where it is allowed
 * (`timeOffOffered` in `lib/overtime`) — never by default.
 */
export type OvertimeSide = 'BILLED' | 'PAYS'

export interface OvertimeOption {
  key: 'SAME_RATE' | 'PREMIUM' | 'TIME_OFF'
  title: string
  detail: string
}

export function overtimeOptions(input: {
  side: OvertimeSide
  timeOffAllowed: boolean
  hours: number
  rateCents: number
  multiplierBps: number
  firstName: string
}): OvertimeOption[] {
  const { side, hours, rateCents, multiplierBps } = input
  const flat = Math.round(hours * rateCents)
  const premium = Math.round(hours * rateCents * (multiplierBps / 10_000))
  const tail = side === 'BILLED' ? 'added to what you are billed for the week' : 'added to the week’s pay'
  const verb = side === 'BILLED' ? 'Accept' : 'Pay'
  const out: OvertimeOption[] = [
    { key: 'SAME_RATE', title: `${verb} them at the usual rate`, detail: `${hours}h × ${compact(rateCents)} = ${amount(flat)} ${tail}.` },
    { key: 'PREMIUM', title: `${verb} them at a premium`, detail: `${hours}h at the higher rate = ${amount(premium)} ${tail}.` },
  ]
  if (input.timeOffAllowed) {
    out.push({
      key: 'TIME_OFF',
      title: 'Give the time back instead',
      detail: `Nothing extra for those hours. ${hours}h goes into ${input.firstName}’s time-off bank, to be taken as paid leave later.`,
    })
  }
  return out
}
