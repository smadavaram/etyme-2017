/**
 * The submission chase's rules (record 112, chain 1, "Win work", item
 * "Drafts of outreach and chases", part A). Pure: no database, no clock.
 *
 * A submission that went out and has no confirmation after three days is
 * proposed as one task. A person says yes once; that yes releases one
 * letter and one reminder, three working days apart, and the task closes
 * when a confirmation is recorded. The letter asks for one thing, carries
 * no rate, no contact details and no link, and goes only to the address the
 * submission's own letter already went to.
 */

import { formatDay } from '@/lib/format-date'
import { hello, paragraphs } from '@/lib/notify/letters'
import type { TaskPlan } from './tasks'
import { PROPOSED_LATE_AFTER_DAYS, type ItemState } from './confirmation-rules'

export const SUBMISSION_CHASE_KIND = 'SUBMISSION_CHASE'
export const SUBMISSION_CHASE_TEMPLATE = 'submission-chase'
/** The mail ledger's own name for a letter about a submission. The chase keeps it, so a bounce and a confirmation tied to a chase letter reach the tracker. */
export const SUBMISSION_RECORD = 'Submission'

/**
 * PROPOSED DEFAULTS, AWAITING THE OWNER. Nobody has decided these numbers.
 * The first letter goes once a submission has waited more than three days;
 * one reminder follows, three working days later.
 */
export const PROPOSED_SUBMISSION_CHASE = { firstAfterDays: PROPOSED_LATE_AFTER_DAYS, letters: 1, retries: 1, workingDaysApart: 3 } as const

export const PROPOSED_SUBMISSION_CHASE_PLAN: TaskPlan = {
  messages: [{ template: SUBMISSION_CHASE_TEMPLATE, label: 'Submission follow-up' }],
  retries: PROPOSED_SUBMISSION_CHASE.retries,
  daysApart: PROPOSED_SUBMISSION_CHASE.workingDaysApart,
  closesWhen: 'a confirmation is recorded',
}

/** The one thing the letter asks for. The card quotes it so the yes is for these very words. */
export const THE_ONE_ASK = 'confirm you have it, or tell us it is not wanted'

/** Whether a submission is proposed for a chase, and if not, why. Pure. */
export function chaseProposal(i: { state: ItemState; waitedDays: number; hasSentLetter: boolean; everHadTask: boolean }): { propose: true } | { propose: false; why: string } {
  if (i.state !== 'AWAITING') return { propose: false, why: 'Only a submission still awaiting its confirmation is chased.' }
  if (i.waitedDays <= PROPOSED_SUBMISSION_CHASE.firstAfterDays) return { propose: false, why: 'It has not waited long enough.' }
  if (!i.hasSentLetter) return { propose: false, why: 'No letter about it is on the mail ledger, so nobody is known to write to.' }
  if (i.everHadTask) return { propose: false, why: 'A chase was already proposed for this submission. Another is a person’s to start.' }
  return { propose: true }
}

/** The card's question, with the numbers said as a proposal. Pure. */
export function submissionChaseQuestion(f: { person: string; job: string; sentOn: Date }, plan: TaskPlan = PROPOSED_SUBMISSION_CHASE_PLAN): string {
  const n = plan.retries
  return `${f.person} for ${f.job}, put forward ${formatDay(f.sentOn)}, has no confirmation. Send a letter asking them to ${THE_ONE_ASK}? ` +
    `Proposed: one letter, then ${n} ${n === 1 ? 'reminder' : 'reminders'}, ${plan.daysApart} working days apart, closing when a confirmation is recorded. ` +
    'These numbers are proposed; the Owner may change them.'
}

/** Why a submission was not chased where nobody can be asked. Pure. */
export function submissionChaseNoOwnerSays(count: number): string {
  const many = count !== 1
  return `${count} ${many ? 'submissions' : 'submission'} waiting for a confirmation ${many ? 'were' : 'was'} not chased: no Account Manager or Owner seat is working. Fill one and the next run proposes ${many ? 'them' : 'it'}.`
}

export interface SubmissionChaseLetterInput {
  firmName: string
  contactName: string | null
  person: string
  job: string
  sentOn: Date
  /** 1 for the first letter, 2 for the reminder. */
  attempt: number
}

/** The letter. One ask, no rate, no link, no contact details, no threat, no date. Pure. */
export function submissionChaseLetter(i: SubmissionChaseLetterInput): { subject: string; text: string } {
  return {
    subject: `${i.attempt > 1 ? 'Reminder: ' : ''}${i.person} for ${i.job}`,
    text: paragraphs(
      hello(i.contactName),
      `${i.attempt > 1 ? 'This is a reminder. ' : ''}On ${formatDay(i.sentOn)}, ${i.firmName} put ${i.person} forward for the ${i.job} job. We have not heard that it arrived.`,
      `Please reply to ${THE_ONE_ASK}.`,
    ),
  }
}
