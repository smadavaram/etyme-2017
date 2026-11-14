import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Screen walk on df3074094: the person asked to take ownership, and the
 * second Owner asked to agree to a removal, could say yes on no screen.
 * Settings → Owners answered only Owners and Admins, and the notice
 * linked there. One reader, `asksAddressedTo` in lib/owner-asks, answers
 * what waits on a person's yes, and the screen and Ask Etyme's card read
 * it alike.
 */

const db = vi.hoisted(() => ({
  company: { findUnique: vi.fn() },
  ownershipRequest: { findMany: vi.fn() },
  context: { findMany: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ prisma: db }))

import { asksAddressedTo } from '@/lib/owner-asks'
import { desklessDoor } from '@/lib/deskless-door'

const seatRow = (id: string, name: string, role: string) => ({
  id: `c-${id}`, personId: `p-${id}`, suspendedAt: null, expiresAt: null,
  person: { name, primaryEmail: `${id}@tapin.example` }, role: { name: role },
})
const inAWeek = () => new Date(Date.now() + 5 * 86_400_000)

beforeEach(() => {
  db.company.findUnique.mockResolvedValue({ name: 'Tapin' })
  db.context.findMany.mockResolvedValue([
    seatRow('camille', 'Camille Roux', 'Owner'),
    seatRow('madhavi', 'Madhavi Rao', 'Owner'),
    seatRow('lorena', 'Lorena Kellerman', 'Account Manager'),
    seatRow('oliver', 'Oliver Park', 'Recruiter'),
  ])
  db.ownershipRequest.findMany.mockResolvedValue([
    { id: 'pass1', kind: 'PASS', askerAfter: 'ADMIN', reason: 'Lorena runs it now', expiresAt: inAWeek(), askedById: 'p-camille', askedBy: { name: 'Camille Roux' }, subjectContextId: 'c-lorena', toRole: null },
    { id: 'rm1', kind: 'REMOVE', askerAfter: null, reason: 'Left the firm', expiresAt: inAWeek(), askedById: 'p-camille', askedBy: { name: 'Camille Roux' }, subjectContextId: 'c-madhavi', toRole: null },
  ])
})

describe('the person an Owner ask is addressed to can answer it', () => {
  it('the person asked to take ownership reads that ask, what they become and what they can then do, and where to say yes', async () => {
    const asks = await asksAddressedTo('p-lorena', 'co-tapin')
    expect(asks.map((a) => a.id)).toEqual(['pass1'])
    const a = asks[0]
    expect(a.says).toBe('Camille Roux wants to pass Tapin’s ownership to you. After this you are an Owner of Tapin. Camille Roux will be an Admin.')
    expect(a.becomes).toBe('Owner')
    expect(a.canThen).toMatch(/^As an Owner you run Tapin’s business/)
    expect(a.askedBy).toBe('Camille Roux')
    expect(a.answerUrl).toBe('/api/settings/owners/pass1')
    expect(a.href).toBe('/dashboard/settings/owners')
  })

  it('the second Owner asked to agree to a removal reads it as addressed to them', async () => {
    const asks = await asksAddressedTo('p-madhavi', 'co-tapin')
    expect(asks.map((a) => a.id)).toEqual(['rm1'])
    expect(asks[0].youAreSubject).toBe(true)
    expect(asks[0].becomes).toBe('No longer at Tapin')
    expect(asks[0].says).toMatch(/^Camille Roux asks to remove you as an Owner of Tapin/)
  })

  it('the Owner who asked is never shown her own ask as one to answer', async () => {
    expect(await asksAddressedTo('p-camille', 'co-tapin')).toEqual([])
  })

  it('a colleague nothing is addressed to reads nothing', async () => {
    expect(await asksAddressedTo('p-oliver', 'co-tapin')).toEqual([])
  })

  it('an ask past its seven days is never offered', async () => {
    db.ownershipRequest.findMany.mockResolvedValue([
      { id: 'old', kind: 'PASS', askerAfter: 'OWNER', reason: 'x', expiresAt: new Date(Date.now() - 1000), askedById: 'p-camille', askedBy: { name: 'Camille Roux' }, subjectContextId: 'c-lorena', toRole: null },
    ])
    expect(await asksAddressedTo('p-lorena', 'co-tapin')).toEqual([])
  })
})

describe('Settings → Owners opens for the person an ask is addressed to, and shows them only that', () => {
  const route = readFileSync('src/app/api/settings/owners/route.ts', 'utf8')
  const page = readFileSync('src/app/dashboard/settings/owners/page.tsx', 'utf8')

  it('a reader who is neither Owner nor Admin is answered the asks addressed to them and nothing about who owns the company', () => {
    const branch = route.slice(route.indexOf('const addressed = await asksAddressedTo(personId, company.id)'), route.indexOf('await ensureDefaultRoles('))
    expect(branch).toContain("return NextResponse.json({ data: { company: company.name, addressedOnly: true, asks: addressed } })")
    expect(branch).not.toMatch(/owners:|others:|roles/)
  })

  it('a reader with no ask addressed to them is still refused in a sentence', () => {
    expect(route).toContain('Who owns ${company.name} is read by its Owners and Admins.')
  })

  it('the page answers an addressed ask with Yes and No through the one door the card also calls', () => {
    expect(page).toContain('if (r.addressedOnly) {')
    expect(page).toContain("post(`y${a.id}`, a.answerUrl, { decision: 'yes' })")
    expect(page).toContain("post(`n${a.id}`, a.answerUrl, { decision: 'no' })")
  })

  it('a seat with no desk may open the Owners routes, which answer it only what is addressed to it', () => {
    for (const path of ['/api/settings/owners', '/api/settings/owners/ask1']) {
      const v = desklessDoor({ path, method: path.endsWith('ask1') ? 'POST' : 'GET', contextType: 'EMPLOYEE', permissions: [], companyName: 'Tapin', companyKind: 'VENDOR' })
      expect(v.open, path).toBe(true)
    }
  })
})

describe('after a person answers an ownership ask, their answer stays on the screen (Owner walk, 2026-11-12)', () => {
  const page = readFileSync('src/app/dashboard/settings/owners/page.tsx', 'utf8')

  it('a refused read after an answer turns the page into the addressed view with nothing waiting, never a refusal', async () => {
    const { viewAfterRefusedRead } = await import('@/app/dashboard/settings/owners/view')
    expect(viewAfterRefusedRead({ company: 'Tapin', addressedOnly: true, asks: [{}] })).toEqual({ company: 'Tapin', addressedOnly: true, asks: [] })
    expect(viewAfterRefusedRead({ company: 'Tapin', asks: [{}] })).toEqual({ company: 'Tapin', addressedOnly: true, asks: [] })
    expect(viewAfterRefusedRead(null)).toBeNull()
  })

  it('the page tells a refusal from a fault by the status readJson carries, on the first read and after an answer', () => {
    expect(page).toContain('if (isRefusal(e) && afterAnswer) setR((prev) => viewAfterRefusedRead(prev)')
    expect(page).toContain('else if (isRefusal(e)) setRefused(e.message)')
    expect(page).not.toContain('e?.status === 403')
  })

  it('the route’s answer sentence is drawn above the panels, and “Nothing is waiting” is not said beside a fresh answer', () => {
    const addressed = page.slice(page.indexOf('if (r.addressedOnly) {'), page.indexOf('const adminRole'))
    expect(addressed.indexOf('{said && <FormMessage')).toBeLessThan(addressed.indexOf('r.asks.map('))
    expect(addressed).toContain("r.asks.length === 0 && !(said && said.tone === 'ok')")
    expect(addressed).toContain('title="Answered"')
  })
})

describe('the move form says when the new Owner moves the previous one alone (Owner walk, 2026-11-12)', () => {
  it('after a pass, moving the Owner who passed it to Admin says nobody else is asked, and the button says what it does', async () => {
    const { moveFormSays } = await import('@/app/dashboard/settings/owners/view')
    const says = moveFormSays({ alone: true, subjectName: 'Madhavi', companyName: 'Tapin', emailLeaves: true })
    expect(says.line).toBe('Madhavi passed Tapin’s ownership to you, so you move them to Admin yourself. Nobody else is asked, and Madhavi is told by email.')
    expect(says.button).toBe('Move them to Admin')
    expect(says.line).not.toMatch(/needs the yes/)
  })

  it('where no email can leave, the Owners screen says the person is told and answers in Ask Etyme, and never promises an email', async () => {
    const { moveFormSays, passFormSays } = await import('@/app/dashboard/settings/owners/view')
    const move = moveFormSays({ alone: true, subjectName: 'Madhavi', companyName: 'Tapin', emailLeaves: false })
    expect(move.line).toBe('Madhavi passed Tapin’s ownership to you, so you move them to Admin yourself. Nobody else is asked, and Madhavi is told in Ask Etyme.')
    expect(passFormSays(false)).toBe('They say yes on a card in Ask Etyme. Nothing changes until then. Both changes then happen together.')
    expect(passFormSays(true)).toBe('They say yes on a card in Ask Etyme and by email. Nothing changes until then. Both changes then happen together.')
    // The page reads the answer from its own route, never the environment.
    const page = readFileSync('src/app/dashboard/settings/owners/page.tsx', 'utf8')
    expect(page).not.toMatch(/by email\./)
    expect(page).not.toContain('mail-leaves')
    expect(page).toContain('{passFormSays(r.emailLeaves === true)}')
    expect(page).toContain('emailLeaves: r.emailLeaves === true,')
    expect(readFileSync('src/app/api/settings/owners/route.ts', 'utf8')).toContain('emailLeaves: mailLeaves(),')
  })

  it('every other removal or move still says it needs the yes of an Owner who did not ask', async () => {
    const { moveFormSays } = await import('@/app/dashboard/settings/owners/view')
    const says = moveFormSays({ alone: false, subjectName: 'Madhavi', companyName: 'Tapin', emailLeaves: true })
    expect(says.line).toMatch(/^This needs the yes of an Owner who did not ask\./)
    expect(says.button).toBe('Ask for their yes')
  })

  it('the Owners read marks the Owner the reader may move alone, from the same rule the move itself reads', () => {
    const route = readFileSync('src/app/api/settings/owners/route.ts', 'utf8')
    expect(route).toContain('aloneToAdmin: iAmOwner && movesAloneAfterPass({ actor: me, subject: s, toRoleName: ADMIN_ROLE, passedToActorBy: passedBy, seats })')
    const page = readFileSync('src/app/dashboard/settings/owners/page.tsx', 'utf8')
    expect(page).toContain("alone: !!chosenOwner?.aloneToAdmin && ownerAct === 'demote' && !!adminRole && chosenRoleId === adminRole.id")
  })
})
