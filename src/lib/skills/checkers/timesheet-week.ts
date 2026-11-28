/**
 * What the timesheet chase's checkers share (record 123, plan C3): one due
 * week re-read through the checker's own read client, and whether it was
 * filed, with the rules' own readers (`weekFiledWith`, `employsWorkerWith`).
 * "As of" a moment means only hours filed by then count, so a week filed
 * after a chase was proposed does not make the proposal wrong. Reads only.
 */
import type { PrismaClient } from '@prisma/client'
import { employsWorkerWith, weekFiledWith, type ChaseReads } from '@/lib/agents/timesheet-chase-rules'
import type { ReadDb } from '../checker'
import { daysOffRead } from './calendar'

export async function dueWeek(read: ReadDb<PrismaClient>, cycleId: string) {
  return read.cycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true, kind: true, dueOn: true, periodStart: true, periodEnd: true, completedAt: true,
      sellContract: { select: { companyId: true, state: true, personId: true, clientCompanyId: true, endClientCompanyId: true } },
    },
  })
}
export type DueWeek = NonNullable<Awaited<ReturnType<typeof dueWeek>>>

/** Whether the week was filed at `at`, by the rules' own reader: its hours-due date completed by then, or hours filed by then that cover its days. */
export async function filedAsOf(read: ReadDb<PrismaClient>, companyId: string, c: DueWeek, at: Date | null): Promise<boolean> {
  const daysOff = await daysOffRead(read, companyId)
  const reads: ChaseReads = at === null ? (read as unknown as ChaseReads) : {
    ...(read as unknown as ChaseReads),
    timesheet: { findMany: (args: any) => read.timesheet.findMany({ ...args, where: { ...args.where, submittedAt: { lte: at } } }) as any },
  }
  const completedByThen = c.completedAt !== null && (at === null || c.completedAt <= at)
  return weekFiledWith(reads, { ...c, completedAt: completedByThen ? c.completedAt : null }, daysOff)
}

export const employsAtFirm = (read: ReadDb<PrismaClient>, companyId: string, personId: string) =>
  employsWorkerWith(read as unknown as ChaseReads, companyId, personId)
