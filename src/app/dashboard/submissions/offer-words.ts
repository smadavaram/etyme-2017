import { formatDay } from '@/lib/format-date'
import { submissionStatusWord } from './words'

/**
 * What a row says about its live offer, and whether it offers the supplier
 * the way to record her answer. Pure.
 */
export interface RowOffer { state: string; rate: number; currency: string; startDate: string | null; side: 'BUYER' | 'SUPPLIER'; mayAnswer?: boolean }


/** "Offered: 95.00 USD an hour, starts Jan 11, 2027" (or "Accepted: ..."); nothing where there is no offer. */
export function offerLine(o: RowOffer | null | undefined): string | null {
  if (!o) return null
  const head = o.state === 'ACCEPTED' ? 'Accepted' : 'Offered'
  return `${head}: ${o.rate.toFixed(2)} ${o.currency} an hour${o.startDate ? `, starts ${formatDay(o.startDate)}` : ''}`
}

/** The supplier's "Record her answer" is drawn only where the route said her seat may, while the offer waits for one. */
export const mayRecordHerAnswer = (o: RowOffer | null | undefined): boolean => !!o && o.side === 'SUPPLIER' && o.state === 'PROPOSED' && o.mayAnswer === true

/** A row's status word: once her answer is "accepted" the row reads Accepted, not Offered, until she is placed. Pure. */
export function rowStatusWord(status: string, offer: RowOffer | null | undefined): string {
  return status === 'OFFERED' && offer?.state === 'ACCEPTED' ? 'Accepted' : submissionStatusWord(status)
}

/** The sentence under an offer dialog's title, said to the side reading it. Pure. */
export function offerIntro(side: 'BUYER' | 'SUPPLIER' | null): string {
  return side === 'SUPPLIER'
    ? 'The firm that hires sets the rate, the start and the terms. You record her answer.'
    : 'The rate, the start date and the terms are yours to set. Placing opens on them once the offer is accepted.'
}
