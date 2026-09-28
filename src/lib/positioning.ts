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
 *
 * ── Widened 2026-09-20, when Etyme began offering to run the program ──
 *
 * The founder decided Etyme will run a client's contractor program
 * itself, as a vendor-neutral program office. That put a new sentence on
 * the page — "Etyme's program office runs the program for you" — and the
 * old list would have let through the sentence that actually breaks the
 * rule: "we supply the contractors". So the list now names the supply
 * verbs with a person as their object, and `RUNS_THE_PROGRAM` below says
 * in code what the difference is, rather than leaving it to whoever
 * widens the list next.
 *
 * Running a program means deciding who may supply and at what band,
 * releasing roles, chasing paperwork and matching bills. Supplying
 * people means having a bench and putting somebody on it in front of a
 * client. The first is the offer. The second is the master-vendor model
 * and is excluded permanently.
 */
const NEUTRALITY = [
  'we place', 'we source', 'our consultants', 'our bench', 'our recruiters',
  'we find you', 'we hire', 'our talent pool', 'we recruit',
  // The supply claim the program office offer could reach for, which the
  // list above would have missed entirely.
  'we supply', 'we staff', 'we fill', 'we provide contractors', 'we provide talent',
  'our contractors', 'our candidates', 'our workers', 'our talent', 'our own people',
  'etyme supplies', 'etyme places', 'etyme sources', 'etyme recruits',
  'master vendor',
]

/**
 * The offer's own words, which two rules would otherwise misread.
 *
 * These phrases are taken out of the text before the neutrality words
 * and the vertical words are looked for, so neither rule can be read as
 * refusing the offer itself. Two different misreadings are being
 * prevented, and both are real:
 *
 *   neutrality  "runs the program" is not a claim to supply people.
 *               Running a program means deciding who may supply and at
 *               what band, releasing roles, chasing paperwork and
 *               matching bills. Supplying people means having a bench.
 *
 *   vertical    "VMS software" carries the word software, and the
 *               vertical list is looking for software *staffing* — a
 *               page about developers and engineers. A buyer's name for
 *               a product category is not a claim about which industry
 *               this serves, and the page has to be free to use the two
 *               labels the buyer already knows.
 *
 * It is the place to look when somebody widens either list and
 * accidentally catches the product.
 */
const THE_OFFER = [
  'runs the program', 'run the program', 'runs your program', 'run your program',
  'runs it for you', 'run it for you', 'program office', 'msp provider',
  'vms software', 'runs the program office',
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
 *
 * ── The exception that lasted an evening, 2026-09-20 ─────────────────
 *
 * The founder gave the home page to the CTO of a two-billion-dollar
 * company with forty to fifty contractors — the exact buyer. He said he
 * did not understand what the app does. The founder said "we are SAP
 * Fieldglass" and it connected at once, so for a few hours this file
 * carried one allowed sentence naming SAP Fieldglass and Beeline.
 *
 * The founder then read the page on his phone and struck it: "Invoking
 * SAP Fieldglass and Beeline will trigger more questions than answers."
 * A rival's name on a page invites "how are you different", "are you
 * certified like them", "who else uses you", and a page cannot finish
 * that argument — a conversation can, which is where the comparison
 * belongs. The page says the category and the size instead.
 *
 * So there is no exception. Every named company, anywhere on the page,
 * framed as a customer or as a comparison, is refused.
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
  // Added 2026-09-26, when the documentation came across from the static
  // site with a column headed "What SAP calls it" on every page and an
  // integrations table marking SAP, Concur and a dozen others as
  // connected. None of them has agreed to appear, and none of those
  // connectors exists. "SAP" is three letters and breaks the four-letter
  // floor below on purpose: it is matched as a whole word, the brief
  // named it, and an ERP's name in a crosswalk is exactly the comparison
  // the founder struck on 2026-09-20.
  'sap', 'concur', 'magnit', 'netsuite', 'quickbooks', 'xero', 'docusign',
  'okta', 'checkr', 'hireright', 'adobe', 'dynamics 365', 'computer futures',
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
 * The text with the offer's own words taken out.
 *
 * Exported so the test can show the two readings side by side: a page
 * that says Etyme runs a client's program passes, and a page that says
 * Etyme supplies the contractors does not.
 */
export function settingTheOfferAside(text: string): string {
  let out = text.toLowerCase()
  for (const phrase of THE_OFFER) out = out.split(phrase).join(' ')
  return out
}

/**
 * Every real company named in a piece of copy.
 *
 * Empty is the only acceptable answer on a public page, with nothing set
 * aside — a comparison is a named company too. Each hit is the name as
 * listed, so somebody can search the file for it rather than reading the
 * whole page looking for the sentence.
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
  // Read with the offer's own words set aside, so "VMS software" — the
  // label a buyer uses for the category — is not read as a page about
  // software staffing. "Software engineers" still trips it.
  const vertical = hits(settingTheOfferAside(all), VERTICAL)
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
  //
  // Read against the text with the program-office sentences taken out,
  // because running somebody's program is not supplying them people.
  const claims = hits(settingTheOfferAside(all), NEUTRALITY)
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

// ── Outcomes, benefits and methods — not metaphors ────────────────────
//
// Added 2026-09-20, on the founder reading the rebuilt page: "The home
// page is filled with metaphors rather than outcomes, benefits and
// methods."
//
// He is right, and the four rules above could not see it. A page can
// name the category, keep AI out of the hero, place nobody and stay
// horizontal, and still say "that's the gap" and "the bill comes the
// week somebody stops accepting the caveat" — sentences a program
// manager reading English as a second language parses twice and still
// cannot act on.
//
// Three of the failures are mechanical enough to check, so they are
// checked here rather than left to whoever reads the page next:
//
//   1. a headline with no verb in it is a slogan, and a slogan is a
//      claim nobody can agree or disagree with
//   2. a sentence over thirty words is two sentences somebody has not
//      split yet
//   3. a gate quoted on a marketing page has to be the sentence the
//      software actually says, which the test proves against the source
//      rather than against the page's word for it
//
// What this still cannot tell you is whether the writing is good. It
// can tell you the page has gone back to being clever.

/**
 * Every headline written as literal text in the page source.
 *
 * Headlines rendered from data — the four questions, the three
 * exposures, the four screens — are deliberately not here: they are
 * checked as the data they come from, where the shape of the row says
 * what each field is for. This is the prose a writer types straight
 * into a heading, which is where a slogan goes.
 */
export function headlinesFrom(source: string): string[] {
  const out: string[] = []
  for (const m of source.matchAll(/<h[1-3][^>]*>([^<>{}]+?)<\/h[1-3]>/g)) {
    const t = m[1].replace(/\s+/g, ' ').trim()
    if (t && /[a-zA-Z]/.test(t)) out.push(t)
  }
  return out
}

/**
 * The verbs a plain sentence about this product is built from.
 *
 * Finite forms only. A participle is what a slogan uses to sound like a
 * sentence without being one — "Four questions, answered before lunch"
 * has no subject and nothing to disagree with — so "answered" is not in
 * here and "answer" is.
 */
const VERBS = [
  'is', 'are', 'was', 'were', 'be', 'can', 'cannot', 'may', 'will', 'do', 'does', 'have', 'has',
  'add', 'adds', 'answer', 'answers', 'arrive', 'arrives', 'ask', 'asks', 'block', 'blocks',
  'buy', 'buys', 'call', 'calls', 'change', 'changes', 'charge', 'charges', 'check', 'checks',
  'come', 'comes', 'cost', 'costs', 'count', 'counts', 'cover', 'covers', 'end', 'ends',
  'file', 'files', 'find', 'finds', 'fix', 'fixes', 'get', 'gets', 'give', 'gives', 'go', 'goes',
  'hire', 'hires', 'hold', 'holds',
  // "Join forces with global teams around the world" — the founder's line,
  // 2026-09-27. An imperative is a finite verb and the line is a sentence.
  'join', 'joins',
  'keep', 'keeps', 'know', 'knows', 'land', 'lands',
  'leave', 'leaves', 'list', 'lists', 'look', 'looks', 'make', 'makes', 'match', 'matches',
  'move', 'moves', 'name', 'names', 'need', 'needs', 'open', 'opens', 'pay', 'pays',
  'put', 'puts', 'read', 'reads', 'record', 'records', 'replace', 'replaces', 'run', 'runs',
  'say', 'says', 'see', 'sees', 'send', 'sends', 'settle', 'settled', 'show', 'shows',
  'sign', 'signs', 'sit', 'sits', 'spend', 'spends', 'stay', 'stays', 'stop', 'stops',
  // "Supply people to a program instead?" — the supplier's door on the
  // home page, 2026-09-27. The trade's own verb for what a supplier does.
  'supply', 'supplies',
  'take', 'takes', 'tell', 'tells', 'travel', 'travels', 'use', 'uses', 'watch', 'watches',
  'work', 'works', 'write', 'writes',
]

/**
 * The headlines with no verb in them.
 *
 * Empty is the only acceptable answer, with one exception the caller
 * passes in: the hero line the founder signed off, "Every contractor.
 * Every supplier. One record." It is three noun phrases and it stays,
 * because it is the one line on the page a reader is meant to remember
 * rather than act on. Everything under it says what it means.
 */
export function withoutVerb(headings: string[], allowed: string[] = []): string[] {
  return headings.filter((h) => {
    if (allowed.includes(h)) return false
    const words = h.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
    return !words.some((w) => VERBS.includes(w))
  })
}

/**
 * Sentences longer than a reader can hold.
 *
 * Thirty words is the refusal line, not the target — the target is
 * about twenty, and an agent asked for twenty writes twenty-eight. A
 * sentence over thirty is two sentences with the full stop missing, and
 * it is read by somebody whose first language is not English.
 *
 * Returns the offenders with their length, so the message names the
 * sentence to split rather than the page to reread.
 */
export function longSentences(text: string, max = 30): string[] {
  const out: string[] = []
  for (const raw of text.split(/(?<=[.!?])\s+/)) {
    const words = raw.trim().split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w))
    if (words.length > max) out.push(`${words.length} words: ${raw.trim()}`)
  }
  return out
}

// ── Nothing on the page is aimed at a supplier ────────────────────────
//
// Added 2026-09-20, on the founder: "MSP selling should be undercover
// selling and more as value addition rather than fully pitching for the
// market. Remove the threat if any to supply chain."
//
// The neutrality rule above catches the page claiming Etyme supplies
// people. It cannot catch the other half of the same problem, which is
// a page that keeps the promise and still reads, to the firm that put
// its consultants in the system, as a tool bought to catch it. "See
// what your suppliers are really charging" breaks no rule in this file
// and costs the network, because a supplier who reads the page as
// hostile does not join and there is nothing to sell a client.
//
// The distinction the guard draws is the one the founder drew: a
// sentence about the client's own knowledge is fine — "are we paying
// two suppliers differently for the same work" is a question a CFO
// asks about their own company — and a sentence about catching
// somebody is not. So most patterns fire only when a supplier is named
// in the same sentence, and the few that are hostile on their own
// (a hidden markup, overcharging, nowhere to hide) fire anywhere.
//
// Why sentence by sentence rather than word by word: the live page
// already says "most companies have never been caught by any of this",
// which is about the reader's own company and has to stay. A word list
// would refuse it, somebody would delete the guard, and then nothing
// guards anything.

const SUPPLIER_WORD =
  /\b(?:supplier|suppliers|supplier's|vendor|vendors|sub-vendor|sub-vendors|staffing firm|staffing firms|prime|primes)\b/i

const AIMED_AT_SUPPLIERS: { pattern: RegExp; says: string; needsSupplier?: boolean }[] = [
  { pattern: /\b(?:catch|catches|catching|caught)\b/i, says: 'catching a supplier out', needsSupplier: true },
  { pattern: /\b(?:expose|exposes|exposing|exposed)\b/i, says: 'exposing a supplier', needsSupplier: true },
  { pattern: /\b(?:hidden|secret|undisclosed)\s+(?:markup|markups|margin|margins|fee|fees|spread)\b/i,
    says: 'a hidden markup, which is an accusation' },
  { pattern: /\bmarkups?\b/i, says: 'the supplier’s markup, named as the thing to find', needsSupplier: true },
  { pattern: /\bovercharg(?:e|es|ed|ing)\b/i, says: 'overcharging' },
  { pattern: /\b(?:watch|watches|watching|monitor|monitors|monitoring|police|polices|policing)\s+(?:your\s+|the\s+|their\s+)?(?:supplier|suppliers|vendor|vendors)\b/i,
    says: 'watching suppliers' },
  { pattern: /\b(?:compare|compares|comparing|rank|ranks|ranking|score|scores|scoring)\s+(?:your\s+|the\s+|their\s+)?(?:supplier|suppliers|vendor|vendors)\b/i,
    says: 'comparing suppliers against each other' },
  { pattern: /\b(?:supplier|suppliers|vendor|vendors)\s+(?:cannot|can\s?not|can’t|can't)\s+hide\b/i,
    says: 'suppliers cannot hide' },
  { pattern: /\bnowhere to hide\b/i, says: 'nowhere to hide' },
  // ── The one this guard missed for a day, 2026-09-21 ────────────────
  //
  // The page's own headline read "Etyme shows every contractor on your
  // sites, including contractors your suppliers' subcontractors
  // placed". Every rule above passed it: no markup, no catching, no
  // watching. And to a prime it says the client will be shown the firm
  // the prime buys from, which is the whole of the NDA between them and
  // the reason "a sub-vendor's name is the prime's to keep" is a
  // ratified decision rather than a preference.
  //
  // What the record actually does is narrower, and the difference is
  // the product: the client sees the person and the standing of
  // whoever employs them — insured or not, authorized or not, which is
  // the client's own exposure — and sees the sub by name only where its
  // own agreement with the prime requires it. A page that promises more
  // than that costs the supply side, which is where the people are.
  { pattern: /\b(?:your|their)\s+suppliers?[’']?s?\s+sub-?\s?contractors?\b/i,
    says: 'the client being promised its suppliers’ own subcontractors' },
  { pattern: /\bsub-?\s?contractors?\s+(?:placed|put forward|supplied|sent|billed)\b/i,
    says: 'the subcontractors behind a supplier, named as something the client is shown' },
  { pattern: /\bcrack(?:ing)? down\b/i, says: 'cracking down' },
  { pattern: /\b(?:squeeze|squeezing|leverage over|play(?:ing)? (?:them|one)\s+off)\b/i,
    says: 'using the record against them', needsSupplier: true },
]

/**
 * Every sentence a supplier would read as aimed at them.
 *
 * Empty is the only acceptable answer on a public page. Each hit is the
 * sentence and what tripped it, so somebody can rewrite the sentence
 * rather than hunt the page for it.
 */
export function readsAsAimedAtSuppliers(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/(?<=[.!?])\s+/)) {
    const sentence = raw.trim()
    if (!sentence) continue
    const names = SUPPLIER_WORD.test(sentence)
    for (const { pattern, says, needsSupplier } of AIMED_AT_SUPPLIERS) {
      if (needsSupplier && !names) continue
      const m = sentence.match(pattern)
      if (m) {
        out.push(`${says} — "${sentence}"`)
        break
      }
    }
  }
  return out
}

// ── The program office service is sold quietly ────────────────────────
//
// Etyme will run a client's program where the client would rather not
// staff one. It is a service sold on top of the record, and the founder
// asked for it to read as a value added rather than as the thing being
// pitched. Two ways that goes wrong, and both are mechanical:
//
//   1. the offer creeps into a headline, and the page stops selling the
//      record and starts selling a managed service
//   2. the offer is repeated until it is the page's argument, which is
//      what "fully pitching for the market" means
//
// So the offer is counted rather than described. What counts is a
// sentence saying Etyme would run it *for you* — not the words "program
// office", which the page needs constantly for the client's own.

const THE_OFFER_SENTENCE = [
  /\brun(?:s)? it for you\b/i,
  /\brun(?:s)? the program for you\b/i,
  /\brun(?:s)? your program\b/i,
  /\bprogram office without hiring one\b/i,
  /\bEtyme(?:’s|'s)? (?:own )?program office runs\b/i,
]

/**
 * Every sentence on a page that offers to run the client's program.
 *
 * The hero carries one, quietly, after the record sentence. The section
 * that explains the option carries one more. Anywhere else, and in any
 * headline, it has stopped being a second option and become the pitch.
 */
export function offersTheProgramOffice(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/(?<=[.!?])\s+/)) {
    const sentence = raw.trim()
    if (sentence && THE_OFFER_SENTENCE.some((p) => p.test(sentence))) out.push(sentence)
  }
  return out
}

// ── Sizing against the incumbents is a pitch ──────────────────────────
//
// The page said "An MSP normally wants a program of hundreds of
// contractors. Etyme's program office takes programs with five to
// fifteen suppliers." Both halves are probably true and together they
// are a competitive claim about firms nobody here has spoken to, on
// behalf of a service that has never been delivered. It also tells a
// reader they are the client the real ones would not take, which is a
// strange thing to say to somebody you are asking to trust you.
//
// Describing the buyer is not sizing: "a company with a dozen
// suppliers" says who this is for without measuring anybody. What is
// caught is the comparison.

const SIZING: { pattern: RegExp; says: string }[] = [
  { pattern: /\bMSPs?\b[^.]{0,60}\b(?:normally|usually|typically|only|rarely|will not|won’t|won't|do not|don’t)\b/i,
    says: 'what an MSP will and will not take' },
  { pattern: /\bprograms? (?:of|with) (?:hundreds|thousands)\b/i, says: 'the size of program somebody else wants' },
  { pattern: /\b(?:too small|not big enough|beneath) (?:for|to interest)\b/i, says: 'the reader being too small for somebody else' },
  { pattern: /\bclients (?:they|the incumbents|nobody else) (?:will not|won’t|won't|would not) take\b/i,
    says: 'the clients somebody else refuses' },
  { pattern: /\bunlike (?:an?|the) (?:MSP|VMS|incumbent)/i, says: 'a comparison with an incumbent' },
  { pattern: /\bnone of (?:them|the incumbents) can\b/i, says: 'a claim about what rivals cannot do' },
]

/**
 * Anything on a page that measures Etyme against the incumbents.
 *
 * Empty is the only acceptable answer while no program has been run.
 */
export function sizesAgainstIncumbents(text: string): string[] {
  const out: string[] = []
  for (const { pattern, says } of SIZING) {
    const m = text.match(pattern)
    if (m) out.push(`${m[0].trim()} — ${says}`)
  }
  return out
}

// ── Open to every size. Decided 2026-09-28 ────────────────────────────
//
// For a day the category line read "Contingent workforce management for
// companies with 20 to 200 contractors. The vendor management system,
// sized for fifty contractors rather than five thousand." The founder
// struck the range: "Declare category as Enterprise Contingent workforce
// mgmt. Don't limit to 50–500 consultants — keep the business open for
// all." So a public page may describe what the product does for any
// company and may not tell a reader which size of company it is for.
//
// This is a different rule from the one above. That one catches Etyme
// measured against the incumbents; this one catches the reader measured
// against a range, which turns away everybody outside it. A worked
// example with a count in it ("a company with a dozen suppliers") is not
// caught: it names a situation, not a limit.

const BUYER_SIZE: { pattern: RegExp; says: string }[] = [
  { pattern: /\b(?:\d[\d,]*|twenty|thirty|forty|fifty|a hundred|one hundred)\s*(?:to|–|—|-)\s*(?:\d[\d,]*|(?:one |two |three |five )?hundred|(?:one |two |five )?thousand)\s+(?:contractors|consultants|contract workers|workers)\b/i,
    says: 'a range of contractors the product is for' },
  { pattern: /\bsized for\b/i, says: 'the size of company the product is for' },
  { pattern: /\brather than (?:\d[\d,]*|five|ten|a|one|two) (?:hundred|thousand)\b/i, says: 'a size the product is not for' },
  { pattern: /\b(?:too big|too large) for a spreadsheet\b|\btoo small for the enterprise\b/i,
    says: 'a band of company sizes, stated as its two edges' },
  { pattern: /\b(?:only )?for (?:companies|firms|clients|businesses) (?:with|of) (?:\d|twenty|thirty|forty|fifty|a hundred|hundreds|thousands|up to|under|over|fewer|more)/i,
    says: 'the number of contractors a buyer must have' },
]

/**
 * Anything on a page that limits who may buy by how many contractors
 * they have. Empty is the only acceptable answer since 2026-09-28.
 */
export function sizesTheBuyer(text: string): string[] {
  const out: string[] = []
  for (const { pattern, says } of BUYER_SIZE) {
    const m = text.match(pattern)
    if (m) out.push(`${m[0].trim()} — ${says}`)
  }
  return out
}

// ── "Vendor management system", banned. Decided 2026-09-28 ───────────
//
// On the morning of 2026-09-28 the category became "Enterprise contingent
// workforce management", and "vendor management system" was allowed to
// stay once, as the word a buyer's procurement searches for. The same
// evening, in his go-to-market edit list, the founder struck that too:
// the phrase is banned on public pages, and the category is the one
// sentence and nothing else. A buyer who reads "vendor management system"
// files Etyme beside the enterprise suites and asks the questions a page
// cannot finish — the same reason no competitor is named.
//
// Matched on the words, in any case, with or without a hyphen or a plural,
// so "Vendor-management systems" is caught too. "VMS" alone is not: it is
// the acronym a buyer uses for the system already on their desk ("keep
// your ATS, your VMS"), and "VMS software" is one of the founder's two
// labels for the ways to run a program (2026-09-20). If those go too, the
// founder says so and the pattern widens here.

const VMS_PHRASE = /\bvendor[\s-]+management[\s-]+systems?\b/gi

/**
 * Every "vendor management system" on a page. Empty is the only
 * acceptable answer on a public page since 2026-09-28.
 */
export function vendorManagementSystem(text: string): string[] {
  return [...text.matchAll(VMS_PHRASE)].map((m) => m[0])
}

// ── A claim the reader cannot check. Decided 2026-09-28 ───────────────
//
// The founder: "You are targeting well-versed IT people; they rarely buy
// anything because of claims. Our main goal is registering as a
// trustworthy brand." An engineer discounts an adjective the moment he
// reads it, and discounts the page with it. So a public page says what
// the software does, plainly, or states a fact a reader can check on the
// site — the demo with no account, a screen, the public documentation,
// the security position — and never:
//
//   - a hype adjective or a superlative ("seamless", "powerful",
//     "best-in-class"), which nobody can check and everybody discounts
//   - a speed nobody measured ("in minutes", "set up in days"), which is
//     a promise about a client we have not onboarded
//   - a badge the company has not earned ("enterprise-grade",
//     "bank-level security", "trusted by", "industry-leading"), which the
//     security position would contradict on the next click
//
// The list is words, not meaning, on purpose: it is the part of the rule
// a machine can hold. The other part — is this sentence checkable — is
// the founder's to read, and the test names say so.

const UNVERIFIABLE: { pattern: RegExp; says: string }[] = [
  { pattern: /\b(?:seamless(?:ly)?|effortless(?:ly)?|powerful|revolutionary|game[- ]chang(?:er|ing)|cutting[- ]edge|state[- ]of[- ]the[- ]art|next[- ]generation|world[- ]class|best[- ]in[- ]class|robust|blazing(?:ly)?|lightning[- ]fast|supercharge[sd]?|unparalleled|unrivall?ed|magic(?:al|ally)?|delightful|intuitive|frictionless|turnkey)\b/i,
    says: 'a hype adjective nobody can check' },
  { pattern: /\b(?:the )?(?:best|fastest|easiest|smartest|simplest|most (?:powerful|advanced|complete|comprehensive|trusted|secure))\b(?! practice)/i,
    says: 'a superlative nobody can check' },
  { pattern: /\b(?:industry[- ]leading|market[- ]leading|leading provider|enterprise[- ]grade|bank[- ](?:level|grade)|military[- ]grade|trusted by|loved by|used by (?:thousands|hundreds|leading))\b/i,
    says: 'a badge nobody has awarded' },
  { pattern: /\b(?:in|within|under) (?:minutes|seconds|hours|days|a few (?:minutes|hours|days)|an (?:afternoon|hour)|\d+ (?:minutes|seconds))\b/i,
    says: 'a speed nobody has measured' },
  { pattern: /\b(?:set ?up|live|up and running|onboard(?:ed)?|deploy(?:ed)?) (?:in|within) \w+/i,
    says: 'a set-up time nobody has measured' },
  { pattern: /\b(?:save|cut|reduce|lower)s?\b[^.]{0,40}?\d+\s*%|\b\d+x (?:faster|cheaper|more)\b/i,
    says: 'a result nobody has measured' },
  { pattern: /\b(?:guaranteed|100% (?:compliant|accurate|secure)|never miss(?:es)? a)\b/i,
    says: 'a guarantee the software cannot give' },
  { pattern: /!/, says: 'an exclamation' },
]

/**
 * Every phrase on a page that claims what a reader cannot check.
 *
 * Empty is the only acceptable answer on a public page. Each hit is the
 * words and why they were refused, so somebody can find the sentence.
 */
export function unverifiableClaims(text: string): string[] {
  const out: string[] = []
  for (const { pattern, says } of UNVERIFIABLE) {
    const m = text.match(pattern)
    if (m) out.push(`${m[0].trim()} — ${says}`)
  }
  return out
}

// ── A button that promises an account the site cannot open ────────────
//
// Added 2026-09-27, with the lead funnel. The marketing thread's primary
// button said "Start free". Sign-in for a real tenant is not configured
// on production — `/ready` says the only way in is the demo — so there
// was nothing to start, and the button led to a demo while promising an
// account. Every rule above reads sentences; this one reads the words on
// things a reader presses, because a button is a promise with a click
// attached and the reader finds out it was false one second later.
//
// It reads labels, not prose, on purpose. The census page says "you
// create no account" and the hero says "no sign-up", both true and both
// the opposite of a promise; a rule that fired on them would be deleted.

const ACCOUNT_PROMISES: { pattern: RegExp; says: string }[] = [
  { pattern: /\b(?:start|try)(?: it| etyme)?(?: for)? free\b/i, says: 'a free start, which is an account' },
  { pattern: /\bfree trial\b|\bstart (?:a |your )?(?:free )?trial\b/i, says: 'a trial, which is an account' },
  { pattern: /(?<!\bno )\bsign[ -]?up\b/i, says: 'a sign-up' },
  { pattern: /\b(?:create|open|get) (?:an |your |a free )?account\b/i, says: 'an account' },
  { pattern: /\bget started\b/i, says: 'getting started, which is an account with the word hidden' },
  { pattern: /\bregister\b/i, says: 'a registration' },
  { pattern: /\bjoin (?:free|now|etyme|today)\b/i, says: 'joining, which is an account' },
  { pattern: /\bstart (?:now|today|here)\b/i, says: 'a start, which is an account' },
]

/**
 * Every label that promises the reader an account of their own.
 *
 * Empty is the only acceptable answer while sign-in for a real tenant is
 * not open. Each hit is the label and what it promised, so somebody can
 * find the button rather than read every page.
 *
 * Once Microsoft or Google sign-in is configured (`signInOpen` in
 * lib/public-site/nav), a plain "Sign up" is a true promise: the first
 * sign-in with a corporate tenant creates the company. So with
 * `signInOpen` the sign-up label alone is allowed. Everything else here
 * — a free start, a trial, "get started" — stays refused either way,
 * because each promises more than an account.
 */
export function promisesAnAccount(labels: string[], opts: { signInOpen?: boolean } = {}): string[] {
  const out: string[] = []
  for (const label of labels) {
    for (const { pattern, says } of ACCOUNT_PROMISES) {
      if (opts.signInOpen && says === 'a sign-up') continue
      if (pattern.test(label)) {
        out.push(`"${label.trim()}" — ${says}`)
        break
      }
    }
  }
  return out
}
