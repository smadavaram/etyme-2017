/**
 * The answer key for `weekly.summary` (record 123, plan C3 and C9).
 *
 * The run says which firm and which Monday it wrote for. This re-reads that
 * week from the readers the agent itself is bound to (the census, the
 * employer's accepted hours, the people on site) and compares each figure
 * with the line on the ledger. It never reads what the agent returned.
 * The line carries seven figures: customers and suppliers active and
 * dormant, consultants billing, hours accepted and hours waiting.
 */
import type { PrismaClient } from '@prisma/client'
import { formatDayLong } from '@/lib/format-date'
import { readWeeklySummary, WEEKLY_SUMMARY_ACTION, WEEKLY_SUMMARY_AGENT, type WeeklySummary } from '@/lib/agents/weekly-summary'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'

const LINE = /^This week: (\d+) customers? active, (\d+) dormant; (\d+) suppliers? active, (\d+) dormant; (?:(\d+) consultants? billing|consultants billing not applicable to this firm); ([\d.]+) hours? accepted for the week of ([A-Za-z]+ \d+); ([\d.]+) hours? waiting for acceptance\.$/

type Figures = [label: string, value: string][]

/** The figures a ledger line states, or null where it is not a summary line. Pure. */
export function figuresOfLine(line: string): Figures | null {
  const m = LINE.exec(line)
  if (!m) return null
  return [
    ['customers active', m[1]], ['customers dormant', m[2]], ['suppliers active', m[3]], ['suppliers dormant', m[4]],
    ['consultants billing', m[5] ?? 'not applicable'], ['hours accepted', m[6]], ['week of', m[7]], ['hours waiting', m[8]],
  ]
}

/** The same figures, read from the record. Pure. */
export function figuresOfRecord(s: WeeklySummary): Figures {
  return [
    ['customers active', String(s.customers.active)], ['customers dormant', String(s.customers.dormant)],
    ['suppliers active', String(s.suppliers.active)], ['suppliers dormant', String(s.suppliers.dormant)],
    ['consultants billing', s.consultantsBilling === null ? 'not applicable' : String(s.consultantsBilling)],
    ['hours accepted', String(s.hoursAccepted)], ['week of', formatDayLong(s.weekOf, { year: false })], ['hours waiting', String(s.hoursWaiting)],
  ]
}

/** Each figure that differs, one sentence each. Empty means the line and the record agree. Pure. */
export function figureDifferences(line: Figures, record: Figures): string[] {
  return line.flatMap(([label, said], i) => said === record[i][1] ? [] : [`${label}: the line says ${said}, the record says ${record[i][1]}`])
}

export const weeklySummaryChecker: SkillChecker<PrismaClient> = async (companyId, _skillKey, window, recordRefs, read): Promise<CheckerResult> => {
  const ref = recordRefs[0]
  const monday = ref?.recordId.split(':')[1]
  if (!monday || !/^\d{4}-\d{2}-\d{2}$/.test(monday)) return unknownBecause('The run does not say which Monday it wrote for, so there is no week to re-read.')
  const rows = await read.recordAction.findMany({
    where: { companyId, agentKey: WEEKLY_SUMMARY_AGENT, action: WEEKLY_SUMMARY_ACTION, createdAt: { gte: window.from, lte: window.to } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { summary: true },
  })
  if (rows.length === 0) return { verdict: 'FAIL', reason: 'The run ran for a Monday but no weekly summary line is on the ledger for it.', evidence: `Monday ${monday}`, unitsFound: 0 }
  const line = figuresOfLine(rows[rows.length - 1].summary)
  if (!line) return { verdict: 'FAIL', reason: 'The line on the ledger is not a weekly summary line, so its figures cannot be compared.', evidence: rows[rows.length - 1].summary, unitsFound: 0 }
  const fresh = await readWeeklySummary(companyId, new Date(`${monday}T12:00:00Z`))
  const record = figuresOfRecord(fresh)
  const diff = figureDifferences(line, record)
  if (diff.length === 0) return { verdict: 'PASS', reason: 'All eight figures on the line equal a fresh reading of the record.', evidence: record.map(([l, v]) => `${l} ${v}`).join('; '), unitsFound: 1 }
  return { verdict: 'FAIL', reason: `The line is wrong on ${diff.length} ${diff.length === 1 ? 'figure' : 'figures'}: ${diff.join('; ')}.`, evidence: record.map(([l, v]) => `${l} ${v}`).join('; '), unitsFound: 0 }
}
