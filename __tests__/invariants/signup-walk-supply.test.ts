import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Round one of the sign-up walk, 2026-10-08, on the person's own pages.
 *
 * Each sentence here is a fix the walk asked for: a claim nobody can
 * check replaced by a plain fact, and an empty page that offered a door
 * the product did not have.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const BENCHES = read('src/app/dashboard/my-benches/page.tsx')

describe('"Who has you" says plain facts a person can check', () => {
  it('makes no claim about the industry that nobody can check', () => {
    expect(BENCHES).not.toMatch(/never existed/i)
    expect(BENCHES).not.toMatch(/in this industry/i)
  })

  it('the firms panel says it lists every firm that holds your consent to be put forward, with how long you chose to stay', () => {
    expect(BENCHES).toContain(
      'Every firm that holds your consent to be put forward, with how long you chose to stay.'
    )
  })

  it('the history panel says what each row shows: the firm, the client, the job, what happened and when', () => {
    expect(BENCHES).toContain('Every firm that put you forward: the client, the job, what happened and when.')
  })
})
