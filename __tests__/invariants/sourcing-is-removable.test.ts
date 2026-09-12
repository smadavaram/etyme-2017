import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { readyToRemove, VENDOR_TARGET, SOURCED_SHARE_FLOOR } from '@/lib/sourcing-exit'

/**
 * Sourced contacts are scaffolding with a demolition date, and this test
 * is what keeps them removable.
 *
 * The bought list exists to bring traffic and to give a vendor with a
 * thin bench something to work while the network is small. Both problems
 * disappear at around a thousand vendors, and then all of it is deleted.
 *
 * A feature nobody plans to remove becomes load-bearing by accident.
 * Something references it, then something references that, and in two
 * years it is holding up the building and the deletion is a project
 * instead of a chore. The only reliable defence is a test that fails on
 * the commit which first points the wrong way — the one moment somebody
 * is in a position to say so cheaply.
 */

const ROOT = process.cwd()

/** Everything sourcing may ever live in. One place, so removal is one delete. */
const SOURCING_PATHS = [
  'src/lib/sourcing',
  'src/lib/sourced-contacts.ts',
  'src/app/api/sourcing',
  'src/app/dashboard/sourcing',
]

/**
 * The exit criterion itself is exempt.
 *
 * It measures whether the scaffolding can come down and has to outlive
 * it by one commit — the commit that removes everything else and then
 * removes this.
 */
const EXEMPT = ['src/lib/sourcing-exit.ts']

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(ROOT, full))
  }
  return out
}

const ALL = walk(join(ROOT, 'src'))
const isSourcing = (f: string) => SOURCING_PATHS.some((p) => f === p || f.startsWith(p + '/'))
const CORE = ALL.filter((f) => !isSourcing(f) && !EXEMPT.includes(f))

describe('the core never learns that sourced contacts exist', () => {
  it('finds a real codebase to check, so a pass means something', () => {
    expect(CORE.length).toBeGreaterThan(100)
  })

  it('nothing outside the sourcing module imports from it', () => {
    // The whole removability claim in one assertion. Vacuous while the
    // module does not exist, and the day it does this is the wall.
    const offenders = CORE.filter((f) => {
      const src = readFileSync(join(ROOT, f), 'utf8')
      return /from ['"]@\/(lib\/sourcing|lib\/sourced-contacts|app\/api\/sourcing)/.test(src)
    })
    expect(
      offenders,
      'these import sourcing, which makes it undeletable:\n  ' + offenders.join('\n  ')
    ).toEqual([])
  })

  it('no core model in the schema holds a relation to a sourced contact', () => {
    // A foreign key is a harder dependency than an import: it survives
    // the code being deleted and turns removal into a migration nobody
    // wants to write.
    const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8')
    const models = schema.split(/\nmodel /).slice(1)
    const offenders = models
      .map((m) => ({ name: m.split(/\s/)[0], body: m }))
      .filter((m) => m.name !== 'SourcedContact')
      .filter((m) => /SourcedContact/.test(m.body))
      .map((m) => m.name)
    expect(
      offenders,
      'these models reference SourcedContact and would block its removal:\n  ' + offenders.join('\n  ')
    ).toEqual([])
  })

  it('keeps sourcing in one place, so removing it is one delete and not a hunt', () => {
    const strays = ALL.filter(
      (f) => !isSourcing(f) && !EXEMPT.includes(f) && /sourced[-_]?contact/i.test(f)
    )
    expect(strays, 'sourcing code outside the module:\n  ' + strays.join('\n  ')).toEqual([])
  })
})

describe('and there is a number that says when to take it down', () => {
  it('carries the bench while the network is too small to feed itself', () => {
    const v = readyToRemove({ activeVendors: 40, listingsFromSourced: 300, listingsTotal: 500 })
    expect(v.stage).toBe('CARRYING')
    expect(v.says).toMatch(/what it is for while the network is this small/i)
  })

  it('says to fix it, not remove it, when it is quiet on a small network', () => {
    // The failure worth naming. A small sourced share with forty vendors
    // means the list is not working — and removing it then takes away
    // the only thing feeding a network too small to feed itself.
    const v = readyToRemove({ activeVendors: 40, listingsFromSourced: 5, listingsTotal: 500 })
    expect(v.stage).toBe('CARRYING')
    expect(v.says).toMatch(/Fix it, do not remove it/i)
  })

  it('is not ready on vendor count alone, while the habit has not shifted', () => {
    const v = readyToRemove({ activeVendors: 1200, listingsFromSourced: 400, listingsTotal: 1000 })
    expect(v.stage).toBe('FADING')
    expect(v.says).toMatch(/network is big enough; the habit has not shifted/i)
  })

  it('says delete it once the network is big and the list has gone quiet', () => {
    const v = readyToRemove({ activeVendors: 1200, listingsFromSourced: 20, listingsTotal: 1000 })
    expect(v.stage).toBe('READY')
    expect(v.says).toMatch(/It has done its job. Delete it./)
  })

  it('waits for a share near zero rather than exactly zero, which never arrives', () => {
    // A handful of people who first came from the list will still be on
    // a bench years later.
    expect(SOURCED_SHARE_FLOOR).toBeGreaterThan(0)
    expect(readyToRemove({
      activeVendors: VENDOR_TARGET, listingsFromSourced: 50, listingsTotal: 1000,
    }).stage).toBe('READY')
  })

  it('measures success as the thing shrinking, which is unusual enough to state', () => {
    const early = readyToRemove({ activeVendors: 200, listingsFromSourced: 400, listingsTotal: 500 })
    const late = readyToRemove({ activeVendors: 1100, listingsFromSourced: 30, listingsTotal: 1000 })
    expect(early.sourcedShare).toBeGreaterThan(late.sourcedShare)
    expect(late.stage).toBe('READY')
  })
})
