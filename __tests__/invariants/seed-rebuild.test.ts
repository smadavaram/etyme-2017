import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Prisma } from '@prisma/client'
import { DELETE_ORDER, KEPT, LOOSE, ORPHANED_WITH_THE_WORLD, edges, CONFIRM_PHRASE, RELEASE_PHRASE, STAND_IN_DOMAIN } from '@/lib/seed-rebuild'
import { maskEmail } from '@/lib/seed-owners'
import { reservedAddress } from '@/lib/demo-session'

/**
 * The rebuild deletes rows, so its reach is checked against the schema
 * on every commit rather than trusted.
 *
 * A model added tomorrow with a foreign key to a company or a person is
 * followed automatically — the graph is read off `Prisma.dmmf` — but it
 * still has to be placed in the delete order, and a column that names a
 * row without a foreign key has to be decided by whoever adds it. These
 * fail until they are.
 */

const MODELS = Prisma.dmmf.datamodel.models
const NAMES = MODELS.map((m) => m.name)
const LIB = readFileSync(join(process.cwd(), 'src/lib/seed-rebuild.ts'), 'utf8')
/** The code, without the comments that explain why it never truncates. */
const CODE = LIB.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/seed-world/rebuild/route.ts'), 'utf8')

describe('rebuilding the demo world', () => {
  it('names every model in the schema in its delete order, exactly once', () => {
    expect([...DELETE_ORDER].sort()).toEqual([...NAMES].sort())
    expect(new Set(DELETE_ORDER).size).toBe(DELETE_ORDER.length)
  })

  it('deletes every row before the row it points at, so no foreign key is ever left dangling mid-transaction', () => {
    const at = new Map(DELETE_ORDER.map((m, i) => [m as string, i]))
    const wrong: string[] = []
    for (const m of MODELS) {
      for (const f of m.fields) {
        if (f.kind !== 'object' || !f.relationFromFields?.length || f.type === m.name) continue
        if (at.get(m.name)! > at.get(f.type)!) wrong.push(`${m.name}.${f.name} → ${f.type}`)
      }
    }
    expect(wrong, 'these point at a model deleted before them').toEqual([])
  })

  it('reaches every model from a company or a person, unless it is a record kept on purpose or a parent that goes with the world', () => {
    const all = edges()
    const reached = new Set<string>(['Company', 'Person'])
    let grew = true
    while (grew) {
      grew = false
      for (const e of all) {
        if (reached.has(e.to) && !reached.has(e.from)) {
          reached.add(e.from)
          grew = true
        }
      }
    }
    const excused = new Set<string>([...KEPT, ...ORPHANED_WITH_THE_WORLD])
    const unreached = NAMES.filter((n) => !reached.has(n) && !excused.has(n))
    expect(
      unreached,
      'no foreign key or declared column ties these to a company or a person — the rebuild would leave their demo rows behind'
    ).toEqual([])
  })

  it('declares every column that names another row without a foreign key as owned, a link, or a record', () => {
    const undeclared: string[] = []
    for (const m of MODELS) {
      const fks = new Set(m.fields.flatMap((f) => f.relationFromFields ?? []))
      for (const f of m.fields) {
        if (f.kind !== 'scalar' || f.type !== 'String' || f.name === 'id' || fks.has(f.name)) continue
        if (!/(Id|Ids|By)$/.test(f.name)) continue
        if (!LOOSE[`${m.name}.${f.name}`]) undeclared.push(`${m.name}.${f.name}`)
      }
    }
    expect(undeclared, 'decide each one in LOOSE in lib/seed-rebuild').toEqual([])
  })

  it('declares no loose column the schema does not have', () => {
    const stale = Object.keys(LOOSE).filter((key) => {
      const [model, field] = key.split('.')
      return !MODELS.find((m) => m.name === model)?.fields.some((f) => f.name === field)
    })
    expect(stale).toEqual([])
  })

  it('names what an owned or linking column points at, and only at models that exist', () => {
    for (const [key, spec] of Object.entries(LOOSE)) {
      if (spec.as === 'RECORD') continue
      expect(spec.to?.length, key).toBeGreaterThan(0)
      for (const to of spec.to!) expect(NAMES, key).toContain(to)
    }
  })

  it('never deletes a lead from the site, an incident or a run of the nightly job', () => {
    expect([...KEPT].sort()).toEqual(['Incident', 'JobRun', 'MarketingLead'])
    for (const e of edges()) expect(KEPT as readonly string[], `${e.from}.${e.column}`).not.toContain(e.from)
  })

  it('never truncates a table or drops the database — it deletes rows by id', () => {
    expect(CODE).not.toMatch(/TRUNCATE/i)
    expect(CODE).not.toMatch(/DROP\s+(TABLE|DATABASE)/i)
    expect(CODE).not.toMatch(/resetDatabase/)
    expect(CODE).toMatch(/DELETE FROM \$\{q\(table\(model\)\)\} WHERE "id" = ANY/)
  })

  it('asks for the deployment secret and a phrase typed out, and has a minute to work in', () => {
    expect(CONFIRM_PHRASE).toBe('delete the demo world')
    expect(ROUTE).toMatch(/^export const maxDuration = 60$/m)
    expect(ROUTE).toContain('CRON_SECRET')
    expect(ROUTE).not.toContain('callerIsStaff')
  })

  it('logs the rebuild as an act that cannot be put back', () => {
    expect(LIB).toContain("action: 'DEMO_WORLD_REBUILT'")
    expect(LIB).toMatch(/reversible: false/)
  })

  it('names a real person by a masked address and a made-up one whole', () => {
    expect(maskEmail('priya.shah@gmail.com')).toBe('p\u2022\u2022\u2022@gmail.com')
    expect(maskEmail('world-computer-systems@demo.etyme.local')).toBe('world-computer-systems@demo.etyme.local')
    expect(maskEmail('verify.three@seed.etyme.invalid')).toBe('verify.three@seed.etyme.invalid')
    expect(maskEmail(null)).toBe('no address')
  })

  it('releasing the ties asks for a phrase of its own, typed out, that cannot be mistaken for the rebuild', () => {
    expect(RELEASE_PHRASE).toBe('release the demo world from real records')
    expect(RELEASE_PHRASE).not.toBe(CONFIRM_PHRASE)
    expect(ROUTE).toContain('RELEASE_PHRASE')
    expect(ROUTE).toMatch(/body\?\.dryRun === true/)
  })

  it('releasing the ties changes references only and has no way to delete a row', () => {
    const release = CODE.slice(CODE.indexOf('export const RELEASE_PHRASE'))
    expect(release.length).toBeGreaterThan(1000)
    expect(release).not.toMatch(/DELETE\s+FROM/i)
    expect(release).not.toMatch(/\.delete(Many)?\(/)
    expect(release).toContain("action: 'DEMO_TIES_RELEASED'")
    expect(release).toMatch(/reversible: false/)
  })

  it('a stand-in for a released demo person lives at an address nobody can register', () => {
    expect(reservedAddress(`released.abc@${STAND_IN_DOMAIN}`)).toBe(true)
  })
})
