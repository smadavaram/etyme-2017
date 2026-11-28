import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { jobsWhere, submissionsWhere, jobInReach, outsideReachSays, teamsSay } from '@/app/api/requisitions/grant-reach'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const dayton = { has: true, scope: 'UNIT' as const, unitIds: ['dayton', 'dayton-line-2'] }
const firm = { has: true, scope: 'COMPANY' as const, unitIds: [] }
const own = { has: true, scope: 'PERSON' as const, unitIds: [] }
const none = { has: false, scope: 'NONE' as const, unitIds: [] }

describe('jobs and submissions are narrowed at the query by the Owner’s grant', () => {
  it('a recruiter granted submissions on the Dayton team reads that team’s jobs and submissions only', () => {
    expect(jobsWhere(dayton, 'rory')).toEqual({ orgUnitId: { in: ['dayton', 'dayton-line-2'] } })
    expect(submissionsWhere(dayton, 'rory')).toEqual({ requirement: { orgUnitId: { in: ['dayton', 'dayton-line-2'] } } })
    expect(jobInReach(dayton, { orgUnitId: 'dayton-line-2' }, 'rory')).toBe(true)
  })

  it('a team grant never opens another team’s, nor a job charged to no team', () => {
    expect(jobInReach(dayton, { orgUnitId: 'belfast' }, 'rory')).toBe(false)
    expect(jobInReach(dayton, { orgUnitId: null }, 'rory')).toBe(false)
  })

  it('the role’s own permission still reads the firm’s', () => {
    expect(jobsWhere(firm, 'gwen')).toEqual({})
    expect(submissionsWhere(firm, 'gwen')).toEqual({})
    expect(jobInReach(firm, { orgUnitId: 'belfast' }, 'gwen')).toBe(true)
  })

  it('an own-work grant reads the jobs the reader raised or owns and the submissions they put forward', () => {
    expect(jobsWhere(own, 'rory')).toEqual({ OR: [{ raisedById: 'rory' }, { ownerId: 'rory' }] })
    expect(submissionsWhere(own, 'rory')).toEqual({ submittedById: 'rory' })
    expect(jobInReach(own, { orgUnitId: 'belfast', ownerId: 'rory' }, 'rory')).toBe(true)
    expect(jobInReach(own, { orgUnitId: 'belfast', ownerId: 'gwen', raisedById: 'gwen' }, 'rory')).toBe(false)
  })

  it('no grant reads nothing', () => {
    expect(jobsWhere(none, 'rory')).toBeNull()
    expect(submissionsWhere(none, 'rory')).toBeNull()
  })

  it('a refusal names the reach', () => {
    expect(outsideReachSays('jobs', dayton, ['Dayton'], 'Cavanaugh Glassworks')).toBe('You read jobs for the Dayton team, and this one is outside it. Ask the Owner of Cavanaugh Glassworks for the firm’s.')
    expect(outsideReachSays('submissions', own, [], 'Cavanaugh Glassworks')).toBe('You read your own submissions only, and this one is not yours. Ask the Owner of Cavanaugh Glassworks for the firm’s.')
    expect(teamsSay(['Dayton', 'Belfast'])).toBe('the Dayton and Belfast teams')
  })

  it('the jobs list, the submissions list, putting forward, raising and changing a job read the grant, never hasPermission alone', () => {
    expect(read('src/app/api/requirements/route.ts')).toContain("await reachFor(caller, 'requirements.read')")
    const subs = read('src/app/api/submissions/route.ts')
    expect(subs).toContain("await reachFor(caller, 'submissions.read')")
    expect(subs).toContain("await reachFor(caller, 'submissions.create')")
    expect(read('src/app/api/requisitions/route.ts')).toContain("await reachFor(caller, 'requirements.write')")
    expect(read('src/app/api/requisitions/[id]/route.ts')).toContain("await reachFor(caller, 'requirements.write')")
  })
})
