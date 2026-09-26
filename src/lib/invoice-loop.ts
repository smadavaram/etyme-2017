/**
 * The three-way match, on the harness.
 *
 * It was the least accountable check in the build. It blocks a payment on
 * a receipt check, and nothing anywhere counted whether that check had
 * ever been right, how often it needed a second attempt, or what it cost.
 * It could have been wrong for six months.
 *
 * The arithmetic is unchanged — it was correct and had forty-two tests
 * before this file existed. What changes is that every run now leaves a
 * ledger row, every verdict leaves a Check row with its evidence, and the
 * attempts are counted.
 *
 * Recorded on submission rather than on every read. The match runs
 * whenever somebody opens an invoice, and recording that would fill the
 * ledger with page views. Submission is the moment money is about to
 * move, which is the moment worth counting.
 */

import { matchInvoice } from '@/lib/invoice-match'
import { runLoop, type Finding, type Step } from '@/lib/loop'
import type { MatchResult } from '@/lib/three-way-match'

/**
 * Every check the match made, as findings the harness understands.
 *
 * An override stays a PASS with the waiver in the reason, because that is
 * what it is — somebody with authority said proceed, and the record has
 * to show both that it failed and that it was waived.
 */
export function asFindings(result: MatchResult): Finding[] {
  return result.checks.map((c) => ({
    code: c.code,
    checker: 'RULE',
    verdict: c.outcome === 'FAIL' ? 'FAIL' : 'PASS',
    reason: c.reason,
    // What it read to decide. Which lines a check failed on is the first
    // thing an AP clerk needs and the engine already knew it.
    evidence: c.lines?.length ? `lines: ${c.lines.join(', ')}` : null,
  }))
}

/**
 * Run the match and write down that it ran.
 *
 * Returns the result unchanged, so callers that only care about the
 * verdict are untouched.
 */
export async function matchAndRecord(
  invoiceId: string,
  companyId: string,
  attempt: number
): Promise<{ result: MatchResult | null; state: string }> {
  let result: MatchResult | null = null

  const steps: Step<null>[] = [
    {
      code: 'THREE_WAY_MATCH',
      checker: 'RULE',
      run: async () => {
        result = await matchInvoice(invoiceId)
        return result ? asFindings(result) : null
      },
    },
  ]

  const outcome = await runLoop(
    {
      name: 'invoice.match',
      recordType: 'INVOICE',
      steps,
      // Three, like everything else. An invoice that cannot be made to
      // match in three goes to a person, because the fourth attempt costs
      // the same and has never once worked.
      maxAttempts: 3,
    },
    null,
    { companyId, recordId: invoiceId, attempt }
  )

  return { result, state: outcome.state }
}
