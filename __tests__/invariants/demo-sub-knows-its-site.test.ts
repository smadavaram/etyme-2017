import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { SUPPLIER_SEATS } from '@/app/demo/seats'

/**
 * CLAUDE.md, 2026-09-17: a sub-vendor knows the site it works at — it
 * must, for tenure and compliance. What the NDA hides is the other way
 * round: the client does not learn the sub's name unless its agreement
 * with the prime asks for it. The demo said the opposite of the first
 * half for Techpeple (chain audit, 2026-10-05).
 */
const SAYS_SUB_IS_BLIND =
  /never (learns|knows|sees) (which|where|what) (hospital|site|client|plant|customer|company)|(does not|doesn['’]t|cannot) (know|learn|see) (which|where|what) (hospital|site|client|plant|customer|company)/i

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? filesUnder(p) : /\.(ts|tsx)$/.test(p) ? [p] : []
  })
}

describe('the demo never says a sub-vendor does not know where its person works', () => {
  it('no sentence on the demo page or its doors says a sub-vendor never learns the site its person works at', () => {
    const root = join(process.cwd(), 'src/app/demo')
    const said = filesUnder(root).flatMap((f) =>
      readFileSync(f, 'utf8').split('\n').filter((l) => SAYS_SUB_IS_BLIND.test(l)).map((l) => `${f}: ${l.trim()}`)
    )
    expect(said).toEqual([])
  })

  it('Techpeple\'s door says it knows the hospital, and that the hospital sees its name only if the agreement asks', () => {
    const tp = SUPPLIER_SEATS.find((s) => s.slug === 'world-techpeple')!
    expect(tp.about).toContain('It knows the hospital where its consultant works.')
    expect(tp.about).toContain('The hospital does not see its name unless its agreement with the prime asks for it.')
  })
})
