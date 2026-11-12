import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  needsVerifiedOwner, waitsForVerifiedOwner, proofStanding, mayBecomeOwner, needsDomainProof,
  GATED_ACT_WORDS, PROVE_OWNERSHIP_HREF, type GatedAct, type ProofFacts,
} from '@/lib/owner-proof'
import { rolesFor, isNarrowedAdmin, ADMIN_PERMISSIONS } from '@/lib/company-defaults'
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

  it('a new company’s first person can post a job, issue a bill and approve a week at once, at every kind of company', () => {
    for (const kind of ['CLIENT', 'VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP'] as const) {
      const admin = rolesFor(kind, { foundingAdmin: true }).find((r) => r.name === 'Admin')!
      for (const p of ['requirements.write', 'invoices.issue', 'timesheets.approve', 'team.manage', 'settings.manage']) {
        expect(admin.permissions, `${kind} ${p}`).toContain(p)
      }
      expect(admin.permissions, kind).not.toContain('pnl.read')
      expect(isNarrowedAdmin(admin.permissions), kind).toBe(false)
    }
    expect(read('src/lib/company-create.ts')).toContain('rolesFor(input.kind, { foundingAdmin: proofRule })')
  })

  it('the narrowed Admin, what an Owner gets by pressing Narrow Admin, holds no money or contract act', () => {
    for (const kind of ['CLIENT', 'VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP'] as const) {
      const admin = rolesFor(kind, { narrowAdmin: true }).find((r) => r.name === 'Admin')!
      expect(isNarrowedAdmin(admin.permissions), kind).toBe(true)
    }
  })

  it('the Admin role narrows to people and settings in the same transaction that seats the first verified Owner, and says so in the log', () => {
    const become = read('src/app/api/settings/owner-proof/become.ts')
    expect(become).toContain('narrowed = await narrowFoundingAdmin(tx, {')
    expect(become).toContain('firstVerification: !company.ownerVerifiedAt, underRule: company.ownerProofRequiredAt !== null')
    expect(become).toContain("data: { permissions: [...ADMIN_PERMISSIONS] }")
    expect(become).toContain("action: 'ADMIN_NARROWED'")
    expect(ADMIN_PERMISSIONS).toEqual(['team.manage', 'settings.manage', 'governance.read', 'privacy.manage'])
    // The Superadmin's record for a one-person firm goes through the same write.
    expect(read('src/app/api/superadmin/owner-proof/route.ts')).toContain('becomeOwner(')
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

describe('signing an agreement waits for a verified Owner', () => {
  it('the route that records a signature on an agreement reads the Owner gate before any write', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/app/api/program/agreements/[id]/sign/route.ts', 'utf8')
    const gate = src.indexOf("needsVerifiedOwnerAt(companyId, 'SIGN')")
    expect(gate).toBeGreaterThan(-1)
    expect(src).toMatch(/gateRefusal\(owner\)/)
    const firstWrite = src.search(/prisma\.\w+\.(update|create|upsert)|\$transaction/)
    expect(firstWrite === -1 || gate < firstWrite).toBe(true)
  })
})

describe('an Owner-only screen at a company with no verified Owner names Prove ownership, with its link', () => {
  it('beside an Owner act, a company waiting for a verified Owner is told the gate’s sentence and given the link, never "ask the Owner"', async () => {
    const { ownerOnlyLine } = await import('@/lib/owner-gate')
    for (const act of ['COMPANY_TYPE', 'SIGN_IN_MODE', 'BANK'] as const) {
      const line = ownerOnlyLine(GATED, act)
      expect(line.says).toBe((needsVerifiedOwner(GATED, act) as { says: string }).says)
      expect(line.says).toContain('Prove ownership under Setup → Prove ownership')
      expect(line.href).toBe(PROVE_OWNERSHIP_HREF)
      expect(line.linkSays).toBe('Prove ownership')
      expect(line.says).not.toMatch(/Ask the Owner/)
    }
  })

  it('at a company that has its Owner, the Owner-only sentence stands and there is no link', async () => {
    const { ownerOnlyLine } = await import('@/lib/owner-gate')
    const owned = { ownerProofRequiredAt: null, ownerVerifiedAt: null }
    expect(ownerOnlyLine(owned, 'COMPANY_TYPE')).toEqual({ says: 'Only the Owner changes the type. Ask the Owner if it is wrong.', href: null, linkSays: null })
    expect(ownerOnlyLine(owned, 'SIGN_IN_MODE').says).toBe('Only an Owner changes how people sign in.')
  })

  it('a gate refusal from a route is read with its link', async () => {
    const { refusalLine } = await import('@/lib/owner-gate')
    expect(refusalLine({ message: 'Changing bank details waits …', href: PROVE_OWNERSHIP_HREF, code: 'OWNER_NOT_VERIFIED' }))
      .toEqual({ says: 'Changing bank details waits …', href: PROVE_OWNERSHIP_HREF, linkSays: 'Prove ownership' })
    expect(refusalLine({ message: 'x', code: 'OWNER_NOT_VERIFIED' })?.href).toBe(PROVE_OWNERSHIP_HREF)
  })

  it('the words a screen reads carry no database, so a page can import them', () => {
    expect(read('src/lib/owner-gate.ts')).not.toMatch(/@\/lib\/db|@prisma\/client/)
  })

  it('Settings says the type line from the one helper, not its own words', () => {
    expect(read('src/app/api/settings/route.ts')).toContain("typeLine: mayChangeType || !company ? null : ownerOnlyLine(company, 'COMPANY_TYPE')")
    const page = read('src/app/dashboard/settings/page.tsx')
    expect(page).toContain('<OwnerGateLine line={data.typeLine}')
    expect(page).not.toContain('subtitle="Only the Owner changes the type. Ask the Owner if it is wrong."')
  })

  it('Settings → Sign-in says the gate’s sentence to an Admin, and a save there is refused in it before the Owner-only sentence', () => {
    for (const p of ['src/app/api/settings/sign-in/route.ts', 'src/app/api/settings/sign-in/overview/route.ts']) {
      expect(read(p)).toContain("ownerLine: roleName === 'Owner' ? null : await ownerOnlyLineAt(company.id, 'SIGN_IN_MODE')")
    }
    const gate = read('src/app/api/settings/sign-in/gate.ts')
    expect(gate.indexOf("needsVerifiedOwnerAt(caller.company.id, 'SIGN_IN_MODE')")).toBeLessThan(gate.indexOf('Only an Owner of ${caller.company.name} changes how its people sign in'))
    const page = read('src/app/dashboard/settings/sign-in/page.tsx')
    expect(page).toContain('<OwnerGateLine line={o.ownerLine')
    expect(page).not.toContain('You can read this page. Only an Owner changes how people sign in.')
  })

  it('Setup → Bank details says the gate before Save and keeps the link when the route refuses', () => {
    const route = read('src/app/api/settings/setup/[item]/route.ts')
    expect(route).toContain('return { ok: false, says: gate.says, href: gate.href }')
    expect(route).toContain('return refused(said.says, 422, said.href)')
    expect(read('src/app/api/settings/setup/read.ts')).toContain('waits: bankWaits')
    const items = read('src/app/dashboard/settings/setup/items.tsx')
    expect(items).toContain('<OwnerGateLine line={d.waits} />')
    expect(items).toContain("const line = body?.error?.href ? refusalLine(body.error) : null")
  })
})

describe('the small things the screen walk found on the proofs', () => {
  it('pressing Record twice on the Superadmin identity form writes one row and refuses the repeat in a sentence', async () => {
    const { alreadyRecordedSays } = await import('@/lib/owner-proof')
    expect(alreadyRecordedSays({ provider: 'Persona', reference: 'inq_42', checkedOn: new Date('2026-11-12T00:00:00Z'), personName: 'Colleen Byrne', companyName: 'Byrne Nursing' }))
      .toBe('Persona’s result for Colleen Byrne at Byrne Nursing, reference inq_42, Nov 12, 2026, is already recorded. Nothing was recorded twice.')
    const src = read('src/app/api/superadmin/owner-proof/route.ts')
    expect(src.indexOf('tx.ownerProof.findFirst({ where: same')).toBeLessThan(src.indexOf('tx.ownerProof.create({'))
    expect(src).toContain("{ isolationLevel: 'Serializable' }")
    expect(src).toContain("code: 'ALREADY_RECORDED', message: already } }, { status: 409 }")
  })

  it('a verified one-person firm’s Prove ownership says she is the Owner, since when, and on which provider’s result', async () => {
    const { verifiedOwnerSays } = await import('@/lib/owner-proof')
    const says = verifiedOwnerSays({
      companyName: 'Byrne Nursing', verifiedAt: new Date('2026-11-12T15:00:00Z'), readerIsOwner: true,
      person: { provider: 'Persona', reference: 'inq_42', checkedOn: new Date('2026-11-11T00:00:00Z'), result: 'Approved' },
    })
    expect(says).toBe('You are the Owner of Byrne Nursing since Nov 12, 2026, on Persona’s result, reference inq_42, Nov 11, 2026. Nothing is left to do here.')
    expect(says).not.toMatch(/Two proofs|Not answered yet|If you skip/)
  })

  it('once verified, Prove ownership draws no proofs list, stamp, skip warning or buttons', () => {
    expect(read('src/app/api/settings/owner-proof/route.ts')).toContain('doneSays: c.ownerVerifiedAt')
    const items = read('src/app/dashboard/settings/setup/items.tsx')
    expect(items).toContain("doneLine={proof?.doneSays ?? 'Reading who the Owner is…'}")
    expect(items).toContain('{doneLine == null ? w.sub : doneLine}')
    expect(items).toContain('{doneLine == null && <>')
  })

  it('the two doors on the sign-in screen stand the same height, the filled one carrying a border like the outlined one', () => {
    const frame = read('src/app/(auth)/door-frame.tsx')
    const login = read('src/app/(auth)/login/page.tsx')
    expect(frame).toMatch(/doorButton =\s*'w-full px-4 py-2\.5 rounded-lg border border-transparent/)
    expect(login).toMatch(/outlineButton =\s*'w-full px-4 py-2\.5 rounded-lg border /)
  })

  it('a reason typed with its own full stop is said with one stop, never two', async () => {
    const { clause, askSaysTo } = await import('@/lib/owner-rules')
    expect(clause('Left the firm.')).toBe('Left the firm')
    expect(clause('  Away on leave...  ')).toBe('Away on leave')
    expect(askSaysTo('ASKER', { kind: 'REMOVE', askerName: 'A', subjectName: 'B', companyName: 'Tapin', reason: 'Left the firm.', deciderNames: ['C'], youAreSubject: false }))
      .not.toContain('..')
  })
})
