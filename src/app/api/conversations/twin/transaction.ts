/**
 * Ask Etyme never goes beyond the transaction (founder, 2026-10-18:
 * "ensure no conversation goes beyond environment and transaction";
 * CLAUDE.md, "One Ask Etyme conversation per person, saved").
 *
 * It answers about this company's own work on the record — its jobs,
 * candidates, timesheets, bills, invoice receipts, payroll, papers and
 * people — and refuses anything else in one sentence that says what it
 * can help with. A question about another company's book, or a general
 * question with no record behind it, is refused here, by rules, before
 * any model is called; never answered from a model's own knowledge.
 *
 * Pure: no database, no model, no network. The one read it needs — who
 * and which firms the reader may read, to tell whether a question names
 * somebody on the record — is passed in by `respond` (./ask).
 *
 * The test is deliberately one-sided. A question is on the record when
 * it uses a word of the trade the record holds, names a reference the
 * record carries (an invoice number, a ledger id), or names a person or
 * firm the reader may read. Anything else is refused. A question about
 * the record phrased in words nobody in the trade would use is refused
 * too, and the sentence says what to ask instead; that is the safer
 * mistake, because the other one is the model answering from nowhere.
 */

/** Refused: no record behind the question. One sentence, under twenty words, saying what Ask Etyme helps with. */
export const ONLY_THE_RECORD =
  'I answer only about your company’s own record: jobs, candidates, timesheets, bills, invoice receipts, payroll, papers and people.'

/** Refused: another company's book, or a benchmark across companies. */
export const NOT_ANOTHER_BOOK =
  'I answer only about your company’s own jobs, timesheets, bills and people, never another company’s book or rates.'

/**
 * Asks that are general knowledge or a writing job, whatever trade word
 * sits beside them: "write a poem about our timesheets" is still a poem.
 */
const GENERAL: readonly RegExp[] = [
  /\b(poems?|jokes?|haikus?|limericks?|riddles?|lyrics|recipes?|horoscopes?)\b/,
  /\bweather\b/,
  /\bcapital (city )?of\b/,
  /\b(president|prime minister|election|elections)\b/,
  /\btranslat(e|ion)\b/,
  /\b(python|javascript|typescript|regex|html|css)\b/,
  /\b(stock|share) prices?\b|\bbitcoin\b|\bcrypto(currency)?\b/,
  /\bwho won\b|\b(football|soccer|cricket|baseball|basketball)\b/,
  /\b(movies?|films?|tv shows?|novels?|songs?)\b/,
  /\bmeaning of life\b/,
  /\bwrite (me )?(an? |the )?(essay|story|blog|tweet|post|speech|cover letter)\b/,
  /\b(news|headlines)\b/,
]

/** Another company's book, a rival's, or a benchmark across companies — never the reader's own. */
const ANOTHER_BOOK: readonly RegExp[] = [
  // "other companies", "another client" — but "our other clients" is the reader's own book.
  /(?<!\b(?:our|my|your)\s)\b(other|another)\s+(compan(y|ies)|clients?|customers?|firms?|tenants?|businesses|enterprises?)\b/,
  /\b(competitors?|rivals?)\b/,
  /\bmarket rates?\b|\bindustry (averages?|rates?|benchmarks?|standards?)\b|\bbenchmarks?\b|\bgoing rates?\b/,
  /\b(across|for) (all|every) (compan(y|ies)|clients?|customers?|tenants?)\b/,
  /\beverybody else\b|\beveryone else\b/,
]

/**
 * The trade's words for what the record holds: jobs and who applied,
 * suppliers and contractors, contracts and orders, hours and timesheets,
 * bills, invoice receipts and payroll, papers, the time limit, and
 * Etyme's own ledger and rules.
 */
const TRADE =
  /\b(jobs?|job requests?|requisitions?|requirements?|positions?|roles?|openings?|vacanc(y|ies)|candidates?|appl(y|ied|ies|icants?|ications?)|interviews?|submissions?|submitted|submit|shortlists?|matches|matching|suppliers?|vendors?|sub-?vendors?|primes?|contractors?|consultants?|workers?|employees?|staff|people|person|team|headcount|placements?|placed|assignments?|contracts?|orders?|pos?|msas?|sows?|agreements?|rates?|bills?|billed|billing|invoices?|receipts?|pay|paid|unpaid|payroll|payments?|payable|spend|spent|spending|costs?|budgets?|margins?|mark-?ups?|timesheets?|weeks?|hours?|overtime|approv\w*|reject\w*|signed|signature|time limit|tenure|on site|sites?|starts?|starting|started|ends?|ending|ended|extend\w*|extensions?|roll(s|ing|ed)? off|rolloff|bench|paperwork|papers?|documents?|i-9s?|visas?|insurance|certificates?|background checks?|screening|compliance|expir\w*|onboard\w*|offboard\w*|ledger|entr(y|ies)|rules?|etyme|programs?|hir(e|es|ed|ing)|managers?|clerks?|procurement|finance|accounts? (payable|receivable)|due|overdue|late|holidays?|days off|commissions?|expenses?|mismatch\w*|variance|three-way|clients?|customers?|projects?|engagements?|work orders?|purchase orders?|sales orders?|tax(es)?|w-?2|1099|corp-to-corp|c2c|needs? me|waiting)\b/

/** A reference the record carries: an invoice or order number ("PR-2026-0442"), or a ledger id the model is given ("[ck…]"). */
const REFERENCE = /\b[A-Z]{2,}[A-Z0-9]*-[A-Z0-9]+(?:-[A-Z0-9]+)*\b|\[[A-Za-z0-9_-]{6,}\]/

/** A firm named by its legal form, which is how a person names a company that is not on their own record. */
const FIRM_WITH_FORM = /\b((?:[A-Z][\p{L}&.'-]*\s+){0,4}[A-Z][\p{L}&.'-]*)\s+(Inc|LLC|Ltd|Limited|Corp|Corporation|GmbH|PLC|Pvt|LLP)\b\.?/gu

const lowerOf = (text: string) => text.toLowerCase().normalize('NFC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()

/** A general-knowledge or writing ask, whatever else it says. */
export function generalAsk(text: string): boolean {
  const t = lowerOf(text)
  return GENERAL.some((re) => re.test(t))
}

/** An ask about another company's book or a benchmark across companies. */
export function anotherBook(text: string): boolean {
  const t = lowerOf(text)
  return ANOTHER_BOOK.some((re) => re.test(t))
}

/** Uses a word of the trade, or a reference the record carries. */
export function tradeWords(text: string): boolean {
  return TRADE.test(lowerOf(text)) || REFERENCE.test(text)
}

/** Firms the question names by their legal form ("Acme Corp", "Halden Systems Inc"), as written. */
export function firmsByForm(text: string): string[] {
  return [...text.matchAll(FIRM_WITH_FORM)].map((m) => m[0].replace(/\.$/, '').trim())
}

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
/** The legal form, dropped, so "Computer Systems Inc" is known as "Computer Systems". */
const bare = (s: string) => squash(s).replace(/\s+(inc|llc|ltd|limited|corp|corporation|gmbh|plc|pvt|llp)$/, '').trim()

/** The names the reader may read: the same list masking reads. */
export interface ReaderNames { people: readonly string[]; firms: readonly string[]; withheld?: ReadonlyArray<{ name: string }> }

/** Words a question starts with that the legal-form pattern sweeps up with a firm's name ("Did Halden Systems Inc …"). */
const LEADING = new Set(['did', 'does', 'do', 'what', 'how', 'is', 'was', 'are', 'show', 'tell', 'when', 'who', 'which', 'can', 'could', 'why', 'has', 'have', 'list', 'give', 'the', 'a', 'an', 'our', 'my', 'about', 'from', 'with', 'for', 'and', 'at', 'to', 'of', 'in', 'on', 'pay', 'bill'])

/** Whether a firm named in a question is one the reader trades with, by name or by a withheld name it may not read. */
export function knownFirm(firm: string, names: ReaderNames): boolean {
  const words = bare(firm).split(' ').filter(Boolean)
  while (words.length > 1 && LEADING.has(words[0])) words.shift()
  const f = words.join(' ')
  if (!f) return false
  const all = [...names.firms, ...(names.withheld ?? []).map((w) => w.name)]
  return all.some((n) => {
    const b = bare(n)
    return b.length > 0 && (b === f || b.startsWith(`${f} `) || f.endsWith(` ${b}`))
  })
}

/** Whether the question names a person or a firm on the reader's record, by full name or by a distinctive part written with its capital. */
export function namesSomebody(text: string, names: ReaderNames): boolean {
  const flat = squash(text)
  const padded = ` ${flat} `
  for (const n of [...names.people, ...names.firms]) {
    const full = squash(n)
    if (full.length >= 3 && padded.includes(` ${full} `)) return true
    for (const part of n.split(/\s+/)) {
      if (part.length < 3 || !/^\p{Lu}/u.test(part)) continue
      const p = squash(part)
      if (['inc', 'llc', 'ltd', 'corp', 'the', 'and', 'group', 'systems', 'services', 'solutions', 'staffing', 'talent', 'consulting', 'company'].includes(p)) continue
      if (new RegExp(`(?<![\\p{L}\\p{N}])${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(text)) return true
    }
  }
  return false
}

export type OffRecord = typeof ONLY_THE_RECORD | typeof NOT_ANOTHER_BOOK

/**
 * The rules' verdict on a free-text question, before any model: null
 * where it is about the reader's own record, else the one sentence that
 * refuses it. `names` is read only where the words alone cannot decide
 * (no trade word, or a firm named by its legal form), so most questions
 * cost no read at all.
 */
export async function offRecord(
  text: string,
  read: { named(text: string): Promise<{ person?: unknown; receipt?: unknown; ambiguous?: unknown[] }>; names(): Promise<ReaderNames> },
): Promise<OffRecord | null> {
  if (generalAsk(text)) return ONLY_THE_RECORD
  if (anotherBook(text)) return NOT_ANOTHER_BOOK
  const trade = tradeWords(text)
  const firms = firmsByForm(text)
  if (trade && firms.length === 0) return null
  if (firms.length === 0) {
    // No trade word: on the record only if it names somebody the reader may read.
    const named = await read.named(text)
    if (named.person || named.receipt || (named.ambiguous?.length ?? 0) > 0) return null
  }
  const names = await read.names()
  if (firms.some((f) => !knownFirm(f, names))) return NOT_ANOTHER_BOOK
  if (trade || namesSomebody(text, names)) return null
  return ONLY_THE_RECORD
}
