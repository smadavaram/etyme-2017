/**
 * What a worker reads in the Placement picker of File your hours and File
 * an expense (the third screen walk, 2026-11-03, S2).
 *
 * Nikhil had two lines at Pinnacle Resourcing and was offered two
 * identical options, "Pinnacle Resourcing · through Pinnacle Resourcing":
 * the site fell back to the firm that pays him where the line names no
 * end client, and nothing told the two lines apart. So each option says
 * where the work is (the end client, else the client this line sells to),
 * through whom, and, only where two options would still read alike, the
 * job and then the dates.
 *
 * Pure: no database, safe in the browser.
 */

import { plainDate, daySpan } from '@/lib/plain-date'

export interface FilingLine {
  contractId: string
  /** Where the work is done: the end client, null where the line names none. */
  site: string | null
  /** Who buys this rung. Read where the line names no end client. */
  client: string | null
  /** Who pays them. */
  payer: string
  /** The job the line was awarded on, where there is one. */
  job: string | null
  /** YYYY-MM-DD. */
  startDate: string
  endDate: string | null
}

/** "Northbend Athletic · through Computer Systems", or the payer alone where it is also the site. */
function base(l: FilingLine): string {
  const where = l.site ?? l.client
  if (!where || where === l.payer) return l.payer
  return `${where} · through ${l.payer}`
}

function dates(l: FilingLine): string {
  return l.endDate ? daySpan(l.startDate.slice(0, 10), l.endDate.slice(0, 10)) : `from ${plainDate(l.startDate.slice(0, 10))}`
}

/** Groups of indexes whose labels read alike. */
function alike(labels: readonly string[]): number[][] {
  const by = new Map<string, number[]>()
  labels.forEach((s, i) => by.set(s, [...(by.get(s) ?? []), i]))
  return [...by.values()].filter((g) => g.length > 1)
}

/**
 * One label per line, in the order given, no two alike where the lines
 * differ in anything a worker can see. The job is added only where it
 * tells two lines apart; the dates only where the job did not.
 */
export function filingLabels(lines: readonly FilingLine[]): string[] {
  const labels = lines.map(base)
  for (const group of alike(labels)) {
    const jobs = new Set(group.map((i) => lines[i].job ?? ''))
    if (jobs.size > 1) for (const i of group) if (lines[i].job) labels[i] = `${labels[i]} · ${lines[i].job}`
  }
  for (const group of alike(labels)) {
    for (const i of group) labels[i] = `${labels[i]} · ${dates(lines[i])}`
  }
  return labels
}
