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

  // Text between tags: >Some words here<
  for (const m of source.matchAll(/>([^<>{}]{4,})</g)) {
    const t = m[1].replace(/\s+/g, ' ').trim()
    if (t && /[a-zA-Z]/.test(t)) out.push(t)
  }

  // String literals long enough to be prose rather than a class name.
  for (const m of source.matchAll(/(?:^|[\s({[,:])'([^'\\]{12,})'/g)) {
    const t = m[1].trim()
    if (/^[A-Z]/.test(t) && / /.test(t) && !t.includes('/')) out.push(t)
  }

  return out
}
