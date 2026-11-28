/**
 * The checklist and the person's checks, as a reader above the supplier may
 * be sent them. "A sub-vendor's name is the prime's to keep" (CLAUDE.md,
 * 2026-09-17). The same rule `doorsForReader` and `factsForReader` hold:
 * a screening company's name is free text a firm below the supplier typed,
 * and the sentence built from it can carry that firm's name.
 *
 * Where the firm that ordered a check is one the reader may not name, the
 * screening company and its sentence are not sent at all, since the
 * provider goes with the firm. Everywhere else a withheld firm's name or id
 * is said as "your supplier". Pure.
 */
export interface ReaderFirms {
  hidden: readonly { id: string; name: string }[]
  mayName: (firmId: string) => boolean
}

interface Check { type: string; orderedByCompanyId?: string | null }

const STAND_IN = 'your supplier'
const REPORTED = 'A screening company has reported on this check.'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A sentence with every withheld firm's name or id said as "your supplier". */
export function sayWithoutHidden(text: string, hidden: ReaderFirms['hidden']): string {
  let out = text
  for (const f of hidden) {
    out = out.split(f.id).join(STAND_IN)
    if (f.name) out = out.replace(new RegExp(escape(f.name), 'gi'), STAND_IN)
  }
  return out
}

const mentionsHidden = (text: string | null, hidden: ReaderFirms['hidden']) =>
  !!text && hidden.some((f) => text.includes(f.id) || (!!f.name && text.toLowerCase().includes(f.name.toLowerCase())))

const orderedByWithheld = (c: Check, r: ReaderFirms) => !!c.orderedByCompanyId && !r.mayName(c.orderedByCompanyId)

/** The screening company on one recorded check; null where the ordering firm is withheld or the name carries a hidden firm's. */
export function providerForReader(c: Check & { provider: string | null }, r: ReaderFirms): string | null {
  if (orderedByWithheld(c, r) || mentionsHidden(c.provider, r.hidden)) return null
  return c.provider
}

export function checklistForReader<T extends { key: string; note: string; renderedBy?: string | null; renderedSays?: string | null }>(
  items: T[],
  checks: Check[],
  r: ReaderFirms,
): T[] {
  return items.map((it) => {
    const withheld = checks.some((c) => c.type === it.key && orderedByWithheld(c, r))
    const out: Record<string, unknown> = { ...it }
    if (withheld) {
      if ('renderedBy' in it) out.renderedBy = null
      if ('renderedSays' in it) out.renderedSays = null
      if (it.renderedSays && it.note === it.renderedSays) out.note = REPORTED
    }
    for (const [k, v] of Object.entries(out)) {
      if (typeof v === 'string') out[k] = sayWithoutHidden(v, r.hidden)
    }
    return out as unknown as T
  })
}
