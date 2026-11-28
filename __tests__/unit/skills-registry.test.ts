import { describe, it, expect } from 'vitest'
import { SKILLS, registryGaps, skillOf, paperMayReachModel, FORBIDDEN_ACTS, type Skill } from '@/lib/skills/registry'

const good: Skill = {
  key: 'test.skill', name: 'Test', unit: 'row', inputs: ['x'], output: 'y', dataClass: 'TENANT_BUSINESS', tier: 'RULES',
  mayEscalate: false, acts: ['READ'], maySend: false, taskKinds: [], usedBy: ['a'],
  answerKey: { checker: 'test.skill', says: 'a thing re-read' },
}

describe('the skill registry', () => {
  it('every skill names its data class, tier, unit and the checker that grades it', () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(21)
    for (const s of SKILLS) {
      expect(s.dataClass, s.key).toBeTruthy()
      expect(['RULES', 'LOW', 'HIGH']).toContain(s.tier)
      expect(s.unit, s.key).toBeTruthy()
      expect(s.answerKey.checker, s.key).toBeTruthy()
      expect(s.answerKey.says, s.key).toBeTruthy()
    }
  })

  it('the registered skills stand with no gap', () => {
    expect(registryGaps()).toEqual([])
  })

  it('a skill with no checker fails the build and names the gap', () => {
    const gaps = registryGaps([{ ...good, answerKey: { checker: '', says: '' } }])
    expect(gaps).toEqual(['Skill test.skill has no checker, so nothing grades it.'])
  })

  it('a skill that handles tax IDs, bank details or social security numbers can only be a rules skill', () => {
    expect(registryGaps([{ ...good, dataClass: 'LANE_C', tier: 'LOW' }])[0]).toMatch(/Lane C data, so it can only be a rules skill/)
    expect(registryGaps([{ ...good, dataClass: 'LANE_C', tier: 'RULES' }])).toEqual([])
    for (const s of SKILLS.filter((x) => x.dataClass === 'LANE_C')) expect(s.tier).toBe('RULES')
  })

  it('a skill that moves money, signs, ends a placement, decides about a person or publishes compliance copy cannot be registered', () => {
    for (const act of FORBIDDEN_ACTS) {
      expect(registryGaps([{ ...good, acts: ['READ', act] }])[0], act).toMatch(/no skill may do/)
    }
    for (const s of SKILLS) for (const a of s.acts) expect(FORBIDDEN_ACTS).not.toContain(a)
  })

  it('a skill that may send names its task kind and sends nothing outside an approved task', () => {
    expect(registryGaps([{ ...good, maySend: true, acts: ['SEND'], taskKinds: [] }])[0]).toMatch(/names no task kind/)
    expect(registryGaps([{ ...good, maySend: false, acts: ['SEND'] }])[0]).toMatch(/not marked as one that may send/)
    const senders = SKILLS.filter((s) => s.maySend)
    expect(senders.map((s) => s.key)).toEqual(['chase.send'])
    expect(senders[0].taskKinds).toContain('TIMESHEET_CHASE')
  })

  it('a skill registered twice is named', () => {
    expect(registryGaps([good, good])).toEqual(['Skill test.skill is registered twice.'])
  })

  it('a rules skill cannot escalate and a high tier skill has nowhere to escalate to', () => {
    expect(registryGaps([{ ...good, mayEscalate: true }])[0]).toMatch(/no tier to escalate from/)
    expect(registryGaps([{ ...good, tier: 'HIGH', mayEscalate: true }])[0]).toMatch(/already on the high tier/)
  })

  it('only the skills that call a model start above the rules tier', () => {
    const models = SKILLS.filter((s) => s.tier !== 'RULES').map((s) => s.key).sort()
    expect(models).toEqual(['ask.answer', 'bio.write', 'document.read', 'match.rank', 'outreach.push', 'proposal.draft', 'site.voice', 'skills.evidence'])
  })

  it('a W-4, W-9, voided check or identity document is never read by a model, by its type', () => {
    for (const t of ['W-4', 'w9', 'voided check', 'SSA_CARD', 'I-9', 'passport']) expect(paperMayReachModel(t), t).toBe(false)
    expect(paperMayReachModel('MSA')).toBe(true)
    expect(paperMayReachModel('CERTIFICATE_OF_INSURANCE')).toBe(true)
  })

  it('no price or charge appears in the registry', () => {
    expect(JSON.stringify(SKILLS)).not.toMatch(/price|charge|\$\d/i)
  })

  it('finds a skill by key and says nothing for one that is not there', () => {
    expect(skillOf('payroll.draft')?.name).toBe('Payroll draft')
    expect(skillOf('nope')).toBeNull()
  })
})
