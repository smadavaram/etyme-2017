import { prisma } from '@/lib/db'
import type { RegionScope } from '@/lib/region-scope'

/**
 * Which of a regional manager's own threads sit inside her region
 * (founder, 2026-10-27, the region map: "nothing a regional manager reads
 * crosses regions").
 *
 * The thread list for a region seat is already only the threads the
 * person is on. This is the second wall: a thread about a job request, a
 * candidate, a contract, a bill or an expense is kept only where that
 * thing sits at one of the region's plants, read through the same scope
 * `lib/region-scope` gives every other region read (a job request by the
 * unit it is charged to, a contract by its site).
 *
 * Fail closed. A thread about something this cannot place (a paper, a
 * topic added later, a row that is gone) is dropped, never shown. A
 * thread about nothing in particular (GENERAL or DIRECT, with no topic
 * row) names no plant, so the person's own is kept.
 */

export interface ThreadTopic {
  id: string
  topic: string
  topicId: string | null
}

/** The topics a thread names a plant through, and the ids placed inside the region. */
export interface PlacedTopics {
  requirements: ReadonlySet<string>
  submissions: ReadonlySet<string>
  contracts: ReadonlySet<string>
  invoices: ReadonlySet<string>
  expenses: ReadonlySet<string>
}

/** Pure: whether one thread may be shown to the region seat, given what was placed inside the region. */
export function threadInRegion(t: ThreadTopic, placed: PlacedTopics): boolean {
  if (t.topic === 'GENERAL' || t.topic === 'DIRECT') return true
  if (!t.topicId) return false
  switch (t.topic) {
    case 'REQUIREMENT': return placed.requirements.has(t.topicId)
    case 'SUBMISSION': return placed.submissions.has(t.topicId)
    case 'CONTRACT': return placed.contracts.has(t.topicId)
    case 'INVOICE': return placed.invoices.has(t.topicId)
    case 'EXPENSE': return placed.expenses.has(t.topicId)
    default: return false
  }
}

/** The threads among `threads` that sit inside the region. One read per kind of topic present. */
export async function threadsInRegion<T extends ThreadTopic>(threads: readonly T[], scope: RegionScope): Promise<T[]> {
  const ids = (topic: string) => [...new Set(threads.filter((t) => t.topic === topic && t.topicId).map((t) => t.topicId as string))]
  const req = ids('REQUIREMENT'), sub = ids('SUBMISSION'), con = ids('CONTRACT'), inv = ids('INVOICE'), exp = ids('EXPENSE')
  const atSites = { workLocationId: { in: scope.siteIds } }
  const [requirements, submissions, contracts, invoices, expenses] = await Promise.all([
    req.length ? prisma.requirement.findMany({ where: { id: { in: req }, orgUnitId: { in: scope.unitIds } }, select: { id: true } }) : [],
    sub.length ? prisma.submission.findMany({ where: { id: { in: sub }, requirement: { orgUnitId: { in: scope.unitIds } } }, select: { id: true } }) : [],
    con.length ? prisma.sellContract.findMany({ where: { id: { in: con }, ...atSites }, select: { id: true } }) : [],
    // A bill is in the region only where every line on it is: one line at a
    // plant outside it would carry that plant's hours into her list.
    inv.length
      ? prisma.invoice.findMany({
          where: { id: { in: inv }, invoiceLines: { some: { sellContract: atSites } }, NOT: { invoiceLines: { some: { NOT: { sellContract: atSites } } } } },
          select: { id: true },
        })
      : [],
    exp.length ? prisma.expense.findMany({ where: { id: { in: exp }, sellContract: atSites }, select: { id: true } }) : [],
  ])
  const set = (rows: { id: string }[]) => new Set(rows.map((r) => r.id))
  const placed: PlacedTopics = {
    requirements: set(requirements),
    submissions: set(submissions),
    contracts: set(contracts),
    invoices: set(invoices),
    expenses: set(expenses),
  }
  return threads.filter((t) => threadInRegion(t, placed))
}
