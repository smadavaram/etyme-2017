/**
 * History was billed at the multiplier. Say so, once, in writing.
 *
 *   npx tsx scripts/backfill-overtime-decisions.ts            # what it would do
 *   npx tsx scripts/backfill-overtime-decisions.ts --write    # do it
 *
 * ── Why this exists ───────────────────────────────────────────────────
 *
 * Until the overtime rewrite, a week over the threshold was priced by
 * multiplying the rate by whatever `SellContract.overtimeMultiplierBps`
 * said. Nobody decided it and nothing recorded it; the multiplication
 * simply happened, on the invoice and in the budget.
 *
 * The new code refuses to do that. It prices from an `OvertimeDecision`
 * and bills nothing at all for a week nobody has answered. Left alone,
 * that would quietly restate history: a 45-hour week that was invoiced
 * at $4,750 in July would read as $4,500 the next time anything asked
 * what it was worth, and the three-way match would call the invoice
 * wrong.
 *
 * So every approved week that went over the line, and has no decision on
 * it, gets the decision that was actually applied to it: PREMIUM, at the
 * contract's own multiplier. The figure does not move. What changes is
 * that the number now has a record behind it instead of an assumption.
 *
 * ── What it will not do ───────────────────────────────────────────────
 *
 * **It never changes the value of anything already sent.** It writes
 * decisions that reproduce what was billed, to the cent, and where the
 * week has already reached an invoice it stamps the decision billed with
 * that invoice's own date — so nobody can re-answer a week a client has
 * already been sent a document about.
 *
 * **It never answers a week nobody approved.** An open or submitted
 * timesheet has a live question on it, and the approval desk asks it.
 * Answering on that desk's behalf is exactly the fabrication this whole
 * change exists to stop.
 *
 * **It is not somebody's signature, and says so.** `decidedBy` is a
 * required column, so a row has to name a person; it names whoever
 * signed the hours, because they are the only person with any claim to
 * the week at all. The reason says in words that the treatment was
 * derived from the contract rather than chosen, and every row carries
 * the same sentence so they can be found again. A `derived` flag on the
 * table would be better than a sentence, and is the architect's call.
 *
 * It is safe to run twice: a decision already on a week is left exactly
 * as it is, whoever wrote it.
 */

import { PrismaClient } from '@prisma/client'
import { policyOf, splitWeeks } from '../src/lib/overtime'

const prisma = new PrismaClient()

/** The sentence that marks a row as derived rather than decided. */
const DERIVED =
  'Derived, not decided: this week was billed at the contract multiplier before ' +
  'overtime became a decision, and this row records what was applied so the figure ' +
  'does not change. Nobody chose it.'

const WRITE = process.argv.includes('--write')

async function main() {
  // Only contracts that carry a threshold can have produced an overtime
  // hour. Straight-time work — most of it — has nothing to backfill.
  const contracts = await prisma.sellContract.findMany({
    where: { overtimeAfterHours: { not: null } },
    select: {
      id: true, companyId: true, clientCompanyId: true,
      overtimeAfterHours: true, overtimeMultiplierBps: true,
    },
  })

  if (contracts.length === 0) {
    console.log('No contract carries an overtime threshold, so no week was ever billed at a multiplier. Nothing to do.')
    return
  }

  let weeks = 0
  let stamped = 0
  const sheetsTouched = new Set<string>()

  for (const contract of contracts) {
    const policy = policyOf(contract)

    const sheets = await prisma.timesheet.findMany({
      where: {
        sellContractId: contract.id,
        // Approved, by the column or by the ledger. An unapproved week
        // is a question for whoever signs it, not for this script.
        OR: [
          { status: 'APPROVED' },
          { assertions: { some: { role: 'CLIENT_APPROVAL', state: 'LIVE' } } },
        ],
      },
      select: {
        id: true, days: true, leaveDays: true,
        clientApprovedById: true, employerAcceptedById: true, approvedById: true,
        personId: true,
        overtimeDecisions: { select: { weekOf: true, sellContractId: true } },
        invoiceLines: {
          where: { sellContractId: contract.id },
          select: { invoice: { select: { issuedAt: true, periodEnd: true, status: true } } },
        },
      },
    })

    for (const sheet of sheets) {
      const split = splitWeeks((sheet.days as Record<string, number>) ?? {}, policy, {
        leaveDays: (sheet.leaveDays as Record<string, number>) ?? {},
      })

      const over = split.weeks.filter((w) => w.overHours > 0)
      if (over.length === 0) continue

      // Whoever signed the week. Never the person whose hours they are —
      // nobody decides overtime on their own week, and a backfill that
      // wrote one would be the first row in the table to break the rule
      // the table exists for.
      const signer =
        [sheet.clientApprovedById, sheet.employerAcceptedById, sheet.approvedById]
          .find((id): id is string => Boolean(id) && id !== sheet.personId) ?? null

      if (!signer) {
        console.log(
          `  skipped ${sheet.id}: ${over.length} week(s) over the line, but no signature on the sheet to attribute them to. ` +
          'Decide these on the approval desk.'
        )
        continue
      }

      // Where the week has already reached an invoice, the decision is
      // billed from that invoice's own date — not today's, which would
      // read as though somebody decided it this morning.
      const billedOn = sheet.invoiceLines
        .map((l) => l.invoice)
        .filter((i) => i.status !== 'VOID' && i.status !== 'CANCELLED')
        // The day it was billed, or failing that the last day it billed
        // for. Never today: today would read as a decision taken this
        // morning about a week somebody was invoiced for in July.
        .map((i) => i.issuedAt ?? i.periodEnd)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null

      for (const week of over) {
        const already = sheet.overtimeDecisions.some(
          (d) => d.sellContractId === contract.id && d.weekOf.toISOString().slice(0, 10) === week.weekOf
        )
        if (already) continue

        weeks++
        if (billedOn) stamped++
        sheetsTouched.add(sheet.id)

        if (!WRITE) continue

        await prisma.overtimeDecision.create({
          data: {
            timesheetId: sheet.id,
            sellContractId: contract.id,
            weekOf: new Date(`${week.weekOf}T00:00:00.000Z`),
            treatment: 'PREMIUM',
            overtimeHours: week.overHours,
            afterHours: contract.overtimeAfterHours!,
            multiplierBps: contract.overtimeMultiplierBps,
            // The whole point: what was applied is what the contract
            // said, because that is what the invoice charged.
            appliedBps: contract.overtimeMultiplierBps,
            accrualBps: 10_000,
            decidedById: signer,
            decidedByCompanyId: contract.clientCompanyId ?? contract.companyId,
            decidedAt: billedOn ?? new Date(),
            reason: DERIVED,
            billedAt: billedOn,
          },
        })
      }
    }
  }

  const verb = WRITE ? 'Wrote' : 'Would write'
  if (weeks === 0) {
    console.log('Every week that went over the line already has a decision on it. Nothing to do.')
    return
  }

  console.log(
    `${verb} ${weeks} overtime decision${weeks === 1 ? '' : 's'} across ${sheetsTouched.size} timesheet${sheetsTouched.size === 1 ? '' : 's'}, ` +
    `each at the contract's own multiplier so no invoice changes value. ` +
    `${stamped} of them ${stamped === 1 ? 'is' : 'are'} already on an invoice and stamped billed, which means ${stamped === 1 ? 'it' : 'they'} can no longer be changed.`
  )
  if (!WRITE && weeks > 0) console.log('Nothing was written. Run again with --write.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
