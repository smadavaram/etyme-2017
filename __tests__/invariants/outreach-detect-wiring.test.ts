import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { packCard } from '@/lib/outreach/pack-rules'
import { buildCandidateLetter } from '@/lib/outreach/candidate-rules'
import { SKILLS } from '@/lib/skills/registry'
import { CHECKERS } from '@/lib/skills/checkers'
import { PUSH_SKILL } from '@/lib/outreach/push'

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')

describe('what an approved pack says it releases, and the nightly watch that fills it', () => {
  const card = packCard({ name: 'Spring data pack', segmentWords: 'Data engineers in Texas.', contentKinds: ['COURSE', 'OUTCOME_PROOF'], role: 'CANDIDATE', cap: 40 })

  it('the pack card does not promise a look at each letter before it goes', () => {
    expect(card.detail).not.toMatch(/you see each one/i)
    expect(card.detail).toMatch(/without a further look from you/i)
  })

  it('the pack card names the segment, the kinds of content, the most letters and that nothing past that sends', () => {
    expect(card.detail).toContain('Data engineers in Texas.')
    expect(card.detail).toMatch(/a course, outcome proof/i)
    expect(card.detail).toContain('40 letters')
    expect(card.detail).toMatch(/More is a new pack and asks you again/)
  })

  it('the pack card says every letter still checks consent and the stop list, and names the follow-up cap for a company pack', () => {
    expect(card.detail).toMatch(/checks consent and the stop list/i)
    const company = packCard({ name: 'Teams', segmentWords: 'Hiring managers.', contentKinds: ['POD_OFFER'], role: 'CLIENT', cap: 10 })
    expect(company.detail).toMatch(/sent again up to 2 times/)
  })

  it('a candidate letter says it carries one tracked page link counted only for the signed-in recipient', () => {
    expect(buildCandidateLetter.toString()).toBeTruthy()
    const src = read('src/lib/outreach/candidate-rules.ts')
    expect(src).toMatch(/counted only when the signed-in recipient opens it/)
    expect(src).not.toMatch(/no tracking/)
  })

  it('the push drafting skill is registered on the low model tier with a checker that reads it back', () => {
    const s = SKILLS.find((k) => k.key === PUSH_SKILL)
    expect(s?.tier).toBe('LOW')
    expect(s?.maySend).toBe(false)
    expect(CHECKERS[PUSH_SKILL]).toBeTypeOf('function')
  })

  it('the daily job runs the detection watch before the agents, and the watch reads only firms with Outreach on', () => {
    const daily = read('src/app/api/cron/daily/route.ts')
    expect(daily.indexOf("path: 'outreach-detect'")).toBeGreaterThan(0)
    expect(daily.indexOf("path: 'outreach-detect'")).toBeLessThan(daily.indexOf("path: 'agents'"))
    const route = read('src/app/api/cron/outreach-detect/route.ts')
    expect(route).toContain("pluginsOn: { has: 'OUTREACH' }")
    expect(route).toContain('cronAuthorized(request)')
  })
})
