/**
 * The master contract — the 2017 word, kept, and made a choice.
 *
 * ── What it is ───────────────────────────────────────────────────────
 *
 * The founder, 2026-09-18, on where the two lines came from:
 *
 *   > Our original contract form in Etyme-2017 had these both under one
 *   > form under master contract, but now we are splitting them and
 *   > letting companies tag them to master contract if they want to see
 *   > contract profitability.
 *
 * So `ProjectOrder` is the roll-up a sell line and the buy line that
 * funds it are tagged to, and "master contract" is what a screen calls
 * it (`MASTER_CONTRACT_WORD` in `lib/order-naming`, which owns the
 * words). What changed in 2026 is that it is no longer the container
 * every contract is born inside: the lines come first, and the master is
 * a tag.
 *
 * ── Why a tag needs rules at all ─────────────────────────────────────
 *
 * Because postings settle into it. `orderFor` in `lib/order-postings`
 * groups lines by engagement when nothing is tagged, and every figure on
 * the profitability screen walks back to a posting in one of those
 * buckets. Three things follow, and all three are money:
 *
 *   1. **A settled or closed master refuses new postings** — the write
 *      throws rather than changing a period that has already been
 *      reported. So tagging a line onto one is refused here, on the way
 *      in, rather than at the next timesheet.
 *   2. **Nothing already posted moves.** A posting carries its own
 *      `projectOrderId`, stamped with the rate it was converted at. Re-
 *      tagging changes where the NEXT posting lands and nothing else,
 *      and the sentence says so — a screen implying otherwise would be
 *      promising a restatement nobody is doing.
 *   3. **Currency is fixed when the master opens**, and every posting is
 *      converted into it on the day. A line billing in another currency
 *      is allowed and is worth a sentence, because the roll-up will then
 *      hold converted figures rather than the ones on the invoice.
 *
 * No database in here, on purpose.
 */

import { MASTER_CONTRACT_WORD, masterContractLine } from '@/lib/order-naming'

/** A master contract, as much of it as a caller needs to decide. */
export interface MasterContractRef {
  id: string
  /** Ours. "PRJ-0042". */
  code: string
  name: string
  /** OPEN · SETTLED · CLOSED. */
  status: string
  /** What every posting into it is converted to. */
  currency: string
  /** Whose roll-up it is. */
  companyId: string
}

/** The line being tagged — a sell line or a buy line. */
export interface TaggableLine {
  id: string
  /** The firm whose book this line is in. */
  companyId: string
  /** What the line itself is in. */
  currency: string
  /** Where it settles today, where anywhere. */
  projectOrderId?: string | null
}

export type TagRefusal =
  | 'NO_SUCH_LINE'
  | 'LINE_NOT_YOURS'
  | 'NO_SUCH_MASTER'
  | 'MASTER_NOT_YOURS'
  | 'MASTER_CLOSED'

export interface TagVerdict {
  ok: boolean
  code: TagRefusal | null
  /** What happened, or what is missing and what to do. Always a sentence. */
  says: string
  /** Something true and worth knowing that does not stop the move. */
  note: string | null
}

/**
 * Whether this company may put this line on this master contract.
 *
 * `master: null` is untagging, which is always allowed on your own line
 * — a company that tagged something by mistake must be able to undo it,
 * and the default grouping catches the line when it falls.
 */
export function mayTag(input: {
  by: { companyId: string }
  line: TaggableLine | null
  master: MasterContractRef | null
  /** True where a master was named and not found. */
  masterMissing?: boolean
}): TagVerdict {
  const { by, line, master } = input

  if (!line) {
    return { ok: false, code: 'NO_SUCH_LINE', says: 'No such line.', note: null }
  }

  if (line.companyId !== by.companyId) {
    return {
      ok: false,
      code: 'LINE_NOT_YOURS',
      says:
        `That line is another firm's to code. A ${MASTER_CONTRACT_WORD.noun} is how your own ` +
        `books group a deal, and it never reaches across two companies.`,
      note: null,
    }
  }

  if (input.masterMissing) {
    return {
      ok: false,
      code: 'NO_SUCH_MASTER',
      says: `No ${MASTER_CONTRACT_WORD.noun} of that id.`,
      note: null,
    }
  }

  if (!master) {
    return {
      ok: true,
      code: null,
      says:
        `Off its ${MASTER_CONTRACT_WORD.noun}. It groups with its engagement again, the way an ` +
        `untagged line always has.`,
      note: 'What it has already posted stays where it posted. Nothing is restated.',
    }
  }

  if (master.companyId !== by.companyId) {
    return {
      ok: false,
      code: 'MASTER_NOT_YOURS',
      says: `${master.code} belongs to another firm.`,
      note: null,
    }
  }

  if (master.status === 'SETTLED' || master.status === 'CLOSED') {
    return {
      ok: false,
      code: 'MASTER_CLOSED',
      says:
        `${master.code} is ${master.status.toLowerCase()}. Its balance has been reported, and ` +
        `postings into it are refused — tag this line to an open ${MASTER_CONTRACT_WORD.noun} instead.`,
      note: null,
    }
  }

  return {
    ok: true,
    code: null,
    says: `${masterContractLine({ code: master.code, name: master.name })} What it bills and what it costs roll up there from now on.`,
    note:
      master.currency.toUpperCase() === line.currency.toUpperCase()
        ? 'What it has already posted stays where it posted. Nothing is restated.'
        : `This line is in ${line.currency.toUpperCase()} and ${master.code} totals in ` +
          `${master.currency.toUpperCase()}, so each posting is converted on the day it is made. ` +
          'What it has already posted stays where it posted.',
  }
}

/**
 * What a line says about its master contract, tagged or not.
 *
 * One sentence for the screen, through `masterContractLine` so the words
 * live in one file, plus what happens by default — which is the part a
 * reader actually needs, because "not tagged" sounds like "not counted"
 * and it is not: postings always settle somewhere.
 */
export function masterContractOn(input: {
  tag: { code?: string | null; name?: string | null } | null
  /** The engagement the line falls back to, where it has one. */
  engagementTitle?: string | null
}): { tagged: boolean; says: string; byDefault: string | null } {
  if (input.tag) {
    return { tagged: true, says: masterContractLine(input.tag), byDefault: null }
  }
  return {
    tagged: false,
    says: masterContractLine(null),
    byDefault: input.engagementTitle
      ? `Until then it rolls up with the rest of ${input.engagementTitle}.`
      : 'Until then it rolls up on its own.',
  }
}

/**
 * A code for a master contract somebody is opening by hand.
 *
 * `orderFor` derives `IO-PRJ-…` codes for the buckets it opens itself,
 * and a person naming their own deal should not have to think of a
 * scheme. Sequential, per company, and never reused — the code is
 * "stable for the life of the work" and appears on exports a finance
 * team reconciles against.
 */
export function nextMasterContractCode(existing: readonly string[]): string {
  const used = new Set(existing.map((c) => c.toUpperCase()))
  let n = existing.filter((c) => /^PRJ-\d+$/i.test(c)).length + 1
  for (;;) {
    const code = `PRJ-${String(n).padStart(4, '0')}`
    if (!used.has(code)) return code
    n += 1
  }
}
