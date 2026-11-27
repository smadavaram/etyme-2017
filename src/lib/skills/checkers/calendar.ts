/**
 * The firm's calendar, read through the checker's own read client (record
 * 123). The days off and the holidays are the rules' own readers
 * (`settingsFrom`, `loadCompanyHolidays`), handed the injected handle, so a
 * checker never reaches the global database client. Reads only.
 */
import type { PrismaClient } from '@prisma/client'
import { settingsFrom } from '@/lib/days-off'
import { loadCompanyHolidays } from '@/lib/holidays'
import type { ReadDb } from '../checker'

const WEEK_COLUMNS = { daysOff: true, hoursDueWeekday: true, approveByWeekday: true, approvalExtraWeeks: true, weekSettingsSetAt: true, weekSettingsSetById: true } as const

/** The company's days off through the injected read; Saturday and Sunday where it said nothing. */
export async function daysOffRead(read: ReadDb<PrismaClient>, companyId: string): Promise<number[]> {
  const row = await read.company.findUnique({ where: { id: companyId }, select: WEEK_COLUMNS })
  return settingsFrom(row).daysOff
}

/** The firm's holidays for the years around `year`, through the injected read. */
export const holidaysRead = (read: ReadDb<PrismaClient>, companyId: string, year: number) =>
  loadCompanyHolidays(companyId, year - 1, year + 1, undefined, read as any)
