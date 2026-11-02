import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { apartTitles } from '@/app/api/bench/ours/positions'

/**
 * The screen walk, 2026-11-02: on Our bench, Reserve's "For" list showed
 * two job requests with one title, at one client in one city, as two
 * identical lines nobody could choose between. Each line already names
 * the client and the city; what tells two alike apart after that is
 * demand's own rule (`jobApart`): the day each starts, then the day each
 * was posted, then how many are alike.
 */

const title = 'Java developer — Northbend Athletic, Tualatin'
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('the Reserve list tells two jobs alike apart', () => {
  it('two job requests with one title, at one client in one city, read by the day each starts', () => {
    const t = apartTitles([
      { key: 'req:a', title, startDate: day('2026-11-09'), postedAt: day('2026-10-20') },
      { key: 'req:b', title, startDate: day('2026-12-07'), postedAt: day('2026-10-20') },
    ])
    expect(t.get('req:a')).not.toBe(t.get('req:b'))
    expect(t.get('req:a')).toMatch(/^Java developer — Northbend Athletic, Tualatin, starting /)
    expect(t.get('req:b')).toMatch(/^Java developer — Northbend Athletic, Tualatin, starting /)
  })

  it('two that also start the same day are told apart by the day each was posted', () => {
    const t = apartTitles([
      { key: 'req:a', title, startDate: day('2026-11-09'), postedAt: day('2026-10-20') },
      { key: 'req:b', title, startDate: day('2026-11-09'), postedAt: day('2026-10-27') },
    ])
    expect(t.get('req:a')).not.toBe(t.get('req:b'))
    expect(t.get('req:a')).toMatch(/, posted /)
    expect(t.get('req:a')).not.toMatch(/starting/)
  })

  it('where nothing a person reads differs, the line says how many are alike', () => {
    const t = apartTitles([
      { key: 'req:a', title, startDate: day('2026-11-09'), postedAt: day('2026-10-20') },
      { key: 'req:b', title, startDate: day('2026-11-09'), postedAt: day('2026-10-20') },
    ])
    expect(t.get('req:a')).toBe('Java developer — Northbend Athletic, Tualatin, one of two like it')
  })

  it('a line with no twin reads exactly as before', () => {
    const t = apartTitles([
      { key: 'req:a', title, startDate: day('2026-11-09') },
      { key: 'order:o', title: 'HCM integration lead — Teleworld Solutions, Portland', startDate: day('2026-08-03') },
    ])
    expect(t.get('req:a')).toBe(title)
    expect(t.get('order:o')).toBe('HCM integration lead — Teleworld Solutions, Portland')
  })

  it('the route tells every position apart with demand’s jobApart before the list is sent', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/bench/ours/route.ts'), 'utf8')
    expect(route).toContain("import { apartTitles } from './positions'")
    expect(route).toContain('startDate: true, createdAt: true')
    expect(route.indexOf('apartTitles(positions.map(')).toBeLessThan(route.indexOf('positions,\n'))
    const helper = readFileSync(join(process.cwd(), 'src/app/api/bench/ours/positions.ts'), 'utf8')
    expect(helper).toContain("import { jobApart } from '@/app/api/requisitions/words'")
  })
})
