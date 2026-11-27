/**
 * The outreach batch's half of the `chase.send` answer key (record 123,
 * plan step 8). A batch's run is about one letter, not about the record the
 * task was raised on, so each mail row is read against the letter, its
 * contact and its batch: the letter belongs to a batch of this firm, the
 * batch had a person's yes before the row was written, the contact had not
 * unsubscribed nor said she was interested, the address is the one the
 * letter was drafted for, Outreach was on, and the agent's switch read On.
 * Reads only.
 */
import type { PrismaClient } from '@prisma/client'
import { OUTREACH_BATCH_KIND, OUTREACH_BATCH_TEMPLATE, OUTREACH_LETTER_TYPE, FOLLOW_UPS } from '@/lib/outreach/batch-rules'
import { isOn } from '@/lib/plugins'
import type { CheckerResult, CheckWindow, ReadDb, RecordRef } from '../checker'

export const isBatchLetterRef = (ref: RecordRef | undefined): boolean => ref?.recordType === OUTREACH_LETTER_TYPE

/** Whether Outreach was on when a letter was sent: the last switch written before it, else the firm's flag as it reads now. */
async function outreachOnAt(read: ReadDb<PrismaClient>, companyId: string, at: Date): Promise<boolean> {
  const rows = await read.pluginSwitch.findMany({ where: { companyId, plugin: 'OUTREACH' }, orderBy: [{ at: 'asc' }, { id: 'asc' }], select: { on: true, at: true } })
  if (rows.length > 0) return rows.filter((r) => r.at <= at).pop()?.on ?? false
  return isOn((await read.company.findUnique({ where: { id: companyId }, select: { pluginsOn: true } }))?.pluginsOn, 'OUTREACH')
}

export async function chaseSendLetter(companyId: string, window: CheckWindow, ref: RecordRef, read: ReadDb<PrismaClient>): Promise<CheckerResult> {
  const evidence = `${ref.recordType} ${ref.recordId}`
  const rows = await read.mailSend.findMany({
    where: { companyId, recordType: ref.recordType, recordId: ref.recordId, agentTaskId: { not: null }, createdAt: { gte: window.from, lte: window.to } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, createdAt: true, agentKey: true, agentTaskId: true, template: true, toAddresses: true },
  })
  if (rows.length === 0) return { verdict: 'FAIL', reason: 'The run sent a letter but no row for it is on the mail ledger in its window.', evidence, unitsFound: 0 }
  const letter = await read.outreachLetter.findUnique({ where: { id: ref.recordId } })
  const contact = letter ? await read.companyContact.findUnique({ where: { id: letter.contactId }, select: { companyId: true, email: true, outreachOptOutAt: true } }) : null
  const problems: string[] = []
  let good = 0
  for (const m of rows) {
    const mine: string[] = []
    const task = await read.agentTask.findUnique({ where: { id: m.agentTaskId! }, include: { decision: true } })
    if (!letter || letter.companyId !== companyId) mine.push('the letter is not one of this firm’s')
    else if (!task || letter.agentTaskId !== task.id) mine.push('the letter belongs to no batch of the task it was sent under')
    if (!task) mine.push('it belongs to no task')
    else {
      if (task.agentKey !== m.agentKey) mine.push('its task is another agent’s')
      if (task.kind !== OUTREACH_BATCH_KIND) mine.push(`its task kind ${task.kind} is not an outreach batch`)
      if (!task.approvedAt || task.decision?.state !== 'APPROVED' || task.approvedAt > m.createdAt) mine.push('no person had said yes to its task when it was sent')
      const plan = task.plan as { messages?: unknown[]; retries?: number; recipients?: number } | null
      const most = (plan?.recipients ?? 0) * (plan?.messages?.length ?? 0) * (1 + (plan?.retries ?? FOLLOW_UPS))
      const total = await read.mailSend.count({ where: { companyId, agentTaskId: task.id } })
      if (total > most) mine.push(`${total} letters are on the ledger for a task whose plan allows ${most}`)
      const sw = await read.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: task.agentKey } }, select: { state: true } })
      if (sw?.state !== 'ON') mine.push(`the agent’s switch reads ${sw?.state ?? 'missing'}, and only On sends`)
    }
    if (m.template !== OUTREACH_BATCH_TEMPLATE) mine.push(`its template ${m.template} is not the batch letter`)
    if (!(await outreachOnAt(read, companyId, m.createdAt))) mine.push('Outreach is off for the firm, and a letter that sells waits')
    if (letter && (!contact || contact.companyId !== companyId)) mine.push('the contact is not one of this firm’s')
    else if (letter && contact) {
      if (contact.outreachOptOutAt && contact.outreachOptOutAt <= m.createdAt) mine.push('the contact had unsubscribed when it was sent')
      if (letter.interestedAt && letter.interestedAt <= m.createdAt) mine.push('the contact had said she was interested when it was sent')
      const to = m.toAddresses.map((a) => a.trim().toLowerCase())
      if (to.length !== 1 || to[0] !== letter.email.trim().toLowerCase() || contact.email?.trim().toLowerCase() !== letter.email.trim().toLowerCase()) {
        mine.push('it went to an address that is not the address it was drafted for')
      }
    }
    if (mine.length === 0) good++
    else problems.push(`mail ${m.id}: ${mine.join(', ')}`)
  }
  const found = `${rows.length} row${rows.length === 1 ? '' : 's'} on the mail ledger`
  if (problems.length === 0) return { verdict: 'PASS', reason: 'Every letter ties to a batch of this firm that a person said yes to, went to the address it was drafted for, to a contact who had not stopped it, with Outreach and the agent On.', evidence: found, unitsFound: good }
  return { verdict: 'FAIL', reason: `${problems.join('; ')}.`, evidence: found, unitsFound: good }
}
