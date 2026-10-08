/**
 * Teams, after Microsoft switched off the old kind of link.
 *
 * Etyme posted a legacy MessageCard to an Office 365 Connector link.
 * Microsoft retired those connectors in Teams in May 2026 (rollout
 * May 18–22). The replacement is a Workflows link — a Power Automate
 * flow, "When a Teams webhook request is received" — which takes an
 * Adaptive Card. Nothing in Etyme noticed: the old card went on being
 * posted, and the health page went on saying Teams was configured.
 *
 * These sentences are what the founder reads to confirm the channel is
 * honest again.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  teamsLinkKind, checkTeamsLink, teamsLinkStanding, teamsCard, teamsEdge, countTeamsLinks,
  TEAMS_LINK_RETIRED_SENTENCE, RETIRED_LINK_ROUTE_REASON, TEAMS_WORKFLOWS_SENT_NOTE,
} from '@/lib/notify/teams-link'
import { routeFor, attemptDelivery, type Recipient, type Sender } from '@/lib/notification-delivery'
import { configuredSenders } from '@/lib/senders'
import { appLink } from '@/lib/notify'

const WORKFLOWS =
  'https://prod-27.westus.logic.azure.com:443/workflows/7a1c/triggers/manual/paths/invoke?api-version=2016-06-01&sig=abc'
const WORKFLOWS_ENV =
  'https://default1234.ab.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/9f/triggers/manual/paths/invoke?sig=abc'
const RETIRED = 'https://northbend.webhook.office.com/webhookb2/1111@2222/IncomingWebhook/3333/4444'
const RETIRED_OUTLOOK = 'https://outlook.office.com/webhook/1111@2222/IncomingWebhook/3333/4444'

const NOW = new Date('2026-10-03T09:00:00Z')

function business(over: Partial<Recipient> = {}): Recipient {
  return { isConsultant: false, email: 'marcus@northbend.example', teamsWebhookUrl: WORKFLOWS, ...over }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('which kind of Teams link a company saved', () => {
  it('a Logic Apps link and a Power Platform environment link are both Workflows links', () => {
    expect(teamsLinkKind(WORKFLOWS)).toBe('WORKFLOWS')
    expect(teamsLinkKind(WORKFLOWS_ENV)).toBe('WORKFLOWS')
  })

  it('an Office 365 Connector link, on either of its hosts, is the retired kind', () => {
    expect(teamsLinkKind(RETIRED)).toBe('RETIRED')
    expect(teamsLinkKind(RETIRED_OUTLOOK)).toBe('RETIRED')
  })

  it('a look-alike host that only contains a Workflows name is not a Workflows link', () => {
    expect(teamsLinkKind('https://logic.azure.com.attacker.example/hook')).toBe('OTHER')
    expect(teamsLinkKind('http://prod-27.westus.logic.azure.com/workflows/x')).toBe('INVALID')
  })
})

describe('saving a Teams link', () => {
  it('a Workflows link is accepted as it was pasted, without the spaces around it', () => {
    expect(checkTeamsLink(`  ${WORKFLOWS}  `)).toEqual({ ok: true, url: WORKFLOWS })
  })

  it('a legacy connector link is refused in a sentence that says what to paste instead', () => {
    const r = checkTeamsLink(RETIRED)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.message).toBe(
      'Microsoft switched off this kind of Teams link in May 2026. In Teams, add the Workflows ' +
        'app’s ‘Post to a channel when a webhook request is received’ and paste its link here.'
    )
    expect(TEAMS_LINK_RETIRED_SENTENCE).toBe(r.message)
  })

  it('a link that is neither kind is refused, and told how to make a Workflows link', () => {
    const r = checkTeamsLink('https://example.com/hook')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('Post to a channel when a webhook request is received')
  })

  it('clearing the link is always allowed, so a company can go back to email', () => {
    expect(checkTeamsLink('')).toEqual({ ok: true, url: null })
    expect(checkTeamsLink(null)).toEqual({ ok: true, url: null })
  })
})

describe('a company that saved the retired kind before May 2026', () => {
  it('its settings say the link needs replacing, and how', () => {
    const s = teamsLinkStanding(RETIRED)
    expect(s.state).toBe('NEEDS_NEW_LINK')
    expect(s.says).toContain('Microsoft switched off this kind of link in May 2026')
    expect(s.says).toContain('go by email until a new link is saved')
    expect(teamsLinkStanding(WORKFLOWS).state).toBe('WORKS')
    expect(teamsLinkStanding(null).state).toBe('NONE')
  })

  it('a company whose saved link is the retired kind is told by email, and the reason is recorded', async () => {
    const route = routeFor(business({ teamsWebhookUrl: RETIRED }))
    expect(route.channel).toBe('EMAIL')
    expect(route.retiredTeamsLink).toBe(true)
    expect(route.reason).toBe(RETIRED_LINK_ROUTE_REASON)

    const email: Sender = { channel: 'EMAIL', async send() {} }
    const o = await attemptDelivery(route, 'marcus@northbend.example', 'T', 'B', [email], NOW)
    expect(o.state).toBe('SENT')
    // The note is what the notification row keeps, so the reason is on
    // the record of the message itself.
    expect(o.note).toContain('switched off in May 2026')
  })

  it('with a retired link and no email address, nothing is called sent and the row says why', async () => {
    const route = routeFor(business({ teamsWebhookUrl: RETIRED, email: null }))
    expect(route.channel).toBe('IN_APP')
    const o = await attemptDelivery(route, null, 'T', 'B', [], NOW)
    expect(o.state).toBe('NOT_CONFIGURED')
    expect(o.note).toContain('Save a Workflows link in Settings')
  })

  it('a consultant is still reached by email, whatever link their firm saved', () => {
    expect(routeFor(business({ isConsultant: true, teamsWebhookUrl: RETIRED })).retiredTeamsLink).toBeUndefined()
  })
})

describe('what is posted to Teams', () => {
  it('a notice to Teams goes as an Adaptive Card a Workflows link accepts', async () => {
    const posted: { url: string; body: any }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
      posted.push({ url, body: JSON.parse(init.body) })
      return new Response(null, { status: 202 })
    }))

    const teams = configuredSenders().find((s) => s.channel === 'TEAMS')!
    await teams.send(
      WORKFLOWS,
      'Helena Marsh’s week is waiting for you',
      'Helena Marsh filed 40 hours for the week ending Oct 3. Approve it or send it back.',
      'https://app.etyme.example/dashboard/timesheets'
    )

    expect(posted).toHaveLength(1)
    expect(posted[0].url).toBe(WORKFLOWS)
    const msg = posted[0].body
    expect(msg.type).toBe('message')
    expect(msg['@type']).toBeUndefined()
    expect(msg.attachments).toHaveLength(1)
    expect(msg.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive')
    const card = msg.attachments[0].content
    expect(card.type).toBe('AdaptiveCard')
    expect(Number(card.version)).toBeGreaterThanOrEqual(1.4)
    expect(card.body.map((b: any) => b.text)).toEqual([
      'Helena Marsh’s week is waiting for you',
      'Helena Marsh filed 40 hours for the week ending Oct 3. Approve it or send it back.',
    ])
    expect(card.actions).toEqual([
      { type: 'Action.OpenUrl', title: 'Open in Etyme', url: 'https://app.etyme.example/dashboard/timesheets' },
    ])
  })

  it('the card carries the notice’s own words and nothing else, so no figure is added to it', () => {
    const card = teamsCard('Title', 'The sentence.', null).attachments[0].content
    const text = JSON.stringify(card)
    expect(text).not.toMatch(/\$\d/)
    expect(card.body).toHaveLength(2)
  })

  it('with no page to open, the card has no button rather than a button to nowhere', () => {
    expect(teamsCard('T', 'B', null).attachments[0].content).not.toHaveProperty('actions')
    expect(teamsCard('T', 'B', 'http://localhost:3000/dashboard').attachments[0].content).not.toHaveProperty('actions')
  })

  it('the button opens this deployment’s own page only when the deployment knows its address', () => {
    const before = { app: process.env.NEXT_PUBLIC_APP_URL, vercel: process.env.VERCEL_URL, auth: process.env.NEXTAUTH_URL }
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXTAUTH_URL
    delete process.env.VERCEL_URL
    expect(appLink('/dashboard/timesheets')).toBeNull()
    process.env.VERCEL_URL = 'etyme-preview.vercel.app'
    expect(appLink('/dashboard/timesheets')).toBe('https://etyme-preview.vercel.app/dashboard/timesheets')
    if (before.app !== undefined) process.env.NEXT_PUBLIC_APP_URL = before.app
    if (before.auth !== undefined) process.env.NEXTAUTH_URL = before.auth
    if (before.vercel !== undefined) process.env.VERCEL_URL = before.vercel
    else delete process.env.VERCEL_URL
  })

  it('the sender refuses to post to a retired link even when asked directly, and says why', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const teams = configuredSenders().find((s) => s.channel === 'TEAMS')!
    await expect(teams.send(RETIRED, 'T', 'B')).rejects.toThrow(TEAMS_LINK_RETIRED_SENTENCE)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a Workflows link that refuses the post is recorded as failed, with the status it gave', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 400 })))
    const o = await attemptDelivery(routeFor(business()), WORKFLOWS, 'T', 'B', configuredSenders(), NOW)
    expect(o.state).toBe('FAILED')
    expect(o.note).toBe('The Teams Workflows link returned 400')
  })

  it('a post a Workflows link accepted is recorded with the note that proves Teams heard', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 202 })))
    const o = await attemptDelivery(routeFor(business()), WORKFLOWS, 'T', 'B', configuredSenders(), NOW)
    expect(o.state).toBe('SENT')
    expect(o.note).toBe(TEAMS_WORKFLOWS_SENT_NOTE)
  })

  it('a post to an unrecognized link saved before the check is never counted as proof', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))
    const url = 'https://hooks.example.com/teams'
    const o = await attemptDelivery(
      routeFor(business({ teamsWebhookUrl: url })), url, 'T', 'B', configuredSenders(), NOW
    )
    expect(o.state).toBe('SENT')
    expect(o.note).not.toBe(TEAMS_WORKFLOWS_SENT_NOTE)
  })
})

describe('what the health and ready pages say about Teams', () => {
  it('Teams is not set up while the only saved links are the retired kind, and the page says how many', () => {
    const counted = countTeamsLinks([RETIRED, RETIRED_OUTLOOK, null])
    expect(counted).toEqual({ workflowsChannels: 0, retiredChannels: 2 })
    const e = teamsEdge({ ...counted, postedByWorkflows: 0 })
    expect(e.state).toBe('MISSING')
    expect(e.says).toContain('2 companies still have the kind of link Microsoft switched off in May 2026')
  })

  it('Teams is set up once a company has a Workflows link, and proven only once one has posted', () => {
    expect(teamsEdge({ workflowsChannels: 1, retiredChannels: 0, postedByWorkflows: 0 }).state).toBe('SET')
    const proven = teamsEdge({ workflowsChannels: 1, retiredChannels: 0, postedByWorkflows: 3 })
    expect(proven.state).toBe('PROVEN')
    expect(proven.says).toBe('3 messages have been posted to Teams through a Workflows link.')
  })
})
