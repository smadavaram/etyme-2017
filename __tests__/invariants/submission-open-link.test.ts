import { describe, it, expect } from 'vitest'
import { lineFor } from '@/app/api/submissions/line-for'
import { mayOpenLine } from '@/app/api/placements/[id]/party'

const sub = { id: 'sub-line', requirementId: 'r1', personId: 'p1', companyId: 'SUB', clientCompanyId: 'PRIME' }
const prime = { id: 'prime-line', requirementId: 'r1', personId: 'p1', companyId: 'PRIME', clientCompanyId: 'CLIENT' }

describe('the Open link on a submission row', () => {
  it('a client is offered its own line and never the line below its supplier', () => {
    expect(lineFor([sub, prime], 'CLIENT').get('r1:p1')).toBe('prime-line')
    expect(lineFor([prime, sub], 'CLIENT').get('r1:p1')).toBe('prime-line')
  })
  it('a client with only the line below its supplier on the job is offered no link', () => {
    expect(lineFor([sub], 'CLIENT').size).toBe(0)
  })
  it('the prime is offered the line it sells before the line it buys, and the sub-vendor its own', () => {
    expect(lineFor([sub, prime], 'PRIME').get('r1:p1')).toBe('prime-line')
    expect(lineFor([prime, sub], 'SUB').get('r1:p1')).toBe('sub-line')
  })
  it('a reader with no company is offered no link', () => {
    expect(lineFor([prime], null).size).toBe(0)
  })
  it('a link is offered exactly where the placement route would open the line', () => {
    for (const reader of ['SUB', 'PRIME', 'CLIENT', 'STRANGER']) {
      for (const line of [sub, prime]) {
        const offered = lineFor([line], reader).has('r1:p1')
        expect(offered).toBe(mayOpenLine(reader, line))
      }
    }
  })
})

describe('Place is never offered twice when the only line is one the reader may not open (record 119)', () => {
  it('submissions and interviews ask whether the person is placed from every line, and link only to a line the reader may open', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of ['src/app/api/submissions/route.ts', 'src/app/api/interviews/route.ts']) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toMatch(/const placedOn = new Map\(lines\.map/)
      expect(src, f).toMatch(/lineForReader\(lines, caller\.company\?\.id \?\? null\)/)
      expect(src, f).toMatch(/contractId: (placedOn\.get|placed)/)
    }
  })
})
