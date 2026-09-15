/**
 * A test for what the page says it is.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The positioning was agreed in conversation and the landing page went
 * on saying something else for a week — "Stop reading bad submissions",
 * which is one module describing itself, over a hero showing a
 * shortlist. It read as a hiring tool. Nothing caught it, because
 * positioning had no test and the founder had not seen the page.
 *
 * Every other class of mistake in this codebase gets caught by an
 * invariant. This one did not, and it is the most expensive kind: a
 * product that works and is understood as something smaller than it is.
 *
 * So the rules from CLAUDE.md are checkable functions now, run against
 * the actual copy on the actual page.
 *
 * ── What it can and cannot catch ─────────────────────────────────────
 *
 * It cannot tell you the writing is good. It can tell you the page
 * leads with a module instead of a category, reaches for AI, assumes
 * software staffing, or claims to place people. Those four are the ones
 * that have actually gone wrong or would end the business, and a rule
 * that catches four real failures beats a style guide nobody reads.
 */

export type Severity = 'WRONG' | 'RISKY'

export interface Finding {
  rule: string
  severity: Severity
  /** The words that triggered it, so somebody can go and look. */
  found: string
  says: string
}

/**
 * Words that name the category. At least one has to appear early, in
 * the words a buyer would use about their own problem — not ours.
 */
const CATEGORY = [
  'contingent', 'contractor', 'contractors', 'contract workers',
  'staffing', 'suppliers', 'supplier', 'vendors', 'workforce',
  'non-employee', 'extended workforce', 'temporary',
]

/**
 * Single modules, describing themselves.
 *
 * Naming one station makes the whole product read as that station. This
 * is the specific failure that happened: a screening headline over a
 * shortlist, on a product whose span is requisition to invoice.
 */
const MODULES = [
  'submission', 'submissions', 'shortlist', 'shortlisting',
  'resume', 'resumes', 'cv screening', 'screening',
  'timesheet', 'timesheets', 'invoice', 'invoices',
  'applicant', 'applicants', 'candidate pipeline',
]

/**
 * Never lead with this. It is in there, it does real work, and it is the
 * least defensible thing in the product — roughly half of what looks
 * like AI is plain rules, and that is a feature.
 */
const AI = [
  'ai', 'a.i.', 'artificial intelligence', 'llm', 'gpt', 'machine learning',
  // Hyphens are stripped before matching, so these read as two words.
  'ai powered', 'ai native', 'ai driven',
]

/**
 * Vertical assumptions. The same product has to work for a travel nurse
 * and a validation engineer, so anything that only makes sense for
 * software is wrong even when it reads well.
 */
const VERTICAL = [
  'developer', 'developers', 'engineer', 'engineers', 'engineering',
  'software', 'java', 'python', 'devops', 'full-stack', 'programmer',
  'tech talent', 'it staffing', 'coder', 'coders',
]

/**
 * Claims that break neutrality. Etyme never runs a bench and never
 * places anybody — the moment it competes with its own suppliers the
 * network stops growing.
 */
const NEUTRALITY = [
  'we place', 'we source', 'our consultants', 'our bench', 'our recruiters',
  'we find you', 'we hire', 'our talent pool', 'we recruit',
]

/**
 * Real companies, named on a public page.
 *
 * ── Why this is a rule and not a matter of taste ──────────────────────
 *
 * The page said "Or sit at a running program — Nike, Corning, Terumo BCT
 * — from whichever desk is yours." Those are the seeded demo tenants.
 * On a marketing page, above a button, "a running program" reads as
 * *these companies run their programs on Etyme*: three trademarked
 * enterprises framed as live customers, none of whom has heard of us.
 *
 * It walked straight past "claims no paying customers", because that
 * guard looked for the words a testimonial uses — "customers say",
 * "keep paying" — and a logo wall does not use them. A name is the
 * claim. So the name is what is checked.
 *
 * ── Why the list is short and named, not a trademark database ─────────
 *
 * There is no way to detect "is this a real company" from a string, and
 * a rule that tried would fail on Calder Manufacturing and Brightmoor
 * Talent, which are inventions in the worked examples and have to stay.
 * This is instead the specific set that has been on this page, plus the
 * ones somebody would reach for next: the household names, the peer
 * systems a comparison would name, and the large staffing firms. A
 * comparison is caught too, deliberately — "unlike Fieldglass" is a
 * claim about somebody else's product that nobody here has tested.
 *
 * Two-word names are matched whole, so "General Electric" is caught and
 * a sentence about electric vehicles is not. Nothing shorter than four
 * letters is listed, because "GE" and "SAP" appear inside ordinary words
 * and a guard that cries wolf gets deleted.
 */
const TRADEMARKED = [
  // On this page, until today.
  'nike', 'corning', 'terumo', 'terumo bct',
  // Household names, the sort a page reaches for to look established.
  'apple', 'google', 'microsoft', 'amazon', 'meta', 'facebook', 'tesla',
  'boeing', 'pfizer', 'siemens', 'general electric', 'johnson johnson',
  'walmart', 'intel', 'nvidia', 'netflix', 'starbucks', 'coca cola',
  // The systems a comparison would name.
  'fieldglass', 'beeline', 'coupa', 'workday', 'oracle', 'salesforce',
  'bullhorn', 'greenhouse', 'ceipal', 'icims', 'taleo', 'successfactors',
  'linkedin', 'indeed', 'ziprecruiter',
  // The large staffing and consulting firms.
  'accenture', 'deloitte', 'infosys', 'wipro', 'cognizant', 'capgemini',
  'randstad', 'adecco', 'manpower', 'aerotek', 'robert half',
  'insight global', 'kelly services', 'allegis',
]

function hits(text: string, words: string[]): string[] {
  const raw = text.toLowerCase()
  // Punctuation goes, so "Every contractor." still matches "contractor".
  // Keeping the full stop for "a.i." broke every other word, which is
  // why that one is checked against the raw text instead.
  const lower = ` ${raw.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `
  return words.filter((w) =>
    w.includes('.') ? raw.includes(w) : lower.includes(` ${w} `)
  )
}

/**
 * Every real company named in a piece of copy.
 *
 * Empty is the only acceptable answer on a public page. Each hit is the
 * name as listed, so somebody can search the file for it rather than
 * reading the whole page looking for the sentence.
 */
export function namedCompanies(text: string): string[] {
  const found = hits(text, TRADEMARKED)
  // "Terumo BCT" also matches "terumo"; report the longest form only, so
  // the message names the company the way the page did.
  return found.filter((name) => !found.some((other) => other !== name && other.includes(name)))
}

export interface Copy {
  /** Everything above the fold, in reading order. */
  hero: string[]
  /** The rest of the page. */
  body: string[]
}

export function check(copy: Copy): Finding[] {
  const findings: Finding[] = []
  const hero = copy.hero.join(' ')
  const all = [...copy.hero, ...copy.body].join(' ')

  // ── Category first ──────────────────────────────────────────────────
  //
  // The way Concur says travel and expense before it says anything
  // clever. A visitor should know what kind of thing this is before
  // they know what is good about it.
  const category = hits(hero, CATEGORY)
  if (category.length === 0) {
    findings.push({
      rule: 'category-first',
      severity: 'WRONG',
      found: copy.hero[0] ?? '(nothing above the fold)',
      says:
        'Nothing above the fold says what category this is. A visitor has to know ' +
        'it is about contractors and the suppliers who provide them before they know ' +
        'what is good about it — the way Concur says travel and expense first.',
    })
  }

  // ── One module, describing itself ───────────────────────────────────
  const moduleWords = hits(hero, MODULES)
  if (moduleWords.length > 0 && category.length === 0) {
    findings.push({
      rule: 'module-not-category',
      severity: 'WRONG',
      found: moduleWords.join(', '),
      says:
        `The hero leads with "${moduleWords[0]}" and never names the category. ` +
        'Naming one station makes the whole product read as that station — which is ' +
        'exactly how this page came to read as a hiring tool.',
    })
  }

  // ── Never lead with AI ──────────────────────────────────────────────
  const aiInHero = hits(hero, AI)
  if (aiInHero.length > 0) {
    findings.push({
      rule: 'never-lead-with-ai',
      severity: 'WRONG',
      found: aiInHero.join(', '),
      says:
        'The hero leads with AI. It is in there, it does real work, and it is the ' +
        'least defensible thing in the product — about half of what looks like AI is ' +
        'plain rules, and that is a feature. Lead with the record, not the model.',
    })
  }

  // ── Horizontal, never vertical ──────────────────────────────────────
  const vertical = hits(all, VERTICAL)
  if (vertical.length > 0) {
    findings.push({
      rule: 'horizontal-not-vertical',
      severity: 'RISKY',
      found: vertical.join(', '),
      says:
        `"${vertical[0]}" assumes software staffing. The same product has to work for ` +
        'a travel nurse and a validation engineer. Fine inside an illustration that is ' +
        'plainly one example; wrong in a headline or a claim.',
    })
  }

  // ── Somebody else's company, named on our page ──────────────────────
  //
  // Whether it is framed as a customer, a logo or a comparison, we
  // cannot stand behind it: nobody named has agreed to appear here.
  const named = namedCompanies(all)
  if (named.length > 0) {
    findings.push({
      rule: 'names-a-real-company',
      severity: 'WRONG',
      found: named.join(', '),
      says:
        `The page names ${named[0]}, and nobody at ${named[0]} has agreed to appear on it. ` +
        'A real company on a marketing page reads as a customer whatever the sentence ' +
        'around it says — "sit at a running program" made three seeded demo tenants read ' +
        'as three live programs. Use an invented firm, or describe the company instead ' +
        'of naming it.',
    })
  }

  // ── Neutrality is absolute ──────────────────────────────────────────
  const claims = hits(all, NEUTRALITY)
  if (claims.length > 0) {
    findings.push({
      rule: 'neutrality',
      severity: 'WRONG',
      found: claims.join(', '),
      says:
        `"${claims[0]}" says Etyme supplies people. It never runs a bench and never ` +
        'places anybody — the moment it competes with its own suppliers the network ' +
        'stops growing.',
    })
  }

  return findings
}

export interface Verdict {
  ok: boolean
  findings: Finding[]
  says: string
}

export function verdict(copy: Copy): Verdict {
  const findings = check(copy)
  const wrong = findings.filter((f) => f.severity === 'WRONG')

  return {
    ok: wrong.length === 0,
    findings,
    says:
      wrong.length === 0
        ? findings.length === 0
          ? 'Reads as the category it is.'
          : `Reads as the category it is, with ${findings.length} thing${findings.length === 1 ? '' : 's'} worth a second look.`
        : wrong[0].says,
  }
}

/**
 * Pulls the visible words out of a React page file.
 *
 * Crude on purpose. A renderer would be more accurate and would need the
 * page to run; this needs a file and catches the thing that actually
 * went wrong, which was words in the source that nobody read.
 */
export function copyFrom(source: string): string[] {
  const out: string[] = []

  // Text between tags, up to the next tag *or the next expression*:
  //
  //     >Some words here<
  //     >Some words here.{' '}
  //
  // The second shape is not a curiosity. The line naming three real
  // companies — "Or sit at a running program — Nike, Corning, Terumo BCT
  // — from whichever desk is yours.{' '}" — ended in a JSX space
  // expression, so the old pattern, which required a closing `<`, never
  // saw a word of it. A whole sentence of the page was outside every
  // rule in this file for as long as it was live. Anything a reader can
  // read has to be inside the guard, and a sentence with a link at the
  // end of it is the most ordinary thing on a marketing page.
  for (const m of source.matchAll(/>([^<>{}]{4,})(?=[<{])/g)) {
    const t = m[1].replace(/\s+/g, ' ').trim()
    if (t && /[a-zA-Z]/.test(t)) out.push(t)
  }

  // And the other half of the same sentence: prose that *starts* after an
  // expression, which is what a paragraph with a bold lead-in or an
  // inline link looks like.
  //
  //     <span>Supplying into a program?</span>{' '}
  //     You are on it because your client is, and nothing competes with you.
  //
  // A `}` also closes a block of code, and what follows that is code. So
  // this keeps only what cannot be code: prose has no `=`, no `;`, no
  // brackets, no slashes and no straight quotes, and starts with a
  // letter. Crude, and it is the difference between a guard that reads
  // the page and a guard that reads most of it.
  for (const m of source.matchAll(/\}([^<>{}]{4,})(?=[<{])/g)) {
    const t = m[1].replace(/\s+/g, ' ').trim()
    if (!/^[A-Za-z]/.test(t)) continue
    if (/[=;*[\]'`\\/]/.test(t)) continue
    if (t.split(' ').length < 3) continue
    out.push(t)
  }

  // String literals long enough to be prose rather than a class name.
  for (const m of source.matchAll(/(?:^|[\s({[,:])'([^'\\]{12,})'/g)) {
    const t = m[1].trim()
    if (/^[A-Z]/.test(t) && / /.test(t) && !t.includes('/')) out.push(t)
  }

  return out
}

// ── The other way a page fails a reader ───────────────────────────────
//
// The four rules above catch a page that says the wrong thing. This
// catches a page that says the right thing at 375 pixels and cannot be
// read. The founder reads this on a phone, and a `grid-cols-2` with no
// breakpoint prefix is two columns at every width including his — the
// same class of bug that put half a surname in an email field on
// another screen the same day.
//
// Tailwind is mobile-first: an unprefixed column count applies from
// zero up. So an unprefixed count of anything other than one is a
// declaration that the layout never stacks, which is almost never what
// was meant.

/**
 * Column counts that apply at every width, phone included.
 *
 * Returns the offending class tokens so somebody can go and look. An
 * empty array means every multi-column grid on the page stacks by
 * default and splits only when there is room.
 */
export function gridsWithoutBreakpoint(source: string): string[] {
  const out: string[] = []
  for (const m of source.matchAll(/(^|[\s"'`])((?:[a-z0-9]+:)*)grid-cols-([\w[\]().,_%-]+)/g)) {
    const prefixes = m[2]
    const value = m[3]
    // A single column at every width is a single column, which stacks
    // by definition and is what a phone wants anyway.
    if (value === '1') continue
    // Anything carrying a variant — sm:, md:, lg:, and also hover: or
    // print: — was a deliberate choice about when it applies.
    if (prefixes.length > 0) continue
    out.push(`grid-cols-${value}`)
  }
  return out
}

// ── A price nobody has settled ────────────────────────────────────────
//
// Etyme is free while it is proved out with the first five firms, and
// the price is set after that. Until then no page, deck or conversation
// invents a number, a range or a unit — a figure put on a landing page
// to look like a real company is a figure we have to walk back, and a
// reader would be right to hold it against us.
//
// The page is allowed to carry money: the worked example shows a
// contractor at $78/hr and an invoice at $11,856, which is what the
// product records rather than what it charges. So this looks for the
// *units a software price is quoted in* rather than for dollar signs,
// which is the difference between "here is a placement" and "here is
// what we would bill you for it".

/**
 * The shapes a SaaS price takes when somebody writes one down.
 *
 * Deliberately not "per contractor" or "per hire": the page already
 * says "one record per contractor, across every supplier they use",
 * which is a description of the record and not a billing unit. A guard
 * that fires on that sentence gets deleted by the next person, and then
 * nothing is guarding anything.
 */
const PRICE_UNITS: { pattern: RegExp; says: string }[] = [
  { pattern: /\bper\s+(?:seat|user|month|year|placement|requisition)\b/i,
    says: 'a billing unit' },
  { pattern: /\$\s?\d[\d,]*(?:\.\d+)?\s*(?:\/|\bper\b)\s*(?:seat|user|mo\b|month|yr\b|year)/i,
    says: 'a rate per seat or per period' },
  { pattern: /\b\d+(?:\.\d+)?\s*%\s*(?:of\s+)?(?:spend|margin|bill rate|markup|invoice value)\b/i,
    says: 'a percentage of spend' },
  { pattern: /\bstarting at\b/i, says: 'an opening price' },
  { pattern: /\bpricing (?:starts|plans|tiers)\b/i, says: 'a price list' },
  { pattern: /\b(?:contact us for|request) (?:a )?(?:pricing|a quote)\b/i,
    says: 'a quote, which is a price with the number hidden' },
]

/**
 * Anything on a page that reads as a price for Etyme itself.
 *
 * Empty is the only acceptable answer while the price is unsettled.
 * Each hit carries the words that triggered it, so somebody can go and
 * look rather than guess which sentence is the problem.
 */
export function priceClaims(text: string): string[] {
  const out: string[] = []
  for (const { pattern, says } of PRICE_UNITS) {
    const m = text.match(pattern)
    if (m) out.push(`${m[0].trim()} — ${says}`)
  }
  return out
}
