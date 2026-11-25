import type { PaperFacts } from '@/lib/document-stages/line-paper-facts'

/**
 * The facts about each paper on a line (what was asked, what arrived, who
 * examined it), as one reader may be sent them (record 117, step 2).
 *
 * "A sub-vendor's name is the prime's to keep" (CLAUDE.md, 2026-09-17), by
 * the same rule `doorsForReader` holds for the doors: the firm and the
 * person who examined at it are named only where `mayName` says this
 * reader may call that firm by name. Where not, the firm and the examiner
 * are null and the screen says "the supplier’s supplier". A screening
 * provider's name is scrubbed of any withheld firm's name, so a firm
 * that recorded a verdict as its own provider is not named by it. Pure.
 */
type Firmed<T> = Omit<T, 'firmId' | 'firmName'> & { firmId: string | null; firmName: string | null }

export interface FactsForReader {
  asked: Firmed<NonNullable<PaperFacts['asked']>> | null
  received: Firmed<NonNullable<PaperFacts['received']>> | null
  examined: Firmed<NonNullable<PaperFacts['examined']>> | null
  verdict: PaperFacts['verdict']
}

export function factsForReader(
  facts: Record<string, PaperFacts>,
  mayName: (firmId: string) => boolean,
): Record<string, FactsForReader> {
  const withheld = new Map<string, string>()
  const note = (f: { firmId: string; firmName: string } | null) => {
    if (f && !mayName(f.firmId)) withheld.set(f.firmId, f.firmName)
  }
  for (const f of Object.values(facts)) { note(f.asked); note(f.received); note(f.examined) }

  const firm = <T extends { firmId: string; firmName: string }>(x: T | null) => {
    if (!x) return null
    return withheld.has(x.firmId) ? { ...x, firmId: null, firmName: null } : x
  }
  const scrub = (text: string | null) => {
    if (!text) return text
    for (const [id, name] of withheld) {
      if (text.includes(id) || (name && text.toLowerCase().includes(name.toLowerCase()))) return null
    }
    return text
  }

  const out: Record<string, FactsForReader> = {}
  for (const [key, f] of Object.entries(facts)) {
    const examined = firm(f.examined)
    out[key] = {
      asked: firm(f.asked),
      received: firm(f.received),
      // The examiner works at the firm; where the firm is withheld so is she.
      examined: examined && examined.firmId === null ? { ...examined, by: null } : examined,
      // A check ordered by a firm this reader may not name keeps its word and date; its provider and reference go, so they cannot name that firm.
      verdict: f.verdict
        ? (f.verdict.firmId && !mayName(f.verdict.firmId)
          ? { ...f.verdict, provider: null, reference: null, firmId: null }
          : { ...f.verdict, provider: scrub(f.verdict.provider) })
        : null,
    }
  }
  return out
}
