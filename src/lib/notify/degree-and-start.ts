/**
 * The words for a degree and for the start's one question.
 *
 * Decided by the founder, 2026-11-03 ("A degree is read, not just held").
 * A degree is proof, not compliance: nothing about it blocks a start.
 * When something on it does not look right the record warns HR in a
 * sentence beside the paper, and HR decides: ask for the transcript, send
 * it to a verification provider, or send it back. Etyme renders no verdict
 * on a degree; the provider does, and its verdict clears the warning.
 *
 * And at the start, one question to the hiring manager: is the person who
 * started the person interviewed. A No holds the start and tells HR and
 * the supplier, by name, in one sentence.
 *
 * Exported here so regulatory's degree rules and demand's start card say
 * the same words; conversation owns how they are said, the other domains
 * decide when. The voice: what to do, then the fact, one door; no apology
 * words; dry about people; never "fraud" in a line anybody at a supplier
 * reads, because a mismatch is a question, not an accusation. The record
 * stores no pronouns, so a sentence names the person or says "the person".
 */
import { formatDay } from '@/lib/format-date'

/** The three things HR may do about a degree that does not look right: the door every warning ends on. */
export const DEGREE_DOORS = 'Ask for the transcript, send it to a verification provider, or send it back.'

/** The one question asked before a degree is read for the person, on their own upload. */
export const READ_FOR_YOU = 'Read the details from this document for you?'

// ── To HR, beside the paper ────────────────────────────────────────────

/** "The certificate says 2016; the résumé says 2019 for the same degree. Ask for the transcript, …" */
export function degreeYearDiffers(i: { certificateYear: number; resumeYear: number }): string {
  return `The certificate says ${i.certificateYear}; the résumé says ${i.resumeYear} for the same degree. ${DEGREE_DOORS}`
}

/** A graduation year after this year. */
export function degreeYearAhead(i: { certificateYear: number; on: Date }): string {
  return `The certificate says ${i.certificateYear}, which has not come yet (it is ${i.on.getUTCFullYear()}). ${DEGREE_DOORS}`
}

/** The name printed on the certificate is not the person's. */
export function degreeNameDiffers(i: { printedName: string; personName: string }): string {
  return `The certificate is in the name ${i.printedName}, not ${i.personName}. ${DEGREE_DOORS}`
}

/** The institution on the certificate is not the one the résumé names for that degree. */
export function degreeSchoolDiffers(i: { certificateSchool: string; resumeSchool: string }): string {
  return `The certificate is from ${i.certificateSchool}; the résumé says ${i.resumeSchool} for the same degree. ${DEGREE_DOORS}`
}

/** The job requires a qualification the paper does not show. */
export function degreeNotWhatTheJobAsks(i: { jobTitle: string; required: string; onPaper: string }): string {
  return `The ${i.jobTitle} job asks for ${i.required}; this certificate is ${i.onPaper}. Ask for the right certificate, or send it back.`
}

/** The same file already filed for somebody else: said to HR only, never to either person or their supplier. */
export function sameFileFiledBefore(i: { otherPersonName: string }): string {
  return `This file was already filed by ${i.otherPersonName}. Both records keep it; check which is right.`
}

/** A provider's verdict on the degree, recorded verbatim: it clears every warning on that degree. */
export function degreeVerifiedBy(i: { provider: string; reference: string | null; on: Date }): string {
  return `${i.provider} verified the degree on ${formatDay(i.on)}${i.reference ? `, reference ${i.reference}` : ''}. Nothing more to do on it.`
}

// ── To the person ──────────────────────────────────────────────────────

/** "Northbend asks for your degree certificate before the start. Upload it once; …" */
export function degreeAskedOfYou(i: { firmName: string }): string {
  return `${i.firmName} asks for your degree certificate before the start. Upload it once; it stays on your record for every firm you work with.`
}

/** What the person is told when HR sends a degree back, in HR's own words. */
export function degreeSentBack(i: { firmName: string; reason: string }): string {
  return `${i.firmName} sent your degree certificate back: ${i.reason.trim().replace(/[.\s]+$/, '')}. Upload the right one from your page.`
}

// ── The start's one question ──────────────────────────────────────────

/** Asked of the hiring manager on the start card, Yes or No, recorded with who said it. */
export const START_QUESTION = 'Is the person who started the person you interviewed?'

/** "Dana Whitfield says the person who started is not the person interviewed. The start is on hold until HR confirms who is on site." */
export function notThePersonInterviewed(i: { saidBy: string }): string {
  return `${i.saidBy} says the person who started is not the person interviewed. The start is on hold until HR confirms who is on site.`
}

/** The notice to HR and the supplier on a No: who it is about in the title, the sentence as the body. */
export function notThePersonNotice(i: { saidBy: string; personName: string; jobTitle: string }): { title: string; body: string } {
  return {
    title: `Start on hold: ${i.personName}, ${i.jobTitle}`,
    body: notThePersonInterviewed(i),
  }
}
