import { describe, it, expect } from 'vitest'
import { approverIsKnownAtClient } from '@/app/api/timesheets/approval-by-email'

/**
 * The person named as a client's approver on evidence must be somebody
 * at the client. Nothing stopped a worker naming their own address.
 */

const NORTHBEND = {
  name: 'Northbend Athletic',
  domain: 'northbend.example',
  aliases: ['northbend-athletic.example'],
  seatedEmails: ['marcus.oyelaran@demo.etyme.local', 'lorena.kellerman@demo.etyme.local'],
}

describe('whether an approver is known at the client', () => {
  it('an address at the client’s own domain is accepted', () => {
    expect(approverIsKnownAtClient({ approverEmail: 'dana.whitfield@northbend.example', client: NORTHBEND }))
      .toEqual({ ok: true, how: 'DOMAIN' })
  })

  it('an address at a subdomain of the client’s domain is accepted', () => {
    expect(approverIsKnownAtClient({ approverEmail: 'dana@us.northbend.example', client: NORTHBEND }).ok).toBe(true)
  })

  it('an address at one of the client’s saved aliases is accepted', () => {
    expect(approverIsKnownAtClient({ approverEmail: 'ops@northbend-athletic.example', client: NORTHBEND }))
      .toEqual({ ok: true, how: 'ALIAS' })
  })

  it('a person seated at the client is accepted whatever domain their address is on, as Marcus Oyelaran is in the seeded world', () => {
    expect(approverIsKnownAtClient({ approverEmail: 'Marcus.Oyelaran@Demo.Etyme.Local', client: NORTHBEND }))
      .toEqual({ ok: true, how: 'SEATED' })
  })

  it('a worker naming their own address as the client’s approver is refused in a sentence', () => {
    const v = approverIsKnownAtClient({ approverEmail: 'helena.marsh@gmail.com', client: NORTHBEND })
    expect(v.ok).toBe(false)
    if (v.ok) throw new Error('expected a refusal')
    expect(v.code).toBe('APPROVER_NOT_AT_CLIENT')
    expect(v.says).toContain('helena.marsh@gmail.com is not an address at Northbend Athletic')
    expect(v.says).toContain('@northbend.example')
  })

  it('a domain that merely ends in the client’s name is not the client’s domain', () => {
    expect(approverIsKnownAtClient({ approverEmail: 'x@notnorthbend.example', client: NORTHBEND }).ok).toBe(false)
  })

  it('a client recorded on a consumer mail domain does not let every address there approve for it', () => {
    const odd = { ...NORTHBEND, domain: 'gmail.com', aliases: ['yahoo.com'], seatedEmails: [] }
    expect(approverIsKnownAtClient({ approverEmail: 'anybody@gmail.com', client: odd }).ok).toBe(false)
    expect(approverIsKnownAtClient({ approverEmail: 'anybody@yahoo.com', client: odd }).ok).toBe(false)
  })

  it('a missing or malformed address is refused, asking for the approver’s address', () => {
    const v = approverIsKnownAtClient({ approverEmail: 'not-an-address', client: NORTHBEND })
    expect(v.ok).toBe(false)
    if (v.ok) throw new Error('expected a refusal')
    expect(v.says).toContain('Give the email address')
  })
})
