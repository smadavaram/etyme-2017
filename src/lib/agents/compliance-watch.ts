/**
 * The compliance watch agent (record 112, chain 6, "Keep it legal").
 *
 * Three jobs, each opening cards for a person and deciding nothing:
 *  1. Tenure against the client's limit, per person per client, from the
 *     one ledger every door reads (`standingAgainstLimit`, `bookedLimitDay`;
 *     a person's days at the client across every supplier, each day once).
 *     A card to the program manager, else the Owner, when a limit is 90, 60
 *     or 30 days away (the firm's own warning days; those are proposals) and
 *     when somebody is past it and still on site. The extension decision is
 *     a person's. Only a client that set a limit is watched, and only its
 *     own program's book is read.
 *  2. Notice postings: a person records a posted notice; the agent counts
 *     the required posting period (10 working days, proposed) and opens a
 *     card to HR when it ends, so a person takes the notice down and records
 *     the removal. The agent publishes and removes nothing.
 *  3. The public access file: for a petition with a filing day, the agent
 *     opens the tracker (due within 1 working day, proposed) and a card to
 *     HR; a person approves it. It approves and publishes nothing.
 * Rules regulatory has not confirmed with a source warn and never block;
 * none of these blocks. Same on Drafts only and On: nothing is sent.
 */

import { prisma } from '@/lib/db'
import { dayAround } from '@/lib/decision-queue'
import { endClientFilter } from '@/lib/resolve-end-client'
import { ruleSetFor } from '@/lib/twin/rule-set'
import { daysOffFor } from '@/lib/days-off'
import { loadCompanyHolidays } from '@/lib/holidays'
import { bookedLimitDay, linesCounted, standingAgainstLimit } from '@/lib/tenure-days'
import { registerAgent, type AgentContext } from './runner'
import { openOnce, ownerOf } from './open-once'
import {
  accessFileReadyBy, accessFileWords, crossedWarning, daysFromTo, dayStart, noticeEndsOn, noticePeriodOver, noticeWords, tenureWords,
} from './checklist-rules'

export const COMPLIANCE_WATCH_AGENT = 'compliance-watch'
export const COMPLIANCE_WATCH_RULES = 'compliance-watch-1'
export const TENURE_RECORD = 'TenureWatch'
export const NOTICE_RECORD = 'NoticePosting'
export const ACCESS_FILE_RECORD = 'PublicAccessFile'

async function tenureStep(ctx: AgentContext): Promise<void> {
  const { companyId, now } = ctx
  const rules = await prisma.governanceRule.findMany({
    where: { policy: { companyId, isActive: true }, ruleType: { in: ['TENURE_CAP', 'BREAK_IN_SERVICE'] }, isActive: true },
    orderBy: { id: 'asc' },
  })
  const cap = rules.find((r) => r.ruleType === 'TENURE_CAP')
  const capMonths = cap ? Number((cap.parameters as { maxMonths?: unknown }).maxMonths) : NaN
  // No limit set by this client, nothing to watch: a supplier never reads another firm's days.
  if (!Number.isFinite(capMonths) || capMonths <= 0) return
  const breakRule = rules.find((r) => r.ruleType === 'BREAK_IN_SERVICE')
  const breakDays = breakRule ? Number((breakRule.parameters as { breakDays?: unknown }).breakDays) : null
  const warnAt = (await ruleSetFor(companyId)).tenureWarnAtDays
  const widest = Math.max(0, ...warnAt) || null
  const owner = await ownerOf(ctx, ['Program Manager'])

  const lines = await prisma.sellContract.findMany({
    where: { ...endClientFilter(companyId), state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] } },
    select: { personId: true, startDate: true, endDate: true, state: true, person: { select: { name: true } } },
    orderBy: { id: 'asc' },
  })
  const client = (await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }))?.name ?? 'the client'
  const byPerson = new Map<string, typeof lines>()
  for (const l of lines) byPerson.set(l.personId, [...(byPerson.get(l.personId) ?? []), l])

  for (const [personId, own] of byPerson) {
    if (!own.some((l) => l.state !== 'ENDED')) continue
    const standing = standingAgainstLimit(own.map((l) => ({ startDate: l.startDate, endDate: l.endDate, live: l.state !== 'ENDED' })), { capMonths, breakDays, warnWithinDays: widest }, now)
    const counted = linesCounted(own, standing).map((l) => ({
      startDate: l.startDate,
      endDate: l.state === 'ENDED' ? new Date(Math.min((l.endDate ?? now).getTime(), now.getTime())) : l.endDate,
    }))
    const limitDay = bookedLimitDay(counted, { capMonths, breakDays }, now)
    if (!limitDay) continue
    const daysLeft = daysFromTo(now, limitDay)
    const step = daysLeft < 0 ? 0 : crossedWarning(daysLeft, warnAt)
    if (step === null) continue
    const words = tenureWords({ person: own[0].person.name, client, capMonths, limitDay, daysLeft })
    // One card per person, per limit day, per warning crossed.
    if (!(await ctx.mayAct())) return
    const r = await openOnce(ctx, owner, { recordType: TENURE_RECORD, recordId: `${personId}:${limitDay.toISOString().slice(0, 10)}:${step}` }, words, [{ recordType: 'Person', recordId: personId }])
    if (r === 'OPENED') await ctx.act({ recordType: 'Person', recordId: personId, action: 'TENURE_WARNING_OPENED', summary: `${words.question} A decision is open. Nothing was changed.` })
  }
}

async function noticeStep(ctx: AgentContext, daysOff: number[], holidays: Set<string>): Promise<void> {
  const { companyId, now } = ctx
  const open = await prisma.noticePosting.findMany({ where: { companyId, takenDownOn: null }, orderBy: { postedOn: 'asc' }, take: 500 })
  if (open.length === 0) return
  const owner = await ownerOf(ctx, ['HR'])
  const sites = await prisma.companyLocation.findMany({ where: { id: { in: [...new Set(open.map((n) => n.locationId))] } }, select: { id: true, name: true } })
  for (const n of open) {
    const endsOn = noticeEndsOn(n.postedOn, daysOff, holidays)
    if (!noticePeriodOver(endsOn, dayAround(now).from)) continue
    const site = sites.find((s) => s.id === n.locationId)?.name ?? 'the site'
    const words = noticeWords({ kind: n.kind, site, postedOn: n.postedOn, endsOn })
    if (!(await ctx.mayAct())) return
    const r = await openOnce(ctx, owner, { recordType: NOTICE_RECORD, recordId: n.id }, words, [])
    if (r === 'OPENED') await ctx.act({ recordType: NOTICE_RECORD, recordId: n.id, action: 'NOTICE_PERIOD_ENDED', summary: `${words.question} A decision is open. Nothing was taken down.` })
  }
}

async function accessFileStep(ctx: AgentContext, daysOff: number[], holidays: Set<string>): Promise<void> {
  const { companyId, now } = ctx
  const today = dayAround(now).from
  const filed = await prisma.petition.findMany({ where: { companyId, filedOn: { not: null } }, include: { accessFiles: true }, orderBy: { id: 'asc' }, take: 500 })
  if (filed.length === 0) return
  const owner = await ownerOf(ctx, ['HR'])
  const people = await prisma.person.findMany({ where: { id: { in: [...new Set(filed.map((p) => p.personId))] } }, select: { id: true, name: true } })
  for (const p of filed) {
    const person = people.find((x) => x.id === p.personId)?.name ?? 'the person'
    let file = p.accessFiles[0]
    if (!file) {
      if (!(await ctx.mayAct())) return
      file = await prisma.publicAccessFile.create({ data: { companyId, petitionId: p.id, readyBy: accessFileReadyBy(p.filedOn!, daysOff, holidays) } })
      await ctx.act({ recordType: ACCESS_FILE_RECORD, recordId: file.id, action: 'ACCESS_FILE_TRACKED', summary: `Started tracking the public access file for ${person}’s petition. It is due ${file.readyBy.toISOString().slice(0, 10)}. A person approves it.` })
    }
    if (file.approvedById) continue
    const words = accessFileWords({ person, readyBy: file.readyBy, today })
    // Once when it is due, and once more if it passes its day unapproved: two links, so the second is its own card.
    const late = dayStart(now).getTime() > file.readyBy.getTime()
    if (!(await ctx.mayAct())) return
    const r = await openOnce(ctx, owner, { recordType: ACCESS_FILE_RECORD, recordId: late ? `${file.id}:overdue` : file.id }, words, late ? [{ recordType: ACCESS_FILE_RECORD, recordId: file.id }] : [{ recordType: 'Petition', recordId: p.id }])
    if (r === 'OPENED') await ctx.act({ recordType: ACCESS_FILE_RECORD, recordId: file.id, action: 'ACCESS_FILE_CARD_OPENED', summary: `${words.question} A decision is open. Nothing was approved or published.` })
  }
}

export async function complianceWatchStep(ctx: AgentContext): Promise<void> {
  const year = dayStart(ctx.now).getUTCFullYear()
  const daysOff = await daysOffFor(ctx.companyId)
  const holidays = await loadCompanyHolidays(ctx.companyId, year - 1, year + 1)
  await tenureStep(ctx)
  await noticeStep(ctx, daysOff, holidays)
  await accessFileStep(ctx, daysOff, holidays)
}

export function registerComplianceWatch(): void {
  registerAgent(COMPLIANCE_WATCH_AGENT, { ruleVersion: COMPLIANCE_WATCH_RULES, step: complianceWatchStep })
}
