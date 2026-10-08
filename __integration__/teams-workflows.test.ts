import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma, resetDatabase } from './harness'
import { notify, notifyBulk } from '@/lib/notify'
import {
  RETIRED_LINK_ROUTE_REASON, TEAMS_WORKFLOWS_SENT_NOTE,
} from '@/lib/notify/teams-link'

/**
 * Teams after Microsoft switched off Office 365 Connectors, on a real
 * database, through the one door every notice leaves by (`notify`).
 *
 * Two companies: one saved a Workflows link, one saved a connector link
 * before May 2026 and has not been back. A notice to each person in
 * each is written, delivered, and read back off its own row — which is
 * where support looks when somebody says "I never heard".
 */

const WORKFLOWS =
  'https://prod-27.westus.logic.azure.com:443/workflows/7a1c/triggers/manual/paths/invoke?sig=abc'
const RETIRED = 'https://northbend.webhook.office.com/webhookb2/1111@2222/IncomingWebhook/3333/4444'

const posted: { url: string; body: any }[] = []
const saved = {
  resend: process.env.RESEND_API_KEY,
  from: process.env.NOTIFY_FROM_EMAIL,
  app: process.env.NEXT_PUBLIC_APP_URL,
  auth: process.env.NEXTAUTH_URL,
}

async function settled(id: string) {
  for (let i = 0; i < 100; i++) {
    const row = await prisma.notification.findUniqueOrThrow({ where: { id } })
    if (row.deliveryState !== 'PENDING') return row
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('delivery never settled')
}

async function personAt(companyId: string, name: string, email: string) {
  const person = await prisma.person.create({ data: { name, primaryEmail: email } })
  await prisma.context.create({ data: { personId: person.id, companyId, type: 'EMPLOYEE' } })
  return person
}

describe('a notice to a business user, on each kind of saved Teams link', () => {
  let workflowsPerson = ''
  let retiredPerson = ''
  let workflowsCo = ''
  let retiredCo = ''

  beforeAll(async () => {
    await resetDatabase()
    process.env.RESEND_API_KEY = 're_test'
    process.env.NOTIFY_FROM_EMAIL = 'notices@etyme.example'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.etyme.example'
    // The one base address (appUrl) reads NEXTAUTH_URL first; the
    // environment's own value must not decide this deployment's address.
    process.env.NEXTAUTH_URL = 'https://app.etyme.example'
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
      posted.push({ url: String(url), body: JSON.parse(init.body) })
      return new Response(null, { status: 202 })
    }))

    const a = await prisma.company.create({
      data: { name: 'Northbend Athletic', slug: 'teams-northbend', kind: 'CLIENT', teamsWebhookUrl: WORKFLOWS },
    })
    const b = await prisma.company.create({
      data: { name: 'Cavanaugh Glassworks', slug: 'teams-cavanaugh', kind: 'CLIENT', teamsWebhookUrl: RETIRED },
    })
    workflowsCo = a.id
    retiredCo = b.id
    workflowsPerson = (await personAt(a.id, 'Marcus Oyelaran', 'marcus@northbend.example')).id
    retiredPerson = (await personAt(b.id, 'Dana Whitfield', 'dana@cavanaugh.example')).id
  }, 900_000)

  afterAll(() => {
    vi.unstubAllGlobals()
    for (const [k, v] of [
      ['RESEND_API_KEY', saved.resend], ['NOTIFY_FROM_EMAIL', saved.from], ['NEXT_PUBLIC_APP_URL', saved.app], ['NEXTAUTH_URL', saved.auth],
    ] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('a company with a Workflows link hears in Teams, as an Adaptive Card with a button to the page', async () => {
    const created = await notify({
      personId: workflowsPerson,
      companyId: workflowsCo,
      type: 'TIMESHEET',
      title: 'Helena Marsh’s week is waiting for you',
      body: 'Helena Marsh filed 40 hours for the week ending Oct 3. Approve it or send it back.',
      channel: 'TEAMS',
    })
    const row = await settled(created!.id)

    expect(row.channel).toBe('TEAMS')
    expect(row.deliveryState).toBe('SENT')
    expect(row.deliveryNote).toBe(TEAMS_WORKFLOWS_SENT_NOTE)

    const post = posted.find((p) => p.url === WORKFLOWS)!
    expect(post).toBeDefined()
    const card = post.body.attachments[0]
    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive')
    expect(card.content.body[0].text).toBe('Helena Marsh’s week is waiting for you')
    expect(card.content.actions[0]).toEqual({
      type: 'Action.OpenUrl', title: 'Open in Etyme', url: 'https://app.etyme.example/dashboard/timesheets',
    })
  })

  it('a company whose saved link is the retired kind is told by email, and the reason is recorded on the row', async () => {
    const before = posted.length
    const created = await notify({
      personId: retiredPerson,
      companyId: retiredCo,
      type: 'TIMESHEET',
      title: 'A week is waiting for you',
      body: 'Priya Raman filed 38 hours for the week ending Oct 3. Approve it or send it back.',
      channel: 'TEAMS',
    })
    const row = await settled(created!.id)

    expect(row.channel).toBe('EMAIL')
    expect(row.deliveryState).toBe('SENT')
    expect(row.deliveryNote).toBe(RETIRED_LINK_ROUTE_REASON)

    const sent = posted.slice(before)
    // Nothing was posted to the retired link; one email left.
    expect(sent.some((p) => p.url === RETIRED)).toBe(false)
    expect(sent.filter((p) => p.url === 'https://api.resend.com/emails')).toHaveLength(1)
    expect(sent[0].body.to).toBe('dana@cavanaugh.example')
  })

  it('a bulk notice that asks for Teams or email is delivered like a single one, never left pending', async () => {
    const before = posted.length
    const result = await notifyBulk([
      { personId: workflowsPerson, companyId: workflowsCo, type: 'SYSTEM', title: 'In the app only', body: 'Shown in the app.' },
      { personId: workflowsPerson, companyId: workflowsCo, type: 'SYSTEM', title: 'Bulk to Teams', body: 'Posted to the channel.', channel: 'TEAMS' },
      { personId: retiredPerson, companyId: retiredCo, type: 'SYSTEM', title: 'Bulk to a retired link', body: 'Goes by email.', channel: 'TEAMS' },
    ])
    expect(result).toEqual({ count: 3 })

    const rows = await prisma.notification.findMany({
      where: { title: { in: ['In the app only', 'Bulk to Teams', 'Bulk to a retired link'] } },
      select: { id: true, title: true },
    })
    const by = new Map<string, Awaited<ReturnType<typeof settled>>>()
    for (const r of rows) by.set(r.title, await settled(r.id))

    expect(by.get('In the app only')!.channel).toBe('IN_APP')
    expect(by.get('In the app only')!.deliveryState).toBe('SENT')
    expect(by.get('Bulk to Teams')!.channel).toBe('TEAMS')
    expect(by.get('Bulk to Teams')!.deliveryState).toBe('SENT')
    expect(by.get('Bulk to Teams')!.deliveryNote).toBe(TEAMS_WORKFLOWS_SENT_NOTE)
    expect(by.get('Bulk to a retired link')!.channel).toBe('EMAIL')
    expect(by.get('Bulk to a retired link')!.deliveryNote).toBe(RETIRED_LINK_ROUTE_REASON)

    const sent = posted.slice(before)
    expect(sent.filter((p) => p.url === WORKFLOWS)).toHaveLength(1)
    expect(sent.filter((p) => p.url === 'https://api.resend.com/emails')).toHaveLength(1)
  })

  it('the Teams proof counts only posts a Workflows link accepted', async () => {
    const proof = await prisma.notification.count({
      where: { channel: 'TEAMS', deliveryState: 'SENT', deliveryNote: TEAMS_WORKFLOWS_SENT_NOTE },
    })
    // One single notice and one bulk notice went through a Workflows link.
    expect(proof).toBe(2)
  })
})
