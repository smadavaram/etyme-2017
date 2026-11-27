import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Plugin 5, supplier diversity (record 132): what the three new tables
 * must hold in the database, checked against the schema.
 */
const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
const model = (name: string) => {
  const m = schema.match(new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm'))
  expect(m, `model ${name} should exist`).not.toBeNull()
  return m![1]
}

describe('supplier diversity on the record (record 132)', () => {
  it('a certification is held, applied for, not held or lapsed, and nothing else', () => {
    const e = schema.match(/^enum CertificationStatus \{([\s\S]*?)^\}/m)![1].split(/\s+/).filter(Boolean)
    expect(e).toEqual(['NOT_HELD', 'APPLIED', 'HELD', 'LAPSED'])
  })

  it('a certification names MBE, WBE, 8(a), HUBZone or another kind the Owner names', () => {
    const e = schema.match(/^enum CertificationKind \{([\s\S]*?)^\}/m)![1].split(/\s+/).filter(Boolean)
    expect(e).toEqual(['MBE', 'WBE', 'EIGHT_A', 'HUBZONE', 'OTHER'])
    expect(model('SupplierCertification')).toMatch(/otherName\s+String\?/)
  })

  it('a certification keeps its certificate as a paper, its number, its dates and the person who set it', () => {
    const m = model('SupplierCertification')
    for (const col of ['documentId', 'number', 'issuedOn', 'expiresOn', 'setById', 'certifier']) expect(m).toContain(col)
  })

  it('an ownership attestation always says who attested it and when', () => {
    const m = model('OwnershipAttestation')
    expect(m).toMatch(/attestedById\s+String\n/)
    expect(m).toMatch(/attestedAt\s+DateTime\s+@default\(now\(\)\)/)
    expect(m).toMatch(/attested\s+Boolean/)
  })

  it('a portal registration records who submitted it on the portal and when, and starts as not started', () => {
    const m = model('DiversityRegistration')
    expect(m).toMatch(/submittedById\s+String\?/)
    expect(m).toMatch(/submittedAt\s+DateTime\?/)
    expect(m).toMatch(/status\s+RegistrationStatus\s+@default\(NOT_STARTED\)/)
  })

  it('a bid may name the certification it is set aside for, and an open bid names none', () => {
    expect(model('Proposal')).toMatch(/requiresCertification\s+CertificationKind\?/)
  })

  it('every foreign key on the three tables is indexed', () => {
    for (const [name, cols] of [['SupplierCertification', ['documentId', 'setById']], ['OwnershipAttestation', ['attestedById']], ['DiversityRegistration', ['createdById', 'submittedById']]] as const) {
      for (const c of cols) expect(model(name), `${name}.${c}`).toMatch(new RegExp(`@@index\\(\\[${c}\\]\\)`))
      expect(model(name)).toMatch(/@@index\(\[companyId/)
    }
  })

  it('the three tables are cleared by the seed rebuild before the paper and the firm they name', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/seed-rebuild.ts'), 'utf8')
    for (const t of ['SupplierCertification', 'OwnershipAttestation', 'DiversityRegistration']) expect(src).toContain(`'${t}'`)
    expect(src.indexOf("'SupplierCertification'")).toBeLessThan(src.indexOf("'DocInstance'"))
  })
})
