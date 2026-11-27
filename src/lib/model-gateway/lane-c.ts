/**
 * Lane C at the gateway door (record 125, plan C6). Pure.
 *
 * Tax IDs, bank details and social security numbers reach no model, at any
 * tier. The gateway refuses by the paper's type first (a W-4, W-9, voided
 * check, identity paper or social security card is never read, whatever its
 * text holds), and by pattern second (a text that carries one of the three
 * is refused whole, never trimmed and sent). A refusal names what it found
 * in words, never the value.
 */

import { paperMayReachModel } from '@/lib/skills/registry'

export type LaneCFound = 'SOCIAL_SECURITY' | 'BANK_DETAILS' | 'TAX_ID'

const WORDS: Record<LaneCFound, string> = {
  SOCIAL_SECURITY: 'a social security number',
  BANK_DETAILS: 'bank details',
  TAX_ID: 'a tax ID',
}

const SHAPES: { kind: LaneCFound; re: RegExp }[] = [
  { kind: 'SOCIAL_SECURITY', re: /(?<![\d-])\d{3}[-\s]\d{2}[-\s]\d{4}(?![\d-])/ },
  { kind: 'SOCIAL_SECURITY', re: /\b(?:ssn|social security(?:\s+(?:number|no\.?|#))?)\s*[:#=-]?\s*\d{9}\b/i },
  // An employer number is two digits, a dash, seven digits; any labelled tax number too.
  { kind: 'TAX_ID', re: /(?<![\d-])\d{2}-\d{7}(?![\d-])/ },
  { kind: 'TAX_ID', re: /\b(?:ein|tin|itin|tax id|taxpayer id|tax identification(?: number)?)\s*[:#=-]?\s*[A-Z0-9][A-Z0-9 -]{6,20}[A-Z0-9]\b/i },
  { kind: 'BANK_DETAILS', re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/ },
  { kind: 'BANK_DETAILS', re: /\b(?:routing|aba|swift|bic|sort code|iban|bank account|acct|account)(?:\s+(?:number|no\.?|num|#))?\s*[:#=-]?\s*\d[\d -]{5,32}\d\b/i },
]

export type LaneCVerdict =
  | { refused: false }
  | { refused: true; by: 'TYPE' | 'PATTERN'; found: LaneCFound[]; says: string }

/** What is in the text, by pattern. Empty means nothing Lane C was found. */
export function laneCIn(text: string): LaneCFound[] {
  const found = new Set<LaneCFound>()
  for (const { kind, re } of SHAPES) if (re.test(text)) found.add(kind)
  return [...found]
}

/**
 * Refuse by document type first, then by pattern. `texts` is every piece
 * that would leave: the prompt, the system text, each attachment's words.
 */
export function laneCRefusal(input: { documentType?: string | null; texts: readonly string[] }): LaneCVerdict {
  if (input.documentType && !paperMayReachModel(input.documentType)) {
    return {
      refused: true, by: 'TYPE', found: [],
      says: 'This kind of paper holds tax, bank or identity details, so no model reads it. The rules or a person do.',
    }
  }
  const found = new Set<LaneCFound>()
  for (const t of input.texts) for (const k of laneCIn(t)) found.add(k)
  if (found.size === 0) return { refused: false }
  const list = [...found]
  return {
    refused: true, by: 'PATTERN', found: list,
    says: `The text holds ${list.map((k) => WORDS[k]).join(' and ')}, so it was not sent to any model.`,
  }
}
