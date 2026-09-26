import { describe, it, expect } from 'vitest'
import { skillGap } from '@/lib/training'

/**
 * The skill gap, which used to compare a real demand side against a
 * supply side that was always zero.
 *
 * CloudEPA is the real case: five people on its bench, every one with
 * skills on record, and the Training page read "Bench consultants 0 with
 * skills listed" and computed the gap from that nought.
 */

const cloudEPA = {
  people: [
    { skills: ['ERP finance', 'General ledger'] },              // Priya Raman
    { skills: ['ERP finance', 'General ledger'] },              // Grace Lindqvist
    { skills: ['Teamcenter', 'PLM'] },                          // Peter Halloran
    { skills: ['Epic', 'Beaker', 'LIS'] },                      // Ifeoma Balogun
    { skills: ['ERP finance', 'General ledger', 'Central finance'] }, // Helena Marsh
  ],
}

describe('a skill gap needs both sides', () => {
  it('counts the people on a full bench instead of reporting zero skilled people', () => {
    const g = skillGap([{ skills: ['ERP finance'] }], cloudEPA)
    expect(g.people).toBe(5)
    expect(g.peopleWithSkills).toBe(5)
    expect(g.comparable).toBe(true)
  })

  it('a skill gap is not computed from a supply of zero when the bench is full', () => {
    const g = skillGap([{ skills: ['ERP finance'] }, { skills: ['ERP finance'] }], cloudEPA)
    const erp = g.rows.find((r) => r.skill.toLowerCase() === 'erp finance')!
    expect(erp.demand).toBe(2)
    expect(erp.supply).toBe(3)
    expect(erp.gap).toBe(-1)
    expect(erp.says).toBe('1 spare')
  })

  it('skills tracked counts both sides or neither, never demand alone', () => {
    // The bench names eight distinct skills; demand names two more the
    // bench has none of. Ten is the span, and the broken version showed two.
    const g = skillGap([{ skills: ['Kubernetes', 'Terraform'] }], cloudEPA)
    expect(g.skillsTracked).toBe(10)
    expect(g.rows).toHaveLength(10)
    expect(skillGap([{ skills: ['Kubernetes', 'Terraform'] }], { people: [] }).skillsTracked).toBe(2)
  })

  it('a bench where nobody has a skill on record is a gap in the record, not a gap in the bench', () => {
    // Teleworld Solutions: five employees, no consultant profiles, so no
    // skills anywhere. Nought people with SAP out of five is not five
    // people short of SAP.
    const g = skillGap([{ skills: ['Avionics', 'DO-178C'] }], {
      people: [{ skills: [] }, { skills: [] }, { skills: [] }, { skills: [] }, { skills: [] }],
    })
    expect(g.people).toBe(5)
    expect(g.peopleWithSkills).toBe(0)
    expect(g.comparable).toBe(false)
    expect(g.skillsTracked).toBeNull()
    expect(g.inDeficit).toBeNull()
    expect(g.rows.every((r) => r.gap === null)).toBe(true)
    expect(g.says).toMatch(/gap in the record, not in the bench/i)
  })

  it('a supply side that could not be read at all shows no gap and says why', () => {
    const g = skillGap([{ skills: ['ERP finance'] }], null)
    expect(g.comparable).toBe(false)
    expect(g.people).toBeNull()
    expect(g.peopleWithSkills).toBeNull()
    expect(g.skillsTracked).toBeNull()
    expect(g.inDeficit).toBeNull()
    expect(g.rows).toHaveLength(0)
    expect(g.says).toMatch(/could not be read/i)
  })

  it('a skill in demand that nobody has reads as the number of people needed', () => {
    const g = skillGap(
      [{ skills: ['Epic'] }, { skills: ['Epic'] }, { skills: ['Epic'] }],
      cloudEPA
    )
    const epic = g.rows.find((r) => r.skill.toLowerCase() === 'epic')!
    expect(epic.gap).toBe(2)
    expect(epic.says).toBe('2 needed')
    expect(g.inDeficit).toBe(1)
  })

  it('a skill as many people have as roles want reads as matched, not as a deficit of nothing', () => {
    const g = skillGap([{ skills: ['Teamcenter'] }], cloudEPA)
    const tc = g.rows.find((r) => r.skill.toLowerCase() === 'teamcenter')!
    expect(tc.gap).toBe(0)
    expect(tc.says).toBe('Matched')
    expect(g.inDeficit).toBe(0)
  })

  it('a firm with nobody at all is told so, rather than told to buy training', () => {
    const g = skillGap([{ skills: ['Epic'] }], { people: [] })
    expect(g.people).toBe(0)
    expect(g.comparable).toBe(true)
    expect(g.says).toMatch(/Nobody on your bench or your payroll/i)
  })

  it('a bench part-described says so, so nobody reads the supply as the whole truth', () => {
    const g = skillGap([{ skills: ['ERP finance'] }], {
      people: [{ skills: ['ERP finance'] }, { skills: [] }, { skills: [] }],
    })
    expect(g.peopleWithSkills).toBe(1)
    expect(g.comparable).toBe(true)
    expect(g.says).toMatch(/2 of them have no skills on record/i)
    expect(g.says).toMatch(/can only be wider/i)
  })

  it('one person listing a skill twice is one person with it', () => {
    const g = skillGap([{ skills: ['Epic'] }], { people: [{ skills: ['Epic', 'epic', ' Epic '] }] })
    const epic = g.rows.find((r) => r.skill.toLowerCase() === 'epic')!
    expect(epic.supply).toBe(1)
  })

  it('a skill reads the way somebody typed it, not the way it was counted', () => {
    const g = skillGap([{ skills: ['ERP finance'] }], cloudEPA)
    expect(g.rows.map((r) => r.skill)).toContain('ERP finance')
    expect(g.rows.map((r) => r.skill)).not.toContain('Erp finance')
  })
})
