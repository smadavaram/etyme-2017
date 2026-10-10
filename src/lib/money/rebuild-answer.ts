/**
 * What a rebuild of the books says back, in a sentence.
 *
 * Pure, so the sentence is tested without a database. Two things it must
 * never do, both found on the live demo on 2026-10-06 rebuilding Byrne
 * Critical Care LLC's books: call ten signatures "ten signed weeks" when
 * there were four weeks, and report "3 postings removed, 0 written" with
 * no reason beside it — a figure that reads like lost revenue when it was
 * her own company's pay to herself, which the rule does not post.
 */

export interface RebuildAnswer {
  dryRun: boolean
  weeks: number
  checked: number
  rebuilt: number
  written: number
  removed: number
  leftAlone: { says: string }[]
  postsNothing: { says: string }[]
  /** Postings removed because the signature under them is no longer live. */
  withdrawnRemoved: number
}

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`

export function rebuildSays(d: RebuildAnswer): string {
  const read = `${n(d.checked, 'signature')} on ${n(d.weeks, 'signed week')} read`
  const head =
    d.rebuilt === 0
      ? `${read}; every posting under them already matched.`
      : d.dryRun
        ? `${read}. A rebuild would replace the postings of ${d.rebuilt}: ${n(d.removed, 'posting')} removed, ${d.written} written. Nothing was changed.`
        : `${read}. The postings of ${d.rebuilt} were rebuilt: ${n(d.removed, 'posting')} removed, ${d.written} written.`

  const parts = [head]
  if (d.postsNothing.length) {
    // One sentence per distinct reason, counted, so three weeks of one
    // cause read as one line.
    const reasons = new Map<string, number>()
    for (const p of d.postsNothing) reasons.set(p.says, (reasons.get(p.says) ?? 0) + 1)
    const lead = d.dryRun ? 'would post nothing in their place' : 'post nothing in their place'
    for (const [says, k] of reasons) parts.push(`${n(k, 'signature')} ${lead}: ${says}`)
  }
  if (d.withdrawnRemoved > 0) {
    const what = `${n(d.withdrawnRemoved, 'posting')} under withdrawn signatures`
    parts.push(d.dryRun ? `${what} would be removed.` : `${what} removed.`)
  }
  if (d.leftAlone.length) {
    parts.push(`${d.leftAlone.length} left as ${d.leftAlone.length === 1 ? 'it was' : 'they were'}, each with the reason.`)
  }
  return parts.join(' ')
}
