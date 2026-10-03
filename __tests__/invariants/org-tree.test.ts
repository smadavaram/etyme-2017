import { describe, it, expect } from 'vitest'
import { ancestry, descendants, type Unit } from '@/lib/org-tree'

/**
 * Founder question: "can indirect procurement and HR team work with
 * multiple discrete teams — apps, security, infrastructure, saas, R&D 1,
 * R&D 2". Yes, and this is the walk that makes a rule on the parent
 * responsible for work raised in a child.
 */

const TECH: Unit[] = [
  { id: 'tech', parentId: null },
  { id: 'apps', parentId: 'tech' },
  { id: 'security', parentId: 'tech' },
  { id: 'infra', parentId: 'tech' },
  { id: 'saas', parentId: 'tech' },
  { id: 'rnd', parentId: 'tech' },
  { id: 'rnd1', parentId: 'rnd' },
  { id: 'rnd2', parentId: 'rnd' },
]

describe('who is responsible for work raised inside a team', () => {
  it('makes the team itself responsible first', () => {
    expect(ancestry(TECH, 'rnd1')[0]).toBe('rnd1')
  })

  it('carries responsibility up to every parent above it', () => {
    // A rule on Technology catches work raised in R&D 1 without anybody
    // copying that rule onto each leaf.
    expect(ancestry(TECH, 'rnd1')).toEqual(['rnd1', 'rnd', 'tech'])
  })

  it('does not make a sibling responsible for another team’s work', () => {
    // Security is not asked about an Apps requisition.
    expect(ancestry(TECH, 'apps')).not.toContain('security')
  })

  it('asks nobody in particular when the work names no team', () => {
    // Which is what company-wide rules are for. Returning everything
    // here is how a requisition with no team got every team's approver.
    expect(ancestry(TECH, null)).toEqual([])
  })

  it('stops rather than hanging when somebody makes a team its own parent', () => {
    const looped: Unit[] = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ]
    expect(ancestry(looped, 'a')).toEqual(['a', 'b'])
  })

  it('reads the other way for a lead asking what is happening under them', () => {
    expect(descendants(TECH, 'rnd').sort()).toEqual(['rnd', 'rnd1', 'rnd2'])
    expect(descendants(TECH, 'tech')).toHaveLength(8)
  })
})
