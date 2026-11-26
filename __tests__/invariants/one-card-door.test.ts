import { describe, it, expect } from 'vitest'
import { desklessDoor } from '@/lib/deskless-door'
import { routesOpenToADesklessSeat, routeMatches } from '@/lib/nav-table'

/**
 * Record 130: Ask Etyme draws one card from /api/conversations/one-card.
 * A seat that holds only the reads of its own work must be able to read
 * its own card, as it already reads its own thread.
 */
describe('the one card is read through the door', () => {
  it('a seat with only own-work reads may read its own one card', () => {
    for (const kind of ['VENDOR', 'GSI', 'MSP', 'CLIENT', 'CONSULTANT_CORP', null]) {
      const door = desklessDoor({
        path: '/api/conversations/one-card', method: 'GET', contextType: 'EMPLOYEE',
        permissions: ['assignments.read', 'timesheets.read'], companyName: 'Tellisford', companyKind: kind,
      })
      expect(door.open, String(kind)).toBe(true)
    }
  })

  it('the one card is named by Ask Etyme itself, not borrowed from the Conversations link', () => {
    const { menu } = routesOpenToADesklessSeat()
    expect(menu).toContain('conversations/one-card')
    expect(menu.some((r) => r === 'conversations/one-card')).toBe(true)
    expect(routeMatches('/api/conversations/one-card', 'conversations/one-card')).toBe(true)
  })
})
