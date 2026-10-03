import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

import { GET as readSettings, PATCH as changeSettings } from '@/app/api/settings/route'
import { GET as health } from '@/app/api/health/route'
import { teamsFacts } from '@/lib/readiness-facts'
import { TEAMS_WORKFLOWS_SENT_NOTE } from '@/lib/notify/teams-link'

/**
 * The Teams link, as the settings desk saves it and as /ready and
 * /api/health count it (conversation's Workflows change, 2b8b0f94c).
 *
 * Microsoft switched off the old connector links in May 2026. A link of
 * that kind starts with https:// and goes nowhere, so the settings check
 * is the kind of link, a saved one of the old kind is not "configured",
 * and a post counts as proof only where a Workflows link accepted it.
 */

const WORKFLOWS = 'https://prod-12.westus.logic.azure.com/workflows/abc123/triggers/manual/paths/invoke?sig=x'
const RETIRED = 'https://brightmoor.webhook.office.com/webhookb2/abc/IncomingWebhook/def/ghi'

type Seat = { id: string; personId: string; email: string }
let owner: Seat
let companyId = ''

async function call(fn: any, method: string, url: string, body?: unknown) {
  as(owner.email)
  return json(await fn(req(method, url, body, { 'x-context-id': owner.id })))
}

describe('the Teams link on a company’s settings', () => {
  beforeAll(async () => {
    await freshWorld()
    const ctx = await prisma.context.findFirstOrThrow({
      where: { type: 'EMPLOYEE', company: { kind: 'VENDOR' }, role: { permissions: { has: '*' } } },
      include: { person: true },
    })
    owner = { id: ctx.id, personId: ctx.personId, email: ctx.person.primaryEmail }
    companyId = ctx.companyId!
    // Every company starts this file with no link, so the counts below are this file's.
    await prisma.company.updateMany({ data: { teamsWebhookUrl: null } })
    await prisma.notification.deleteMany({ where: { channel: 'TEAMS' } })
  })

  it('a link of the kind Microsoft switched off is refused when saved, with what to paste instead', async () => {
    const r = await call(changeSettings, 'PATCH', '/api/settings', { teamsWebhookUrl: RETIRED })
    expect(r.status).toBe(422)
    expect(r.body.error.field).toBe('teamsWebhookUrl')
    expect(r.body.error.message).toContain('Microsoft switched off this kind of Teams link in May 2026')
    expect((await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).teamsWebhookUrl).toBeNull()
  })

  it('a web address that is not a Teams Workflows link is refused in a sentence', async () => {
    const r = await call(changeSettings, 'PATCH', '/api/settings', { teamsWebhookUrl: 'https://example.com/hook' })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toContain('This is not a Teams Workflows link.')
  })

  it('a Workflows link is saved, and the company reads as posting to Teams', async () => {
    const r = await call(changeSettings, 'PATCH', '/api/settings', { teamsWebhookUrl: `  ${WORKFLOWS}  ` })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.company.teamsConfigured).toBe(true)
    expect(r.body.data.company.teams).toEqual({ state: 'WORKS', says: 'Notifications for this company post to Teams.' })
    expect((await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).teamsWebhookUrl).toBe(WORKFLOWS)
  })

  it('a company whose saved link is the retired kind reads as not configured, and is told how to replace it', async () => {
    await prisma.company.update({ where: { id: companyId }, data: { teamsWebhookUrl: RETIRED } })
    const r = await call(readSettings, 'GET', '/api/settings')
    expect(r.status).toBe(200)
    expect(r.body.data.company.teamsConfigured).toBe(false)
    expect(r.body.data.company.teams.state).toBe('NEEDS_NEW_LINK')
    expect(r.body.data.company.teams.says).toContain('This Teams link no longer works')
  })

  it('an empty link clears the channel, and the company goes back to email', async () => {
    const r = await call(changeSettings, 'PATCH', '/api/settings', { teamsWebhookUrl: '' })
    expect(r.status).toBe(200)
    expect(r.body.data.company.teams.state).toBe('NONE')
    expect((await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).teamsWebhookUrl).toBeNull()
  })

  it('/ready counts a retired link apart, and a Teams post as proof only where a Workflows link accepted it', async () => {
    const other = await prisma.company.findFirstOrThrow({ where: { id: { not: companyId } } })
    await prisma.company.update({ where: { id: companyId }, data: { teamsWebhookUrl: WORKFLOWS } })
    await prisma.company.update({ where: { id: other.id }, data: { teamsWebhookUrl: RETIRED } })
    const base = { personId: owner.personId, companyId, type: 'SYSTEM', title: 'A week is waiting', body: 'Sign it.', channel: 'TEAMS', deliveryState: 'SENT' }
    await prisma.notification.create({ data: { ...base, deliveryNote: 'Posted to Teams' } })
    await prisma.notification.create({ data: { ...base, deliveryNote: TEAMS_WORKFLOWS_SENT_NOTE } })

    expect(await teamsFacts()).toEqual({ workflowsChannels: 1, retiredChannels: 1, postedByWorkflows: 1 })
  })

  it('health reports Teams configured only once a company has a Workflows link, read from the same facts', async () => {
    const before = (await json(await health())).body.data.notifications.find((s: any) => s.channel === 'TEAMS')
    expect(before.configured).toBe(true)
    expect(before.note).toContain('1 message has been posted to Teams through a Workflows link.')

    await prisma.company.updateMany({ where: { teamsWebhookUrl: WORKFLOWS }, data: { teamsWebhookUrl: null } })
    const after = (await json(await health())).body.data.notifications.find((s: any) => s.channel === 'TEAMS')
    expect(after.configured).toBe(false)
    expect(after.note).toContain('No company has a Teams Workflows link saved.')
  })
})
