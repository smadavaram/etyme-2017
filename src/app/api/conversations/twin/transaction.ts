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

// ── Money between two other firms ────────────────────────────────────

/**
 * Words that mean the reader's own side of a deal: "what does Computer
 * Systems owe us" is the reader's own book, whoever is named first.
 */
const OURS = /^(we|i|us|me|our|my|you|your|ourselves)\b/i

/** "What does X pay …", "How much did X bill …": the payer, the verb and the rest. */
const WHO_PAYS = /^(?:what|how much)\s+(?:does|did|do|will|would|is|was)\s+(.+?)\s+(?:pay(?:ing)?|bill(?:ing)?|charg(?:e|es|ing)|earn(?:ing)?|make|get paid|owe|spend)\b(.*)$/i
/** "… paid by X", "… billed to X", "… charged by X". */
const PAID_BY = /\b(?:paid|billed|charged|invoiced)\s+(?:by|to)\s+(.+?)\s*[?.]?$/i
/** "X's rates", "X’s bill rate", "X's margin". */
const FIRMS_RATE = /\b((?:[A-Z][\p{L}&.'-]*\s+){0,4}[A-Z][\p{L}&.'-]*)['’]s?\s+(?:bill |pay |hourly |day )?(?:rates?|margins?|mark-?ups?|prices?|fees?|pay)\b/u

const plainOf = (s: string) => s.replace(/^(the|a|an)\s+/i, '').replace(/[?.!,;:]+$/, '').trim()

/** Whether a name is the reader's own company, by its name or a pronoun for it. */
function isOurs(name: string, own: string | null | undefined): boolean {
  const n = plainOf(name)
  if (!n || OURS.test(n)) return true
  if (!own) return false
  const a = bare(n)
  const b = bare(own)
  return a.length > 0 && (a === b || b.startsWith(`${a} `) || a.startsWith(`${b} `))
}

/** Whether the words name a firm that is not the reader: a firm on its record, a withheld one, or a name written as a firm is. */
function aFirm(name: string, names: ReaderNames): boolean {
  const n = plainOf(name)
  if (!n) return false
  const lower = squash(n)
  // A person on the record is a person, not a firm: what she earns is a question for another rule.
  if (names.people.some((p) => squash(p) === lower)) return false
  if (knownFirm(n, names)) return true
  if (firmsByForm(n).length > 0) return true
  // Written with capitals, and not a person on the record: read as a firm the reader does not trade with.
  return /^\p{Lu}/u.test(n) && n.split(/\s+/).every((w) => /^\p{Lu}/u.test(w) || ['of', 'and', '&'].includes(w))
}

/** Words that name no firm in particular; "other companies" is the rule above's, not this one's. */
const NO_FIRM = /^(other|another|any|every|all|each|some|most|their|they|he|she|it|this|that|these|those|who|which|people|suppliers?|clients?|customers?|vendors?|firms?|companies)\b/i

/**
 * The payer a question asks about, by the words alone and with no read:
 * null where the question has no firm's money in it, where the payer or
 * the other party is the reader itself, or where the words name no firm
 * in particular. Only a payer left standing costs a read of the names.
 */
export function firmMoneyAsk(text: string, own: string | null | undefined): { payer: string } | null {
  const t = text.trim().replace(/\s+/g, ' ')
  const standing = (payer: string) => (isOurs(payer, own) || NO_FIRM.test(plainOf(payer)) ? null : { payer })
  const who = t.match(WHO_PAYS)
  if (who) {
    const rest = plainOf(who[2] ?? '')
    // The reader is the other party: its own transaction.
    if (rest && (isOurs(rest.split(/\s+(?:for|on|in|this|last|per|an?)\b/i)[0], own) || (own && squash(rest).includes(squash(own))))) return null
    return standing(who[1])
  }
  const by = t.match(PAID_BY)
  if (by) return standing(by[1])
  const rate = t.match(FIRMS_RATE)
  if (rate) return standing(rate[1])
  return null
}

/** The cheap test, no read: whether the names need reading at all. */
export function asksAboutFirmMoney(text: string, own?: string | null): boolean {
  return firmMoneyAsk(text, own) != null
}

/**
 * Whether a question asks what a firm other than the reader pays, bills,
 * charges or earns, or what its rates are, where the reader is not the
 * other party (founder, 2026-10-18: it never goes beyond the
 * transaction). "What does Brightmoor Staffing pay Helena Marsh?" asked
 * at Techpeple is Brightmoor's book; "What does Computer Systems owe
 * us?" is Techpeple's own.
 */
export function anotherFirmsMoney(text: string, own: string | null | undefined, names: ReaderNames): boolean {
  const ask = firmMoneyAsk(text, own)
  return ask != null && aFirm(ask.payer, names)
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
