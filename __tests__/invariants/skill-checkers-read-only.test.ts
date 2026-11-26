import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * A checker only reads (record 123). It is how success is read from the
 * record and never from the agent's report, so a checker that could write
 * would be grading its own homework.
 */

const DIR = path.join(process.cwd(), 'src/lib/skills/checkers')

const FORBIDDEN_IMPORTS: [RegExp, string][] = [
  [/from\s+['"]@\/lib\/db['"]/, 'the database client'],
  [/from\s+['"]@\/lib\/record-ledger['"]/, 'the record ledger writer'],
  [/from\s+['"]@\/lib\/agents\/(runner|tasks|open-once)['"]/, 'the agent runner or its task writer'],
  [/from\s+['"]@\/lib\/agent-run['"]/, 'the run ledger writer'],
  [/from\s+['"]@\/lib\/skills\/(runner|grade)['"]/, 'the skill runner or the grader'],
  [/from\s+['"]@\/lib\/notify/, 'a way to send'],
  [/^import\s+(?!type)[^'"]*from\s+['"]@prisma\/client['"]/m, 'the database library as a value'],
]
const FORBIDDEN_TEXT: [RegExp, string][] = [
  [/\bctx\.act\b/, 'ctx.act'],
  [/\brecordAction\b|\bwriteRecordAction\b/i, 'the record ledger'],
  [/\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/, 'a write call'],
  [/\$(transaction|executeRaw|queryRaw)/, 'a raw or transactional call'],
]

/** What in a checker's source writes or reaches a writer, one sentence each. Comments do not count. */
export function checkerSourceGaps(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const gaps: string[] = []
  for (const [re, what] of FORBIDDEN_IMPORTS) if (re.test(code)) gaps.push(`imports ${what}`)
  for (const [re, what] of FORBIDDEN_TEXT) if (re.test(code)) gaps.push(`uses ${what}`)
  return gaps
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts'))

describe('a checker file only reads', () => {
  it('there is a folder of checkers to guard', () => {
    expect(files).toContain('index.ts')
  })

  it('a checker file cannot import anything that writes to the record', () => {
    const bad = files.flatMap((f) => checkerSourceGaps(fs.readFileSync(path.join(DIR, f), 'utf8')).map((g) => `${f} ${g}`))
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('the guard itself catches each way a checker could write', () => {
    expect(checkerSourceGaps("import { prisma } from '@/lib/db'")).toEqual(['imports the database client'])
    expect(checkerSourceGaps("import { writeRecordAction } from '@/lib/record-ledger'")).toContain('imports the record ledger writer')
    expect(checkerSourceGaps('await ctx.act({})')).toContain('uses ctx.act')
    expect(checkerSourceGaps('await recordAction(x)')).toContain('uses the record ledger')
    expect(checkerSourceGaps('await read.check.create({})')).toContain('uses a write call')
    expect(checkerSourceGaps("import { record } from '@/lib/agent-run'")).toContain('imports the run ledger writer')
  })

  it('a comment that names a writer does not fail a checker', () => {
    expect(checkerSourceGaps('// never ctx.act or recordAction\n/* prisma.x.create( */ const a = 1')).toEqual([])
  })
})
