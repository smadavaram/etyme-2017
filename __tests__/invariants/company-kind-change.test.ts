import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The founder's Tapin, on production, 2026-11-02: it signed up as "Own
 * company", a one-person firm, so its Owner read the seven-link
 * solopreneur menu and greeting and could not run a bench of hundreds,
 * and Settings had no way to change the type. Now the Owner changes it
 * there, and the change is refused only where work on the record
 * depends on the old type.
 */

// ── A database that answers the reads behind the change ───────────────

interface World {
  company: { id: string; name: string; kind: string; supplierPosture: string | null; siteWrittenBy: string | null }
  /** Whether the calling seat is the Owner's. */
  owner: boolean
  ownerName: string
  seats: { personId: string; name: string }[]
  ownWorkLines: { buyer: string; person: string }[]
  counts: Partial<Record<'othersWork' | 'benchAll' | 'benchOthers' | 'sellAll' | 'sellOthers' | 'openJobs' | 'linesAsClient' | 'seatsGranted' | 'linesAsPayer' | 'seatsHeld' | 'openSubmissions' | 'benchTurns', number>>
}

const writes: { update: any[]; log: any[]; upsert: any[] } = { update: [], log: [], upsert: [] }
let world: World

function count(key: keyof World['counts']) {
  return vi.fn(async () => world.counts[key] ?? 0)
}

vi.mock('@/lib/db', () => {
  const tx = {
    company: { update: vi.fn(async (a: any) => { writes.update.push(a); return {} }) },
    automationLog: { create: vi.fn(async (a: any) => { writes.log.push(a); return {} }) },
    consultantProfile: { upsert: vi.fn(async (a: any) => { writes.upsert.push(a); return {} }) },
  }
  const prisma = {
    company: { findUnique: vi.fn(async () => world.company) },
    context: {
      findFirst: vi.fn(async (a: any) => {
        // The Owner check names the caller's seat; the Owner's name does not.
        if (a.where.id) return world.owner ? { id: a.where.id } : null
        return { person: { name: world.ownerName } }
      }),
      findMany: vi.fn(async () => world.seats.map((s) => ({ personId: s.personId, person: { name: s.name } }))),
    },
    buyContract: {
      findMany: vi.fn(async () => world.ownWorkLines.map((l) => ({ company: { name: l.buyer }, candidates: [{ person: { name: l.person } }] }))),
      count: vi.fn(async (a: any) => (a.where.vendorCompanyId ? world.counts.othersWork ?? 0 : world.counts.linesAsPayer ?? 0)),
    },
    benchListing: { count: vi.fn(async (a: any) => (a.where.consultant ? world.counts.benchOthers ?? 0 : world.counts.benchAll ?? 0)) },
    sellContract: {
      count: vi.fn(async (a: any) =>
        a.where.clientCompanyId ? world.counts.linesAsClient ?? 0 : a.where.personId ? world.counts.sellOthers ?? 0 : world.counts.sellAll ?? 0),
    },
    requirement: { count: count('openJobs') },
    programSeat: { count: vi.fn(async (a: any) => (a.where.clientCompanyId ? world.counts.seatsGranted ?? 0 : world.counts.seatsHeld ?? 0)) },
    submission: { count: count('openSubmissions') },
    benchHolidaySwitch: { count: count('benchTurns') },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  }
  return { prisma }
})

const rolesAdded = vi.fn(async () => ({ added: ['Recruiter', 'Account Manager', 'AP & Payroll'], renamed: [], granted: [], revoked: [] }))
vi.mock('@/lib/company-roles', () => ({ ensureDefaultRoles: (...a: unknown[]) => (rolesAdded as any)(...a) }))

import { changeCompanyKind } from '@/app/api/settings/kind'
import { KIND_CHOICES, choiceByKey, choiceOf, kindChangeVerdict, NO_KIND_FACTS } from '@/lib/company-kind'
import { getNavForKind, offersYouHat } from '@/lib/nav-table'
import { partyOf, questionsFor } from '@/app/api/conversations/twin/ask'
import { firstActFor } from '@/app/api/conversations/twin/first-act'
import { checklistFor, itemsFor, NO_FACTS } from '@/lib/setup-checklist'

const TAPIN = { id: 'tapin', name: 'Tapin', kind: 'CONSULTANT_CORP', supplierPosture: null, siteWrittenBy: 'RULES' }
const SHARATH = { id: 'p-sharath', name: 'Sharath Madavaram' }
const NOW = new Date('2026-11-02T21:00:00Z')

function tapin(over: Partial<World> = {}): World {
  return { company: { ...TAPIN }, owner: true, ownerName: SHARATH.name, seats: [{ personId: SHARATH.id, name: SHARATH.name }], ownWorkLines: [], counts: {}, ...over }
}

function change(type: string, as: { id: string; name: string } = SHARATH) {
  return changeCompanyKind({ companyId: 'tapin', contextId: 'ctx-1', person: as, type, now: NOW })
}

const labels = (kind: string, worker = false) => getNavForKind(kind as any, false, { permissions: ['*'], worker }).map((s) => s.label)

beforeEach(() => {
  writes.update = []; writes.log = []; writes.upsert = []
  rolesAdded.mockClear()
})

describe('the Owner changes what kind of company it is', () => {
  it('the Owner of a one-person firm turns it into a bench vendor from Settings, and reads a bench firm’s ten links and greeting on the next screen', async () => {
    world = tapin()
    // Before: the solopreneur's seven links and her own four questions.
    expect(labels('CONSULTANT_CORP')).toEqual(['Ask Etyme', 'Your work', 'Timesheets', 'Bills', 'Contracts', 'Paperwork', 'Settings'])
    expect(partyOf({ companyKind: 'CONSULTANT_CORP' })).toBe('SOLO')

    const r = await change('bench')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(writes.update[0].data).toMatchObject({ kind: 'VENDOR', supplierPosture: 'BENCH' })
    expect(r.message).toMatch(/^Tapin is now a sub-vendor or bench supplier\. Your menu, Ask Etyme and the setup checklist follow it from the next screen/)
    expect(r.message).toContain('3 roles were added for the work a sub-vendor or bench supplier does: Recruiter, Account Manager and AP & Payroll.')

    // After: every menu, greeting and chip reads the kind on each request,
    // so the next screen is a bench firm's.
    expect(labels(r.kind)).toEqual(['Ask Etyme', 'Today', 'Jobs', 'Submissions', 'Contracts', 'Timesheets', 'Bills', 'Candidates', 'Companies', 'Settings'])
    const party = partyOf({ companyKind: r.kind })
    expect(party).toBe('FIRM')
    expect(questionsFor(party, ['*'], r.kind)).toContain('Who is on the bench?')
    expect(firstActFor({ party, companyKind: r.kind, bench: r.supplierPosture === 'BENCH', linked: true, benchPeople: 0 })?.says)
      .toBe('Add the people on your bench and ask each to say yes. Jobs from the firms you sell to land here.')
    // Her own pages stay hers: the Owner with a page of their own is offered the You hat.
    expect(offersYouHat(r.kind as any, false, { worker: true })).toBe(true)
    expect(labels(r.kind, true)).not.toContain('You')
  })

  it('nobody but the Owner changes what kind of company it is', async () => {
    world = tapin({ owner: false })
    const r = await change('bench', { id: 'p-admin', name: 'Oliver Grant' })
    expect(r).toEqual({ ok: false, status: 403, field: 'type', message: 'Only the Owner of Tapin, Sharath Madavaram, changes what kind of company it is.' })
    expect(writes.update).toHaveLength(0)
    expect(rolesAdded).not.toHaveBeenCalled()

    // The route asks before its settings gate, so an Admin who may change
    // everything else is told whose this is, not that a permission is missing.
    const route = readFileSync(join(process.cwd(), 'src/app/api/settings/route.ts'), 'utf8')
    const patch = route.slice(route.indexOf('export async function PATCH'))
    expect(patch.indexOf("'type' in body")).toBeGreaterThan(0)
    expect(patch.indexOf("'type' in body")).toBeLessThan(patch.indexOf("hasPermission(caller.permissions, 'settings.manage')"))
    expect(patch).toContain('Change the type of company on its own, then the rest.')
  })

  it('a change of kind is recorded with who and when and loses no answer already given', async () => {
    world = tapin()
    const r = await change('prime')
    expect(r.ok).toBe(true)
    // Who and when, on the company, and the change itself on the log.
    const data = writes.update[0].data
    expect(data).toMatchObject({ kind: 'VENDOR', supplierPosture: 'PRIME', kindSetById: SHARATH.id, kindSetAt: NOW })
    expect(writes.log[0].data).toMatchObject({
      companyId: 'tapin',
      action: 'COMPANY_TYPE_CHANGED',
      summary: 'Sharath Madavaram changed Tapin from a solopreneur to a prime vendor',
      payload: { from: { kind: 'CONSULTANT_CORP', supplierPosture: null }, to: { kind: 'VENDOR', supplierPosture: 'PRIME' }, byPersonId: SHARATH.id },
    })
    // Nothing anybody answered is written over: only the type, who and
    // when, and the page's words the rules wrote (never a person's).
    expect(Object.keys(data).sort()).toEqual(['kind', 'kindSetAt', 'kindSetById', 'siteIntro', 'siteTagline', 'supplierPosture'])
    // Roles are added, never taken away.
    expect(rolesAdded).toHaveBeenCalledWith('tapin', 'VENDOR')
    // The setup checklist keeps every answer and gains the items a firm has.
    const record = { COMPANY: { outcome: 'DONE' as const, byId: SHARATH.id, at: '2026-10-29T00:00:00Z' }, BANK: { outcome: 'SKIPPED' as const, byId: SHARATH.id, at: '2026-10-29T00:00:00Z' } }
    const before = checklistFor({ kind: 'CONSULTANT_CORP', record, facts: NO_FACTS })
    const after = checklistFor({ kind: 'VENDOR', record, facts: NO_FACTS })
    for (const row of before.rows) expect(after.rows.find((a) => a.key === row.key)?.state).toBe(row.state)
    expect(itemsFor('VENDOR').filter((k) => !itemsFor('CONSULTANT_CORP').includes(k))).toEqual(expect.arrayContaining(['TEAM', 'SITES', 'PEOPLE_IN_CHARGE', 'DOMAIN']))
  })

  it('words a person wrote on the company’s page stay when the type changes', async () => {
    world = tapin({ company: { ...TAPIN, siteWrittenBy: 'PERSON' } })
    await change('bench')
    expect(writes.update[0].data).not.toHaveProperty('siteTagline')
  })

  it('becoming a one-person firm records the firm as the Owner’s own company, as sign-up does', async () => {
    world = tapin({ company: { ...TAPIN, kind: 'VENDOR', supplierPosture: 'BENCH' } })
    const r = await change('solo')
    expect(r.ok).toBe(true)
    expect(writes.upsert[0]).toMatchObject({ where: { personId: SHARATH.id }, update: { ownCompanyId: 'tapin' } })
  })
})

describe('a change of type is refused only where work on the record depends on the old one', () => {
  it('a one-person firm whose own person works on a running line through it keeps its type until that line ends, and is told which', async () => {
    world = tapin({ ownWorkLines: [{ buyer: 'Halcyon Talent', person: 'Colleen Byrne' }], company: { ...TAPIN, name: 'Byrne Critical Care LLC' } })
    const r = await change('bench')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(409)
    expect(r.message).toBe(
      'Halcyon Talent pays Byrne Critical Care LLC for Colleen Byrne’s own work on a running line, and that line asks for papers as from ' +
        'Colleen Byrne’s own company. As a sub-vendor or bench supplier, Byrne Critical Care LLC would be asked a supplier’s papers instead, ' +
        'an agreement and good standing, in the middle of the work. Change the type once that line ends.'
    )
    expect(writes.update).toHaveLength(0)
  })

  it('a line paying the firm for somebody else’s work does not hold the change, and the screen says its papers change', async () => {
    world = tapin({ counts: { othersWork: 2, benchTurns: 1 } })
    const r = await change('bench')
    expect(r.ok && r.message).toContain('2 lines other firms pay you on now ask for a supplier’s papers, not an own company’s.')
  })

  it('a firm with other people on its record cannot become a one-person firm', () => {
    const v = kindChangeVerdict({
      firm: 'Brightmoor Staffing', from: { kind: 'VENDOR', posture: 'PRIME' }, to: choiceByKey('solo')!, isOwner: true,
      facts: { ...NO_KIND_FACTS, otherSeats: ['Marisa Delacroix', 'Imelda Santoro'], benchListings: { all: 4, others: 4 } },
    })
    expect(v).toEqual({
      ok: false, status: 409,
      says: 'A one-person firm is one person, and Marisa Delacroix and Imelda Santoro hold seats here and 4 people are on your bench. Keep Brightmoor Staffing as it is, or end that work first.',
    })
  })

  it('a client with open job requests stays a client, and a firm that sells cannot become one', () => {
    const leaving = kindChangeVerdict({
      firm: 'Northbend Athletic', from: { kind: 'CLIENT', posture: null }, to: choiceByKey('prime')!, isOwner: true,
      facts: { ...NO_KIND_FACTS, openJobs: 3, linesAsClient: 7 },
    })
    expect(leaving.ok === false && leaving.says).toBe('Northbend Athletic is a client on the record: 3 job requests are still open and 7 contractors are on site. A client keeps its type while that work is open.')
    const joining = kindChangeVerdict({
      firm: 'Tapin', from: { kind: 'VENDOR', posture: 'BENCH' }, to: choiceByKey('client')!, isOwner: true,
      facts: { ...NO_KIND_FACTS, sellLines: { all: 1, others: 1 } },
    })
    expect(joining.ok === false && joining.says).toBe('A client buys and never sells, and Tapin bills 1 running line. Change the type once that work ends.')
  })

  it('an MSP holding a seat in a client’s program gives it back before it changes type, and a firm that places people cannot become one', () => {
    const leaving = kindChangeVerdict({
      firm: 'Aptiva Workforce', from: { kind: 'MSP', posture: null }, to: choiceByKey('prime')!, isOwner: true, facts: { ...NO_KIND_FACTS, seatsHeld: 1 },
    })
    expect(leaving.ok === false && leaving.says).toBe('Aptiva Workforce holds 1 seat in a client’s program as its MSP. Give the seat back first, then change the type.')
    const joining = kindChangeVerdict({
      firm: 'Tapin', from: { kind: 'VENDOR', posture: 'BENCH' }, to: choiceByKey('msp')!, isOwner: true, facts: { ...NO_KIND_FACTS, benchListings: { all: 3, others: 3 } },
    })
    expect(joining.ok === false && joining.says).toBe('An MSP places nobody and pays nobody, and has 3 people on its bench. Change the type once that work ends.')
  })

  it('a change between supplier types with nothing depending on it goes through', () => {
    for (const [from, to] of [[['VENDOR', 'PRIME'], 'bench'], [['VENDOR', 'BENCH'], 'gsi'], [['GSI', 'PRIME'], 'prime']] as const) {
      expect(kindChangeVerdict({ firm: 'Tapin', from: { kind: from[0], posture: from[1] }, to: choiceByKey(to)!, isOwner: true, facts: NO_KIND_FACTS })).toEqual({ ok: true })
    }
  })

  it('choosing the type it already is changes nothing and says so', async () => {
    world = tapin({ company: { ...TAPIN, kind: 'VENDOR', supplierPosture: 'BENCH' } })
    const r = await change('sub')
    expect(r).toEqual({ ok: false, status: 422, field: 'type', message: 'Tapin is already a sub-vendor or bench supplier.' })
  })
})

describe('the choices are sign-up’s own', () => {
  it('sub-vendor and bench supplier are one choice, because the record stores them the same way', () => {
    expect(KIND_CHOICES.map((c) => c.label)).toEqual([
      'Client (hiring managers)', 'MSP', 'Integrator (project delivery)', 'Prime vendor', 'Sub-vendor or bench supplier', 'Solopreneur',
    ])
    expect(choiceByKey('sub')).toBe(choiceByKey('bench'))
    expect(choiceOf('VENDOR', 'BENCH')?.keys).toEqual(['sub', 'bench'])
    // An integrator is an integrator whatever its posture says.
    expect(choiceOf('GSI', null)?.key).toBe('gsi')
  })

  it('a type nobody offers is refused with the choices in words', async () => {
    world = tapin()
    const r = await change('VENDOR')
    expect(r.ok === false && r.message).toBe(
      'Choose what kind of company Tapin is: Client (hiring managers), MSP, Integrator (project delivery), Prime vendor, Sub-vendor or bench supplier, Solopreneur.'
    )
  })
})
