import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as askGet, POST as askPost } from '@/app/api/conversations/twin/route'
import { ensureDefaultRoles } from '@/lib/company-roles'

/**
 * Fix list, layer 4, people and access (2026-11-15): a person invited
 * with no role opened Ask Etyme and was never told who gives her one.
 * Now a seat with no role, or only the Member role, reads one more
 * sentence on its first screen: the person who invited her, by name,
 * while that person holds a live seat that may give roles; else the roles
 * here that may; else an Owner or Admin of the firm. A seat with a role
 * reads exactly what it read before.
 *
 * Seated at a made-up firm on a reserved domain, inside the seeded world.
 */

const DANA = 'dana.reyes@harborline-tech.example'
const LEE = 'lee.park@harborline-tech.example'
const KIM = 'kim.ortiz@harborline-tech.example'
const ANA = 'ana.silva@harborline-tech.example'
const LEAD = 'Nobody has given you a role here yet.'
const KARTHIK = 'karthik.menon@seed.etyme.invalid'

/** Every sentence the greeting says, lead to tail, as one string. */
function everythingSaid(answer: any): string {
  const lines = [answer?.says, answer?.recommend?.says, ...(answer?.more ?? []).map((m: any) => m?.says ?? m), ...(answer?.tail ?? []).map((t: any) => t?.says ?? t)]
  return lines.filter(Boolean).join(' ')
}

async function greeting(cookie?: string) {
  const r = await json(await askGet(req('GET', '/api/conversations/twin', undefined, cookie ? { cookie } : {})))
  expect(r.status).toBe(200)
  return r.body.data.answer
}

describe('a person invited with no role is told on her first screen who gives her one', () => {
  let firm = ''
  const seat: Record<string, string> = {}
  let lee = ''
  let dana = ''

  beforeAll(async () => {
    await freshWorld()
    firm = (await prisma.company.create({ data: { name: 'Harborline Tech', slug: 'harborline-tech', kind: 'VENDOR', currency: 'USD' } })).id
    await ensureDefaultRoles(firm, 'VENDOR')
    const role = async (name: string) => (await prisma.role.findFirstOrThrow({ where: { companyId: firm, name }, select: { id: true } })).id
    const seatFor = async (email: string, name: string, roleId: string, extra: Record<string, unknown> = {}) => {
      const p = await prisma.person.create({ data: { primaryEmail: email, name }, select: { id: true } })
      const c = await prisma.context.create({ data: { personId: p.id, companyId: firm, type: 'EMPLOYEE', roleId, grantReason: 'Seated for the test', ...extra }, select: { id: true } })
      seat[email] = c.id
      return p.id
    }
    dana = await seatFor(DANA, 'Dana Reyes', await role('Owner'))
    lee = await seatFor(LEE, 'Lee Park', await role('Admin'))
    await seatFor(KIM, 'Kim Ortiz', await role('Admin'))
    await seatFor(ANA, 'Ana Silva', await role('Member'), { invitedAt: new Date(), invitedById: lee })
  }, 600_000)

  it('a person invited by an Admin who still holds a live seat is told to ask that Admin by name', async () => {
    as(ANA)
    const said = everythingSaid(await greeting())
    expect(said).toContain(`${LEAD} Ask Lee Park, who invited you, to give you one.`)
  })

  it('an inviter whose seat has ended is never named, and she is told which roles give roles', async () => {
    await prisma.context.update({ where: { id: seat[LEE] }, data: { expiresAt: new Date(Date.now() - 86_400_000) } })
    as(ANA)
    const answer = await greeting()
    expect(everythingSaid(answer)).toContain(`${LEAD} Giving roles is for the Owner or an Admin here. Ask one of them.`)
    expect(JSON.stringify(answer)).not.toContain('Lee Park')
    await prisma.context.update({ where: { id: seat[LEE] }, data: { expiresAt: null } })
  })

  it('an Owner kept open past the end date is still named as one who gives roles', async () => {
    await prisma.context.update({ where: { id: seat[DANA] }, data: { expiresAt: new Date(Date.now() - 86_400_000) } })
    await prisma.context.update({ where: { id: seat[ANA] }, data: { invitedById: dana } })
    as(ANA)
    expect(everythingSaid(await greeting())).toContain(`${LEAD} Ask Dana Reyes, who invited you, to give you one.`)
    await prisma.context.update({ where: { id: seat[DANA] }, data: { expiresAt: null } })
    await prisma.context.update({ where: { id: seat[ANA] }, data: { invitedById: lee } })
  })

  it('an inviter who was invited and never signed in is never named', async () => {
    await prisma.context.update({ where: { id: seat[LEE] }, data: { invitedAt: new Date(), lastUsedAt: null } })
    as(ANA)
    const answer = await greeting()
    expect(everythingSaid(answer)).toContain(`${LEAD} Giving roles is for the Owner or an Admin here. Ask one of them.`)
    expect(JSON.stringify(answer)).not.toContain('Lee Park')
    await prisma.context.update({ where: { id: seat[LEE] }, data: { invitedAt: null } })
  })

  it('once the person who invited her is paused, she is told which roles here give roles, and his name is never said', async () => {
    await prisma.context.update({ where: { id: seat[LEE] }, data: { suspendedAt: new Date(), suspendReason: 'On leave' } })
    as(ANA)
    const answer = await greeting()
    expect(everythingSaid(answer)).toContain(`${LEAD} Giving roles is for the Owner or an Admin here. Ask one of them.`)
    expect(JSON.stringify(answer)).not.toContain('Lee Park')
  })

  it('where only the Owner may give roles, she is told to ask the Owner', async () => {
    await prisma.context.update({ where: { id: seat[KIM] }, data: { revokedAt: new Date(), revokeReason: 'Left the firm' } })
    as(ANA)
    const answer = await greeting()
    expect(everythingSaid(answer)).toContain(`${LEAD} Giving roles is for the Owner here. Ask them.`)
    expect(JSON.stringify(answer)).not.toContain('Kim Ortiz')
  })

  it('where no live seat may give roles, she is told to ask an Owner or Admin of the firm', async () => {
    await prisma.context.update({ where: { id: seat[DANA] }, data: { suspendedAt: new Date(), suspendReason: 'On leave' } })
    as(ANA)
    const answer = await greeting()
    expect(everythingSaid(answer)).toContain(`${LEAD} Ask an Owner or Admin of Harborline Tech to give you one.`)
    expect(JSON.stringify(answer)).not.toContain('Dana Reyes')
    await prisma.context.update({ where: { id: seat[DANA] }, data: { suspendedAt: null, suspendReason: null } })
  })

  it('a seat that holds a role reads the greeting it read before, with no word about roles', async () => {
    const engineer = await prisma.role.create({ data: { companyId: firm, name: 'Field Engineer', isDefault: false, permissions: ['assignments.read', 'timesheets.read'] }, select: { id: true } })
    await prisma.context.update({ where: { id: seat[ANA] }, data: { roleId: engineer.id } })
    as(ANA)
    const answer = await greeting()
    expect(answer.says).toBe('Nothing needs you today. Checked just now.')
    expect(answer.more).toEqual([])
    expect(everythingSaid(answer)).not.toContain(LEAD)
  })
})

describe('a firm’s own worker with no role, in the firm’s hat, is told who gives her one', () => {
  let tellisford = ''
  let karthikSeat = ''
  let ownRole = ''
  let giver = { personId: '', name: '' }

  beforeAll(async () => {
    await freshWorld()
    tellisford = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-tellisford' }, select: { id: true } })).id
    const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: KARTHIK }, select: { id: true } })
    const s = await prisma.context.findFirstOrThrow({ where: { personId: person.id, companyId: tellisford }, select: { id: true, roleId: true } })
    karthikSeat = s.id
    ownRole = s.roleId!
    // Somebody at Tellisford who may give roles today, read from the seeded seats, never assumed.
    const g = await prisma.context.findFirstOrThrow({
      where: {
        companyId: tellisford, revokedAt: null, suspendedAt: null, type: 'EMPLOYEE', invitedAt: null,
        role: { permissions: { hasSome: ['settings.manage', '*'] } },
        person: { primaryEmail: { not: { endsWith: 'sample.etyme.local' } } },
      },
      select: { personId: true, person: { select: { name: true } } },
      orderBy: { id: 'asc' },
    })
    giver = { personId: g.personId, name: g.person.name }
  }, 600_000)

  it('Karthik Menon, who holds a role of his own, reads the firm hat’s line as before, with no word about roles', async () => {
    as(KARTHIK)
    const answer = await greeting('etyme_hat=firm')
    expect(answer.says).toMatch(/(Nothing of Tellisford Solutions’ is addressed to you; your own work is under You, in the account menu\.|Your own work is under You, in the account menu\.)$/)
    expect(answer.says).not.toContain(LEAD)
  })

  it('with only the Member role, Karthik Menon in the firm’s hat is told to ask the colleague who invited him, by name', async () => {
    const member = (await prisma.role.findFirst({ where: { companyId: tellisford, name: 'Member' }, select: { id: true } }))
      ?? (await prisma.role.create({ data: { companyId: tellisford, name: 'Member', isDefault: false, permissions: [] }, select: { id: true } }))
    await prisma.context.update({ where: { id: karthikSeat }, data: { roleId: member.id, invitedById: giver.personId } })
    as(KARTHIK)
    const answer = await greeting('etyme_hat=firm')
    expect(answer.says).toContain(`${LEAD} Ask ${giver.name}, who invited you, to give you one.`)
    const asked = await json(await askPost(req('POST', '/api/conversations/twin', { text: 'What needs me today?' }, { cookie: 'etyme_hat=firm' })))
    expect(asked.status).toBe(200)
    expect(asked.body.data.answer.says).toBe(`Nothing of Tellisford Solutions’ is addressed to you; your own work is under You, in the account menu. ${LEAD} Ask ${giver.name}, who invited you, to give you one.`)
    await prisma.context.update({ where: { id: karthikSeat }, data: { roleId: ownRole, invitedById: null } })
  })
})
