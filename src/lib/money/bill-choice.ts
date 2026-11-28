/**
 * How a choice on the Bills page's "Generate bill" picker reads: the
 * person, the week or the weeks waiting, and the customer, the way the
 * trade says which bill it means. "Helena Marsh · Oct 4 – Oct 10, 2026 ·
 * Northbend Athletic", never a job title or an engagement label alone.
 *
 * Found by the second screen walk, 2026-11-03: the picker named jobs, and
 * two placements on one job read as one choice. The choice is still one
 * engagement, because a bill covers an engagement over a period; this is
 * only what it is called. No database.
 */

import { formatRange } from '@/lib/format-date'

export interface BillChoiceFacts {
  /** The people on this firm's own billable lines under the engagement. */
  people: readonly string[]
  /** The signed weeks not yet on a live bill, on those lines. */
  weeks: readonly { start: Date | string; end: Date | string }[]
  /** Who the bill goes to; null where nothing on the paper says. */
  clientName: string | null
  /** The engagement's own name, said only where no person is on it. */
  title: string
}

function whoSays(people: readonly string[]): string | null {
  const names = [...new Set(people.map((p) => p.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  if (names.length === 0) return null
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]} and ${names.length - 1} others`
}

const iso = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

function whenSays(weeks: BillChoiceFacts['weeks']): string {
  if (weeks.length === 0) return 'no signed week waiting'
  const starts = weeks.map((w) => iso(w.start)).sort()
  const ends = weeks.map((w) => iso(w.end)).sort()
  const span = formatRange(starts[0], ends[ends.length - 1])
  return weeks.length === 1 ? span : `${weeks.length} signed weeks, ${span}`
}

export function billChoiceLabel(f: BillChoiceFacts): string {
  const who = whoSays(f.people) ?? f.title
  return [who, whenSays(f.weeks), f.clientName].filter(Boolean).join(' · ')
}
