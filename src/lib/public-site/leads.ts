/**
 * Lead capture, for people who asked to hear from us.
 *
 * ── Why this file is careful about something that looks trivial ──────
 *
 * Every staffing product on earth has a "request a demo" box, and most
 * of them are the front of a machine that buys a list, guesses at job
 * titles and sends eleven emails to somebody who never asked. That
 * machine works, in the sense that it produces meetings. It also trains
 * a market to filter you, and this product's entire argument is that the
 * noise in this industry is the problem. We do not get to add to it.
 *
 * So the rules are code rather than culture:
 *
 *   - No consent, no row. A moment somebody can point at, and words the
 *     person themselves wrote.
 *   - A purchased list is refused whole. Not filtered — refused, because
 *     an import that quietly keeps the good rows is a list that gets
 *     bought again next quarter.
 *   - A second ask updates what somebody wants. Two rows for one human
 *     is how you write to an address they left two years ago.
 *   - A customer stops being a lead the day they become one.
 *
 * ── Why it lives here ────────────────────────────────────────────────
 *
 * `src/lib/domains.ts` gives the market domain `lib/public-site`, and a
 * file with no owner fails `__tests__/invariants/domain-ownership.test.ts`
 * on the commit that adds it. `lib/marketing-leads` is the name this
 * should have; adding it to the map is the architect's call, and the map
 * was being edited by somebody else at the time. Asked for, not taken.
 *
 * Nothing here touches the database. The route does that.
 */

// ── Where somebody came from ────────────────────────────────────────

/**
 * The five ways a person reaches us, all of which start with them.
 *
 * There is deliberately no PURCHASED, no LIST and no OTHER. A source
 * enum with an escape hatch is an enum that ends up holding a bought
 * spreadsheet under whichever value looked least alarming.
 */
export const SOURCES = ['HOME_PAGE', 'DEMO', 'GENERATED_SITE', 'REFERRAL', 'EVENT'] as const
export type LeadSource = (typeof SOURCES)[number]

export function isSource(s: string | null | undefined): s is LeadSource {
  return !!s && (SOURCES as readonly string[]).includes(s)
}

/** Sources where the act of typing an address into a box IS the ask. */
const SELF_SERVED: readonly string[] = ['HOME_PAGE', 'DEMO', 'GENERATED_SITE']

// ── What somebody typed ─────────────────────────────────────────────

export interface AskInput {
  email: string
  name?: string | null
  companyName?: string | null
  source: string
  /** What they want, in their words. Never ours. */
  asked?: string | null
}

export interface Problem {
  field: 'email' | 'source' | 'asked' | 'name'
  says: string
}

/** Trimmed and lowercased, so one human is one row. */
export function normalEmail(e: string | null | undefined): string | null {
  const t = (e ?? '').trim().toLowerCase()
  return t.length > 0 ? t : null
}

/** Whitespace collapsed; empty becomes null rather than an empty string. */
export function tidy(s: string | null | undefined): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > 0 ? t : null
}

/**
 * The longest first message worth keeping.
 *
 * Not a technical limit — a honest one. Somebody pasting two thousand
 * characters into a first message has written a document, and the reply
 * they get will be about the first paragraph either way.
 */
const ASK_LIMIT = 2000

/**
 * What is wrong with this, in words that quote back what was typed.
 *
 * "Invalid email" tells somebody they are wrong without showing them
 * what they did. Half the time the mistake is visible the moment they
 * see their own text: a surname in the address field, a trailing comma
 * from a paste, an @ that never got typed.
 */
export function problems(input: AskInput): Problem[] {
  const out: Problem[] = []

  const typed = (input.email ?? '').trim()
  if (typed.length === 0) {
    out.push({
      field: 'email',
      says:
        'An email address, so somebody can write back. It is the only thing here we ' +
        'actually need — and if you would rather not leave one, the demo needs no sign-up.',
    })
  } else if (!typed.includes('@')) {
    out.push({
      field: 'email',
      says:
        `"${typed}" has no @ in it, so there is nowhere to send a reply. ` +
        'If that is a company name rather than an address, it goes in the box below.',
    })
  } else if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(typed)) {
    out.push({
      field: 'email',
      says:
        `"${typed}" is missing the part after the @ — a domain like cloudepa.com. ` +
        'Send it again with the whole address and it will go straight through.',
    })
  }

  if (!isSource(input.source)) {
    out.push({
      field: 'source',
      says:
        `"${input.source}" is not a way anybody reaches us. The five are ${SOURCES.join(', ')}, ` +
        'and every one of them starts with the person. There is no value here for a list ' +
        'somebody bought.',
    })
  }

  const asked = (input.asked ?? '').trim()
  if (asked.length > ASK_LIMIT) {
    out.push({
      field: 'asked',
      says:
        `That is ${asked.length.toLocaleString('en-US')} characters, and the shorter half is ` +
        'the part somebody will read. Send the sentence that matters and we will ask for the rest.',
    })
  }

  const name = (input.name ?? '').trim()
  if (name.length > 200) {
    out.push({ field: 'name', says: 'That is longer than a name. Put the detail in the box below.' })
  }

  return out
}

// ── A script, not a person ──────────────────────────────────────────

export interface SubmissionShape {
  /** A field a person never sees, and a script fills in because it is there. */
  honeypot?: string | null
  /** Milliseconds between the form appearing and being sent, if known. */
  filledInMs?: number | null
}

/**
 * Faster than anybody types an address and a sentence.
 *
 * Generous on purpose. Somebody pasting an address from their password
 * manager can be quick, and refusing a real person to stop a bot is a
 * bad trade — the honeypot does most of the work and this catches the
 * scripts that do not bother rendering the page.
 */
const HUMAN_FLOOR_MS = 1500

/**
 * Whether this was typed by somebody.
 *
 * Not by IP address. An office of forty people shares one, so blocking
 * it refuses thirty-nine who did nothing, and anybody scripting this at
 * volume has a proxy pool anyway. A rate limit keyed on an address is
 * theatre that hits the wrong people — a field only a script can see is
 * not.
 */
export function looksScripted(s: SubmissionShape): { scripted: boolean; says: string } {
  if ((s.honeypot ?? '').trim().length > 0) {
    return {
      scripted: true,
      says:
        'That form has a field people never see, and this filled it in. Nothing was ' +
        'saved. If you are a person and you are reading this, write to us directly and ' +
        'we will sort it out.',
    }
  }

  const ms = s.filledInMs
  // Absence of a timer is not evidence. An old browser, a blocked
  // script, somebody using the API — none of that makes them a robot.
  if (typeof ms === 'number' && ms >= 0 && ms < HUMAN_FLOOR_MS) {
    return {
      scripted: true,
      says:
        'That arrived faster than anybody types an address, so nothing was saved. ' +
        'Try it again at human speed.',
    }
  }

  return { scripted: false, says: 'Reads like somebody typed it.' }
}

// ── Asking twice ────────────────────────────────────────────────────

export interface OnFile {
  id: string
  email: string
  name?: string | null
  companyName?: string | null
  asked?: string | null
  consentAt: Date
  convertedCompanyId?: string | null
  convertedAt?: Date | null
}

/**
 * Both asks, newest first, with nothing thrown away.
 *
 * Somebody who wrote in June about tenure and in August about VMS email
 * has told you two different things, and the June one is often the
 * better one. Overwriting is the cheap implementation and it loses the
 * sentence that would have opened the conversation.
 */
export function mergeAsk(previous: string | null | undefined, next: string | null | undefined): string | null {
  const before = tidy(previous)
  const now = tidy(next)

  if (!now) return before
  if (!before) return now
  if (before === now) return before
  if (before.includes(now)) return before

  return `${now}\n\n${before}`
}

export interface AskVerdict {
  alreadyOnFile: boolean
  of?: OnFile
  /** What to store in `asked` after this message. */
  asked: string | null
  /** What to store in `consentAt` — the first time, never the latest. */
  consentAt: Date
  says: string
}

/**
 * One human, one row.
 *
 * Consent keeps the earlier date because consent is when they gave it.
 * Moving it forward on every message would quietly make an old
 * permission look fresh, which is the opposite of a record.
 */
export function secondAsk(input: AskInput, existing: OnFile | null, now: Date): AskVerdict {
  const asked = tidy(input.asked)

  if (!existing) {
    return {
      alreadyOnFile: false,
      asked,
      consentAt: now,
      says: 'First time we have heard from them.',
    }
  }

  return {
    alreadyOnFile: true,
    of: existing,
    asked: mergeAsk(existing.asked, asked),
    consentAt: existing.consentAt,
    says:
      `${existing.email} is already on file and asked before. This adds what they said ` +
      'this time rather than making a second of them.',
  }
}

// ── No consent, no row ──────────────────────────────────────────────

export interface ConsentEvidence {
  source: string
  /** When they asked. Not when the row was created. */
  consentAt?: Date | null
  /** Their words. */
  asked?: string | null
  /** Where somebody could go and check that this happened. */
  whereTheyAsked?: string | null
}

/**
 * Whether there is a person behind this row.
 *
 * Two things have to be true, and the second is the one lists fail: a
 * moment anybody can point at, and words the person themselves wrote or
 * said. A form somebody filled in is exempt from the second, because
 * typing your own address into a box that says a person reads this IS
 * the asking.
 */
export function consentVerdict(e: ConsentEvidence): { consented: boolean; says: string } {
  if (!e.consentAt) {
    return {
      consented: false,
      says:
        'There is no date on this — nobody can say when they asked, which usually ' +
        'means they did not. A row with no moment behind it is not a lead.',
    }
  }

  const selfServed = SELF_SERVED.includes(e.source)

  if (!tidy(e.whereTheyAsked) && !selfServed) {
    return {
      consented: false,
      says:
        'Nothing here says where they asked. "HR Tech, booth 214" is checkable; a source ' +
        'column is not, and in six months nobody will remember which it was.',
    }
  }

  if (!tidy(e.asked) && !selfServed) {
    return {
      consented: false,
      says:
        'There are no words of their own in this row. A name, a title and a company is ' +
        'what a list looks like — the thing that makes somebody a lead is that they said ' +
        'something.',
    }
  }

  return {
    consented: true,
    says: selfServed
      ? 'They filled in the form themselves, which is the asking.'
      : 'They asked, there is a date on it, and somewhere to go and check.',
  }
}

// ── A list somebody bought ──────────────────────────────────────────

export interface ImportRow extends ConsentEvidence {
  email: string
  name?: string | null
  companyName?: string | null
}

export interface ImportVerdict {
  refused: boolean
  /** The rows to write, or null. Null every time anything is refused. */
  accepted: ImportRow[] | null
  /** How many of the people in this file actually asked. */
  consented: number
  total: number
  says: string
}

/**
 * Whether this file may be loaded.
 *
 * All or nothing, deliberately. An import that keeps the twelve good
 * rows and drops the rest is an import that gets run again next quarter
 * with a bigger file, because it worked. Refusing the whole thing puts
 * the decision back where it belongs: with whoever bought it.
 */
export function reviewImport(rows: ImportRow[]): ImportVerdict {
  const total = rows.length

  if (total === 0) {
    return {
      refused: true,
      accepted: null,
      consented: 0,
      total: 0,
      says: 'There is nothing in this file. Nothing was written.',
    }
  }

  const verdicts = rows.map((r) => ({ row: r, v: consentVerdict(r) }))
  const consented = verdicts.filter((x) => x.v.consented).length
  const missing = total - consented

  if (missing === 0) {
    return {
      refused: false,
      accepted: rows,
      consented,
      total,
      says:
        `${total.toLocaleString('en-US')} ${total === 1 ? 'person' : 'people'} who each asked, ` +
        'each with a date and somewhere to check it. Loaded.',
    }
  }

  return {
    refused: true,
    accepted: null,
    consented,
    total,
    says:
      `${missing.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} rows have nobody's ` +
      'own words in them and no date when they asked, which means they did not ask. ' +
      'Nothing was written — not the good rows either, because an import that keeps those ' +
      'is an import that gets run again next quarter with a bigger file. ' +
      'If we mail this list, every one of those people learns about us the way they learn ' +
      'about everything else: by filtering it. We are selling a product whose argument is ' +
      'that the noise in this industry is the problem. ' +
      (consented > 0
        ? `${consented.toLocaleString('en-US')} of them did ask. Those are worth a real message, typed by somebody.`
        : 'Send the file back and put the money into the people who write to us.'),
  }
}

// ── Once they are a customer ────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function day(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export interface ConversionVerdict {
  update: { convertedCompanyId: string; convertedAt: Date } | null
  says: string
}

/**
 * The day somebody stopped being a lead.
 *
 * Written so nothing keeps courting a customer — the most avoidable
 * embarrassment in this whole category is a "still thinking about it?"
 * email to somebody who has been paying for three months.
 */
export function conversion(lead: OnFile, companyId: string, now: Date): ConversionVerdict {
  if (lead.convertedAt) {
    return {
      update: null,
      says:
        `${lead.email} was already recorded as converted on ${day(lead.convertedAt)}. ` +
        'The first date is the one that counts.',
    }
  }

  return {
    update: { convertedCompanyId: companyId, convertedAt: now },
    says: `${lead.email} became a customer on ${day(now)}, and stops being a lead today.`,
  }
}

/** Everybody who asked, has not become a customer, longest wait first. */
export function stillWaiting(leads: OnFile[]): OnFile[] {
  return leads
    .filter((l) => !l.convertedAt)
    .sort((a, b) => a.consentAt.getTime() - b.consentAt.getTime())
}

// ── Whose list this is ──────────────────────────────────────────────

export interface Staff {
  /** Email domains belonging to us. */
  domains: readonly string[]
  /** Named people, for anybody working with us on another address. */
  emails: readonly string[]
}

/**
 * Who may read the list of people who asked.
 *
 * This is the one table in the system that belongs to Etyme rather than
 * to a tenant, which makes it the one table where "the caller's company"
 * is the wrong question. A customer signing in must not be able to read
 * who else wrote to us — those are their competitors, and the list of
 * who is shopping for a workforce system is commercially interesting to
 * every single one of them.
 *
 * So it is an allow list of us, and everybody else is refused with the
 * reason rather than with a 404 that reads as a bug.
 */
export function mayReadTheList(
  email: string | null | undefined,
  staff: Staff
): { ok: boolean; says: string } {
  const e = normalEmail(email)
  if (!e) {
    return { ok: false, says: 'Sign in first. This is not a public list.' }
  }

  if (staff.emails.some((s) => normalEmail(s) === e)) {
    return { ok: true, says: 'Yours to read.' }
  }

  const domain = e.split('@')[1] ?? ''
  if (staff.domains.some((d) => domain === d.toLowerCase())) {
    return { ok: true, says: 'Yours to read.' }
  }

  return {
    ok: false,
    says:
      'This is Etyme\'s own list of people who wrote to us, not a list your company ' +
      'owns. Every other list in here is yours; this one is not, and the people on it ' +
      'are mostly somebody\'s competitors.',
  }
}

// ── The words on the page ───────────────────────────────────────────

/**
 * What the section says, kept here so a test can read it.
 *
 * No price: that is decided — free until the first five real vendors —
 * and it is recorded in CLAUDE.md rather than invented on a form. No
 * newsletter, no subscribe, no "updates", because none of those are
 * things we do. The only promise is one we can keep: somebody reads it.
 */
export const ASK_COPY = {
  eyebrow: 'Ask us something',
  heading: 'Tell us what you need and a person reads it',
  body:
    'Not a form that opens a sequence. There is no list to be added to and nothing ' +
    'automatic happens next — one of the people building this reads what you wrote and ' +
    'writes back, or tells you it is not built yet.',
  emailLabel: 'Your email',
  emailHint: 'The only thing we need.',
  askLabel: 'What do you need?',
  askHint: 'A sentence is enough. The problem in your words, not ours.',
  askPlaceholder: 'We run 40 contractors through 3 primes and cannot say who is where.',
  namePlaceholder: 'Your name, if you like',
  companyPlaceholder: 'Company, if you like',
  button: 'Send it',
  sending: 'Sending…',
  thanks: 'Got it. Somebody reads this and writes back.',
  after:
    'If you would rather look before you talk to anybody, the demo above needs no card ' +
    'and no sign-up.',
} as const
