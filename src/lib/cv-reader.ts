/**
 * Reading a CV somebody pasted in.
 *
 * A client lists twelve suppliers and sends them a role. The supplier
 * signs in, sees the role — and is then asked to build a bench before
 * they can answer it, which is exactly the friction the invitation was
 * designed to skip. Two minutes after arriving, a recruiter has one CV
 * open in another window and wants to send it.
 *
 * So: one box. Paste the CV, and everything the submission needs is read
 * out of it — who, how to reach them, what they do, where they are.
 * A bench is a thing that accumulates from doing this, not a thing you
 * assemble before you are allowed to start.
 *
 * ── Deliberately dumb, for the same reason as `lead-reader` ──────────
 *
 * A model reads these better and will, later — `extract.ts` is already
 * built for it. But the recruiter is looking at the screen right now,
 * possibly with no key configured, and a reading that is 80% right and
 * editable in place beats one that is 95% right and arrives after a
 * round trip. Nothing here is destructive: the CV is kept whole as the
 * resume text, so a better reader can be run over the same rows later.
 *
 * ── What it will not do ──────────────────────────────────────────────
 *
 * Guess a work authorization. "Visa" appearing in a CV is as likely to
 * be a payment card as a permit, and a wrong permit on a submission is
 * how a placement collapses in week two. It comes back null and the
 * recruiter is asked.
 */

export interface ReadCv {
  name: string | null
  email: string | null
  phone: string | null
  /** The line under the name: "Senior SAP FICO Consultant". */
  headline: string | null
  skills: string[]
  location: string | null
  /** Years of experience, where the CV says so plainly. */
  years: number | null
  /**
   * The résumé's own education lines, read by rules (`readEducation`).
   * An empty list means the CV was read and names no education; it is
   * never left out, so "read, nothing there" and "never read" differ.
   */
  education: EducationLine[]
  /** The paste, kept whole. It becomes the resume text. */
  text: string
  /** What it could not work out, said plainly rather than left blank. */
  unknowns: string[]
}

/**
 * One line of the résumé's education, as the résumé says it.
 *
 * This is what the person claims, never a verdict: a degree on file is
 * checked against it, and a provider verifies the degree itself. Every
 * field but `quote` is null where the line did not say, and the quote is
 * the exact line (or the two lines) it was read from, so a person
 * reading it can see why it reads that way.
 */
export interface EducationLine {
  institution: string | null
  qualification: string | null
  fieldOfStudy: string | null
  year: number | null
  quote: string
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/

/**
 * Skills worth naming, and only ones a client actually asks for.
 *
 * A generic keyword list turns every CV into forty skills and the match
 * score into noise. This is the vocabulary of the roles this product
 * sees, and anything outside it is left for the recruiter to add.
 */
const SKILLS = [
  'SAP FICO', 'SAP BRIM', 'SAP SD', 'SAP MM', 'SAP HANA', 'S/4HANA', 'ABAP',
  'Workday', 'Oracle EBS', 'NetSuite', 'PeopleSoft', 'Salesforce', 'ServiceNow',
  'Java', 'Spring Boot', 'Kotlin', '.NET', 'C#', 'Python', 'Django', 'Go',
  'Node.js', 'TypeScript', 'JavaScript', 'React', 'Angular', 'Vue', 'Next.js',
  'AWS', 'Azure', 'GCP', 'Kubernetes', 'Docker', 'Terraform', 'Ansible',
  'Snowflake', 'Databricks', 'Kafka', 'Spark', 'Airflow', 'dbt', 'Tableau',
  'Power BI', 'SQL', 'PostgreSQL', 'Oracle', 'MongoDB', 'Redis',
  'Selenium', 'Cypress', 'Playwright', 'Jenkins', 'GitLab', 'Splunk',
]

/**
 * Words that appear in sentences and never in names.
 *
 * The tell that separates "Anita Desai" from "A dedicated professional
 * with fifteen years". Length and capitalization do not separate those
 * two; grammar does.
 */
const PROSE = new Set([
  'a', 'an', 'the', 'and', 'or', 'with', 'of', 'for', 'in', 'at', 'to', 'on',
  'is', 'was', 'has', 'have', 'my', 'i', 'over', 'across', 'years', 'year',
  'experience', 'seeking', 'looking', 'passionate', 'dedicated', 'results',
])

/** Words that mean the line is a heading rather than somebody's name. */
const HEADING =
  /^(curriculum vitae|resume|r[ée]sum[ée]|profile|summary|professional summary|objective|contact|personal details|skills|technical skills|experience|work experience|employment|education|certifications?|projects?)\b/i

/** Job-title words, for telling a headline from an address. */
const TITLE =
  /\b(consultant|engineer|developer|architect|analyst|manager|lead|specialist|administrator|designer|scientist|director|programmer|tester|sre|devops)\b/i

/** US state codes and a few obvious city markers, for the location line. */
const PLACE =
  /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2}|[A-Z][a-z]+)\b|\b(remote|hybrid|onsite|on-site|work from home)\b/i

/**
 * Read a pasted CV.
 *
 * Order matters: the address is found first because it is unambiguous,
 * and the name is then looked for above it, which is where CVs put it.
 */
export function readCv(raw: string): ReadCv {
  const text = raw.replace(/\r\n/g, '\n').trim()
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)

  const email = text.match(EMAIL)?.[0]?.toLowerCase() ?? null
  const phone = readPhone(text)
  const name = readName(lines, email)
  const headline = readHeadline(lines, name)
  const skills = readSkills(text)
  const location = readLocation(lines)
  const years = readYears(text)
  const education = readEducation(text)

  const unknowns: string[] = []
  if (!name) unknowns.push('Could not find a name. Type it in.')
  if (!email) unknowns.push('No email address in the CV.')
  if (skills.length === 0) unknowns.push('No skills recognized — add the ones that matter.')
  // Never guessed. "Visa" in a CV is as likely to be a payment card as a
  // permit, and a wrong permit is how a placement collapses in week two.
  unknowns.push('Work authorization is not read from a CV. Say what they hold.')

  return { name, email, phone, headline, skills, location, years, education, text, unknowns }
}

// ── The readers ───────────────────────────────────────────────────────

export function readPhone(text: string): string | null {
  const m = text.match(PHONE)
  return m ? m[0].trim() : null
}

/**
 * The name.
 *
 * A CV puts it at the top, on its own line, in two or three words, above
 * the contact details. Where the top is a heading like "Curriculum
 * Vitae" it is skipped; where there is nothing usable, the local part of
 * the address is a last resort and is flagged as one.
 */
export function readName(lines: string[], email: string | null): string | null {
  for (const line of lines.slice(0, 6)) {
    if (HEADING.test(line)) continue
    if (EMAIL.test(line) || PHONE.test(line)) continue
    if (TITLE.test(line)) continue

    const words = line.split(/\s+/).filter(Boolean)
    if (words.length < 2 || words.length > 4) continue
    // Names are words, not bullet points, pipes or long sentences.
    if (/[|•·@\d]/.test(line) || line.length > 42) continue
    if (!/^[A-Z]/.test(line)) continue
    // A sentence that happens to be short and capitalized is still a
    // sentence. "A dedicated professional with..." is four capitalized
    // words under forty characters and is nobody's name.
    if (words.some((w) => PROSE.has(w.toLowerCase().replace(/[^a-z]/g, '')))) continue
    // A lone letter is an initial only when it is punctuated as one.
    if (words.some((w) => w.length === 1 && !/^[A-Z]\.?$/.test(w))) continue
    // "Java, AWS" under a SKILLS heading is two capitalized words and is
    // nobody's name. Nobody is called Java either.
    if (readSkills(line).length > 0) continue

    return line.replace(/[,.]$/, '')
  }

  if (email) {
    const local = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim()
    if (local.split(/\s+/).length >= 2) return titleCase(local)
  }

  return null
}

/** The line under the name that says what they do. */
export function readHeadline(lines: string[], name: string | null): string | null {
  const start = name ? lines.findIndex((l) => l.startsWith(name)) + 1 : 0
  for (const line of lines.slice(Math.max(0, start), Math.max(0, start) + 5)) {
    if (!TITLE.test(line)) continue
    if (EMAIL.test(line) || PHONE.test(line)) continue
    if (line.length > 70) continue
    return line.replace(/^[-–—•|\s]+/, '').replace(/[,.]$/, '')
  }
  return null
}

/**
 * Skills, from a fixed vocabulary.
 *
 * Matched on word boundaries so "Go" does not fire on "Google" and
 * "React" does not fire on "reaction". Order follows the vocabulary
 * rather than the CV, so two CVs claiming the same things read the same.
 */
export function readSkills(text: string): string[] {
  const out: string[] = []
  for (const skill of SKILLS) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const boundary = /^[A-Za-z]/.test(skill) ? '\\b' : ''
    const trailing = /[A-Za-z0-9]$/.test(skill) ? '\\b' : ''
    if (new RegExp(`${boundary}${escaped}${trailing}`, 'i').test(text)) out.push(skill)
  }
  return out
}

/** Where they are, from the top of the CV where CVs put it. */
export function readLocation(lines: string[]): string | null {
  for (const line of lines.slice(0, 12)) {
    if (line.length > 70) continue
    const m = line.match(PLACE)
    if (!m) continue
    if (m[3]) return titleCase(m[3])
    return `${m[1]}, ${m[2]}`
  }
  return null
}

/** Years of experience, where the CV says so in words. */
export function readYears(text: string): number | null {
  const m = text.match(/(\d{1,2})\+?\s*(?:years?|yrs?)\b[^.\n]{0,24}(?:experience|exp\b)/i)
  if (m) return Number(m[1])
  const n = text.match(/(?:experience|exp)[^.\n]{0,16}?(\d{1,2})\+?\s*(?:years?|yrs?)/i)
  return n ? Number(n[1]) : null
}

// ── Education ─────────────────────────────────────────────────────────
//
// Rules only, and on purpose. A model may read a résumé better, but the
// résumé reader's model path (lib/extract) runs only where the company
// turned the model on, and this reading is the thing a degree is checked
// against, so it has to be the same reading whether or not a key exists.
// Nothing here calls a model, and nothing here decides anything: a line
// that cannot be read keeps its quote and leaves its fields empty.

/** The heading that opens the education section, on a line of its own. */
const EDUCATION_HEADING =
  /^(education|education\s*(?:&|and)\s*(?:training|certifications?|qualifications)|academic\s+(?:background|qualifications|history)|qualifications|degrees?)\s*:?$/i

/** A heading that closes it: the next section of the CV. */
const NEXT_SECTION =
  /^(curriculum vitae|resume|r[ée]sum[ée]|profile|summary|professional summary|career summary|objective|contact|personal details|skills|technical skills|core skills|key skills|core competencies|experience|work experience|professional experience|relevant experience|employment|employment history|work history|career history|certifications?|licen[cs]es?(?:\s*(?:&|and)\s*certifications?)?|projects?|awards?|honors|publications?|languages?|references?|interests|hobbies|volunteer(?:ing)?|training|courses|memberships?|affiliations)\s*:?$/i

/**
 * Qualification words, the longest first so "Bachelor of Science" is
 * read whole rather than as "Bachelor". Abbreviations are matched in
 * capitals only, so "be" and "ms" in a sentence are not a degree; words
 * are matched in any case. Horizontal on purpose: nursing, pharmacy and
 * law degrees read the same way as an engineering one.
 */
const DEGREE_NAME =
  '(?:Applied\\s+)?(?:Science|Arts|Engineering|Technology|Business\\s+Administration|Commerce|Laws|Fine\\s+Arts|Education|Pharmacy|Nursing|Computer\\s+Applications|Public\\s+Health|Social\\s+Work|Philosophy|Medicine|Surgery)'
const QUALIFICATION_WORDS = new RegExp(
  `\\b(?:(?:bachelor|master|associate)(?:['’]s)?(?:\\s+degree)?(?:\\s+of\\s+${DEGREE_NAME})?|doctor(?:ate)?(?:\\s+of\\s+${DEGREE_NAME})?|(?:post\\s*graduate\\s+)?diploma|high\\s+school\\s+diploma|GED)\\b`,
  'i'
)
const QUALIFICATION_ABBREVIATIONS =
  /(?<![A-Za-z.])(?:Ph\.\s?D\.?|PhD|Pharm\.?\s?D\.?|MBA|M\.B\.A\.|B\.\s?Sc\.?|BSc|M\.\s?Sc\.?|MSc|B\.\s?Tech\.?|BTech|M\.\s?Tech\.?|MTech|BSN|MSN|ADN|B\.\s?S\.?|M\.\s?S\.?|B\.\s?A\.?|M\.\s?A\.?|B\.\s?E\.?|M\.\s?E\.?|B\.\s?Com\.?|M\.\s?Com\.?|BCA|MCA|BS|MS|BA|MA|BE|ME|JD|J\.D\.|MD|M\.D\.)(?![A-Za-z])/g

/**
 * Two capitals after a comma at the end of a place are a state, not a
 * degree: "Boston, MA" names Massachusetts, and "Baltimore, MD" is not a
 * doctor of medicine.
 */
const STATE_AFTER_COMMA = /^(?:MA|MS|ME|MD)$/

/** Words that mark the part of a line that names a school. */
const SCHOOL =
  /\b(university|college|institute|school|academy|polytechnic|conservatory|seminary|universidad|universit[éeà]|hochschule|IIT|NIT|IIM)\b/i

const YEAR_TOKEN = /\b(19[4-9]\d|20\d\d)\b/g

/**
 * Read the education section into lines.
 *
 * Each line of the section is one claim. Where a line names a degree
 * but no school and the line before named only a school, the two are
 * read together and both are quoted, which is how most CVs lay it out:
 * the university on one line, the degree and the year under it.
 *
 * `now` sets "this year": a year after it is not a graduation year the
 * résumé can claim as done, so it is left empty rather than guessed.
 */
export function readEducation(raw: string, now: Date = new Date()): EducationLine[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim())
  const start = lines.findIndex((l) => EDUCATION_HEADING.test(stripBullet(l)))
  if (start < 0) return []

  const section: string[] = []
  for (const line of lines.slice(start + 1)) {
    const bare = stripBullet(line)
    if (!bare) continue
    if (NEXT_SECTION.test(bare) || EDUCATION_HEADING.test(bare)) break
    section.push(bare)
  }

  const thisYear = now.getUTCFullYear()
  const out: EducationLine[] = []
  let pending: string | null = null

  const flushPending = () => {
    if (pending === null) return
    out.push(readEducationLine(pending, thisYear))
    pending = null
  }

  for (const line of section) {
    const read = readEducationLine(line, thisYear)
    if (read.qualification === null) {
      // A line with no degree in it: a school, a year, an honor. Held
      // for one line, in case the degree is on the next.
      flushPending()
      pending = line
      continue
    }
    if (read.institution === null && pending !== null) {
      const before = readEducationLine(pending, thisYear)
      out.push({
        institution: before.institution ?? cleanSegment(pending.replace(YEAR_TOKEN, '')),
        qualification: read.qualification,
        fieldOfStudy: read.fieldOfStudy,
        year: read.year ?? before.year,
        quote: `${pending}\n${line}`,
      })
      pending = null
      continue
    }
    flushPending()
    out.push(read)
  }
  flushPending()
  return out
}

/** One line on its own: the degree, the field after "in" or "of", the year, and the rest as the school. */
export function readEducationLine(line: string, thisYear: number = new Date().getUTCFullYear()): EducationLine {
  const quote = line.trim()
  const years = [...quote.matchAll(YEAR_TOKEN)]
    .map((m) => Number(m[1]))
    .filter((y) => y >= 1940 && y <= thisYear)
  // A range ("2008 – 2012") ends on the graduation year.
  const year = years.length > 0 ? years[years.length - 1] : null

  const word = quote.match(QUALIFICATION_WORDS)
  const abbreviation =
    [...quote.matchAll(QUALIFICATION_ABBREVIATIONS)].find((m) => !isStateCode(quote, m)) ?? null
  const found =
    word && abbreviation
      ? (word.index! <= abbreviation.index! ? word : abbreviation)
      : word ?? abbreviation
  if (!found) {
    return { institution: SCHOOL.test(quote) ? schoolOf(quote) : null, qualification: null, fieldOfStudy: null, year, quote }
  }

  const qualification = found[0].replace(/\s+/g, ' ').replace(/\s+degree$/i, '').trim()
  const before = quote.slice(0, found.index!)
  let after = quote.slice(found.index! + found[0].length)

  // The field: what follows "in" or "of" straight after the degree, up to
  // the next separator, the year, or "from" / "at" naming the school.
  let fieldOfStudy: string | null = null
  const field = after.match(/^\s*,?\s*(?:in|of)\s+([^,|·–—(;]+?)(?=\s*(?:[,|·–—(;]|\s-\s|\b(?:from|at)\b|\b(?:19[4-9]\d|20\d\d)\b|$))/i)
  if (field) {
    fieldOfStudy = cleanSegment(field[1])
    after = after.slice(field[0].length)
  }

  const rest = `${before} , ${after}`
    .replace(YEAR_TOKEN, ' ')
    .replace(/\b(?:class of|graduated|expected|completed|awarded)\b/gi, ' ')
    .replace(/\(\s*\)/g, ' ')
  const institution = SCHOOL.test(rest) ? schoolOf(rest) : joinSegments(rest)

  return { institution, qualification, fieldOfStudy, year, quote }
}

function isStateCode(line: string, m: RegExpMatchArray): boolean {
  if (!STATE_AFTER_COMMA.test(m[0])) return false
  const before = line.slice(0, m.index!)
  const after = line.slice(m.index! + m[0].length)
  return /,\s*$/.test(before) && /^\s*(?:\d{5}(?:-\d{4})?)?\s*(?:$|[,|·–—;(])/.test(after)
}

function stripBullet(line: string): string {
  return line.replace(/^[-–—•·*▪◦|\s]+/, '').trim()
}

function segmentsOf(text: string): string[] {
  return text
    .split(/[,|·–—;]|\s-\s/)
    .map((s) => cleanSegment(s.replace(/^\s*(?:from|at)\s+/i, '')))
    .filter((s): s is string => s !== null)
}

function schoolOf(text: string): string | null {
  return segmentsOf(text).find((s) => SCHOOL.test(s)) ?? null
}

function joinSegments(text: string): string | null {
  const parts = segmentsOf(text)
  return parts.length > 0 ? parts.join(', ') : null
}

function cleanSegment(s: string): string | null {
  const t = s.replace(/[()]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '').trim()
  return t.length >= 2 ? t : null
}

/**
 * What to say above the reading.
 *
 * Names what is missing, because that is the only part the recruiter has
 * to do anything about.
 */
export function cvSentence(cv: ReadCv): string {
  if (!cv.text) return 'Paste a CV and it will fill this in.'

  const who = cv.name ?? 'Somebody'
  const what = cv.skills.length
    ? `${cv.skills.slice(0, 3).join(', ')}${cv.skills.length > 3 ? ` and ${cv.skills.length - 3} more` : ''}`
    : 'no skills recognized'

  const missing = [!cv.name && 'a name', !cv.email && 'an email address'].filter(Boolean)

  return missing.length
    ? `${who} — ${what}. Still needs ${missing.join(' and ')}.`
    : `${who} — ${what}.`
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
