/**
 * The inline answer keys (record 125, plan step 10). Pure: no database, no
 * network. A model skill that may move from the low tier to the high tier
 * has one of these. The gateway runs it on the answer and, where it fails,
 * asks once on the high tier. It decides nothing else: the grader and the
 * checkers (lib/skills/checkers) still grade the record afterwards, from
 * the record and never from this.
 *
 * A key reads the answer as the model gave it and the source text the
 * answer must come from. It never fixes, trims or fills an answer in.
 */

export interface InlineVerdict { ok: boolean; reason: string }
export type InlineKey = (answer: string, ctx: { source?: string }) => InlineVerdict

const pass: InlineVerdict = { ok: true, reason: 'The answer passed its check.' }
const fail = (reason: string): InlineVerdict => ({ ok: false, reason })

/** The JSON in an answer, with or without a code fence round it. Null where there is none. */
export function jsonIn(answer: string): unknown | null {
  const t = answer.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(t) } catch { /* fall through to the first object or list */ }
  const from = t.search(/[[{]/)
  if (from < 0) return null
  const close = t[from] === '[' ? ']' : '}'
  const to = t.lastIndexOf(close)
  if (to <= from) return null
  try { return JSON.parse(t.slice(from, to + 1)) } catch { return null }
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** Every value stored under one of these keys, anywhere in the answer. */
function valuesUnder(node: unknown, keys: readonly string[], out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) node.forEach((n) => valuesUnder(n, keys, out))
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (keys.includes(k)) out.push(v)
      else valuesUnder(v, keys, out)
    }
  }
  return out
}

/** Every quote the answer gives is in the source, word for word. At least one must be given. */
function quotesInSource(keys: readonly string[], what: string): InlineKey {
  return (answer, ctx) => {
    const parsed = jsonIn(answer)
    if (parsed === null) return fail('The answer could not be read as the list it was asked for.')
    if (!ctx.source) return fail('There was no source text to check the quotes against.')
    const src = squash(ctx.source)
    const given = valuesUnder(parsed, keys).filter((v) => v !== null && v !== undefined && v !== '')
    if (given.length === 0) return fail(`The answer gave no ${what}.`)
    const bad = given.filter((q) => typeof q !== 'string' || !src.includes(squash(q)))
    return bad.length === 0 ? pass : fail(`${bad.length} of ${given.length} quotes are not in the source word for word.`)
  }
}

const CONFIDENCE = new Set(['HIGH', 'MODERATE', 'LOW'])

/** A match row without factors, basis, confidence and unknowns fails (CLAUDE.md). */
const matchRows: InlineKey = (answer) => {
  const parsed = jsonIn(answer) as unknown
  const rows = Array.isArray(parsed) ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { matches?: unknown }).matches) ? (parsed as { matches: unknown[] }).matches
    : null
  if (!rows || rows.length === 0) return fail('The answer gave no match rows.')
  for (const [i, r] of rows.entries()) {
    const o = (r ?? {}) as Record<string, unknown>
    const at = `Row ${i + 1}`
    if (!Array.isArray(o.factors) || o.factors.length === 0) return fail(`${at} has no factors.`)
    if (typeof o.basis !== 'string' || !o.basis.trim()) return fail(`${at} has no basis.`)
    if (typeof o.confidence !== 'string' || !CONFIDENCE.has(o.confidence)) return fail(`${at} has no confidence of HIGH, MODERATE or LOW.`)
    if (!('unknowns' in o) || (o.unknowns !== null && typeof o.unknowns !== 'string')) return fail(`${at} does not say what is unknown.`)
  }
  return pass
}

/** One key per skill that may escalate. A skill that may not has none. */
export const INLINE_KEYS: Readonly<Record<string, InlineKey>> = {
  'match.rank': matchRows,
  'skills.evidence': quotesInSource(['quote'], 'quote'),
  'document.read': quotesInSource(['foundIn', 'quote'], 'quote of where each value was read'),
}

export const inlineKeyFor = (skillKey: string): InlineKey | null => INLINE_KEYS[skillKey] ?? null
