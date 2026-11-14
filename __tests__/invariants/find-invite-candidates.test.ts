import { describe, it, expect } from 'vitest'
import { plusMenuFor, reachablePagesFor, searchResultsFor } from '@/components/shell/header'
import { rolesFor } from '@/lib/company-defaults'

/**
 * Invite candidates is found from the header (Tapin's first week,
 * 2026-11-14): the + button offers it and the search box finds it under
 * "invite", for a seat whose route takes the send (POST
 * /api/consultants/invite asks what Add consultant asks,
 * consultants.write), and for nobody else.
 */

const role = (name: string) => rolesFor('VENDOR').find((r) => r.name === name)!.permissions
const labels = (menu: ReturnType<typeof plusMenuFor>) => menu.flatMap((s) => s.items.map((i) => i.label))

function searchFor(kind: 'VENDOR' | 'GSI' | 'MSP' | 'CLIENT', permissions: readonly string[], q: string) {
  const plus = plusMenuFor(kind, false, permissions, false)
  return searchResultsFor(q, reachablePagesFor(kind, false, { worker: false, permissions }), plus)
}

describe('Invite candidates is found from the header', () => {
  it('a supplier’s Owner, Recruiter and HR are offered Invite candidates on the + button, opening the invite box on Candidates', () => {
    for (const seat of ['Owner', 'Recruiter', 'HR']) {
      const menu = plusMenuFor('VENDOR', false, role(seat), false)
      const item = menu.flatMap((s) => s.items).find((i) => i.label === 'Invite candidates')
      expect(item, seat).toBeTruthy()
      expect(item!.href).toBe('/dashboard/consultants?invite=1')
    }
  })

  it('typing “invite” in the search box finds Invite candidates for a seat that may invite', () => {
    for (const seat of ['Owner', 'Recruiter']) {
      const found = searchFor('VENDOR', role(seat), 'invite')
      expect(found.map((r) => r.label), seat).toContain('Invite candidates')
      expect(found.find((r) => r.label === 'Invite candidates')!.href).toBe('/dashboard/consultants?invite=1')
    }
    expect(searchFor('VENDOR', role('Owner'), 'INVITE').map((r) => r.label)).toContain('Invite candidates')
  })

  it('a seat whose route would refuse the invitation is offered it by neither the + button nor the search box', () => {
    for (const seat of ['AP & Payroll', 'Accounts Receivable', 'Account Manager', 'Finance']) {
      expect(labels(plusMenuFor('VENDOR', false, role(seat), false)), seat).not.toContain('Invite candidates')
      expect(searchFor('VENDOR', role(seat), 'invite').map((r) => r.label), seat).not.toContain('Invite candidates')
    }
  })

  it('a party whose menu has no Candidates, an MSP or a client, is never offered Invite candidates', () => {
    for (const kind of ['MSP', 'CLIENT'] as const) {
      expect(labels(plusMenuFor(kind, false, ['*'], false)), kind).not.toContain('Invite candidates')
      expect(searchFor(kind, ['*'], 'invite').map((r) => r.label), kind).not.toContain('Invite candidates')
    }
  })

  it('the search box still finds the pages on the reader’s menu first, and an empty box finds nothing', () => {
    const found = searchFor('VENDOR', ['*'], 'cand')
    expect(found[0].type).toBe('page')
    expect(found.map((r) => r.label)).toContain('Candidates')
    expect(found.map((r) => r.label)).toContain('Invite candidates')
    expect(searchFor('VENDOR', ['*'], '  ')).toEqual([])
  })
})
