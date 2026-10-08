import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { tellOwnerSomebodyJoined, JOINED_EVENT } from '@/lib/notify/joined'

/**
 * A colleague signs in on a claimed domain and is seated at once; the
 * owners are told, on the company's own channel, once.
 *
 * Two companies: Northbend saved a Workflows link to its Teams channel,
 * Cavanaugh saved none. Each has an Owner and an Admin, and somebody
 * joins each. Delivery runs for real against a stubbed network, and the
 * outcome is read back off the rows.
 */

const WORKFLOWS =
  'https://prod-27.westus.logic.azure.com:443/workflows/7a1c/triggers/manual/paths/invoke?sig=abc'

const posted: { url: string; body: any }[] = []
const saved = {
  resend: process.env.RESEND_API_KEY,
  from: process.env.NOTIFY_FROM_EMAIL,
  app: process.env.NEXT_PUBLIC_APP_URL,
  auth: process.env.NEXTAUTH_URL,
}

async function settledAll(where: { companyId: string }) {
  for (let i = 0; i < 100; i++) {
    const rows = await prisma.notification.findMany({ where, orderBy: { createdAt: 'asc' } })
    if (rows.every((r) => r.deliveryState !== 'PENDING')) return rows
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('delivery never settled')
}

async function company(name: string, slug: string, teamsWebhookUrl: string | null) {
  const c = await prisma.company.create({ data: { name, slug, kind: 'CLIENT', teamsWebhookUrl } })
  const owner = await prisma.role.create({ data: { companyId: c.id, name: 'Owner', permissions: ['*'] } })
  const admin = await prisma.role.create({ data: { companyId: c.id, name: 'Admin', permissions: ['*'] } })
  const member = await prisma.role.create({ data: { companyId: c.id, name: 'Member', permissions: [], isDefault: true } })
  return { id: c.id, owner: owner.id, admin: admin.id, member: member.id }
}

async function seated(companyId: string, roleId: string, name: string, email: string) {
  const p = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({ data: { personId: p.id, companyId, roleId, type: 'EMPLOYEE' } })
  return p.id
}

describe('the owners hear that a colleague joined', () => {
  let teamsCo: Awaited<ReturnType<typeof company>>
  let mailCo: Awaited<ReturnType<typeof company>>
  let teamsJoiner = ''
  let mailJoiner = ''
  let mailOwner = ''
  let mailAdmin = ''

  beforeAll(async () => {
    await resetDatabase()
    process.env.RESEND_API_KEY = 're_test'
    process.env.NOTIFY_FROM_EMAIL = 'notices@etyme.example'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.etyme.example'
    // The one base address (appUrl) reads NEXTAUTH_URL first, and the
    // integration setup leaves it at http://localhost, which a card refuses.
    process.env.NEXTAUTH_URL = 'https://app.etyme.example'
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
      posted.push({ url: String(url), body: JSON.parse(init.body) })
      return new Response(JSON.stringify({ id: 'sent' }), { status: 200 })
    }))

    teamsCo = await company('Northbend Athletic', 'joined-northbend', WORKFLOWS)
    mailCo = await company('Cavanaugh Glassworks', 'joined-cavanaugh', null)
    await seated(teamsCo.id, teamsCo.owner, 'Marcus Oyelaran', 'marcus@northbend.test')
    await seated(teamsCo.id, teamsCo.admin, 'Lena Brook', 'lena@northbend.test')
    mailOwner = await seated(mailCo.id, mailCo.owner, 'Dana Whitfield', 'dana@cavanaugh.test')
    mailAdmin = await seated(mailCo.id, mailCo.admin, 'Omar Haddad', 'omar@cavanaugh.test')
    teamsJoiner = await seated(teamsCo.id, teamsCo.member, 'Priya Nair', 'priya@northbend.test')
    mailJoiner = await seated(mailCo.id, mailCo.member, 'Sam Ito', 'sam@cavanaugh.test')
  }, 900_000)

  afterAll(() => {
    vi.unstubAllGlobals()
    for (const [k, v] of [
      ['RESEND_API_KEY', saved.resend], ['NOTIFY_FROM_EMAIL', saved.from], ['NEXT_PUBLIC_APP_URL', saved.app],
      ['NEXTAUTH_URL', saved.auth],
    ] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('when a colleague joins, every owner and admin is told who, from which address, as what, and what to do', async () => {
    const said = await tellOwnerSomebodyJoined(mailCo.id, mailJoiner, 'Member')
    expect(said).toEqual({ owners: 2, joiner: true })

    const rows = await settledAll({ companyId: mailCo.id })
    const owners = rows.filter((r) => r.personId !== mailJoiner)
    expect(owners.map((r) => r.personId).sort()).toEqual([mailOwner, mailAdmin].sort())
    for (const r of owners) {
      expect(r.body).toBe('Sam Ito (sam@cavanaugh.test) joined Cavanaugh Glassworks as Member. Give them a desk.')
      expect((r.data as any).href).toBe('/dashboard/access')
    }
  })

  it('the joiner is told they are in and what happens next', async () => {
    const own = await prisma.notification.findMany({ where: { companyId: mailCo.id, personId: mailJoiner } })
    expect(own).toHaveLength(1)
    expect(own[0].body).toBe(
      'You are in at Cavanaugh Glassworks as Member. Your owner has been told; you will see more once they give you a desk.'
    )
    expect(own[0].channel).toBe('IN_APP')
  })

  it('telling the owners twice about one joiner tells nobody twice', async () => {
    const before = await prisma.notification.count({ where: { companyId: mailCo.id } })
    const again = await tellOwnerSomebodyJoined(mailCo.id, mailJoiner, 'Member')
    expect(again).toEqual({ owners: 0, joiner: false })
    expect(await prisma.notification.count({ where: { companyId: mailCo.id } })).toBe(before)
  })

  it('a company with a Teams link hears it in Teams, one without hears it by email', async () => {
    // Cavanaugh, no link: both owners were emailed, and the email links to Users & permissions.
    const mailRows = (await settledAll({ companyId: mailCo.id })).filter((r) => r.personId !== mailJoiner)
    expect(mailRows.map((r) => r.channel)).toEqual(['EMAIL', 'EMAIL'])
    expect(mailRows.every((r) => r.deliveryState === 'SENT')).toBe(true)
    expect(posted.some((p) => p.url === WORKFLOWS)).toBe(false)

    // Northbend, a Workflows link: the channel hears it once, the other owner in the app.
    await tellOwnerSomebodyJoined(teamsCo.id, teamsJoiner, 'Member')
    const teamsRows = (await settledAll({ companyId: teamsCo.id })).filter(
      (r) => r.personId !== teamsJoiner && (r.data as any)?.event === JOINED_EVENT
    )
    expect(teamsRows.map((r) => r.channel).sort()).toEqual(['IN_APP', 'TEAMS'])
    expect(teamsRows.find((r) => r.channel === 'TEAMS')!.deliveryState).toBe('SENT')

    const cards = posted.filter((p) => p.url === WORKFLOWS)
    expect(cards).toHaveLength(1)
    const card = cards[0].body.attachments[0].content
    expect(card.body.map((b: any) => b.text).join(' ')).toContain(
      'Priya Nair (priya@northbend.test) joined Northbend Athletic as Member. Give them a desk.'
    )
    expect(card.actions[0].url).toBe('https://app.etyme.example/dashboard/access')
  })
})
