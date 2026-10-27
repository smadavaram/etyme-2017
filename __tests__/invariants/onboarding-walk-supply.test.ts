import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  addPath, addRefusalSays, askedExistingSays, afterYes, isStaffSeat,
  firmsToOffer, noFirmByThatNameSays, rosterSummary, type RosterPerson,
} from '@/lib/consultant-portfolio'
import { checkFlagWithoutLine, releaseFrom, noLineSays, ourBenchRow, hrNotice, personNotice } from '@/lib/internal-moves'

/**
 * Onboarding fix wave from the release walk (2026-10-27), supply's parts.
 * Every name is the walk's: Maya Brooks signed up herself; Ike Danso
 * said yes for 60 days with no account.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const day = (s: string) => new Date(`${s}T00:00:00Z`)

describe('1 · a firm asks somebody who already has an account, never makes a second record', () => {
  it('a firm asks a person who already has an account onto its bench with the same yes, and never makes a second record of her', () => {
    expect(addPath({ profileExists: true, listing: null })).toBe('ASK_EXISTING')
    expect(addRefusalSays('ASK_EXISTING', 'Maya Brooks', 'Brightmoor Staffing')).toBeNull()
    const route = read('src/app/api/consultants/route.ts')
    // The existing record is read before anything is made, and the ask is
    // the bench's own invitation on it.
    expect(route.indexOf('askExisting({')).toBeLessThan(route.indexOf('tx.person.create'))
    const ask = route.slice(route.indexOf('async function askExisting'))
    expect(ask).toContain('...invitation(new Date())')
    expect(ask).toContain("action: 'BENCH_LISTING_REQUESTED'")
    expect(ask).toContain('requestedBy: caller.person.id')
    expect(ask).not.toContain('consultantProfile.create')
    expect(ask).not.toContain('person.create')
    expect(ask).not.toContain('context.create')
    expect(route).not.toContain('A consultant profile already exists for this person')
  })

  it('somebody nobody has a profile for is made once, as before, and asked', () => {
    expect(addPath({ profileExists: false, listing: null })).toBe('NEW')
  })

  it('asking somebody the firm already asked, or who already said yes, is refused in a sentence that names them, and sends nothing', () => {
    expect(addPath({ profileExists: true, listing: { state: 'INVITED', revokedAt: null } })).toBe('ALREADY_ASKED')
    expect(addPath({ profileExists: true, listing: { state: 'GRANTED', revokedAt: null } })).toBe('ALREADY_ON')
    expect(addRefusalSays('ALREADY_ASKED', 'Maya Brooks', 'Brightmoor Staffing'))
      .toBe('Brightmoor Staffing already asked Maya Brooks and is waiting on the answer. Nothing new was sent; the invitation can be sent again from Bench.')
    expect(addRefusalSays('ALREADY_ON', 'Maya Brooks', 'Brightmoor Staffing'))
      .toBe('Maya Brooks is already on Brightmoor Staffing’s bench. Nothing was sent.')
  })

  it('a person who said no is not asked again, because the invitation promised a no is the end of it', () => {
    expect(addPath({ profileExists: true, listing: { state: 'DECLINED', revokedAt: null } })).toBe('SAID_NO')
    expect(addRefusalSays('SAID_NO', 'Maya Brooks', 'Brightmoor Staffing')).toContain('a no is the end of it')
  })

  it('a person who took a listing back is asked afresh, never quietly restored', () => {
    expect(addPath({ profileExists: true, listing: { state: 'GRANTED', revokedAt: day('2026-10-01') } })).toBe('ASK_AGAIN')
    expect(askedExistingSays({ name: 'Maya Brooks', firm: 'Brightmoor Staffing', emailed: true, again: true }))
      .toBe('Brightmoor Staffing asked Maya Brooks onto its bench again, on the record they already have. The invitation went by email. Nothing reaches past Brightmoor Staffing until Maya Brooks says yes.')
  })

  it('the firm reads what adding them did, in a sentence with no pronoun the record does not hold', () => {
    const says = askedExistingSays({ name: 'Maya Brooks', firm: 'Brightmoor Staffing', emailed: false, again: false })
    expect(says).toBe('Maya Brooks already has an account, so Brightmoor Staffing asked them onto its bench, on the record they already have. The invitation is recorded; it can be sent from Bench. Nothing reaches past Brightmoor Staffing until Maya Brooks says yes.')
    expect(says).not.toMatch(/\b(she|her|he|his)\b/)
  })
})

describe('2 · after a yes there is a way onward', () => {
  it('after a yes, a person with no account is offered her own page in one click', () => {
    const next = afterYes({ firm: 'Techpeple', email: 'ike.danso@example.com', hasAccount: false })
    expect(next.label).toBe('Make your own page')
    expect(next.href).toBe('/signup?as=candidate&email=ike.danso%40example.com')
    expect(next.next).toContain('You need no account for that.')
  })

  it('after a yes, a person who already has an account is sent to sign in, not to sign up again', () => {
    const next = afterYes({ firm: 'Techpeple', email: 'maya@example.com', hasAccount: true })
    expect(next.label).toBe('Sign in to your page')
    expect(next.href).toBe('/login')
  })
})

describe('3 · staff are not roster', () => {
  const owner = { permissions: ['*'], listed: false, lines: [] }
  const line = { live: true, startsOn: day('2026-09-01'), endsOn: day('2026-12-31'), clientName: 'Northbend Athletic' }

  it('a firm’s owner and managers are never counted on its payroll or its bench unless the work says so', () => {
    expect(isStaffSeat(owner)).toBe(true)
    expect(isStaffSeat({ permissions: ['assignments.write', 'consultants.read'], listed: false, lines: [] })).toBe(true)
    // A delivery manager on a placement is on the roster: the work says so.
    expect(isStaffSeat({ permissions: ['assignments.write'], listed: false, lines: [line] })).toBe(false)
    // And one who granted the firm a listing is on its bench by their own yes.
    expect(isStaffSeat({ permissions: ['*'], listed: true, lines: [] })).toBe(false)
    const route = read('src/app/api/bench/route.ts')
    expect(route).toContain('.filter((r) => !isStaffSeat({ permissions: deskOf.get(r.personId) ?? [], listed: r.listed, lines: r.lines }))')
    expect(route.indexOf('isStaffSeat({')).toBeLessThan(route.indexOf('const summary = rosterSummary(rows, now)'))
  })

  it('an employee whose seat only reads their own work stays on the roster with no contract yet', () => {
    expect(isStaffSeat({ permissions: ['assignments.read', 'timesheets.read'], listed: false, lines: [] })).toBe(false)
    expect(isStaffSeat({ permissions: [], listed: false, lines: [] })).toBe(false)
  })

  it('a bench firm whose only seat is its owner reads nobody on its payroll', () => {
    const rows: RosterPerson[] = []
    expect(rosterSummary(rows, day('2026-10-27')).says).toMatch(/^Nobody is on your payroll here yet\./)
  })
})

describe('4 · a roll-off with no project line', () => {
  const base = {
    personName: 'Rahul Deshpande', firmName: 'Teleworld Solutions',
    rollsOffOn: day('2026-11-14'), keepUntil: null, today: day('2026-10-27'),
    manages: true, employed: true,
  }

  it('a delivery manager flags an employee as rolling off even where no project line is recorded yet', () => {
    const v = checkFlagWithoutLine(base)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.says).toBe('Rahul Deshpande comes off on Nov 14, 2026: no project line, free from Nov 15, 2026.')
      expect(v.freeOn.toISOString().slice(0, 10)).toBe('2026-11-15')
    }
  })

  it('kept with a manager, they read as free from the keep date itself', () => {
    const v = checkFlagWithoutLine({ ...base, keepUntil: day('2026-11-30') })
    expect(v.ok && v.freeOn.toISOString().slice(0, 10)).toBe('2026-11-30')
  })

  it('a day already past, a keep date before the roll-off, a seat that manages nothing and somebody the firm does not employ are each refused in a sentence', () => {
    expect(checkFlagWithoutLine({ ...base, rollsOffOn: day('2026-10-20') })).toMatchObject({ ok: false, code: 'IN_THE_PAST' })
    expect(checkFlagWithoutLine({ ...base, keepUntil: day('2026-11-01') })).toMatchObject({ ok: false, code: 'KEEP_BEFORE_ROLLOFF' })
    const hr = checkFlagWithoutLine({ ...base, manages: false })
    expect(hr.ok === false && hr.message).toBe('Flagging who comes off a project is for a delivery or project manager at Teleworld Solutions. HR is told; it does not flag.')
    expect(checkFlagWithoutLine({ ...base, employed: false })).toMatchObject({ ok: false, code: 'NOT_YOUR_PROJECT' })
  })
})

describe('5 · clients a worker will not be sent to', () => {
  it('a worker can name a client she will not be sent to', () => {
    const page = read('src/app/dashboard/my-benches/page.tsx')
    expect(page).toContain('Name a client you will not be sent to.')
    expect(page).toContain("send({ doNotSubmitTo: notPick, note })")
    expect(page).toContain("send({ doNotSubmitName: notName, note })")
    expect(page).toContain('placeholder="Your reason (only you see it)"')
    const route = read('src/app/api/me/benches/route.ts')
    expect(route).toContain("typeof body.doNotSubmitName === 'string'")
    expect(route).toContain("name: { equals: name, mode: 'insensitive' }")
  })

  it('the clients on their own record are offered first, each once, by name, less the ones already listed', () => {
    const offered = firmsToOffer(
      [
        { id: 'nb', name: 'Northbend Athletic' }, { id: 'cg', name: 'Cavanaugh Glassworks' },
        { id: 'nb', name: 'Northbend Athletic' }, { id: 'tm', name: 'Talvern Medical' },
      ],
      ['tm']
    )
    expect(offered).toEqual([{ id: 'cg', name: 'Cavanaugh Glassworks' }, { id: 'nb', name: 'Northbend Athletic' }])
  })

  it('a name that matches no company on Etyme is answered honestly, and nothing is stored', () => {
    expect(noFirmByThatNameSays(' Halvard Freight ')).toBe(
      'No company called Halvard Freight is on Etyme, so no firm can send you there through Etyme. Nothing was saved. If they join, name them again here.'
    )
  })
})

describe('6 · Your paperwork has an add button', () => {
  it('a worker adds her own license or certificate from Your paperwork', () => {
    const page = read('src/app/dashboard/my-work/paperwork/page.tsx')
    const code = page.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).toContain("import { OwnPapers } from '../../documents/own-papers'")
    expect(code).toContain('<OwnPapers about="ME" heading="Your own papers" />')
  })
})

describe('7 · a roll-off with no project line, read everywhere', () => {
  const ROUTES = [
    'src/app/api/bench/ours/flag/route.ts',
    'src/app/api/bench/ours/holds/route.ts',
    'src/app/api/bench/ours/holds/[id]/place/route.ts',
    'src/app/api/bench/ours/releases/[id]/confirm/route.ts',
    'src/app/api/me/work/route.ts',
  ]

  it('every read of a roll-off’s project line survives a release with none', () => {
    expect(releaseFrom(null)).toEqual({ client: null, city: null })
    expect(releaseFrom(undefined)).toEqual({ client: null, city: null })
    expect(releaseFrom({ clientCompany: { name: 'Teleworld Client' }, endClientCompany: { name: 'Corveldt Aerospace' }, workLocation: null, requirement: { location: 'Portland, Oregon' } }))
      .toEqual({ client: 'Corveldt Aerospace', city: 'Portland' })
    for (const f of ROUTES) {
      const src = read(f)
      // No route reaches through a release's line without the null-safe reader.
      expect(src, f).not.toMatch(/\b(r|sc|releaser\?|release|h\.release)\.sellContract\.(clientCompany|endClientCompany|workLocation|requirement)/)
      expect(src, f).not.toMatch(/const sc = release\.sellContract/)
    }
    const place = read('src/app/api/bench/ours/holds/[id]/place/route.ts')
    expect(place).toContain('release?.sellContractId ? await prisma.sellContract.findUnique({')
  })

  it('a release with no line reads "no project line, free from <date>" on Our bench', () => {
    const row = ourBenchRow({
      personId: 'p', name: 'Rahul Deshpande', seat: null, skills: [], place: null,
      release: { id: 'r', rollsOffOn: day('2026-11-14'), keepUntil: null, confirmedAt: null, releaserId: 'm', releaserName: 'Ingrid Solberg', lineless: true },
      current: null, mayNameProject: true, lastEnded: null, hold: null, moving: null, today: day('2026-10-27'),
    }, { personId: 'm', as: 'MANAGER' })
    expect(row.says).toBe('Comes off on Nov 14, 2026: no project line, free from Nov 15, 2026. Released by Ingrid Solberg.')
    expect(noLineSays({ rollsOffOn: day('2026-11-14'), keepUntil: day('2026-11-30') })).toBe('no project line, free from Nov 30, 2026')
  })

  it('HR and the person are told of a release with no line in whole sentences, "the project" standing for the client nobody named', () => {
    const facts = { personName: 'Rahul Deshpande', firmName: 'Teleworld Solutions', actorName: 'Ingrid Solberg', fromClient: null, fromCity: null, rollsOffOn: day('2026-11-14') }
    expect(hrNotice('FLAG', facts).title).toBe('Rahul Deshpande rolls off the project on Nov 14, 2026')
    expect(hrNotice('CONFIRM', facts).body).toBe('From the project. Nothing is asked of you.')
    expect(personNotice('FLAG', facts).title).not.toMatch(/undefined|null/)
  })

  it('the flag route takes a person with no line, uses the running line where there is one, and keeps a lineless release only once the column admits it', () => {
    const route = read('src/app/api/bench/ours/flag/route.ts')
    expect(route).toContain("typeof body.personId === 'string'")
    expect(route).toContain("state: { in: ['IN_PROGRESS', 'PAUSED'] }")
    expect(route).toContain('return flagWithoutLine({')
    expect(route).toContain('checkFlagWithoutLine({')
    expect(route).toContain("f.name === 'sellContractId'")
    expect(route).toContain('return field != null && !field.isRequired')
    expect(route.indexOf('if (!linelessReleasesStored())')).toBeLessThan(route.indexOf('prisma.projectRelease.create({'))
    expect(route).toContain('a roll-off without one cannot be kept yet. Record the project line, then flag the day from it.')
  })

  it('a delivery manager is offered the firm’s own employees with no running line, and never its staff', () => {
    const route = read('src/app/api/bench/ours/route.ts')
    expect(route).toContain('team: [...team, ...unlined],')
    expect(route).toContain('!isStaffSeat({ permissions: deskOf.get(personId) ?? [], listed: false, lines: linesOf.get(personId) ?? [] })')
    expect(route).toContain('lineless: !release.sellContractId,')
    const page = read('src/app/dashboard/bench/our-bench.tsx')
    expect(page).toContain(': { personId: act.team.personId, rollsOffOn, keepUntil: keepUntil || undefined },')
    expect(page).toContain('No project line')
  })
})
