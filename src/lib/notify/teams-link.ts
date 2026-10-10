/**
 * A company's Teams link: which kind it is, whether it still works, and
 * what a notice posted to it looks like.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * Teams used to take a message through an "incoming webhook" — an Office
 * 365 Connector link on `*.webhook.office.com` — and Etyme posted a
 * legacy MessageCard to it. Microsoft switched those links off in Teams
 * in May 2026 (rollout May 18–22). The replacement is a Workflows link:
 * a Power Automate flow, "When a Teams webhook request is received",
 * which takes an Adaptive Card and posts it to a channel.
 *
 * Nothing in Etyme noticed. The sender went on posting the old card to
 * the old links, `senderStatus` went on saying Teams was configured, and
 * /ready went on counting a saved link as a channel. So a business user
 * whose company had saved a link before May heard nothing, and every
 * screen that could have said so said the opposite.
 *
 * So the kind of link is read off its address, here, once:
 *
 *   WORKFLOWS  a Power Automate link. Posted to as an Adaptive Card.
 *   RETIRED    an Office 365 Connector link. Never posted to; refused
 *              when saved; a company that still has one is reached by
 *              email instead, with the reason on the row, and its
 *              settings desk is told once that the link needs replacing.
 *   OTHER      an https address that is neither. Refused when saved,
 *              because a Teams link is where a company's notices go and
 *              an unknown host is not somewhere to send them. One saved
 *              before this check is still tried, and a failure is
 *              recorded as FAILED rather than guessed at.
 *   INVALID    not an https address at all.
 *
 * Pure: no database, no network. `lib/senders` posts the card;
 * `lib/notification-delivery` routes on the kind; `lib/notify` writes
 * the outcome.
 */

export type TeamsLinkKind = 'WORKFLOWS' | 'RETIRED' | 'OTHER' | 'INVALID'

/**
 * Hosts a Workflows link is served from. Power Automate hands out either
 * a Logic Apps address (`prod-27.westus.logic.azure.com`) or, for flows
 * created since 2025, an environment address
 * (`<env>.environment.api.powerplatform.com`). The `.us` Logic Apps
 * host is the US government cloud, where some clients' tenants live.
 */
const WORKFLOWS_HOST_SUFFIXES = [
  '.logic.azure.com',
  '.logic.azure.us',
  '.environment.api.powerplatform.com',
]

/** The Office 365 Connector hosts Microsoft switched off in Teams. */
const RETIRED_HOST_SUFFIX = '.webhook.office.com'
const RETIRED_OUTLOOK_HOSTS = ['outlook.office.com', 'outlook.office365.com']

function parse(url: string): URL | null {
  try {
    return new URL(url.trim())
  } catch {
    return null
  }
}

export function teamsLinkKind(url: string | null | undefined): TeamsLinkKind {
  if (!url) return 'INVALID'
  const u = parse(url)
  if (!u || u.protocol !== 'https:') return 'INVALID'
  const host = u.hostname.toLowerCase()
  if (host === 'webhook.office.com' || host.endsWith(RETIRED_HOST_SUFFIX)) return 'RETIRED'
  if (RETIRED_OUTLOOK_HOSTS.includes(host) && /^\/webhook(b2)?\//i.test(u.pathname)) return 'RETIRED'
  if (WORKFLOWS_HOST_SUFFIXES.some((s) => host.endsWith(s))) return 'WORKFLOWS'
  return 'OTHER'
}

// ── Saving a link ────────────────────────────────────────────────────

/** What the settings screen tells somebody about to paste a link. */
export const TEAMS_LINK_HOW_TO =
  'In Teams, open the channel, choose Workflows, and add “Post to a channel when a webhook ' +
  'request is received”. Finish the steps, copy the link it gives you, and paste it here.'

export const TEAMS_LINK_RETIRED_SENTENCE =
  'Microsoft switched off this kind of Teams link in May 2026. In Teams, add the Workflows ' +
  'app’s ‘Post to a channel when a webhook request is received’ and paste its link here.'

export type TeamsLinkCheck =
  | { ok: true; url: string | null }
  | { ok: false; message: string }

/**
 * The check a link passes before it is saved.
 *
 * Empty clears the link, which is always allowed: a company may stop
 * hearing on Teams and go back to email. Anything else must be a
 * Workflows link, and the refusal says what to paste instead.
 */
export function checkTeamsLink(raw: unknown): TeamsLinkCheck {
  if (raw === null || raw === undefined) return { ok: true, url: null }
  if (typeof raw !== 'string') {
    return { ok: false, message: 'A Teams link is a web address. ' + TEAMS_LINK_HOW_TO }
  }
  const url = raw.trim()
  if (url === '') return { ok: true, url: null }
  switch (teamsLinkKind(url)) {
    case 'WORKFLOWS':
      return { ok: true, url }
    case 'RETIRED':
      return { ok: false, message: TEAMS_LINK_RETIRED_SENTENCE }
    case 'INVALID':
      return { ok: false, message: 'A Teams link starts with https://. ' + TEAMS_LINK_HOW_TO }
    case 'OTHER':
      return {
        ok: false,
        message: 'This is not a Teams Workflows link. ' + TEAMS_LINK_HOW_TO,
      }
  }
}

// ── A link already saved ─────────────────────────────────────────────

export type TeamsLinkStanding =
  | { state: 'NONE'; says: string }
  | { state: 'WORKS'; says: string }
  | { state: 'NEEDS_NEW_LINK'; says: string }

/**
 * What the settings screen says about the link a company already has.
 *
 * This is the mark on a company whose saved link is the retired kind. It
 * is read off the link itself rather than stored beside it, so it cannot
 * disagree with the link, and it clears the moment a Workflows link is
 * saved.
 */
export function teamsLinkStanding(url: string | null | undefined): TeamsLinkStanding {
  if (!url) {
    return {
      state: 'NONE',
      says: 'No Teams channel is set up. Notifications for this company go by email.',
    }
  }
  const kind = teamsLinkKind(url)
  if (kind === 'RETIRED') {
    return {
      state: 'NEEDS_NEW_LINK',
      says:
        'This Teams link no longer works: Microsoft switched off this kind of link in May 2026. ' +
        'Notifications for this company go by email until a new link is saved. ' +
        TEAMS_LINK_HOW_TO,
    }
  }
  if (kind === 'WORKFLOWS') {
    return { state: 'WORKS', says: 'Notifications for this company post to Teams.' }
  }
  return {
    state: 'NEEDS_NEW_LINK',
    says:
      'This Teams link is not a Workflows link, so it may not work. Notifications that fail ' +
      'are shown as failed on the notifications page. ' + TEAMS_LINK_HOW_TO,
  }
}

// ── Routing on a saved link ──────────────────────────────────────────

/**
 * The reason written on a notification that went by email because the
 * company's Teams link is the retired kind. Constant so a report can
 * count these and the settings desk can be shown how many it missed.
 */
export const RETIRED_LINK_ROUTE_REASON =
  'This company’s Teams link is the kind Microsoft switched off in May 2026, so email instead. ' +
  'Save a Workflows link in Settings to post to Teams again.'

// ── The card ─────────────────────────────────────────────────────────

/**
 * The note on a notification that a Workflows link accepted. /ready
 * counts Teams as proven on these and not on any older TEAMS row, which
 * may have gone to a retired connector before May 2026.
 */
export const TEAMS_WORKFLOWS_SENT_NOTE = 'Posted to the company’s Teams channel'

/**
 * What a Workflows link is sent: one message carrying one Adaptive Card.
 *
 * The title, the sentence, and "Open in Etyme" where there is a page to
 * open. Plain text only — the notice's own words, no formatting added
 * and no figure the notice did not already say.
 */
export function teamsCard(title: string, body: string, link?: string | null) {
  const open = link && /^https:\/\//i.test(link) ? link : null
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true },
            { type: 'TextBlock', text: body, wrap: true },
          ],
          ...(open ? { actions: [{ type: 'Action.OpenUrl', title: 'Open in Etyme', url: open }] } : {}),
        },
      },
    ],
  }
}


// ── What the health and ready pages say ──────────────────────────────

export interface TeamsFacts {
  /** Companies whose saved link is a Workflows link. */
  workflowsChannels: number
  /** Companies whose saved link is the retired connector kind. */
  retiredChannels: number
  /** Notifications a Workflows link accepted (`TEAMS_WORKFLOWS_SENT_NOTE`). */
  postedByWorkflows: number
}

/** Count the saved links by kind, for whoever gathers the facts. */
export function countTeamsLinks(urls: readonly (string | null)[]): {
  workflowsChannels: number
  retiredChannels: number
} {
  let workflowsChannels = 0
  let retiredChannels = 0
  for (const u of urls) {
    const k = teamsLinkKind(u)
    if (k === 'WORKFLOWS') workflowsChannels++
    else if (k === 'RETIRED') retiredChannels++
  }
  return { workflowsChannels, retiredChannels }
}

export type TeamsEdgeState = 'MISSING' | 'SET' | 'PROVEN'

/**
 * The Teams edge, honestly: set up only once a company has a Workflows
 * link, proven only once one has posted. A retired link counts for
 * neither, and is named so whoever reads the page knows who to call.
 */
export function teamsEdge(f: TeamsFacts): { state: TeamsEdgeState; says: string; fix?: string } {
  const retired =
    f.retiredChannels > 0
      ? ` ${f.retiredChannels === 1 ? '1 company still has' : `${f.retiredChannels} companies still have`} the kind of link Microsoft switched off in May 2026, and ${f.retiredChannels === 1 ? 'is' : 'are'} reached by email instead.`
      : ''
  if (f.workflowsChannels === 0) {
    return {
      state: 'MISSING',
      says: 'No company has a Teams Workflows link saved. Business users hear nothing in Teams.' + retired,
      fix: 'In a company’s Settings, paste a Workflows link. ' + TEAMS_LINK_HOW_TO,
    }
  }
  const saved = `${f.workflowsChannels === 1 ? '1 company has' : `${f.workflowsChannels} companies have`} a Workflows link saved.`
  if (f.postedByWorkflows === 0) {
    return {
      state: 'SET',
      says: `${saved} Nothing has been posted through one yet.${retired}`,
      fix: 'Do something that notifies that company — approve a timesheet, raise a job request — and look at the channel.',
    }
  }
  return {
    state: 'PROVEN',
    says: `${f.postedByWorkflows === 1 ? '1 message has' : `${f.postedByWorkflows} messages have`} been posted to Teams through a Workflows link.${retired}`,
  }
}
