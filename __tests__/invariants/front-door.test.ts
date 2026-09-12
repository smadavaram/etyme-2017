import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The front door leads into the world, and says so.
 *
 * Founder, opening the product the day Nike, Corning and Terumo BCT were
 * built: "why does client open as Oxford instead of Nike?" The "See it
 * as a company" button minted a private sandbox with a made-up name for
 * every visitor, while the three named programmes sat behind a small
 * link underneath it. Two demos, and the button led to the wrong one.
 *
 * Now a company seat is a chair in lib/seed-world's twenty firms:
 * Company → client → Nike; Company → bench vendor → CloudEPA. The seat
 * says which firm is behind it, because a door that does not say where
 * it goes is a form whose answer is thrown away.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const DOOR = read('src/components/try-demo.tsx')
const ROUTE = read('src/app/api/demo/route.ts')
const WORLD = read('src/lib/seed-world.ts')

/** seat → the world slug the picker sends, as written in try-demo.tsx. */
function worldSeats(): Record<string, { as: string; desk?: string; firm: string }> {
  // From the declaration to the first line that is just a closing brace.
  const start = DOOR.indexOf('const WORLD_SEAT')
  const block = DOOR.slice(start, DOOR.indexOf('\n}', start) + 2)
  const out: Record<string, any> = {}
  for (const m of block.matchAll(/(\w+):\s*\{\s*as:\s*'([^']+)'(?:,\s*desk:\s*'([^']+)')?,\s*firm:\s*'([^']+)'/g)) {
    out[m[1]] = { as: m[2], desk: m[3], firm: m[4] }
  }
  return out
}

describe('the company door leads into the seeded world, not a sandbox with a made-up name', () => {
  const seats = worldSeats()

  it('a company hiring contractors sits at Nike, from the programme manager\'s desk', () => {
    expect(seats.CLIENT).toEqual({ as: 'world-nike', desk: 'programme', firm: 'Nike' })
  })

  it('a staffing firm with a bench sits at CloudEPA', () => {
    expect(seats.BENCH).toMatchObject({ as: 'world-cloudepa', firm: 'CloudEPA' })
  })

  it('the old buyer\'s door means the client\'s chair — Nike as well', () => {
    expect(seats.HIRING).toMatchObject({ as: 'world-nike' })
  })

  it('every company seat has a firm behind it, and that firm is in the world', () => {
    for (const seat of ['CLIENT', 'MSP', 'GSI', 'PRIME', 'BENCH']) {
      expect(seats[seat], `${seat} has no world seat`).toBeDefined()
      const slug = seats[seat].as.replace(/^world-/, '')
      expect(WORLD, `${seats[seat].as} is not a firm lib/seed-world builds`).toContain(`slug: '${slug}'`)
      expect(WORLD, `${seats[seat].firm} is not the name lib/seed-world gives ${slug}`).toContain(`name: '${seats[seat].firm}'`)
    }
  })

  it('each seat on the picker says which firm it opens', () => {
    for (const seat of ['CLIENT', 'MSP', 'GSI', 'PRIME', 'BENCH']) {
      const line = DOOR.split('\n').find((l) => l.includes(`seat: '${seat}'`) && l.includes('label:'))
      expect(line, `no picker line for ${seat}`).toBeDefined()
      expect(line, `${seat}'s note does not name ${seats[seat].firm}`).toContain(`Sit at ${seats[seat].firm}`)
    }
  })

  it('a candidate is still given a seat of their own — they are a person, not a firm', () => {
    expect(worldSeats().CANDIDATE).toBeUndefined()
    // The fallback body is the old one, so the consultant seed still runs.
    expect(DOOR).toMatch(/world \? \{ as: world\.as[\s\S]*?\} : \{ side: chosen \}/)
  })

  it('the picker sends the seat, never a private-sandbox side, for a company', () => {
    // If both were sent, the route's resume check could answer first.
    expect(DOOR).not.toMatch(/side:\s*chosen,\s*as:/)
    expect(DOOR).not.toMatch(/as:\s*world\.as,\s*side/)
  })
})

describe('asking for a world seat is never answered with an old private sandbox', () => {
  it('the route decides `as` before it looks at the cookie, and skips the resume for it', () => {
    // The resume shortcut ran first and read a world request as the
    // default CLIENT seat — so anybody who had ever held a private client
    // sandbox got it back instead of Nike.
    const asWorldAt = ROUTE.indexOf("const asWorld = typeof (body as any)?.as === 'string'")
    const resumeAt = ROUTE.indexOf('if (existing && !asWorld) {')
    expect(asWorldAt).toBeGreaterThan(-1)
    expect(resumeAt).toBeGreaterThan(asWorldAt)
    // And only once — a second, later computation would be the old order back.
    expect(ROUTE.match(/const asWorld =/g)?.length).toBe(1)
  })
})
