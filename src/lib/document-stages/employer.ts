/**
 * Which firm on one person's chain employs them — the firm that
 * completes the I-9 with them.
 *
 * Found by the second Tapin walk, 2026-10-30. Ravi is Tapin's own W2,
 * placed through Brightmoor Staffing at Northbend Athletic. Three firms
 * sit on his two lines, and every door that asked "whose is the I-9?"
 * answered with whichever line it happened to read first: Tapin's
 * compliance page listed only the starts where Tapin was the buyer, and
 * his own upload landed on the Northbend–Brightmoor line, so Brightmoor
 * was told and Tapin, his employer, never was.
 *
 * The law is not ambiguous. The employer completes the I-9 with the
 * person, from the documents the person chose to show. A prime that buys
 * the person's time from a sub-vendor is not the employer and does not
 * complete it; a client never does.
 *
 * Pure, so the record route, the document review, the worker's own page,
 * the start papers ask and the compliance page all ask one question of
 * one function.
 */

/** One line the person is on: who sells their time, and to whom. */
export interface ChainLine {
  id: string
  companyId: string
  clientCompanyId: string | null
}

/**
 * A fact on the record that a firm employs the person.
 *
 *   EMPLOYEE  the firm holds an employee seat for them (CLAUDE.md, "Who
 *             sells and who buys": "own W2" means exactly this)
 *   PAYROLL   the firm pays them on a buy line of its own with nobody in
 *             between — a W2, fixed-term or contract-to-hire line
 */
export interface EmploymentFact {
  companyId: string
  how: 'EMPLOYEE' | 'PAYROLL'
}

/** The buy-line types under which the paying firm is the employer of record. */
export const EMPLOYED_ON: readonly string[] = ['W2', 'C2H_W2', 'FIXED_TERM', 'CDD']

/**
 * The documents only the employer completes or examines. An I-9 is the
 * employer looking at what the person shows and recording it; a right to
 * work check the same. A copy sent by anybody is evidence for that
 * examination, never the examination (lib/document-request,
 * EXAMINED_NOT_SENT, which says the same two keys).
 */
export const EMPLOYER_COMPLETES: readonly string[] = ['I9_EVERIFY', 'RIGHT_TO_WORK']

export interface Employer {
  companyId: string
  /**
   * How the record knows. BOTTOM is the firm at the foot of the chain
   * with no employment fact behind it — the firm the person works for
   * directly, which is the best reading and not a certainty, so nothing
   * is refused on it.
   */
  how: 'EMPLOYEE' | 'PAYROLL' | 'BOTTOM'
}

/**
 * The firms on the chain under one line, top first: the line's seller,
 * then whoever sells to that seller, and so on down. Stops where the
 * paper is ambiguous (two lines below one rung), because a chain nobody
 * can read is not walked by guessing.
 */
export function sellersBelow(fromLineId: string, lines: ChainLine[]): string[] {
  const from = lines.find((l) => l.id === fromLineId)
  if (!from) return []
  const out = [from.companyId]
  const seen = new Set<string>([from.id])
  let current = from
  for (;;) {
    const below = lines.filter((l) => !seen.has(l.id) && l.clientCompanyId === current.companyId)
    if (below.length !== 1) break
    current = below[0]
    seen.add(current.id)
    if (out.includes(current.companyId)) break
    out.push(current.companyId)
  }
  return out
}

/**
 * The firm that employs the person on the chain under this line.
 *
 * An employment fact wins, the lowest on the chain first (a sub's own W2
 * is the sub's, whoever sells his time above it). With no fact, the firm
 * at the foot of the chain, said as BOTTOM. Null where the line is not
 * one of the person's.
 */
export function employerOnChain(input: {
  fromLineId: string
  lines: ChainLine[]
  facts: EmploymentFact[]
}): Employer | null {
  const chain = sellersBelow(input.fromLineId, input.lines)
  if (chain.length === 0) return null
  for (const companyId of [...chain].reverse()) {
    const fact = input.facts.find((f) => f.companyId === companyId && f.how === 'EMPLOYEE')
      ?? input.facts.find((f) => f.companyId === companyId)
    if (fact) return { companyId, how: fact.how }
  }
  return { companyId: chain[chain.length - 1], how: 'BOTTOM' }
}

/**
 * Whether this firm, a seller on the line, must leave an employer-completed
 * paper to another firm: true only where the record says another firm on
 * the chain employs the person. A best reading never refuses anybody.
 */
export function employedElsewhere(employer: Employer | null, callerCompanyId: string): boolean {
  return !!employer && employer.how !== 'BOTTOM' && employer.companyId !== callerCompanyId
}

/**
 * The order a worker's lines are tried in when she sends a paper from
 * her own page: her employer's lines first, then the foot of each chain,
 * then the rest. A worker answers to the firm that employs her, and a
 * paper only the employer examines goes to the employer and nowhere else
 * where the record names one.
 */
export function linesForWorker<T extends { companyId: string; side: 'SELL' | 'BUY'; lineId: string }>(input: {
  candidates: T[]
  sellLines: ChainLine[]
  facts: EmploymentFact[]
  key: string
}): T[] {
  // Only a firm she is actually on a line with: a seat left open at a
  // past employer is not who she answers to today.
  const onHerLines = new Set(input.candidates.map((c) => c.companyId))
  const employers = new Set(input.facts.map((f) => f.companyId).filter((id) => onHerLines.has(id)))
  const buyers = new Set(input.sellLines.map((l) => l.clientCompanyId).filter((v): v is string => !!v))
  const rank = (c: T): number =>
    employers.has(c.companyId) ? 0 : !buyers.has(c.companyId) ? 1 : 2
  const ordered = [...input.candidates].sort((a, b) => rank(a) - rank(b))
  if (EMPLOYER_COMPLETES.includes(input.key) && employers.size > 0) {
    return ordered.filter((c) => employers.has(c.companyId))
  }
  return ordered
}
