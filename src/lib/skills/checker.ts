/**
 * The checker contract (record 123, plan C2 and C3). Types and one guard;
 * no database, no network.
 *
 * A checker is a pure read. It is handed the company, the skill, the
 * window the work was done in and the records the run was about, plus a
 * handle that can only read. It re-derives what should exist from the
 * rules' own readers and compares that with what is on the record. It is
 * never handed the agent's own report, so it cannot grade from it.
 *
 * It answers PASS, FAIL or UNKNOWN. UNKNOWN is "I could not read my key":
 * it carries a reason and is never counted as passed. It writes nothing:
 * the Check row and `unitsDone` belong to the grader (`lib/skills/grade`).
 */

export type CheckerVerdict = 'PASS' | 'FAIL' | 'UNKNOWN'

export interface CheckerResult {
  verdict: CheckerVerdict
  /** In words somebody can act on. A failed check that does not say what to fix is not a check. */
  reason: string
  /** What it read to decide: the two figures it compared, the row it looked for. */
  evidence: string | null
  /** How many units it found on the record that match its own re-derived reading. Null where it cannot say. */
  unitsFound: number | null
}

export interface CheckWindow { from: Date; to: Date }
export interface RecordRef { recordType: string; recordId: string }

/** The only methods a checker's database handle answers. Anything else throws. */
export const READ_METHODS = ['findMany', 'findFirst', 'findUnique', 'findFirstOrThrow', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy'] as const
type ReadMethod = (typeof READ_METHODS)[number]

/** A database client narrowed to reads, for the type checker. */
export type ReadDb<Client> = {
  readonly [Model in keyof Client as Model extends `$${string}` ? never : Model]: Client[Model] extends object
    ? Pick<Client[Model], Extract<keyof Client[Model], ReadMethod>>
    : never
}

export type SkillChecker<Client = unknown> = (
  companyId: string,
  skillKey: string,
  window: CheckWindow,
  recordRefs: readonly RecordRef[],
  read: ReadDb<Client>,
) => Promise<CheckerResult>

export const unknownBecause = (reason: string): CheckerResult => ({ verdict: 'UNKNOWN', reason, evidence: null, unitsFound: null })

/** What a checker answered, if it is a well-formed answer; null where it is not. */
export function wellFormed(r: unknown): CheckerResult | null {
  const x = r as Partial<CheckerResult> | null
  if (!x || typeof x !== 'object') return null
  if (x.verdict !== 'PASS' && x.verdict !== 'FAIL' && x.verdict !== 'UNKNOWN') return null
  if (typeof x.reason !== 'string' || x.reason.trim() === '') return null
  const found = x.unitsFound
  if (found != null && (!Number.isInteger(found) || found < 0)) return null
  return { verdict: x.verdict, reason: x.reason, evidence: typeof x.evidence === 'string' ? x.evidence : null, unitsFound: found ?? null }
}
