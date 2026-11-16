import { describe, it, expect } from 'vitest'
import { rolesFor, GRANTED_SINCE, ADMIN_LOSES, isNarrowedAdmin, FOUNDING_ADMIN } from '@/lib/company-defaults'

const held = (kind: Parameters<typeof rolesFor>[0], role: string) => rolesFor(kind).find((r) => r.name === role)?.permissions ?? []

describe('who holds the permission to set a company’s own accounting codes', () => {
  it('the Owner of every kind of company holds it', () => {
    for (const kind of ['VENDOR', 'GSI', 'CLIENT', 'MSP'] as const) expect(held(kind, 'Owner')).toContain('codes.manage')
  })
  it('Finance at a supplier firm holds it', () => {
    expect(held('VENDOR', 'Finance')).toContain('codes.manage')
    expect(held('GSI', 'Finance')).toContain('codes.manage')
  })
  it('an Admin, who is IT and people, does not hold it by default, at any kind of company', () => {
    for (const kind of ['VENDOR', 'GSI', 'CLIENT', 'MSP'] as const) expect(held(kind, 'Admin')).not.toContain('codes.manage')
    expect(FOUNDING_ADMIN.permissions).not.toContain('codes.manage')
  })
  it('an Admin that holds the permission no longer reads as the narrowed Admin', () => {
    expect(ADMIN_LOSES).toContain('codes.manage')
    expect(isNarrowedAdmin(['settings.manage', 'codes.manage'])).toBe(false)
  })
  it('a company formed before the permission existed gets it on its Owner and Finance roles and never on its Admin', () => {
    const grants = GRANTED_SINCE.filter((g) => g.permissions.includes('codes.manage'))
    expect(grants.some((g) => g.role === 'Owner' && g.kinds.includes('CLIENT') && g.kinds.includes('VENDOR'))).toBe(true)
    expect(grants.some((g) => g.role === 'Finance' && g.kinds.includes('VENDOR'))).toBe(true)
    expect(grants.some((g) => g.role === 'Admin')).toBe(false)
  })
})
