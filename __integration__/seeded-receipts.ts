import { prisma } from './harness'
import { pendingReceiptsFor } from '@/lib/twin/rules/invoice'
import { DRAWS_NOTHING } from '@/lib/money/bill-state'

/**
 * Pinnacle Resourcing's two invoice receipts at Northbend Athletic, found by
 * their facts, never by their numbers.
 *
 * The bank-hold walk was turned red by INV-IHMDQC, a number the template
 * rebuild of 2026-11-09 renumbered. These two are written with literal
 * numbers today (lib/twin/seed-demo), and a test that leans on that is one
 * seed edit from the same red. So a receipt is found by what it is:
 *
 *   - billed by Pinnacle to Northbend, for Lucía Fernández's weeks;
 *   - still owed;
 *   - and what the three-way check says about it (`pendingReceiptsFor`,
 *     the twin's own reading): CLEAN for the one that agrees with the
 *     accepted hours, MISMATCH for the one that bills more.
 *
 * Read before any bank or setup change a test makes, because the verdict on
 * the hours does not move with them.
 */
export async function pinnacleReceiptsAtNorthbend(): Promise<{ clean: string; held: string; northbend: string; pinnacle: string }> {
  const [northbend, pinnacle] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { slug: 'world-nike' }, select: { id: true } }),
    prisma.company.findUniqueOrThrow({ where: { slug: 'world-pinnacle' }, select: { id: true } }),
  ])
  const theirs = new Set(
    (await prisma.invoice.findMany({
      where: {
        invoiceLines: { some: { person: { name: 'Lucía Fernández' }, sellContract: { companyId: pinnacle.id, clientCompanyId: northbend.id } } },
      },
      select: { id: true },
    })).map((i) => i.id),
  )
  const verdicts = (await pendingReceiptsFor(northbend.id)).filter((v) => theirs.has(v.invoiceId))
  const clean = verdicts.find((v) => v.verdict === 'CLEAN')
  const held = verdicts.find((v) => v.verdict === 'MISMATCH')
  if (!clean || !held) {
    throw new Error(
      `The seeded world should hold two of Pinnacle's receipts at Northbend for Lucía Fernández, one clean and one over the hours; it holds ${verdicts.map((v) => v.verdict).join(', ') || 'none'}.`,
    )
  }
  return { clean: clean.invoiceId, held: held.invoiceId, northbend: northbend.id, pinnacle: pinnacle.id }
}

/**
 * Helena Marsh's week that Computer Systems has billed upward and that
 * Techpeple's own invoice for is an invoice receipt at Computer Systems,
 * found by those facts, never by a calendar day: the seeded weeks are
 * counted from the template's own day, so "the week of October 4" is a
 * different week on a template built on a Monday.
 */
export async function helenasDoublyBilledWeek(): Promise<string> {
  const [helena, cs, techpeple] = await Promise.all([
    prisma.person.findFirstOrThrow({ where: { name: 'Helena Marsh' }, select: { id: true } }),
    prisma.company.findUniqueOrThrow({ where: { slug: 'world-computer-systems' }, select: { id: true } }),
    prisma.company.findUniqueOrThrow({ where: { slug: 'world-techpeple' }, select: { id: true } }),
  ])
  // Techpeple's invoices as Computer Systems recorded them: a receipt covers
  // the days inside its period, which is how the Bills page reads it.
  const receipts = await prisma.vendorBill.findMany({
    where: { companyId: cs.id, vendorCompanyId: techpeple.id, status: { not: 'CANCELLED' }, periodStart: { not: null }, periodEnd: { not: null } },
    select: { periodStart: true, periodEnd: true },
  })
  const weeks = await prisma.timesheet.findMany({
    where: {
      personId: helena.id,
      // On a bill Computer Systems sent upward and nobody has paid yet.
      invoiceLines: { some: { sellContract: { companyId: cs.id }, invoice: { status: { notIn: [...DRAWS_NOTHING, 'PAID'] } } } },
    },
    orderBy: { periodStart: 'asc' },
    select: { id: true, periodStart: true, periodEnd: true },
  })
  const week = weeks.find((w) => receipts.some((r) => r.periodStart! <= w.periodStart && w.periodEnd <= r.periodEnd!)) ?? null
  if (!week) throw new Error('The seeded world holds no week of Helena Marsh billed by Computer Systems and received from Techpeple.')
  return week.id
}
