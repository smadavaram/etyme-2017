import { describe, it, expect } from 'vitest'
import { rebuildSays, type RebuildAnswer } from '@/lib/money/rebuild-answer'

const base: RebuildAnswer = {
  dryRun: false, weeks: 4, checked: 10, rebuilt: 0, written: 0, removed: 0, leftAlone: [], postsNothing: [], withdrawnRemoved: 0,
}
const NO_PAY = 'No pay line names this person at a rate, so the week has no pay cost on record — and so no margin, not a perfect one.'

describe('what a rebuild of the books says back', () => {
  it('ten signatures on four weeks are said as signatures on weeks, never as ten signed weeks', () => {
    const says = rebuildSays(base)
    expect(says).toContain('10 signatures on 4 signed weeks read')
    expect(says).not.toContain('10 signed weeks')
  })

  it('a rebuild that changes nothing says every posting already matched', () => {
    expect(rebuildSays(base)).toMatch(/every posting under them already matched\.$/)
  })

  it('a removal with nothing written in its place says why, once per reason, counted', () => {
    const says = rebuildSays({
      ...base, rebuilt: 3, removed: 3,
      postsNothing: [{ says: NO_PAY }, { says: NO_PAY }, { says: NO_PAY }],
    })
    expect(says).toContain('The postings of 3 were rebuilt: 3 postings removed, 0 written.')
    expect(says).toContain(`3 signatures post nothing in their place: ${NO_PAY}`)
    expect(says.split(NO_PAY)).toHaveLength(2)
  })

  it('a dry run says “would” and that nothing was changed', () => {
    const says = rebuildSays({ ...base, dryRun: true, rebuilt: 3, removed: 3, postsNothing: [{ says: NO_PAY }] })
    expect(says).toContain('A rebuild would replace the postings of 3')
    expect(says).toContain('Nothing was changed.')
    expect(says).toContain('would post nothing in their place')
    expect(says).not.toMatch(/were rebuilt/)
  })

  it('signatures left alone are counted in the answer, each with its reason elsewhere', () => {
    const says = rebuildSays({ ...base, leftAlone: [{ says: 'settled' }, { says: 'exported' }] })
    expect(says).toContain('2 left as they were, each with the reason.')
  })
  it('postings under withdrawn signatures are counted on their own line, and a dry run says they would be removed', () => {
    expect(rebuildSays({ ...base, withdrawnRemoved: 3 })).toContain('3 postings under withdrawn signatures removed.')
    expect(rebuildSays({ ...base, dryRun: true, withdrawnRemoved: 1 })).toContain('1 posting under withdrawn signatures would be removed.')
    expect(rebuildSays(base)).not.toContain('withdrawn')
  })
})
