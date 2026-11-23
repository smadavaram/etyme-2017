/**
 * The public access file follows the petition's filing day, in the same
 * save that records the day (record 112, chain 6). Where no file exists one
 * is started, due one working day after the filing (proposed rule). Where a
 * file exists and nobody has approved it, its due day moves with the filing
 * day. An approved file is left as it was: its ready day is a fact.
 * The compliance watch still opens the card for it.
 */
import type { Prisma } from '@prisma/client'
import { daysOffFor } from '@/lib/days-off'
import { loadCompanyHolidays } from '@/lib/holidays'
import { accessFileReadyBy } from '@/lib/agents/checklist-rules'
import { writeRecordAction } from '@/lib/record-ledger'

/** The firm's days off and holidays around a filing day, read before the transaction opens. */
export async function filingCalendar(companyId: string, filedOn: Date) {
  const year = filedOn.getUTCFullYear()
  return { daysOff: await daysOffFor(companyId), holidays: await loadCompanyHolidays(companyId, year - 1, year + 1) }
}

export async function followFilingDay(
  tx: Prisma.TransactionClient,
  o: { companyId: string; petitionId: string; person: string; filedOn: Date; calendar: Awaited<ReturnType<typeof filingCalendar>>; personId: string; heldAs: string; actingEntityId: string | null },
): Promise<void> {
  const readyBy = accessFileReadyBy(o.filedOn, o.calendar.daysOff, o.calendar.holidays)
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const stamp = { companyId: o.companyId, recordType: 'PublicAccessFile', personId: o.personId, heldAs: o.heldAs, actingEntityId: o.actingEntityId }
  const file = await tx.publicAccessFile.findFirst({ where: { companyId: o.companyId, petitionId: o.petitionId }, orderBy: { createdAt: 'asc' } })
  if (!file) {
    const made = await tx.publicAccessFile.create({ data: { companyId: o.companyId, petitionId: o.petitionId, readyBy } })
    await writeRecordAction(tx, { ...stamp, recordId: made.id, action: 'ACCESS_FILE_TRACKED', summary: `Started tracking the public access file for ${o.person}’s petition from its filing day. It is due ${day(readyBy)}. A person approves it.` })
    return
  }
  if (file.approvedById || file.readyBy.getTime() === readyBy.getTime()) return
  await tx.publicAccessFile.update({ where: { id: file.id }, data: { readyBy } })
  await writeRecordAction(tx, { ...stamp, recordId: file.id, action: 'ACCESS_FILE_DUE_MOVED', summary: `The filing day changed to ${day(o.filedOn)}, so the public access file for ${o.person}’s petition is now due ${day(readyBy)}, not ${day(file.readyBy)}.` })
}
