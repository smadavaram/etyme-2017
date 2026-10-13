/**
 * Masking at the edge (CLAUDE.md, "The model boundary, and the four
 * weeks", week 2): before a word leaves for a model, every person's name,
 * every firm's name, every rate, every pay figure and every money amount
 * becomes a token — PERSON_1, FIRM_2, RATE_3, AMOUNT_4 — and the model's
 * answer has the real values put back on the way in.
 *
 * Pure. One masker per request: the map lives in it and dies with it, and
 * nothing here stores it. The tokens are stable inside the request, so
 * the same person is the same token in the question and in every line.
 *
 * Names come from the record — the people and firms the reader may
 * read — because a name cannot be found by its shape. Figures come by
 * pattern: a currency amount, a rate per hour or day, a percentage beside
 * a money word.
 */

export type TokenKind = 'PERSON' | 'FIRM' | 'RATE' | 'AMOUNT'

/** The names the reader may read, from the record. */
export interface MaskVocabulary {
  people: readonly string[]
  firms: readonly string[]
}

export interface Masker {
  /** The text with every known name and every figure replaced by a token. */
  mask(text: string): string
  /** The text with every token this masker issued put back to its real value. */
  unmask(text: string): string
  /** Every real value replaced so far, for the log's leak check. Never stored. */
  realValues(): string[]
}

/** Words a firm's name is often made of that are never masked on their own. */
const COMMON = new Set([
  'inc', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'company', 'co', 'group', 'the', 'and',
  'systems', 'system', 'services', 'service', 'solutions', 'staffing', 'resourcing', 'talent',
  'consulting', 'technologies', 'technology', 'software', 'global', 'international', 'partners',
  'computer', 'medical', 'health', 'athletic', 'bank', 'program', 'office',
])

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** "$98.00/hr", "£1,000", "USD 3,600.00", "₹ 45,000 per month". */
const MONEY =
  /(?:[$£€₹]\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmM]\b)?|\b(?:USD|GBP|EUR|INR|CAD|AUD)\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:USD|GBP|EUR|INR|CAD|AUD)\b)(?:\s?(?:\/|per\s)(?:hr|hour|h|day|week|wk|month|mo|year|yr)\b)?/g

/** A percentage that is about money: a margin, a markup, a fee, a commission, a discount. */
const MONEY_PERCENT =
  /\b(?:margin|mark-?up|fee|commission|discount|spread)s?\b[^.;\n]{0,30}?\d+(?:\.\d+)?\s?%|\d+(?:\.\d+)?\s?%\s+(?:margin|mark-?up|fee|commission|discount|spread)s?\b/gi

/**
 * One masker for one request. `newMasker` is the mask function: build it
 * from what the reader may read, run every outgoing text through `mask`,
 * and every incoming answer through `unmask`.
 */
export function newMasker(vocab: MaskVocabulary): Masker {
  const realToToken = new Map<string, string>()
  const tokenToReal = new Map<string, string>()
  let next = 1

  const tokenFor = (kind: TokenKind, real: string, key = real.toLowerCase()): string => {
    const had = realToToken.get(`${kind}:${key}`)
    if (had) return had
    const token = `${kind}_${next++}`
    realToToken.set(`${kind}:${key}`, token)
    tokenToReal.set(token, real)
    return token
  }

  // The names, whole first and then their distinctive parts, longest
  // first so "Helena Marsh" is one token and not two.
  type Name = { kind: TokenKind; full: string; pattern: RegExp }
  const names: Name[] = []
  const add = (kind: TokenKind, full: string) => {
    const name = full.trim().replace(/\s+/g, ' ')
    if (name.length < 3) return
    names.push({ kind, full: name, pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, 'giu') })
    for (const part of name.split(' ')) {
      if (part.length < 3 || COMMON.has(part.toLowerCase().replace(/[.,]/g, ''))) continue
      // A part is masked only as written with its capital, so "Marsh" is a
      // name and "marsh" in a sentence is not.
      if (!/^\p{Lu}/u.test(part)) continue
      names.push({ kind, full: name, pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escape(part)}(?![\\p{L}\\p{N}])`, 'gu') })
    }
  }
  for (const p of vocab.people) add('PERSON', p)
  for (const f of vocab.firms) add('FIRM', f)
  // Whole names before parts, and longer before shorter.
  names.sort((a, b) => b.pattern.source.length - a.pattern.source.length)

  const parts = new Map<string, string>() // a part's real text, for the leak check

  return {
    mask(text: string): string {
      let out = text
      out = out.replace(MONEY_PERCENT, (m) => tokenFor('RATE', m))
      out = out.replace(MONEY, (m) => tokenFor(/(\/|per\s)/.test(m) ? 'RATE' : 'AMOUNT', m))
      for (const n of names) {
        out = out.replace(n.pattern, (m) => {
          if (m.toLowerCase() !== n.full.toLowerCase()) parts.set(m.toLowerCase(), m)
          // A part maps to the whole name's token: one person, one token.
          return tokenFor(n.kind, n.full, n.full.toLowerCase())
        })
      }
      return out
    },
    unmask(text: string): string {
      return text.replace(/\b(?:PERSON|FIRM|RATE|AMOUNT)_\d+\b/g, (t) => tokenToReal.get(t) ?? t)
    },
    realValues(): string[] {
      return [...new Set([...tokenToReal.values(), ...parts.values()])]
    },
  }
}
