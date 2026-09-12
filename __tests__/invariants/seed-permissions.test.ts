import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PERMISSIONS } from '@/lib/permissions'

/**
 * The seed's own comment warns about this and the seed then did it anyway.
 *
 * A role naming a permission nothing checks grants exactly nothing, and it
 * looks identical to one that works — until somebody tries the feature and
 * is refused for no visible reason. The client's procurement role carried
 * vendors.write and invoices.approve; its HR role carried tenure.read and
 * compliance.write. Four names, none of them real.
 */
describe('permission names used in the seed', () => {
  it('never invents a permission that nothing checks', () => {
    const seed = readFileSync(join(process.cwd(), 'prisma/seed.ts'), 'utf8')
    const known = new Set<string>(PERMISSIONS)

    // Only look inside permissions arrays, so email domains and file paths
    // that happen to contain a dot are not mistaken for permission names.
    const blocks = seed.match(/permissions:\s*\[[^\]]*\]/g) ?? []
    const used = new Set<string>()
    for (const block of blocks) {
      for (const m of block.matchAll(/'([a-z_]+\.[a-z_]+)'/g)) used.add(m[1])
    }

    const invented = [...used].filter((p) => !known.has(p)).sort()
    expect(invented, `these grant nothing: ${invented.join(', ')}`).toEqual([])
  })

  it('gives every seeded company somebody who can grant access', () => {
    // A company with no role holding team.manage cannot give anybody a
    // role, set up an integration, or recover — the only remedy is editing
    // the database.
    const seed = readFileSync(join(process.cwd(), 'prisma/seed.ts'), 'utf8')
    expect(seed).toContain("rolesFor('VENDOR')")
    expect(seed).toContain("rolesFor('CLIENT')")
  })
})
