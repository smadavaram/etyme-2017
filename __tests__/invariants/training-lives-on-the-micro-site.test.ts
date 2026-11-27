import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
const dashboard = walk(join(ROOT, 'src/app/dashboard')).filter((f) => /\.tsx?$/.test(f))
const rel = (f: string) => f.slice(ROOT.length + 1)
const DOOR = 'src/app/dashboard/training/page.tsx'

describe('training lives on the learning micro-site, the core dashboard keeps only a door', () => {
  it('no file under the dashboard calls the training or learning routes except the Training door', () => {
    const offenders = dashboard.filter((f) => /['"`]\/api\/(training|learn)/.test(readFileSync(f, 'utf8'))).map(rel)
    expect(offenders).toEqual([DOOR])
  })

  it('no file under the dashboard draws a training panel, a course form, a cohort or a certification screen', () => {
    const banned = /training-block|TrainingBlock|<Cohorts|<Courses \/>|Put somebody on a course|Add a course\b|Ask her onto the bench|training\/cohorts|\bcohort/i
    const offenders = dashboard.filter((f) => banned.test(readFileSync(f, 'utf8'))).map(rel)
    expect(offenders).toEqual([])
  })

  it('the old Training address only sends the reader to the micro-site and says why when it cannot', () => {
    const door = read(DOOR)
    expect(door).toContain('/manage')
    expect(door).toContain('RefusedState')
    expect(door.split('\n').length).toBeLessThan(40)
  })

  it('the courses, cohorts and skill gap screens live under the learning site’s manage tree', () => {
    for (const f of ['src/app/learn/[tenant]/manage/page.tsx', 'src/app/learn/[tenant]/manage/cohorts/page.tsx', 'src/app/learn/_components/manage/manage-page.tsx', 'src/app/learn/_components/manage/cohorts.tsx']) {
      expect(existsSync(join(ROOT, f)), f).toBe(true)
    }
    expect(existsSync(join(ROOT, 'src/app/dashboard/training/cohorts.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'src/app/dashboard/bench/training-block.tsx'))).toBe(false)
  })

  it('no course screen carries a price field or a price word (record 133)', () => {
    for (const f of walk(join(ROOT, 'src/app/learn/_components/manage'))) {
      expect(readFileSync(f, 'utf8'), rel(f)).not.toMatch(/price|\bamount\(/i)
    }
  })

  it('a seat on another firm’s learning site is told so and is not shown that firm’s training', () => {
    expect(read('src/app/learn/_components/manage/manage-page.tsx')).toContain('This is another firm’s learning site')
  })

  it('the manage screens still ask the same routes the old page asked, so the same permissions apply', () => {
    const page = read('src/app/learn/_components/manage/manage-page.tsx')
    for (const r of ['/api/training', '/api/training/enrollments', '/api/requirements?status=OPEN', '/api/bench?scope=company']) expect(page).toContain(r)
    expect(read('src/app/learn/_components/manage/cohorts.tsx')).toContain('/api/training/cohorts')
  })
})
