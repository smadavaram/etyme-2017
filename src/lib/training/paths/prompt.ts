/**
 * A prompt-generated path: a learner's goal, a mentor's instruction or a
 * client's requirement, drafted through the gateway by the caller, with the
 * rules path as the fallback on every outcome but a good answer. This file
 * never reaches a model; the route hands in the draft.
 */
export type DraftFn = (prompt: string) => Promise<{ ok: true; text: string } | { ok: false }>

/** Pure. Keeps only lesson keys the content holds, once each, in the order given; null when nothing usable. */
export function parseSteps(text: string, known: string[]): string[] | null {
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) return null
  let arr: unknown
  try { arr = JSON.parse(m[0]) } catch { return null }
  if (!Array.isArray(arr)) return null
  const steps = [...new Set(arr.filter((x): x is string => typeof x === 'string' && known.includes(x)))]
  return steps.length > 0 ? steps : null
}

export function promptFor(goal: string, known: string[]): string {
  return `A learner's goal: ${goal.slice(0, 400)}\nLesson keys, in reading order: ${JSON.stringify(known)}\nReturn only a JSON array of the lesson keys that fit the goal, in the order to take them.`
}

export async function promptPath(goal: string, known: string[], draft: DraftFn | null, fallback: string[]): Promise<{ steps: string[]; by: 'MODEL' | 'RULES' }> {
  if (!draft) return { steps: fallback, by: 'RULES' }
  try {
    const got = await draft(promptFor(goal, known))
    if (got.ok) {
      const steps = parseSteps(got.text, known)
      if (steps) return { steps, by: 'MODEL' }
    }
  } catch { /* falls back below */ }
  return { steps: fallback, by: 'RULES' }
}
