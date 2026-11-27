import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { INLINE_KEYS, inlineKeyFor, jsonIn } from '@/lib/skills/inline-keys'
import { SKILLS } from '@/lib/skills/registry'

const row = (o: Record<string, unknown> = {}) => ({ factors: [{ label: 'skills', value: 80, weight: 1, detail: 'x' }], basis: 'b', confidence: 'HIGH', unknowns: null, ...o })

describe('the inline answer keys', () => {
  it('every skill that may escalate has a key, and a skill that may not escalate has none', () => {
    const escalating = SKILLS.filter((s) => s.tier !== 'RULES' && s.mayEscalate).map((s) => s.key).sort()
    expect(Object.keys(INLINE_KEYS).sort()).toEqual(escalating)
    expect(SKILLS.filter((s) => !s.mayEscalate).every((s) => inlineKeyFor(s.key) === null)).toBe(true)
  })
  it('a key is pure: it imports nothing from the database or the network', () => {
    const src = readFileSync('src/lib/skills/inline-keys.ts', 'utf8')
    expect(src).not.toMatch(/^import /m)
  })
  it('a match row without factors, basis, confidence and unknowns fails', () => {
    const k = inlineKeyFor('match.rank')!
    expect(k(JSON.stringify([row()]), {}).ok).toBe(true)
    expect(k(JSON.stringify([row({ factors: [] })]), {}).ok).toBe(false)
    expect(k(JSON.stringify([row({ basis: ' ' })]), {}).ok).toBe(false)
    expect(k(JSON.stringify([row({ confidence: 'SURE' })]), {}).ok).toBe(false)
    const { unknowns: _u, ...noUnknowns } = row()
    expect(k(JSON.stringify([noUnknowns]), {}).reason).toMatch(/unknown/)
    expect(k('not json', {}).ok).toBe(false)
    expect(k('[]', {}).ok).toBe(false)
  })
  it('a match answer in a code fence or under a matches list is still read', () => {
    const k = inlineKeyFor('match.rank')!
    expect(k('```json\n' + JSON.stringify({ matches: [row()] }) + '\n```', {}).ok).toBe(true)
  })
  it('a model quote that is not in the source fails, and one that is passes, whatever the spacing and case', () => {
    const k = inlineKeyFor('skills.evidence')!
    const cv = 'Built Spring Boot services\nfor nine years at a bank.'
    expect(k(JSON.stringify([{ skill: 'Spring', quote: 'spring boot  services for nine years' }]), { source: cv }).ok).toBe(true)
    const bad = k(JSON.stringify([{ skill: 'Kafka', quote: 'ran Kafka clusters' }, { skill: 'Spring', quote: 'Spring Boot services' }]), { source: cv })
    expect(bad.ok).toBe(false)
    expect(bad.reason).toMatch(/1 of 2 quotes/)
  })
  it('a quote check with no source text or no quotes fails rather than passing', () => {
    const k = inlineKeyFor('skills.evidence')!
    expect(k(JSON.stringify([{ quote: 'x' }]), {}).ok).toBe(false)
    expect(k(JSON.stringify([{ skill: 'Java' }]), { source: 'Java' }).ok).toBe(false)
  })
  it('a paper read is checked on the quote behind each value', () => {
    const k = inlineKeyFor('document.read')!
    const answer = { records: [{ fields: [{ field: 'code', value: 'MFG-100', foundIn: 'MFG-100' }] }] }
    expect(k(JSON.stringify(answer), { source: 'code MFG-100 here' }).ok).toBe(true)
    expect(k(JSON.stringify(answer), { source: 'nothing like it' }).ok).toBe(false)
  })
  it('the json in an answer is found with prose round it', () => {
    expect(jsonIn('Here you go: [1,2] thanks')).toEqual([1, 2])
    expect(jsonIn('no json')).toBeNull()
  })
})
