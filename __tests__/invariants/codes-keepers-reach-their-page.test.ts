import { describe, it, expect } from 'vitest'
import { menuFor, menuLinks } from '@/lib/nav-table'
import { rolesFor } from '@/lib/company-defaults'

/** Who is offered the Settings link, and the Cost centers tab beneath it, for the codes. */
const perms = (kind: 'CLIENT' | 'VENDOR', name: string) =>
  rolesFor(kind).find((r) => r.name === name)!.permissions as readonly string[]
const settingsHref = (kind: 'CLIENT' | 'VENDOR', name: string) => {
  const link = menuLinks(menuFor(kind, false, { permissions: perms(kind, name) })).find((l) => l.label === 'Settings')
  return link?.href ?? null
}

describe('the people who keep a client’s codes can reach the page that holds them', () => {
  it('the AP clerk who keeps a client’s codes is offered a Settings link that opens the Cost centers page', () => {
    expect(settingsHref('CLIENT', 'AP Clerk')).toBe('/dashboard/settings/cost-centers')
  })

  it('the vendor’s Finance, who does not open the company settings, is offered the Cost centers page under Settings', () => {
    expect(settingsHref('VENDOR', 'Finance')).toBe('/dashboard/settings/cost-centers')
  })

  it('the Owner’s Settings link still opens the company’s own settings page first', () => {
    expect(settingsHref('CLIENT', 'Owner')).toBe('/dashboard/settings')
  })

  it('a seat that holds neither codes nor payments is not offered the Cost centers page', () => {
    expect(settingsHref('CLIENT', 'Viewer')).not.toBe('/dashboard/settings/cost-centers')
  })
})
