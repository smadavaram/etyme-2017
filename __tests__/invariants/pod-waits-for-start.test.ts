import { describe, it, expect } from 'vitest'
import { waitsForAStart, waitingForStartSays, acceptedAnswer } from '@/lib/money/pod-waits-for-start'

const draft = (personName: string) => ({ state: 'DRAFT', personName })

describe('an accepted deliverable waits for a team member to start', () => {
  it('a project whose members are all still in draft is waiting for a start', () => {
    expect(waitsForAStart([draft('Ada Quillfeather'), draft('Bram Oakhollow')])).toBe(true)
  })
  it('a project with one member in progress is not waiting', () => {
    expect(waitsForAStart([draft('Ada Quillfeather'), { state: 'IN_PROGRESS', personName: 'Bram Oakhollow' }])).toBe(false)
  })
  it('a project with no team lines is not a pod waiting for a start', () => {
    expect(waitsForAStart([])).toBe(false)
  })
  it('the supplier reads the names of the people who have not started', () => {
    expect(waitingForStartSays([draft('Ada Quillfeather'), draft('Bram Oakhollow')], 'SUPPLIER')).toContain('Ada Quillfeather, Bram Oakhollow have not started')
  })
  it('anyone else reads only how many have not started, never a name', () => {
    const says = waitingForStartSays([draft('Ada Quillfeather'), draft('Bram Oakhollow')], 'OTHER')
    expect(says).toContain('2 team members not started')
    expect(says).not.toContain('Ada')
  })
  it('the client’s accepted answer promises no billing', () => {
    const says = acceptedAnswer('Stage 1', [draft('Ada Quillfeather')], 'OTHER')
    expect(says).toBe('Stage 1 accepted.')
    expect(says).not.toContain('Billable')
  })
  it('the supplier’s accepted answer names the waiting step while nobody has started', () => {
    expect(acceptedAnswer('Stage 1', [draft('Ada Quillfeather')], 'SUPPLIER')).toContain('Waiting for a team member')
  })
  it('the supplier’s accepted answer is just accepted once a member has started', () => {
    expect(acceptedAnswer('Stage 1', [{ state: 'IN_PROGRESS', personName: 'Ada Quillfeather' }], 'SUPPLIER')).toBe('Stage 1 accepted.')
  })
})
