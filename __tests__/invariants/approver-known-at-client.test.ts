import { describe, it, expect } from 'vitest'
import { approverIsKnownAtClient, offPlatformApprovalWords, restsOnSupplierRecord } from '@/app/api/timesheets/approval-by-email'

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

/**
 * A client that is not on Etyme: a record its supplier listed, nobody has
 * claimed it, so it has no domain, no aliases and no seats. Day one for a
 * supplier whose client is not on Etyme.
 */
const ACME_OFF_PLATFORM = {
  name: 'Acme',
  domain: null,
  aliases: [],
  seatedEmails: [],
  offPlatform: true,
  recordedContacts: ['Dana@Acme.example'],
}

describe('whether an approver is known at a client that is not on Etyme', () => {
  it('a supplier whose client is not on Etyme sends the approval link to the person it recorded for that client, and the signature says the client was not on Etyme', () => {
    const v = approverIsKnownAtClient({ approverEmail: 'dana@acme.example', client: ACME_OFF_PLATFORM })
    expect(v).toEqual({ ok: true, how: 'RECORDED_CONTACT' })
    if (!v.ok) throw new Error('expected the recorded contact to be accepted')
    expect(restsOnSupplierRecord(v.how)).toBe(true)
    expect(offPlatformApprovalWords({ approverName: ' Dana Whitfield ', approverEmail: 'Dana@Acme.example', clientName: 'Acme' }))
      .toBe('Approved by email: Dana Whitfield, dana@acme.example — Acme was not on Etyme')
  })

  it('somebody else at the recorded person’s company domain may be named, and the client’s own reasons never rest on the supplier’s record', () => {
    expect(approverIsKnownAtClient({ approverEmail: 'raj.patel@ops.acme.example', client: ACME_OFF_PLATFORM }))
      .toEqual({ ok: true, how: 'RECORDED_DOMAIN' })
    expect(restsOnSupplierRecord('DOMAIN')).toBe(false)
    expect(restsOnSupplierRecord('SEATED')).toBe(false)
  })

  it('an address the supplier never recorded for an off-platform client is still refused', () => {
    const v = approverIsKnownAtClient({ approverEmail: 'dana@acme-billing.example', client: ACME_OFF_PLATFORM })
    expect(v.ok).toBe(false)
    if (v.ok) throw new Error('expected a refusal')
    expect(v.code).toBe('APPROVER_NOT_AT_CLIENT')
    expect(v.says).toContain('dana@acme-billing.example is not an address recorded for Acme, which is not on Etyme')
    expect(v.says).toContain('@acme.example')
  })

  it('a worker naming their own address for an off-platform client is still refused', () => {
    expect(approverIsKnownAtClient({ approverEmail: 'helena.marsh@gmail.com', client: ACME_OFF_PLATFORM }).ok).toBe(false)
  })

  it('a recorded consumer address lets that one person approve and nobody else on that provider', () => {
    const solo = { ...ACME_OFF_PLATFORM, recordedContacts: ['owner.acme@gmail.com'] }
    expect(approverIsKnownAtClient({ approverEmail: 'owner.acme@gmail.com', client: solo }))
      .toEqual({ ok: true, how: 'RECORDED_CONTACT' })
    expect(approverIsKnownAtClient({ approverEmail: 'helena.marsh@gmail.com', client: solo }).ok).toBe(false)
  })

  it('an off-platform client with no address recorded refuses every approver and says the address has to be recorded first', () => {
    const v = approverIsKnownAtClient({ approverEmail: 'dana@acme.example', client: { ...ACME_OFF_PLATFORM, recordedContacts: [] } })
    expect(v.ok).toBe(false)
    if (v.ok) throw new Error('expected a refusal')
    expect(v.says).toContain('Acme is not on Etyme and no address is recorded for it')
  })

  it('once the client claims its record, its own domain and seats decide, as before', () => {
    const claimed = { ...ACME_OFF_PLATFORM, offPlatform: false, domain: 'acme-group.example', seatedEmails: ['lee@acme-group.example'] }
    expect(approverIsKnownAtClient({ approverEmail: 'dana@acme.example', client: claimed }).ok).toBe(false)
    expect(approverIsKnownAtClient({ approverEmail: 'pat@acme-group.example', client: claimed }))
      .toEqual({ ok: true, how: 'DOMAIN' })
  })
})
