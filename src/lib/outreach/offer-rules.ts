/**
 * What an outreach letter offers (record 117, step 2). Pure.
 *
 * Three offers a staffing firm sells with: a hot list of who is available,
 * a project pod, an open job. Each is built only from the fields a person
 * typed. A hot list is skills and availability and nothing else, as the
 * public bench rule says: never a name, a rate or an address. A course is
 * not offered here; it is for candidates, and candidate outreach is not
 * built.
 */

import { formatDayLong } from '@/lib/format-date'

export const OFFER_KINDS = ['HOT_LIST', 'PROJECT_POD', 'OPEN_JOB'] as const
export type OfferKind = (typeof OFFER_KINDS)[number]
export const OFFER_LABELS: Record<OfferKind, string> = { HOT_LIST: 'Who is available', PROJECT_POD: 'A project team', OPEN_JOB: 'An open job' }

export type Drafted = { ok: true; subject: string; body: string } | { ok: false; field: string; says: string }

const HOT_KEYS = ['skills', 'availability']
const text = (v: unknown): string => (typeof v === 'string' ? v.trim().replace(/[ \t]+/g, ' ') : '')
const RATE = /[$€£]|\/\s?(hr|hour|day)\b|\bper\s+(hour|day)\b|\brate\b/i
const EMAIL = /\S+@\S+\.\S+/
// A phone as people write one: a leading +, a bracketed area code, or 3-3-4 digits with separators. A bare run of digits is not one.
const PHONE = /\+\d[\d\s().-]{7,}\d|\(\d{3}\)\s?\d{3}[\s.-]?\d{4}|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/
/** A hot list's words, wherever they are typed, carry no rate, no address and no phone number (record 117). Pure. */
export function hotListWordsRefusal(words: string): string | null {
  if (RATE.test(words)) return 'A list of who is available carries skills and availability only. Take the rate out.'
  if (EMAIL.test(words)) return 'A list of who is available carries skills and availability only. Take the email address out.'
  if (PHONE.test(words)) return 'A list of who is available carries skills and availability only. Take the phone number out.'
  return null
}

const HOT_ONLY = 'A hot list carries skills and availability only. Never a name, a rate or an address.'

function hotList(firm: string, offer: Record<string, unknown>): Drafted {
  const lines = Array.isArray(offer.lines) ? offer.lines : []
  if (lines.length === 0) return { ok: false, field: 'offer', says: 'Add at least one line to the hot list: the skills, and when they are available.' }
  const out: string[] = []
  for (const [i, raw] of lines.entries()) {
    const line = (raw ?? {}) as Record<string, unknown>
    const extra = Object.keys(line).filter((k) => !HOT_KEYS.includes(k))
    if (extra.length > 0) return { ok: false, field: 'offer', says: `${HOT_ONLY} Line ${i + 1} has a field called ${extra[0]}.` }
    const skills = text(line.skills); const when = text(line.availability)
    if (!skills || !when) return { ok: false, field: 'offer', says: `Line ${i + 1} of the hot list needs both the skills and when they are available.` }
    if (RATE.test(skills + ' ' + when) || EMAIL.test(skills + ' ' + when)) return { ok: false, field: 'offer', says: `${HOT_ONLY} Take the rate or the address out of line ${i + 1}.` }
    out.push(`- ${skills}: ${when}`)
  }
  return { ok: true, subject: `${firm}: people available for work`, body: `${firm} has people available for work.\n\n${out.join('\n')}\n\nReply with what you need and we will send who fits.` }
}

function projectPod(firm: string, offer: Record<string, unknown>): Drafted {
  const scope = text(offer.scope); const duration = text(offer.duration); const skills = text(offer.skills)
  if (!scope) return { ok: false, field: 'offer', says: 'Say what the project team would do.' }
  if (!duration) return { ok: false, field: 'offer', says: 'Say how long the project team would take.' }
  if (!skills) return { ok: false, field: 'offer', says: 'Say which skills the project team brings.' }
  const short = scope.length > 60 ? `${scope.slice(0, 57).trimEnd()}...` : scope
  return { ok: true, subject: `${firm}: a project team for ${short}`, body: `${firm} can take on a project with a team of its own.\n\nWhat: ${scope}\nHow long: ${duration}\nSkills: ${skills}\n\nReply if this fits something you have, and we will talk through it.` }
}

function openJob(firm: string, offer: Record<string, unknown>): Drafted {
  const title = text(offer.title); const skills = text(offer.skills); const location = text(offer.location)
  if (!title) return { ok: false, field: 'offer', says: 'Say the job title.' }
  if (!skills) return { ok: false, field: 'offer', says: 'Say which skills the job needs.' }
  return { ok: true, subject: `${firm}: ${title}`, body: `${firm} has a job open.\n\nJob: ${title}\nSkills: ${skills}${location ? `\nWhere: ${location}` : ''}\n\nReply if you have somebody for it.` }
}

/** The offer drafted from what was typed, or the sentence that says what is missing. Pure. */
export function draftOffer(firm: string, kind: string, offer: unknown): Drafted {
  const o = (offer && typeof offer === 'object' ? offer : {}) as Record<string, unknown>
  if (kind === 'HOT_LIST') return hotList(firm, o)
  if (kind === 'PROJECT_POD') return projectPod(firm, o)
  if (kind === 'OPEN_JOB') return openJob(firm, o)
  return { ok: false, field: 'offerKind', says: 'Choose who is available, a project team or an open job.' }
}

const monthDay = (iso: string) => formatDayLong(iso, { year: false })

/**
 * Hot list lines drafted from the people the firm has said yes to showing
 * (the public page's own list): skills and availability, grouped where two
 * people read the same. A person edits them before the letter is drafted.
 * Reads no name and no rate. Pure.
 */
export function suggestHotList(rows: readonly { skills: readonly string[]; daysUntilFree: number; freeOn: string }[]): { skills: string; availability: string }[] {
  const groups = new Map<string, { skills: string; availability: string; n: number }>()
  for (const r of rows) {
    const skills = r.skills.slice(0, 3).join(', ')
    if (!skills) continue
    const availability = r.daysUntilFree <= 0 ? 'available now' : `free from ${monthDay(r.freeOn)}`
    const key = `${skills}|${availability}`
    const g = groups.get(key)
    if (g) g.n++
    else groups.set(key, { skills, availability, n: 1 })
  }
  return [...groups.values()].map((g) => ({ skills: g.n > 1 ? `${g.skills} (${g.n} people)` : g.skills, availability: g.availability }))
}
