/**
 * No paper is chased for a party whose set the company never confirmed.
 *
 * The founder, 2026-10-22, on the setup checklist: "A skipped item
 * refuses only the act that needs it, in a sentence that names the step
 * … no I-9 chased for a party whose set was never confirmed." The rule
 * itself is the architect's, one copy, in `lib/setup-gates`
 * (`mayChasePaper`); this is where regulatory's nightly chase asks it.
 *
 * ── What it holds back, and what it does not ─────────────────────────
 *
 * Only the asking. A letter that tells a worker, a supplier or a desk
 * that a paper is running out is a chase made on the company's behalf,
 * and the company has not yet said what it requires of that party, so
 * Etyme does not put words in its mouth. Nothing about whether the work
 * may go on moves: a lapsed I-9, lapsed cover or lapsed good standing
 * still blocks a start through `lib/contract-clearance`, which never
 * reads this gate. The block is the law's; the letter is the company's.
 *
 * ── Never silent ─────────────────────────────────────────────────────
 *
 * What is held back comes back as `withheld`, one row per company and
 * party, with the gate's own sentence (it names Setup → Papers you
 * require) and the papers that were not asked for tonight. The night's
 * findings carry each row (`asFindings` in lib/document-request), so the
 * watch's report says what it did not chase and why.
 *
 * ── Which party a chase is about ─────────────────────────────────────
 *
 * The party of the company's own set that the line reads as its floor:
 * `PARTY_OF_SHAPE` over the line's shape, the same mapping the line's
 * requirements read (`companySet` in lib/document-requirements). So the
 * set a line inherits and the set that lets it be chased are one set.
 */

import { prisma } from '@/lib/db'
import { mayChasePaper } from '@/lib/setup-gates'
import { PARTY_OF_SHAPE, shapeOf, type LineShape } from '@/lib/document-requirements'
import type { Party } from '@/lib/document-stages/required-sets'

type Db = typeof prisma

/** The party of a company's own set a line of this shape reads as its floor. */
export function partyOfShape(shape: LineShape): Party {
  return PARTY_OF_SHAPE[shape]
}

/** Who a chase is made for, and about which of its parties. */
export interface ChaseFor {
  /** The company whose desk the chase is made on behalf of. */
  companyId: string | null
  party: Party | null
}

/** What was not chased tonight, per company and party, in a sentence. */
export interface WithheldChase {
  companyId: string
  party: Party
  /** The gate's sentence, naming the step. Never a code. */
  says: string
  /** The papers it would have asked for, in the words the parties use. */
  documents: string[]
}

/**
 * Split tonight's chases into those that go and those held back.
 *
 * A chase that names no company or no party passes as before: there is
 * no set to read, and a gate that refused what it cannot place would be
 * guessing. Each company and party is asked once, through `mayChasePaper`.
 */
export async function gateChases<T>(
  items: readonly T[],
  forOf: (t: T) => ChaseFor,
  documentOf: (t: T) => string,
  db: Db = prisma
): Promise<{ chase: T[]; withheld: WithheldChase[] }> {
  const verdicts = new Map<string, Awaited<ReturnType<typeof mayChasePaper>>>()
  const chase: T[] = []
  const withheld = new Map<string, WithheldChase>()
  for (const t of items) {
    const f = forOf(t)
    if (!f.companyId || !f.party) {
      chase.push(t)
      continue
    }
    const k = `${f.companyId}:${f.party}`
    let v = verdicts.get(k)
    if (!v) {
      v = await mayChasePaper(f.companyId, f.party, db)
      verdicts.set(k, v)
    }
    if (v.ok) {
      chase.push(t)
      continue
    }
    const row = withheld.get(k) ?? { companyId: f.companyId, party: f.party, says: v.says, documents: [] }
    const what = documentOf(t)
    if (!row.documents.includes(what)) row.documents.push(what)
    withheld.set(k, row)
  }
  return { chase, withheld: [...withheld.values()] }
}

/**
 * The party a person's own check is about, at the firm that would order
 * it again: read off the line that pays them there, where there is one.
 * With none, the firm is taken to be the employer, because a firm orders
 * a background check on its own worker; that is what `checksToRedo`
 * already assumes when it names who owes the check.
 */
export async function workerPartyAt(
  personId: string,
  companyId: string,
  db: Db = prisma
): Promise<Party> {
  const line = await db.buyContract.findFirst({
    where: { companyId, candidates: { some: { personId } }, state: { in: ['IN_PROGRESS', 'PAUSED'] as never[] } },
    select: { contractType: true, vendorCompanyId: true, vendorCompany: { select: { kind: true } } },
    orderBy: { startDate: 'desc' },
  })
  if (!line) return 'WORKERS_W2'
  return partyOfShape(
    shapeOf({ side: 'BUY', contractType: line.contractType, vendorCompanyId: line.vendorCompanyId, vendorKind: line.vendorCompany?.kind ?? null })
  )
}

/** The night's line for one withheld row: the gate's sentence, then what was not asked. */
export function withheldDetail(w: WithheldChase): string {
  const n = w.documents.length
  const list = n <= 3 ? w.documents.join(', ') : `${w.documents.slice(0, 3).join(', ')} and ${n - 3} more`
  return `Not asked for tonight: ${list}. A paper that has run out still stops a start; only the letter waits.`
}
