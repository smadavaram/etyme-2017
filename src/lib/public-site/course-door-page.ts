/**
 * The free training door's page: the words, the ten topic tiles and the
 * four answers to "What are you?".
 *
 * Etyme's own door (owner's ruling, relayed by Pax, 2026-11-28). It is
 * a doorway to a free course, and nothing here says Tapin sells
 * training. The course itself is paused, so the page says so plainly and
 * never links to it.
 *
 * No server code here: the form on the page is a browser component and
 * imports this file. The words that sit beside the tick, and the table
 * that routes an answer to a track, are held by `./course-door` (which
 * uses a server module); this file repeats them for the browser and a
 * test holds the two copies equal.
 */

/**
 * Where the door is served today. The owner's address for it is /start
 * (signed-out visitors); /start is still the signed-in setup page, which
 * belongs to the architect and has to move to /setup first. Until then the
 * door answers here, and the swap is one folder move (see the report).
 */
export const COURSE_DOOR_PATH = '/ai-from-zero'

/** The door's own lead route, called as docs/course-door-lead-contract.md says. */
export const COURSE_DOOR_ENDPOINT = '/api/market/course-door'

/** Where the Learn section's button goes on the door: down to "What are you?". */
export const WHAT_ARE_YOU_HREF = '#what-are-you'

/** Where the same section's button goes on the home page: the door, with no form. */
export const DOOR_HREF = '/start'

export const DOOR_WORDS = {
  paused: 'The course is not open yet. We have not set a date for it.',
  askHeading: 'What are you?',
  askHint: 'Pick the closest one. It decides where you start.',
  emailLabel: 'Your email',
  guardianEmailLabel: 'A parent or guardian’s email',
  itSwitch: 'I work in IT',
  send: 'Tell me when it opens',
  back: 'Change my answer',
  doneHeading: 'You are on the list',
  doneOpens: 'When the course opens is not set yet.',
} as const

/** Same words as `CONSENT_WORDS` and `GUARDIAN_WORDS` in `./course-door`. */
export const CONSENT_LINE = "Email me when the course opens and about Etyme's free training. I can stop anytime."
export const GUARDIAN_LINE = 'This is the email of a parent or guardian, not a child. We keep no name or age for a child.'

export type DoorLabel = 'Worker' | 'Recruiter' | 'Fresher' | 'Kid'

/** The four answers. The track is what each routes to, as `TRACK_FOR` says. */
export const DOOR_ANSWERS: { label: DoorLabel; line: string; track: string }[] = [
  { label: 'Worker', line: 'I have a job and want to work with AI.', track: 'Non-IT' },
  { label: 'Recruiter', line: 'I find and place people.', track: 'Entry Level' },
  { label: 'Fresher', line: 'I am starting my career.', track: 'Entry Level' },
  { label: 'Kid', line: 'I am a student. A parent or guardian signs me up.', track: 'Kids/student' },
]

export const IT_TRACK_NAME = 'IT — Upgrade'

/**
 * What the form sends, and nothing else: the fields the route reads
 * (docs/course-door-lead-contract.md). The track is never sent; the route
 * decides it from the answer. A child's name, age or school has no field.
 */
export interface CourseDoorBody {
  leadType: DoorLabel
  email: string
  consent: boolean
  worksInIT: boolean
  guardianEmail: boolean
  company_website: string
  filledInMs: number
}

export function courseDoorBody(a: {
  who: DoorLabel; email: string; yes: boolean; inIT: boolean; trap: string; filledInMs: number
}): CourseDoorBody {
  return {
    leadType: a.who,
    email: a.email,
    consent: a.yes,
    worksInIT: a.who === 'Worker' && a.inIT,
    guardianEmail: a.who === 'Kid',
    company_website: a.trap,
    filledInMs: a.filledInMs,
  }
}
