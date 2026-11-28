import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { SKILLS } from '@/lib/skills/registry'

const NAME = /claude-(?:haiku|sonnet|opus|\d)[\w.-]*|gpt-\d[\w.-]*|gemini-\d[\w.-]*|mistral-(?:large|small|medium)[\w.-]*|llama-?\d[\w.-]*/i
const filesUnder = (d: string): string[] => readdirSync(d).flatMap((n) => {
  const p = join(d, n)
  return statSync(p).isDirectory() ? filesUnder(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
})
const root = process.cwd()

describe('a step names a tier and never a model', () => {
  it('no file under src names a provider model id, because the ids live only in the environment register', () => {
    const found = filesUnder(join(root, 'src')).map((p) => relative(root, p)).filter((p) => NAME.test(readFileSync(join(root, p), 'utf8')))
    expect(found).toEqual([])
  })
  it('every registered step names RULES, LOW or HIGH as its tier', () => {
    expect(SKILLS.length).toBeGreaterThan(0)
    for (const s of SKILLS) expect(['RULES', 'LOW', 'HIGH']).toContain(s.tier)
  })
  it('the table that holds a company’s own model route has a key reference and no column that could hold a key value', () => {
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8')
    const block = /model TenantModelRoute \{([\s\S]*?)\n\}/.exec(schema)![1]
    const cols = block.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((c) => /^[a-z]\w*$/.test(c) && c !== 'company')
    expect(cols).toContain('keyRef')
    expect(cols.filter((c) => /secret|token|apikey|password|keyvalue|^key$/i.test(c))).toEqual([])
  })
})
