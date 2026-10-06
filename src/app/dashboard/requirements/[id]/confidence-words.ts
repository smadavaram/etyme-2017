/**
 * What the confidence chip on a match says — what confidence measures,
 * never a bare word beside a score.
 *
 * The tester read "Moderate" beside three different scores and took it as
 * a grade of the score. It is not: confidence is set by how many facts
 * about the person are not known (lib/match-engine, lib/candidate-fit),
 * whatever the score. So the chip says "confidence" and how much is not
 * known.
 *
 * A count is printed only where the match says how many: the rules engine
 * writes "Missing: location, availability date", one fact per comma. The
 * fit reader writes sentences joined by "; " and a sentence may carry its
 * own semicolons, so there the chip says facts are missing without a
 * number, rather than print a count nobody can stand behind.
 */
export function confidenceWords(
  confidence: string,
  unknowns: string | null | undefined
): { cls: string; text: string } {
  const cls =
    confidence === 'HIGH' ? 'chip--verified'
    : confidence === 'MODERATE' ? 'chip--attention'
    : confidence === 'LOW' ? 'chip--danger'
    : 'chip--passive'
  const level =
    confidence === 'HIGH' ? 'High'
    : confidence === 'MODERATE' ? 'Moderate'
    : confidence === 'LOW' ? 'Low'
    : null
  if (!level) return { cls, text: 'Confidence not stated' }

  const said = (unknowns ?? '').trim()
  if (!said) return { cls, text: `${level} confidence · nothing missing` }
  const listed = /^Missing:\s*(.+)$/.exec(said)
  if (listed) {
    const n = listed[1].split(',').map((x) => x.trim()).filter(Boolean).length
    return { cls, text: `${level} confidence · ${n} not known` }
  }
  return { cls, text: `${level} confidence · some facts not known` }
}
