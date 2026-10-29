/**
 * Where setup's answers come from, before a person types anything
 * ("Fetch from any source", founder, 2026-10-27).
 *
 * In this order, and each value says where it came from so a person
 * corrects it in a word:
 *
 *  1. **The work email's domain**: the website, the country and the
 *     currency, the domain to verify. Guesses, said as guesses.
 *  2. **A paper the company uploads**: a W-9 carries the legal name, the
 *     business name, the address and the EIN; a certificate of insurance
 *     carries the insurer and the dates. Read by rules first, here. The
 *     model reads only what the rules did not, only where the company
 *     turned the model on, masked and logged (`lib/setup-fill-model`).
 *     Every value comes back with the words it was read from, and nothing
 *     is recorded until a person confirms it.
 *  3. **A file the company already has**: the imports that exist.
 *
 * Never a mailbox, never a registry Etyme has no agreement with, never a
 * page fetched on the person's behalf. The company's own website, by an
 * address the Owner pastes, is a guarded read decided on 2026-10-27 and
 * not built: nothing here fetches anything.
 *
 * Pure: text in, values out, no database and no network.
 */

import { inflateSync } from 'zlib'
import { isConsumerDomain, isPlatformDomain } from '@/lib/company-domains'
import { countryFromDomain } from '@/lib/company-defaults'
import { currencyFor } from '@/lib/setup-steps'
import { addressFromName } from '@/lib/password-words'
import { plainEin } from '@/lib/setup-checklist'

/** One value read from somewhere, with the words it came from. */
export interface ReadValue {
  field: FillField
  value: string
  /** The words the value was read from, as they appear. */
  quote: string
  readBy: 'RULES' | 'MODEL'
}

export type FillField =
  | 'legalName' | 'dba' | 'taxId'
  | 'legal.street' | 'legal.city' | 'legal.state' | 'legal.postalCode'
  | 'insurer' | 'coverFrom' | 'coverUntil'

export const FILL_FIELD_WORDS: Record<FillField, string> = {
  legalName: 'Legal name',
  dba: 'Business name',
  taxId: 'EIN',
  'legal.street': 'Street',
  'legal.city': 'City',
  'legal.state': 'State',
  'legal.postalCode': 'ZIP code',
  insurer: 'Insurer',
  coverFrom: 'Cover begins',
  coverUntil: 'Cover ends',
}

// ── 1. The work email's domain ───────────────────────────────────────

export interface DomainFill {
  domain: string
  website: string
  country: string
  currency: string
  /** The words the guess came from: the email itself. */
  quote: string
}

/**
 * What a work email's domain says. Null for a consumer address (a person,
 * not a company) and for Etyme's own domain, which is never a firm's.
 */
export function fromWorkEmail(email: string | null | undefined): DomainFill | null {
  const e = String(email ?? '').trim().toLowerCase()
  const at = e.lastIndexOf('@')
  const domain = at > 0 ? e.slice(at + 1) : ''
  if (!domain.includes('.') || isConsumerDomain(domain) || isPlatformDomain(domain)) return null
  // A seeded world's reserved domains (.example, .invalid, .local) are not
  // a website anybody can open, so they are never offered as one.
  if (/\.(example|invalid|local|test)$/.test(domain)) return null
  const country = countryFromDomain(domain)
  return { domain, website: `https://${domain}`, country, currency: currencyFor(country), quote: e }
}

/** One answer the sign-up gave, and where it came from, for `SetupAnswer`. */
export interface SignUpAnswer {
  field: 'name' | 'country' | 'currency' | 'etymeAddress'
  source: 'DOMAIN' | 'PERSON'
  /** The domain a guess came from, or the company name an address was made from. */
  quote: string | null
}

/**
 * Where each of the sign-up's answers came from, so the checklist says so
 * rather than "Typed by" over a guess (the Tapin walk, 2026-10-29).
 *
 * The country is the domain's when the email is on a company domain and
 * the country kept is the one the domain gives; the currency is the
 * domain's when it is the country's own and the country was. Anything the
 * person changed is theirs. The company name is always typed. The Etyme
 * address, where it is the one made from the company name, says so; where
 * the person typed another, it is theirs. Pure: no database.
 */
export function signUpAnswers(input: {
  email: string | null | undefined
  name: string
  country: string
  currency: string
  /** The Etyme address, without ".etyme.com"; null at the OAuth door, which asks for none. */
  address?: string | null
  /** The OAuth door: the name was left blank and guessed from the domain. */
  nameFromDomain?: boolean
  /** The OAuth door: the address was made from the domain. */
  addressFromDomain?: boolean
}): SignUpAnswer[] {
  const e = String(input.email ?? '').trim().toLowerCase()
  const at = e.lastIndexOf('@')
  const raw = at > 0 ? e.slice(at + 1) : ''
  const domain = raw.includes('.') && !isConsumerDomain(raw) && !isPlatformDomain(raw) ? raw : null
  const countryGuessed = !!domain && input.country === countryFromDomain(domain)
  const currencyGuessed = countryGuessed && input.currency === currencyFor(input.country)
  const out: SignUpAnswer[] = [
    input.nameFromDomain && domain ? { field: 'name', source: 'DOMAIN', quote: domain } : { field: 'name', source: 'PERSON', quote: null },
    { field: 'country', source: countryGuessed ? 'DOMAIN' : 'PERSON', quote: countryGuessed ? domain : null },
    { field: 'currency', source: currencyGuessed ? 'DOMAIN' : 'PERSON', quote: currencyGuessed ? domain : null },
  ]
  if (input.address && input.addressFromDomain && domain) {
    out.push({ field: 'etymeAddress', source: 'DOMAIN', quote: domain })
  } else if (input.address) {
    const made = addressFromName(input.name) === input.address
    out.push({ field: 'etymeAddress', source: 'PERSON', quote: made ? input.name.trim() : null })
  }
  return out
}

// ── 2. A paper: what kind it is ──────────────────────────────────────

export type PaperKind = 'W9' | 'COI' | 'UNKNOWN'

/** Which paper this text is, by the words every edition prints. */
export function paperKindOf(text: string): PaperKind {
  if (/\bW-?9\b/i.test(text) && /taxpayer identification number/i.test(text)) return 'W9'
  if (/certificate of (liability )?insurance/i.test(text) || /\bACORD\b/.test(text)) return 'COI'
  if (/request for taxpayer/i.test(text)) return 'W9'
  return 'UNKNOWN'
}

export const PAPER_WORDS: Record<PaperKind, string> = {
  W9: 'W-9',
  COI: 'certificate of insurance',
  UNKNOWN: 'paper',
}

// ── A W-9, by rules ──────────────────────────────────────────────────

const lines = (text: string) => text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)

/**
 * The value printed after a W-9 box's label: on the same line after the
 * label's closing words, or on the next line that is not another label.
 */
function afterLabel(ls: string[], label: RegExp, isLabel: RegExp): { value: string; quote: string } | null {
  for (let i = 0; i < ls.length; i++) {
    const m = ls[i].match(label)
    if (!m) continue
    const rest = ls[i].slice((m.index ?? 0) + m[0].length).replace(/^[\s.:\-–)]+/, '').trim()
    // The rest of a label line is the box's own instructions, not a value,
    // on every edition that prints them ("An entry is required.").
    if (rest && !isLabel.test(rest) && !INSTRUCTION.test(rest)) return { value: rest, quote: ls[i] }
    const next = ls[i + 1]
    if (next && !isLabel.test(next)) return { value: next, quote: next }
  }
  return null
}

const INSTRUCTION = /\b(required|instructions|if different|optional|see |entity\/individual|as shown)\b/i

const W9_LABEL = /^(\d\s|\d[a-z]?\s)?(name|business name|address|city|requester|list account|check appropriate|exemptions|part i|part ii|social security|employer identification|enter your tin|certification|sign here|form w-?9)/i

/** "Dayton, OH 45402" → city, state, ZIP. */
export function splitCityLine(line: string): { city: string; state: string; postalCode: string } | null {
  const m = line.match(/^(.+?),\s*([A-Za-z]{2})\.?\s+(\d{5}(?:-\d{4})?)$/)
  return m ? { city: m[1].trim(), state: m[2].toUpperCase(), postalCode: m[3] } : null
}

/**
 * The legal name, the business name, the EIN and the address off a W-9's
 * text, by the box labels every edition since 2017 prints. Only what the
 * rules can point at: a value with no quote behind it is not returned.
 */
export function readW9(text: string): ReadValue[] {
  const ls = lines(text)
  const out: ReadValue[] = []
  const add = (field: FillField, value: string | null | undefined, quote: string) => {
    const v = String(value ?? '').trim()
    if (v && !out.some((o) => o.field === field)) out.push({ field, value: v, quote, readBy: 'RULES' })
  }

  const name = afterLabel(ls, /name of entity\/individual|name \(as shown on your income tax return\)|^1\s+name\b/i, W9_LABEL)
  if (name) add('legalName', name.value, name.quote)
  const dba = afterLabel(ls, /business name\/disregarded entity name(, if different from above)?/i, W9_LABEL)
  if (dba) add('dba', dba.value, dba.quote)

  for (const l of ls) {
    const m = l.match(/\b(\d{2})\s*-\s*(\d{7})\b/)
    if (m && /employer identification|\bEIN\b|^\d{2}\s*-\s*\d{7}$/i.test(l)) {
      add('taxId', plainEin(`${m[1]}${m[2]}`), l)
      break
    }
  }
  if (!out.some((o) => o.field === 'taxId')) {
    const lone = ls.find((l) => /^\d{2}\s*-\s*\d{7}$/.test(l))
    if (lone) add('taxId', plainEin(lone), lone)
  }

  const street = afterLabel(ls, /address \(number, street, and apt\. or suite no\.\)( see instructions\.?)?/i, W9_LABEL)
  if (street) add('legal.street', street.value, street.quote)
  const city = afterLabel(ls, /city, state, and zip code/i, W9_LABEL)
  if (city) {
    const parts = splitCityLine(city.value)
    if (parts) {
      add('legal.city', parts.city, city.quote)
      add('legal.state', parts.state, city.quote)
      add('legal.postalCode', parts.postalCode, city.quote)
    }
  }
  return out
}

// ── A certificate of insurance, by rules ─────────────────────────────

/** "06/01/2026" → "2026-06-01". */
function isoOfUsDate(d: string): string | null {
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [mo, da, yr] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null
  return `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`
}

/**
 * The first insurer and the first policy's two dates off a certificate's
 * text (the ACORD 25 layout: "INSURER A : …", a policy row with its
 * effective and expiry dates side by side).
 */
export function readCoi(text: string): ReadValue[] {
  const ls = lines(text)
  const out: ReadValue[] = []
  const insurer = ls.map((l) => ({ l, m: l.match(/insurer\s*a\s*:?\s*(.+?)(?:\s+\d{5})?$/i) })).find((x) => x.m && x.m[1].trim())
  if (insurer) out.push({ field: 'insurer', value: insurer.m![1].trim(), quote: insurer.l, readBy: 'RULES' })
  for (const l of ls) {
    const dates = [...l.matchAll(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g)].map((m) => m[1])
    if (dates.length >= 2 && !/^date\b/i.test(l)) {
      const from = isoOfUsDate(dates[0])
      const until = isoOfUsDate(dates[1])
      if (from && until && from < until) {
        out.push({ field: 'coverFrom', value: from, quote: l, readBy: 'RULES' })
        out.push({ field: 'coverUntil', value: until, quote: l, readBy: 'RULES' })
        break
      }
    }
  }
  return out
}

/** The fields each paper can fill, so the model is asked only for what the rules missed. */
export const FIELDS_OF: Record<Exclude<PaperKind, 'UNKNOWN'>, FillField[]> = {
  W9: ['legalName', 'dba', 'taxId', 'legal.street', 'legal.city', 'legal.state', 'legal.postalCode'],
  COI: ['insurer', 'coverFrom', 'coverUntil'],
}

/** What the rules read, and what they left for the model. */
export function readPaperByRules(text: string): { kind: PaperKind; values: ReadValue[]; missing: FillField[] } {
  const kind = paperKindOf(text)
  if (kind === 'UNKNOWN') return { kind, values: [], missing: [] }
  const values = kind === 'W9' ? readW9(text) : readCoi(text)
  const have = new Set(values.map((v) => v.field))
  // The business name is optional on a W-9; its absence is not a gap.
  const missing = FIELDS_OF[kind].filter((f) => !have.has(f) && f !== 'dba')
  return { kind, values, missing }
}

// ── The text of an uploaded file ─────────────────────────────────────

/** The largest paper read: a W-9 or a certificate is a page or two. */
export const MAX_PAPER_BYTES = 2_000_000

/**
 * The words in an uploaded paper: plain text as it is; a PDF's text
 * layer and filled form values, read off its own streams with no library.
 * A scanned page has no words to read and returns ''; the screen then
 * asks the person to type the values or paste the text.
 */
export function textOfUpload(bytes: Buffer, contentType: string | null, name: string | null): string {
  const isPdf = bytes.subarray(0, 5).toString('latin1') === '%PDF-' || /pdf/i.test(contentType ?? '') || /\.pdf$/i.test(name ?? '')
  if (!isPdf) return bytes.toString('utf8')
  const raw = bytes.toString('latin1')
  const chunks: string[] = []
  // Filled form values: /V (Tapin LLC).
  for (const m of raw.matchAll(/\/V\s*\(((?:\\.|[^\\)])*)\)/g)) chunks.push(pdfString(m[1]))
  // Each content stream, inflated where it is compressed, its shown text.
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  for (const m of raw.matchAll(re)) {
    let body = m[1]
    try {
      body = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')
    } catch {
      // Not compressed, or not a stream of text: read as it is.
    }
    const shown: string[] = []
    for (const t of body.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:[^\]])*)\]\s*TJ|(T\*|Td|TD|ET)/g)) {
      if (t[1] != null) shown.push(pdfString(t[1]))
      else if (t[2] != null) shown.push([...t[2].matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((x) => pdfString(x[1])).join(''))
      else shown.push('\n')
    }
    const text = shown.join('').replace(/\n{2,}/g, '\n').trim()
    if (text) chunks.push(text)
  }
  return chunks.join('\n')
}

function pdfString(s: string): string {
  return s
    .replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '', f: '', '(': '(', ')': ')', '\\': '\\' } as Record<string, string>)[c])
    .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
}
