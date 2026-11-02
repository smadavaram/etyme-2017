import { formatDay } from '@/lib/format-date'

/**
 * Why a week cannot be signed now, said the way a person would say it.
 *
 * The approve route answered a press on a week already signed with
 * "Timesheet is APPROVED, can only approve from SUBMITTED" (the screen
 * walk, 2026-11-02: Brightmoor's AP & Payroll pressed a stale Accept card
 * in Ask Etyme). A status code is the machine's; the person needs to know
 * who signed it and when, or what is still to happen. Pure.
 */
export function notSignableSays(w: {
  status: string
  personName: string
  periodEnd: Date
  /** The last signature on it: who and when, where it has one. */
  signedAt: Date | null
  signerName: string | null
  /** Approved because nobody answered in the client's window, not by a person. */
  bySilence?: boolean
}): string {
  const week = `${w.personName}’s week ending ${formatDay(w.periodEnd)}`
  switch (w.status) {
    case 'APPROVED':
      if (w.bySilence && !w.signerName) {
        return w.signedAt
          ? `This week was approved on ${formatDay(w.signedAt, { year: false })} because nobody answered in time; nothing is left to sign.`
          : `${week} was approved because nobody answered in time; nothing is left to sign.`
      }
      return w.signedAt && w.signerName
        ? `This week was signed on ${formatDay(w.signedAt, { year: false })} by ${w.signerName}; nothing is left to sign.`
        : `${week} is already signed; nothing is left to sign.`
    case 'REJECTED':
      return `${week} was sent back. It can be signed once ${w.personName} sends it again.`
    case 'OPEN':
    case 'DRAFT':
      return `${week} has not been sent yet. It can be signed once ${w.personName} sends it.`
    default:
      return `${week} cannot be signed now.`
  }
}
