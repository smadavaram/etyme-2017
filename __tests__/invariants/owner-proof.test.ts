import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  needsVerifiedOwner, waitsForVerifiedOwner, proofStanding, mayBecomeOwner, needsDomainProof,
  GATED_ACT_WORDS, PROVE_OWNERSHIP_HREF, type GatedAct, type ProofFacts,
} from '@/lib/owner-proof'
import { rolesFor, isNarrowedAdmin } from '@/lib/company-defaults'
import { itemsFor, checklistFor, checkItemAnswer, itemHref, NO_FACTS } from '@/lib/setup-checklist'
import { ACTIONS } from '@/lib/autonomy'

/**
 * The first person is an Admin; Owner is earned by proof (founder,
 * 2026-11-11). Read as sentences: a new company's founder is seated as
 * Admin, the Owner's acts wait in one sentence naming the step, a company
 * formed before the rule is never gated, and Owner is earned by the
 * domain and the person (the person alone at a one-person firm).
 */

const read = (p: string) => readFileSync(p, 'utf8')
const GATED = { ownerProofRequiredAt: new Date('2026-11-12'), ownerVerifiedAt: null, name: 'Kestrel Works' }
const BEFORE = { ownerProofRequiredAt: null, ownerVerifiedAt: null, name: 'Brightmoor Staffing' }
const PROVEN = { ownerProofRequiredAt: new Date('2026-11-12'), ownerVerifiedAt: new Date('2026-11-13'), name: 'Kestrel Works' }

const facts = (over: Partial<ProofFacts> = {}): ProofFacts => ({ kind: 'VENDOR', dnsDomain: null, directory: null, person: null, ...over })
const checked = { provider: 'Persona', reference: 'inq_4471', checkedOn: new Date('2026-11-12'), result: 'approved' }

describe('the first person is an Admin', () => {
  it('a new company’s first person is seated as Admin, not Owner, at every sign-up door', () => {
    const create = read('src/lib/company-create.ts')
    expect(create).toContain("const firstRoleId = proofRule ? roles.find((r) => r.name === 'Admin')!.id : ownerRoleId")
    expect(create).toContain("seatedAs: ownerContextId ? (proofRule ? 'Admin' : 'Owner') : null")
    // The three doors: the password door, the first sign-in, Add company.
    expect(read('src/lib/password-door.ts')).toContain('ownerProofRequired: true')
    expect(read('src/app/api/onboarding/route.ts')).toContain('ownerProofRequired: true')
    expect(read('src/app/api/companies/route.ts')).toContain('ownerProofRequired: adding.ownsIt')
  })

  it('a company made by any other caller, the seeded and generated worlds and the staff tool, is made exactly as before', () => {
    expect(read('src/lib/company-create.ts')).toContain('const proofRule = input.ownerProofRequired === true')
    for (const f of ['src/lib/seed-world.ts', 'src/lib/staff-bootstrap.ts']) expect(read(f), f).not.toContain('ownerProofRequired')
    // The shipped roles are unchanged where the rule does not apply.
    expect(rolesFor('VENDOR')).toEqual(rolesFor('VENDOR', { narrowAdmin: false }))
  })

  it('the Admin a founder holds under the rule holds no money or contract act', () => {
    for (const kind of ['CLIENT', 'VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP'] as const) {
      const admin = rolesFor(kind, { narrowAdmin: true }).find((r) => r.name === 'Admin')!
      expect(isNarrowedAdmin(admin.permissions), kind).toBe(true)
    }
  })
})

describe('the Owner’s acts wait for a verified Owner', () => {
  it('each gated act is refused in one sentence naming the step until an Owner is verified', () => {
    for (const act of Object.keys(GATED_ACT_WORDS) as GatedAct[]) {
      const g = needsVerifiedOwner(GATED, act)
      expect(g, act).toEqual({
        ok: false,
        says: `${GATED_ACT_WORDS[act]} waits until Kestrel Works has a verified Owner. Prove ownership under Setup → Prove ownership.`,
        href: PROVE_OWNERSHIP_HREF,
        step: 'OWNERSHIP',
      })
    }
    expect(PROVE_OWNERSHIP_HREF).toBe(itemHref('OWNERSHIP'))
  })

  it('once the company has a verified Owner nothing waits', () => {
    for (const act of Object.keys(GATED_ACT_WORDS) as GatedAct[]) expect(needsVerifiedOwner(PROVEN, act)).toEqual({ ok: true })
  })

  it('an existing company formed before the rule is never gated, and its checklist reads as before', () => {
    expect(waitsForVerifiedOwner(BEFORE)).toBe(false)
    for (const act of Object.keys(GATED_ACT_WORDS) as GatedAct[]) expect(needsVerifiedOwner(BEFORE, act)).toEqual({ ok: true })
    expect(itemsFor('VENDOR')).not.toContain('OWNERSHIP')
    expect(checklistFor({ kind: 'VENDOR', record: {}, facts: NO_FACTS }).rows.map((r) => r.key)).not.toContain('OWNERSHIP')
    expect(checkItemAnswer('VENDOR', 'OWNERSHIP', 'SKIPPED')).toMatchObject({ ok: false })
  })

  it('the routes that do a gated act read the one gate before the act', () => {
    for (const [f, act] of [
      ['src/app/api/settings/kind.ts', 'COMPANY_TYPE'], ['src/app/api/settings/sign-in/route.ts', 'SIGN_IN_MODE'],
      ['src/app/api/settings/grants/route.ts', 'GIVE_ACCESS'], ['src/app/api/settings/remit-to/route.ts', 'BANK'],
      ['src/app/api/settings/setup/[item]/route.ts', 'BANK'], ['src/app/api/settings/owners/route.ts', 'PASS_OWNERSHIP'],
    ] as const) {
      expect(read(f), f).toContain(`needsVerifiedOwnerAt(`)
      expect(read(f), f).toContain(`'${act}')`)
    }
  })
})

describe('Owner is earned by the two proofs', () => {
  it('a company under the rule reads Prove ownership after its domain, and it is done only once an Owner is verified', () => {
    const list = itemsFor('VENDOR', { ownerProofRequired: true })
    expect(list.indexOf('OWNERSHIP')).toBe(list.indexOf('DOMAIN') + 1)
    const open = checklistFor({ kind: 'VENDOR', record: { OWNERSHIP: { outcome: 'SKIPPED', byId: 'p', at: '2026-11-12' } }, facts: { ...NO_FACTS, ownerProofRequired: true } })
    expect(open.owed).toContain('OWNERSHIP')
    const done = checklistFor({ kind: 'VENDOR', record: {}, facts: { ...NO_FACTS, ownerProofRequired: true, ownerVerified: true } })
    expect(done.owed).not.toContain('OWNERSHIP')
    expect(read('src/lib/setup-checklist-state.ts')).toContain("v.item === 'OWNERSHIP' && v.outcome === 'DONE' && c.ownerVerifiedAt === null")
  })

  it('Become Owner is refused without both proofs, and says which is still to come', () => {
    const base = { gate: GATED, seatRole: 'Admin', seatLive: true, liveOwners: 0, companyName: 'Kestrel Works' }
    expect(mayBecomeOwner({ ...base, standing: proofStanding(facts()) }))
      .toEqual({ ok: false, says: 'Both proofs first: the domain and your identity check are still to come.' })
    expect(mayBecomeOwner({ ...base, standing: proofStanding(facts({ dnsDomain: 'kestrelworks.com' })) }))
      .toEqual({ ok: false, says: 'Both proofs first: your identity check is still to come.' })
    expect(mayBecomeOwner({ ...base, standing: proofStanding(facts({ person: checked })) }))
      .toEqual({ ok: false, says: 'Both proofs first: the domain is still to come.' })
    expect(mayBecomeOwner({ ...base, standing: proofStanding(facts({ dnsDomain: 'kestrelworks.com', person: checked })) }))
      .toEqual({ ok: true, reseat: true })
  })

  it('a one-person firm becomes its Owner on the person proof alone', () => {
    expect(needsDomainProof('CONSULTANT_CORP')).toBe(false)
    const standing = proofStanding(facts({ kind: 'CONSULTANT_CORP', person: checked }))
    expect(standing.complete).toBe(true)
    expect(mayBecomeOwner({ gate: GATED, standing, seatRole: 'Admin', seatLive: true, liveOwners: 0, companyName: 'Diallo Nursing LLC' }))
      .toEqual({ ok: true, reseat: true })
  })

  it('the provider’s result is said word for word with its name, reference and date, never as Etyme’s verdict', () => {
    expect(proofStanding(facts({ person: checked })).person.says).toBe('Persona checked you on 2026-11-12, reference inq_4471: “approved”.')
  })

  it('a second person cannot become Owner by proof once the company has one, and an older company’s Owners are not reseated', () => {
    const standing = proofStanding(facts({ dnsDomain: 'kestrelworks.com', person: checked }))
    expect(mayBecomeOwner({ gate: GATED, standing, seatRole: 'Admin', seatLive: true, liveOwners: 1, companyName: 'Kestrel Works' }))
      .toEqual({ ok: false, says: 'Kestrel Works has a verified Owner. Ask them to add you from Settings → Owners.' })
    expect(mayBecomeOwner({ gate: BEFORE, standing, seatRole: 'Admin', seatLive: true, liveOwners: 1, companyName: 'Brightmoor Staffing' }).ok).toBe(false)
    expect(mayBecomeOwner({ gate: BEFORE, standing, seatRole: 'Owner', seatLive: true, liveOwners: 1, companyName: 'Brightmoor Staffing' }))
      .toEqual({ ok: true, reseat: false })
  })

  it('becoming the Owner and recording a provider’s result are each a person’s own act on the autonomy ladder', () => {
    for (const a of ['OWNER_VERIFIED', 'OWNER_PROOF_RECORDED']) {
      expect((ACTIONS as any)[a]?.kind, a).toBe('ATTRIBUTED')
    }
    expect(read('src/lib/access-log.ts')).toContain("| 'OWNER_PROOF_RECORD'")
  })
})
