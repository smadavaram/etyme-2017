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
import { CANDIDATE_SIDE } from '@/lib/outreach/candidate-rules'
import { postalLine } from '@/lib/agents/dormant-outreach-rules'
import { baseUrl } from '@/lib/signed-link'
import type { CheckerResult, CheckWindow, ReadDb, RecordRef } from '../checker'

/**
 * What a candidate's update letter is held to (record 117). Not the selling
 * letter's rules: she is not a company contact and has no "interested" link.
 * Hers are: her own standing yes to updates when it left, which her stop link
 * ends for every firm; the firm still keeps her; one address she gave; the
 * sender named with its postal address; a stop link that can be made; and one
 * letter only. Pure.
 */
export interface CandidateLetterFacts {
  sentAt: Date
  yesAt: Date | null
  revokedAt: Date | null
  /** The firm still keeps her: a granted listing or a seat. */
  kept: boolean
  personEmail: string | null
  letterEmail: string
  to: readonly string[]
  /** The firm's postal address as the letter prints it; null where it has none on record. */
  postal: string | null
  /** The stop link can be made on this deployment. */
  stopLink: boolean
  /** Letters of this one row that left. */
  timesSent: number
}

export function candidateLetterProblems(f: CandidateLetterFacts): string[] {
  const out: string[] = []
  if (!f.yesAt || f.yesAt > f.sentAt) out.push('she had not said yes to updates when it was sent')
  else if (f.revokedAt && f.revokedAt <= f.sentAt && f.revokedAt >= f.yesAt) out.push('she had taken her yes to updates back when it was sent')
  if (!f.kept) out.push('the firm does not keep her any more')
  const to = f.to.map((a) => a.trim().toLowerCase())
  const mine = f.letterEmail.trim().toLowerCase()
  if (to.length !== 1 || to[0] !== mine || f.personEmail?.trim().toLowerCase() !== mine) out.push('it went to an address that is not the one on her own record')
  if (!f.postal) out.push('the firm has no postal address on record, so the letter could not say who sends it and where')
  if (!f.stopLink) out.push('the link that ends updates could not be made, so the letter had no way to stop it')
  if (f.timesSent > 1) out.push('the same letter left more than once, and an update letter goes once')
  return out
}

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
  const letterTask = letter ? await read.agentTask.findUnique({ where: { id: letter.agentTaskId }, select: { payload: true } }) : null
  const candidate = (letterTask?.payload as { side?: string } | null)?.side === CANDIDATE_SIDE
  const person = letter && candidate ? await read.person.findUnique({ where: { id: letter.contactId }, select: { primaryEmail: true, updatesYesAt: true, updatesRevokedAt: true } }) : null
  const kept = letter && candidate ? (await read.consultantProfile.count({
    where: { personId: letter.contactId, OR: [{ listings: { some: { companyId, revokedAt: null, state: 'GRANTED' } } }, { person: { contexts: { some: { companyId, revokedAt: null } } } }] },
  })) > 0 : false
  const addresses = candidate ? await read.companyAddress.findMany({ where: { companyId } }) : []
  const postal = candidate ? postalLine(addresses.find((a) => a.kind === 'LEGAL') ?? addresses.find((a) => a.kind === 'BILLING') ?? null) : null
  const contact = letter && !candidate ? await read.companyContact.findUnique({ where: { id: letter.contactId }, select: { companyId: true, email: true, outreachOptOutAt: true } }) : null
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
    if (letter && candidate) {
      if (!person) mine.push('the candidate is not on the record')
      else {
        const timesSent = await read.mailSend.count({ where: { companyId, recordType: ref.recordType, recordId: ref.recordId, outcome: 'SENT' } })
        mine.push(...candidateLetterProblems({
          sentAt: m.createdAt, yesAt: person.updatesYesAt, revokedAt: person.updatesRevokedAt, kept, personEmail: person.primaryEmail,
          letterEmail: letter.email, to: m.toAddresses, postal, stopLink: baseUrl() !== null, timesSent,
        }))
      }
    } else if (letter && (!contact || contact.companyId !== companyId)) mine.push('the contact is not one of this firm’s')
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
  if (problems.length === 0 && candidate) return { verdict: 'PASS', reason: 'Every update letter ties to a batch of this firm that a person said yes to, went once to the address on her own record, while her own yes to updates stood, with the firm’s postal address and a link that ends updates, and with Outreach and the agent On.', evidence: found, unitsFound: good }
  if (problems.length === 0) return { verdict: 'PASS', reason: 'Every letter ties to a batch of this firm that a person said yes to, went to the address it was drafted for, to a contact who had not stopped it, with Outreach and the agent On.', evidence: found, unitsFound: good }
  return { verdict: 'FAIL', reason: `${problems.join('; ')}.`, evidence: found, unitsFound: good }
}
