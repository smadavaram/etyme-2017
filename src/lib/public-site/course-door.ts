/**
 * The free course door: who walked up, and what they said yes to.
 *
 * The home page asks "What are you?" and the answer routes to a track.
 * The course itself is paused and the door runs ahead of it (owner,
 * 2026-11-28), so everything here is about being allowed to write to
 * somebody later, and nothing about the course.
 *
 * The rules are the same ones `lib/public-site/leads` holds, with three
 * additions the door needs:
 *   - the yes is a tick on plainly worded text, never a default;
 *   - a child enters through a parent's or guardian's address and no
 *     detail about the child is accepted, let alone kept;
 *   - the one confirmation letter carries a link that ends it, signed
 *     for the address it was sent to so it cannot be made for another.
 *
 * No database here. The route does that.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { looksScripted, normalEmail } from '@/lib/public-site/leads'

// ── What are you ─────────────────────────────────────────────────────

export const LEAD_TYPES = ['Worker', 'Recruiter', 'Fresher', 'Kid'] as const
export type CourseLeadType = (typeof LEAD_TYPES)[number]

/**
 * Which track each answer routes to, one table (Pax's ruling,
 * 2026-11-28). Worker/Recruiter/Fresher/Kid are door labels kept on the
 * lead; the four track names are locked. A Worker who works in IT turns
 * the visible "I work in IT" switch on and routes to IT_TRACK instead.
 */
export const TRACK_FOR: Record<CourseLeadType, string> = {
  Worker: 'Non-IT',
  Recruiter: 'Entry Level',
  Fresher: 'Entry Level',
  Kid: 'Kids/student',
}
export const IT_TRACK = 'IT — Upgrade'

export function trackFor(leadType: CourseLeadType, worksInIT: boolean): string {
  return leadType === 'Worker' && worksInIT ? IT_TRACK : TRACK_FOR[leadType]
}

/** Where the row says it came from. */
export const COURSE_DOOR_SOURCE = 'COURSE_DOOR'

// ── The words beside the tick ───────────────────────────────────────

export const CONSENT_WORDS =
  "Email me when the course opens and about Etyme's free training. I can stop anytime."

export const GUARDIAN_WORDS =
  'This is the email of a parent or guardian, not a child. We keep no name or age for a child.'

// ── The ledger's words ──────────────────────────────────────────────

export const LEDGER = {
  lead: 'COURSE_DOOR_LEAD',
  confirmation: 'COURSE_DOOR_CONFIRMATION',
  confirmationFailed: 'COURSE_DOOR_CONFIRMATION_FAILED',
  unsubscribed: 'COURSE_DOOR_UNSUBSCRIBED',
} as const

// ── The same answer to everybody ────────────────────────────────────

/**
 * One sentence per deployment, never per address: a reply that differs
 * for an address already on file tells a stranger who has signed up.
 */
export function thanksSays(mailCanLeave: boolean): string {
  return mailCanLeave
    ? 'Thank you. If the address is right, one confirmation is on its way, and we write again when the course opens.'
    : 'Thank you. You are on the list. No email can be sent from here yet, so nothing will arrive until it can.'
}

export const UNSUBSCRIBED_SAYS =
  'You are unsubscribed. We will not write to this address about the course again.'
export const UNSUBSCRIBE_REFUSED_SAYS =
  'That link does not match an address, so nothing was changed. Use the link in the latest email we sent you.'

// ── Reading the request ─────────────────────────────────────────────

export interface CourseDoorLead {
  leadType: CourseLeadType
  track: string
  email: string
  guardian: boolean
  /** The "I work in IT" switch, as the visitor left it. Only a Worker can turn it on. */
  worksInIT: boolean
}

export type CourseDoorCode =
  | 'CONSENT_NEEDED'
  | 'SCRIPTED'
  | 'TYPE_NOT_KNOWN'
  | 'GUARDIAN_NEEDED'
  | 'NO_CHILD_DETAILS'
  | 'EMAIL_NOT_USABLE'

export type CourseDoorVerdict =
  | { ok: true; value: CourseDoorLead }
  | { ok: false; code: CourseDoorCode; says: string }

const EMAIL_LIMIT = 254

/** Fields that would describe a child. A Kid entry carrying one is refused whole. */
const CHILD_FIELDS = [
  'name', 'firstName', 'lastName', 'fullName', 'childName', 'kidName',
  'age', 'childAge', 'dob', 'dateOfBirth', 'birthday', 'birthdate',
  'school', 'grade', 'class',
]

const JUNK_DOMAINS = [
  'test.com', 'test.test', 'example.com', 'example.org', 'example.net', 'asdf.com',
  'mailinator.com', 'yopmail.com', 'guerrillamail.com', '10minutemail.com',
]

function junkAddress(email: string): boolean {
  const [local, domain] = email.split('@')
  if (JUNK_DOMAINS.includes(domain)) return true
  // a@a.aa: the whole thing typed with one finger.
  return local.length <= 2 && domain.split('.')[0].length <= 2
}

/**
 * What the request says, or the one sentence that refuses it.
 *
 * Order matters. A missing yes is named first, so a visitor who forgot
 * to tick and mistyped is told about the tick; a script is told nothing
 * about which field it got wrong.
 */
export function checkCourseDoorAsk(body: Record<string, unknown>): CourseDoorVerdict {
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '')

  const scripted = looksScripted({
    honeypot: str('company_website'),
    filledInMs: typeof body.filledInMs === 'number' ? body.filledInMs : null,
  })
  if (scripted.scripted) return { ok: false, code: 'SCRIPTED', says: scripted.says }

  // Only a real tick is a yes. The string "true" is a script's guess.
  if (body.consent !== true) {
    return {
      ok: false,
      code: 'CONSENT_NEEDED',
      says: `Tick the box that says "${CONSENT_WORDS}" and send again. Nothing was saved and nothing will be emailed.`,
    }
  }

  const leadType = LEAD_TYPES.find((t) => t === body.leadType)
  if (!leadType) {
    return {
      ok: false,
      code: 'TYPE_NOT_KNOWN',
      says: `"What are you?" has four answers: ${LEAD_TYPES.join(', ')}. Nothing was saved.`,
    }
  }

  const guardian = leadType === 'Kid'
  if (guardian) {
    if (CHILD_FIELDS.some((f) => body[f] !== undefined && body[f] !== null && body[f] !== '')) {
      return {
        ok: false,
        code: 'NO_CHILD_DETAILS',
        says: 'We take no name, age or school for a child. Send only a parent or guardian’s email. Nothing was saved.',
      }
    }
    if (body.guardianEmail !== true) {
      return {
        ok: false,
        code: 'GUARDIAN_NEEDED',
        says: `For a child we write only to a parent or guardian. Confirm: "${GUARDIAN_WORDS}" Nothing was saved.`,
      }
    }
  }

  const typed = str('email').trim()
  const email = normalEmail(typed)
  if (
    !email ||
    email.length > EMAIL_LIMIT ||
    !/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(email) ||
    junkAddress(email)
  ) {
    return {
      ok: false,
      code: 'EMAIL_NOT_USABLE',
      says: typed
        ? `"${typed.slice(0, 80)}" is not an address we can write to. Send the whole address, like name@yourcompany.example. Nothing was saved.`
        : 'An email address, so we can write when the course opens. Nothing was saved.',
    }
  }

  const worksInIT = leadType === 'Worker' && body.worksInIT === true
  return { ok: true, value: { leadType, track: trackFor(leadType, worksInIT), email, guardian, worksInIT } }
}

// ── The link that ends it ───────────────────────────────────────────

export function unsubscribeToken(email: string, secret: string): string {
  return createHmac('sha256', secret).update(`course-door-unsubscribe:${email}`).digest('hex')
}

export function tokenMatches(email: string, token: string, secret: string): boolean {
  if (!secret || !token) return false
  const want = Buffer.from(unsubscribeToken(email, secret))
  const got = Buffer.from(token)
  return want.length === got.length && timingSafeEqual(want, got)
}

// ── The one confirmation letter ─────────────────────────────────────

export function confirmationLetter(a: { leadType: CourseLeadType; unsubscribeUrl: string }): {
  subject: string
  body: string
} {
  const who =
    a.leadType === 'Kid'
      ? 'This went to a parent or guardian, because the address you gave is the one we use for a child. We keep no name or age for a child.'
      : 'You asked to hear from us.'
  return {
    subject: 'You are on the list for Etyme’s free training',
    body: [
      who,
      '',
      'The course is not open yet. We will write once when it opens, and now and then about Etyme’s free training. This is the only email before that.',
      '',
      `To stop, open this link and it ends at once: ${a.unsubscribeUrl}`,
      '',
      'Etyme',
    ].join('\n'),
  }
}
