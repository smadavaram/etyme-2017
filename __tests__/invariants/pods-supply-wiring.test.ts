import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { soldTeamSays, projectIsOpen, marginUnknownSays } from '@/lib/pods'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a sold team stands still', () => {
  it('the refusal names the team and the client and points at the project', () => {
    expect(soldTeamSays('Data platform team', 'Nimbus Foods')).toBe('Data platform team is sold to Nimbus Foods; change the project, not the team.')
  })
  it('a project with no accepted deliverable is open', () => {
    expect(projectIsOpen({ fulfilledAt: null, deliverableStates: ['accepted', 'submitted'] })).toBe(true)
  })
  it('a project with no deliverables is open, because nothing proves it fulfilled', () => {
    expect(projectIsOpen({ fulfilledAt: null, deliverableStates: [] })).toBe(true)
  })
  it('a project is closed once every deliverable is accepted', () => {
    expect(projectIsOpen({ fulfilledAt: null, deliverableStates: ['accepted', 'accepted'] })).toBe(false)
  })
  it('a project marked fulfilled is closed whatever its deliverables say', () => {
    expect(projectIsOpen({ fulfilledAt: new Date(), deliverableStates: ['submitted'] })).toBe(false)
  })
})

describe('where the margin is blank, the unknown is named', () => {
  it('nothing accepted reads that the margin shows once a deliverable is accepted', () => {
    expect(marginUnknownSays({ marginCents: null, earnedRevenueCents: 0, unknowns: ['No deliverable has been accepted yet, so nothing is earned.'] })).toEqual(['Margin shows once a deliverable is accepted'])
  })
  it('a member without a pay record is named', () => {
    expect(marginUnknownSays({ marginCents: null, earnedRevenueCents: 500, unknowns: ['Ada Quillfeather has no pay record on this project, so her cost is not known.'] })).toEqual(['Ada Quillfeather has no pay record yet'])
  })
  it('a margin that is a number has nothing to explain', () => {
    expect(marginUnknownSays({ marginCents: 100, earnedRevenueCents: 500, unknowns: [] })).toEqual([])
  })
})

describe('the margin route', () => {
  const route = read('src/app/api/pods/projects/[id]/margin/route.ts')
  it('asks the seat, the plugin, the team caller, then margin.read, in that order, before the reader', () => {
    const at = (s: string) => route.indexOf(s)
    const order = [at('staffOnly(caller'), at("pluginGate(caller, 'PODS')"), at('podReadRefusal('), at('mayReadCut('), at("'margin.read'"), at('marginReachFor('), at('readPodMargin(')]
    expect(order.every((n) => n > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
  it('waits for every refusal row before sending the refusal', () => {
    expect(route.match(/await recordRefusal\(/g)?.length).toBeGreaterThanOrEqual(3)
    expect(route).not.toMatch(/[^t] recordRefusal\(/)
  })
})

describe('the supplier’s team page', () => {
  const page = read('src/app/dashboard/pods/page.tsx')
  it('draws a margin only from a project whose margin route answered yes', () => {
    expect(page).toContain('if (r.ok)')
    expect(page).toContain('{m && (')
  })
})
