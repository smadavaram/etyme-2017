/**
 * Reading what a recruiter pasted in.
 *
 * The demand cone was built and had no door. Leads 0, openings 0 — the
 * whole top half of the diamond sat there with nothing able to reach it,
 * because the only way to get demand into this system was to hand-type a
 * requirement, and nobody hand-types a Dice advert at nine at night.
 *
 * So: one box. Paste the advert, paste the forwarded email, paste five of
 * them at once. This turns that into leads, and openings.ts collapses the
 * leads into seats.
 *
 * ── Why the parsing is deliberately dumb ─────────────────────────────
 *
 * A model would read these better and will, later — extract.ts is already
 * built for it. But a recruiter pasting an advert needs an answer in the
 * same second, offline, with no key configured, and a lead that is 80%
 * right and instantly editable beats one that is 95% right and arrives
 * after a round trip. Nothing here is destructive: the advert is kept
 * whole in `text`, so a better reader can be run over the same rows later.
 */

import type { Source } from '@/lib/openings'

export interface ReadLead {
  source: Source
  postedBy: string | null
  title: string
  skills: string[]
  location: string | null
  rateCents: number | null
  contact: string | null
  text: string
  /** What it could not work out, said plainly rather than left blank. */
  unknowns: string[]
}

/**
 * Split a paste into separate adverts.
 *
 * People paste one at a time, and people paste a morning's worth at once
 * separated by a rule or a blank line or the word "From:". Guessing wrong
 * in the splitting direction is cheap — two half-leads a recruiter merges —
 * and guessing wrong the other way silently loses four adverts, so the
 * split only fires on a strong signal.
 */
export function splitAdverts(raw: string): string[] {
  const text = raw.replace(/\r\n/g, '\n').trim()
  if (!text) return []

  // A horizontal rule, or three-plus blank lines, or a new mail header.
  const parts = text
    .split(/\n\s*(?:[-=_*]{3,}|#{3,})\s*\n|\n{4,}|\n(?=From:\s)/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 20)

  return parts.length > 0 ? parts : [text]
}

const BOARDS: [RegExp, Source][] = [
  [/\bdice\.com\b|\bdice\b/i, 'DICE'],
  [/\blinkedin\b/i, 'LINKEDIN'],
  [/\b(fieldglass|beeline|vndly|coupa|wand)\b/i, 'VMS'],
  [/^(from|sent|subject|to):\s/im, 'EMAIL'],
]

/** Where it came from, guessed from what the text says about itself. */
export function guessSource(text: string): Source {
  for (const [pattern, source] of BOARDS) {
    if (pattern.test(text)) return source
  }
  return 'OTHER'
}

const NOT_A_TITLE =
  /^(from|to|sent|subject|cc|bcc|date|reply-to|hi|hello|dear|thanks|regards|please|we are|greetings)\b/i

/**
 * The role, as a line of text.
 *
 * A labelled line wins. Otherwise the first line that reads like a title
 * rather than like an email header or a greeting — which is what the
 * requirement parser gets wrong on a forwarded mail, where the first line
 * is always "From: Raj".
 */
export function readTitle(text: string): { title: string; sure: boolean } {
  const labelled = text.match(
    /^\s*(?:role|position|title|job\s*title|req(?:uirement)?)\s*[:\-]\s*(.+)$/im
  )
  if (labelled) return { title: tidy(labelled[1]), sure: true }

  // A title written into a sentence: "we have an immediate need for a
  // Senior SAP FICO consultant in Denver". This is the normal shape of a
  // forwarded email, and taking the first unfiltered line instead gives
  // "Hybrid, 3 days on site" as the job title — which then fails to match
  // the same seat posted on a board, so the collapse never happens.
  const inSentence = text.match(
    /\b(?:need|looking|require|seeking|hiring|opening|opportunity)\b[^.\n]{0,40}?\bfor\s+(?:an?\s+)?([A-Za-z0-9][^.\n,]{5,70}?)\s*(?=\bin\b|\bat\b|[.,\n]|$)/i
  )
  if (inSentence) {
    const guess = tidy(inSentence[1])
    if (guess.split(/\s+/).length >= 2) return { title: guess, sure: false }
  }

  for (const line of text.split('\n')) {
    const l = line.trim()
    if (l.length < 6 || l.length > 140) continue
    if (NOT_A_TITLE.test(l)) continue
    if (l.includes('@') || /^https?:/i.test(l)) continue
    // A line that is mostly logistics is not a title. "Hybrid, 3 days on
    // site. Around $65/hr" reads like one to a line-counter and to nobody
    // else.
    if (/\$|\b\d+\s*(?:days?|months?|hrs?|hours?)\b/i.test(l)) continue
    return { title: tidy(l), sure: false }
  }

  return { title: 'Untitled role', sure: false }
}

/** Kept in step with the requirement parser by a test, not by hope. */
const KNOWN_SKILLS = [
  'Java', 'Python', 'JavaScript', 'TypeScript', 'React', 'Angular', 'Vue',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform',
  'SQL', 'PostgreSQL', 'MongoDB', 'Snowflake', 'Databricks', 'Spark',
  'SAP', 'ABAP', 'S/4HANA', 'HANA', 'BRIM', 'FICO', 'FI/CO', 'MM', 'SD', 'PP',
  'SuccessFactors', 'Ariba', 'Fiori',
  'ServiceNow', '.NET', 'C#', 'Spring Boot', 'Node.js', 'Go', 'Rust',
  'Tableau', 'Power BI', 'Salesforce', 'Oracle', 'PeopleSoft', 'Workday',
]

export function readSkills(text: string): string[] {
  const labelled = text.match(
    /^\s*(?:skills?|technologies|tech\s*stack|must\s*have)\s*[:\-]\s*(.+)$/im
  )
  if (labelled) {
    const listed = labelled[1]
      .split(/[,;·•|]/)
      .map((s) => tidy(s))
      .filter((s) => s.length > 1 && s.length < 40)
    if (listed.length > 0) return listed.slice(0, 12)
  }

  const found = KNOWN_SKILLS.filter((s) =>
    new RegExp(`(^|[^a-z0-9])${escape(s)}([^a-z0-9]|$)`, 'i').test(text)
  )
  return found.slice(0, 12)
}

export function readLocation(text: string): string | null {
  const labelled = text.match(
    /^\s*(?:location|city|site|office|work\s*location)\s*[:\-]\s*(.+)$/im
  )
  if (labelled) return tidy(labelled[1])

  // "Denver, CO (Hybrid)" or "Remote — must sit EST", written in the body.
  const inline = text.match(
    /\b(remote|hybrid|onsite|on-site)\b[^\n]{0,60}|\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),\s*([A-Z]{2})\b/
  )
  return inline ? tidy(inline[0]) : null
}

/**
 * The posted rate, in cents per hour.
 *
 * A range keeps the top of it — the advert's number is a ceiling to bid
 * under, so the ceiling is the useful half. An annual salary is ignored
 * rather than divided by 2080: this is contract demand, and a guessed
 * hourly rate that looks like a real one is exactly the plausible-wrong
 * number CLAUDE.md says to stop for.
 */
export function readRate(text: string): { cents: number | null; note: string | null } {
  const annual = /\$\s*\d{2,3},\d{3}(?:\s*[-–]\s*\$?\s*\d{2,3},\d{3})?\s*(?:per\s*year|\/\s*(?:yr|year)|annually|k\b)?/i
  const hourly = /\$\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:[-–—]|to)\s*\$?\s*(\d{1,3}(?:\.\d{1,2})?)|\$\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:\/\s*)?(?:per\s*)?(?:hr|hour|hourly|w2|c2c|corp)?/i

  // Annual first. "$145,000 per year" matches the hourly branch as $145,
  // and $145/hr is a plausible-looking rate, which is exactly the kind of
  // wrong number that gets acted on.
  if (annual.test(text)) {
    return { cents: null, note: 'the number in this looks annual, not hourly' }
  }

  const m = text.match(hourly)
  if (m) {
    const top = m[2] ?? m[3] ?? m[1]
    const dollars = parseFloat(top)
    if (dollars >= 10 && dollars <= 500) {
      return {
        cents: Math.round(dollars * 100),
        note: m[2] ? 'posted as a range, keeping the top of it' : null,
      }
    }
  }

  return { cents: null, note: null }
}

/**
 * Who posted it.
 *
 * Text, not a company row. A prime's name in an advert is a string until
 * somebody says it is a company, and inventing a counterparty from an
 * email signature is how a submission ends up addressed to nobody.
 */
export function readPostedBy(text: string): string | null {
  const labelled = text.match(
    /^\s*(?:client|company|employer|posted\s*by|vendor|prime)\s*[:\-]\s*(.+)$/im
  )
  if (labelled) {
    const v = tidy(labelled[1])
    if (v && !/^(confidential|undisclosed|n\/?a|tbd)$/i.test(v)) return v
  }

  // A signature line, or the domain of whoever sent the mail.
  const from = text.match(/^\s*from:\s*(?:"?([^"<\n]+)"?\s*)?<?([\w.+-]+@([\w-]+)\.[\w.]+)>?/im)
  if (from) {
    const name = from[1]?.trim()
    if (name && name.includes(' ')) return name
    return titleCase(from[3])
  }

  return null
}

export function readContact(text: string): string | null {
  const mail = text.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/)
  if (mail) return mail[0]
  const phone = text.match(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)
  return phone ? phone[0] : null
}

/**
 * One advert, read.
 *
 * Every field it could not work out is named in `unknowns` rather than
 * left silently empty, because a recruiter fixing three blanks is working
 * and a recruiter hunting for what is missing is not.
 */
export function readLead(raw: string): ReadLead {
  const text = raw.trim()
  const { title, sure } = readTitle(text)
  const skills = readSkills(text)
  const location = readLocation(text)
  const rate = readRate(text)
  const postedBy = readPostedBy(text)

  const unknowns: string[] = []
  if (!sure) unknowns.push('the title is a guess from the first usable line')
  if (skills.length === 0) unknowns.push('no skills found')
  if (!location) unknowns.push('no location')
  if (rate.cents === null) unknowns.push(rate.note ?? 'no rate posted')
  else if (rate.note) unknowns.push(rate.note)
  if (!postedBy) unknowns.push('who posted it is not named')

  return {
    source: guessSource(text),
    postedBy,
    title,
    skills,
    location,
    rateCents: rate.cents,
    contact: readContact(text),
    text,
    unknowns,
  }
}

/**
 * What to tell somebody who just pasted, in one sentence.
 *
 * Counting is not reporting. "3 leads created" tells a recruiter nothing
 * they can act on; "two of these are the same seat" is the entire value of
 * the top cone, so it is the sentence.
 */
export function pasteSentence(result: {
  read: number
  newOpenings: number
  collapsed: number
  needsAPerson: number
}): string {
  const bits: string[] = []
  bits.push(result.read === 1 ? 'One advert' : `${result.read} adverts`)

  if (result.collapsed > 0) {
    bits.push(
      result.collapsed === 1
        ? 'one is a seat you are already working'
        : `${result.collapsed} are seats you are already working`
    )
  }
  if (result.newOpenings > 0) {
    bits.push(result.newOpenings === 1 ? 'one is new' : `${result.newOpenings} are new`)
  }
  if (result.needsAPerson > 0) {
    bits.push(
      result.needsAPerson === 1
        ? 'one might be a duplicate — have a look'
        : `${result.needsAPerson} might be duplicates — have a look`
    )
  }

  return bits.map((b, i) => (i === 0 ? b : b.charAt(0).toUpperCase() + b.slice(1))).join('. ') + '.'
}

function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/[.,;:\s]+$/, '').trim()
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
