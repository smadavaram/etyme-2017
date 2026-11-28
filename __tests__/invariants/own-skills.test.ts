import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readOwnSkills, OWN_SKILLS_MAX } from '@/lib/bench-filter'

/**
 * A person says their own skills on their own page (2026-10-20).
 *
 * Found by the simulation's match station: an integrator's own employees
 * between projects never reached matching, because matching weighs only
 * people with skills on record, and nobody lists an employee, so nothing
 * ever wrote their skills.
 */

const read = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')

describe('A person states their own skills', () => {
  it('a save that sends no skills leaves the skills on record alone', () => {
    expect(readOwnSkills(undefined)).toBeNull()
    expect(readOwnSkills(null)).toBeNull()
  })

  it('an empty list clears them', () => {
    expect(readOwnSkills([])).toEqual({ ok: true, skills: [] })
  })

  it('a nurse and a validation engineer list their skills in their own words, trimmed and once each', () => {
    expect(readOwnSkills(['ICU nursing', ' ACLS ', 'acls'])).toEqual({ ok: true, skills: ['ICU nursing', 'ACLS'] })
    expect(readOwnSkills('Process validation, Cleaning validation')).toEqual({
      ok: true, skills: ['Process validation', 'Cleaning validation'],
    })
  })

  it('a skill sent in a list keeps its own comma rather than being split in two', () => {
    const r = readOwnSkills(['Equipment qualification (IQ, OQ, PQ)'])
    expect(r).toEqual({ ok: true, skills: ['Equipment qualification (IQ OQ PQ)'] })
  })

  it('more skills than the limit are refused in a sentence', () => {
    const many = Array.from({ length: OWN_SKILLS_MAX + 1 }, (_, i) => `Skill ${i}`)
    const r = readOwnSkills(many)
    expect(r && !r.ok && r.says).toContain(`${OWN_SKILLS_MAX} skills at most`)
  })

  it('something that is not a list is refused in a sentence', () => {
    const r = readOwnSkills({ skills: 'x' })
    expect(r && !r.ok && r.says).toBe('Send your skills as a list.')
  })

  it('the person’s own page writes them, and only the person reaches that door', () => {
    const route = read('app/api/me/portfolio/route.ts')
    expect(route).toContain('readOwnSkills(body.skills)')
    expect(route).toContain('data.skills = skills.skills')
    // The door is the signed-in person, never a firm acting for them.
    expect(route).toContain('const person = await me()')
  })
})
