/**
 * The answer key for `census.classify` (record 123, plan C3 and C9).
 *
 * The run says which firm and which day the census was taken. This reads
 * the register's own facts again (`censusFacts`), classifies them with the
 * census rules, and compares the result with the one CENSUS_WEEKLY row on
 * the ledger for that week: the counts of customers and suppliers, active
 * and dormant, and the line as a whole. It never reads what the agent
 * returned.
 */
import type { PrismaClient } from '@prisma/client'
import { censusFacts } from '@/lib/agents/census-keeper'
import { censusOn, changesBetween, weeklyLine, CENSUS_AGENT } from '@/lib/agents/census-rules'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'

const COUNTS = /(\d+) customers? \((\d+) active, (\d+) dormant\), (\d+) suppliers? \((\d+) active, (\d+) dormant\)/
const LABELS = ['customers', 'customers active', 'customers dormant', 'suppliers', 'suppliers active', 'suppliers dormant']

/** Each count on the line that differs from the record's, one sentence each. Pure. */
export function countDifferences(line: string, expected: string): string[] | null {
  const a = COUNTS.exec(line); const b = COUNTS.exec(expected)
  if (!a || !b) return null
  return LABELS.flatMap((l, i) => a[i + 1] === b[i + 1] ? [] : [`${l}: the line says ${a[i + 1]}, the record says ${b[i + 1]}`])
}

const DAY = 86_400_000

export const censusClassifyChecker: SkillChecker<PrismaClient> = async (companyId, _key, window, refs, read): Promise<CheckerResult> => {
  const day = refs[0]?.recordId.split(':')[1]
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return unknownBecause('The run does not say which day the census was taken, so there is nothing to re-read.')
  const asOf = new Date(`${day}T12:00:00Z`)
  const from = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate() - asOf.getUTCDay()))
  // One census line in the run's window, and no other line on the ledger for the same week.
  const inRun = await read.recordAction.findMany({
    where: { companyId, agentKey: CENSUS_AGENT, action: 'CENSUS_WEEKLY', createdAt: { gte: window.from, lte: window.to } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { summary: true },
  })
  const sameWeek = await read.recordAction.count({ where: { companyId, agentKey: CENSUS_AGENT, action: 'CENSUS_WEEKLY', summary: { startsWith: `Census, week of ${from.toISOString().slice(0, 10)}:` } } })
  if (inRun.length !== 1 || sameWeek !== 1) {
    const says = inRun.length === 0 ? 'No census line is on the ledger for this run.' : `${Math.max(inRun.length, sameWeek)} census lines are on the ledger for one week, and there should be one.`
    return { verdict: 'FAIL', reason: says, evidence: `Week of ${from.toISOString().slice(0, 10)}`, unitsFound: 0 }
  }
  const week = inRun
  const facts = await censusFacts(companyId)
  const rows = censusOn(facts, asOf)
  const changes = changesBetween(censusOn(facts, new Date(asOf.getTime() - 7 * DAY)), rows)
  const expected = weeklyLine(rows, changes, from)
  const line = week[0].summary
  const active = rows.filter((r) => r.standing === 'ACTIVE').length
  const evidence = `${rows.length} on the register, ${active} active, ${rows.length - active} dormant`
  if (line === expected) return { verdict: 'PASS', reason: 'The census line equals a fresh classification of the register.', evidence, unitsFound: rows.length }
  const diff = countDifferences(line, expected)
  const reason = diff === null ? 'The census line is not in the form the census writes, so its counts cannot be compared.'
    : diff.length ? `The census line is wrong on ${diff.join('; ')}.` : 'The counts agree but the dormant names or the changes on the line differ from a fresh reading.'
  return { verdict: 'FAIL', reason, evidence, unitsFound: 0 }
}
