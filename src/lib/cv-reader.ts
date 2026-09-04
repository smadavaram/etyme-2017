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
 * Guess a work authorisation. "Visa" appearing in a CV is as likely to
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
  /** The paste, kept whole. It becomes the resume text. */
  text: string
  /** What it could not work out, said plainly rather than left blank. */
  unknowns: string[]
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
 * with fifteen years". Length and capitalisation do not separate those
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

  const unknowns: string[] = []
  if (!name) unknowns.push('Could not find a name. Type it in.')
  if (!email) unknowns.push('No email address in the CV.')
  if (skills.length === 0) unknowns.push('No skills recognised — add the ones that matter.')
  // Never guessed. "Visa" in a CV is as likely to be a payment card as a
  // permit, and a wrong permit is how a placement collapses in week two.
  unknowns.push('Work authorisation is not read from a CV. Say what they hold.')

  return { name, email, phone, headline, skills, location, years, text, unknowns }
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
    // A sentence that happens to be short and capitalised is still a
    // sentence. "A dedicated professional with..." is four capitalised
    // words under forty characters and is nobody's name.
    if (words.some((w) => PROSE.has(w.toLowerCase().replace(/[^a-z]/g, '')))) continue
    // A lone letter is an initial only when it is punctuated as one.
    if (words.some((w) => w.length === 1 && !/^[A-Z]\.?$/.test(w))) continue
    // "Java, AWS" under a SKILLS heading is two capitalised words and is
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
    : 'no skills recognised'

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
