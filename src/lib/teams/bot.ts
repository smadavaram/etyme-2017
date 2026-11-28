/**
 * What the Etyme bot does with one activity Teams sent it, after the
 * route has checked the activity really came from Teams.
 *
 *   installed            note where the person is, bind them, and say
 *                        hello in a sentence — or say why not
 *   a message, 1:1       bind, note the chat, and answer with what needs
 *                        them now, or that nothing does
 *   a message, channel   never answer with amounts or names in a room:
 *                        point to the person's own chat
 *   a button pressed     bind, then hand it to the twin's approval door
 *                        (lib/teams/actions) and say what the door said
 *
 * Every person is bound on every activity, not once: a seat revoked this
 * morning cannot approve from Teams this afternoon.
 */

import type { TeamsBotConfig } from '@/lib/teams/config'
import { getMember, sendToConversation, updateActivity, type TeamsMember } from '@/lib/teams/connector'
import { bindTeamsIdentity, type Binding } from '@/lib/teams/binding'
import { rememberConversation } from '@/lib/teams/store'
import { answerCardAction, type ActionAnswer } from '@/lib/teams/actions'
import { answeredCard, asMessage, readCardAction, type CardAction } from '@/lib/teams/cards'
import { cardForAsker } from '@/lib/teams/digest'
import { reportError } from '@/lib/alerts'

/** The parts of a Bot Framework activity the bot reads. */
export interface Activity {
  type?: string
  name?: string
  id?: string
  replyToId?: string
  text?: string
  value?: unknown
  action?: string
  serviceUrl?: string
  channelId?: string
  from?: { id?: string; name?: string; aadObjectId?: string }
  recipient?: { id?: string; name?: string }
  conversation?: { id?: string; conversationType?: string; tenantId?: string }
  channelData?: { tenant?: { id?: string } }
  membersAdded?: { id?: string }[]
}

export interface BotReply {
  status: number
  /** For an invoke, the body Teams reads back. */
  body?: unknown
}

export interface BotDeps {
  member: (config: TeamsBotConfig, a: Activity) => Promise<TeamsMember | null>
  bind: typeof bindTeamsIdentity
  remember: typeof rememberConversation
  send: (config: TeamsBotConfig, a: Activity, activity: Record<string, unknown>) => Promise<void>
  update: (config: TeamsBotConfig, a: Activity, activity: Record<string, unknown>) => Promise<void>
  answer: (action: CardAction, bound: Extract<Binding, { ok: true }>['bound']) => Promise<ActionAnswer>
  asked: typeof cardForAsker
}

export const LIVE: BotDeps = {
  member: (config, a) =>
    a.serviceUrl && a.conversation?.id && a.from?.id ? getMember(config, a.serviceUrl, a.conversation.id, a.from.id) : Promise.resolve(null),
  bind: bindTeamsIdentity,
  remember: rememberConversation,
  send: async (config, a, activity) => {
    if (a.serviceUrl && a.conversation?.id) {
      await sendToConversation(config, a.serviceUrl, a.conversation.id, { ...activity, ...(a.id ? { replyToId: a.id } : {}) })
    }
  },
  update: async (config, a, activity) => {
    if (a.serviceUrl && a.conversation?.id && a.replyToId) {
      await updateActivity(config, a.serviceUrl, a.conversation.id, a.replyToId, activity)
    }
  },
  answer: (action, bound) => answerCardAction(action, bound),
  asked: cardForAsker,
}

const tenantOf = (a: Activity) => a.channelData?.tenant?.id ?? a.conversation?.tenantId ?? null
const personal = (a: Activity) => a.conversation?.conversationType === 'personal'
const say = (text: string) => ({ type: 'message', text })

export const IN_A_ROOM =
  'I answer in a chat with you, not in a channel, so amounts and names stay between us. Open the chat with Etyme from the Apps list in Teams.'

async function bindAndRemember(config: TeamsBotConfig, a: Activity, deps: BotDeps): Promise<Binding> {
  const member = await deps.member(config, a)
  const binding = await deps.bind({
    userPrincipalName: member?.userPrincipalName ?? null,
    email: member?.email ?? null,
    aadObjectId: member?.aadObjectId ?? a.from?.aadObjectId ?? null,
    tenantId: member?.tenantId ?? tenantOf(a),
    teamsUserId: a.from?.id ?? null,
    name: member?.name ?? a.from?.name ?? null,
  })
  if (binding.ok && a.serviceUrl && a.from?.id) {
    const tenantId = member?.tenantId ?? tenantOf(a) ?? ''
    await deps.remember({
      personId: binding.bound.personId,
      companyId: binding.bound.companyId,
      contextId: binding.bound.contextId,
      tenantId,
      aadObjectId: member?.aadObjectId ?? a.from.aadObjectId ?? '',
      teamsUserId: a.from.id,
      serviceUrl: a.serviceUrl,
      botId: a.recipient?.id ?? null,
      ...(personal(a) && a.conversation?.id ? { personalConversationId: a.conversation.id } : {}),
    }).catch(() => undefined)
  }
  return binding
}

function welcome(name: string, company: string): string {
  return (
    `You are connected as ${name} at ${company}. ` +
    'I will write here when an invoice receipt needs your approval or somebody is near the time limit, and only then. ' +
    'Write anything to me to see what needs you now.'
  )
}

/** One activity in, what to answer. Never throws. */
export async function handleActivity(a: Activity, config: TeamsBotConfig, deps: BotDeps = LIVE): Promise<BotReply> {
  try {
    // ── Installed, or the bot added to a conversation ──
    const added = a.type === 'conversationUpdate' && (a.membersAdded ?? []).some((m) => m.id && m.id === a.recipient?.id)
    const installed = a.type === 'installationUpdate' && (a.action ?? 'add').startsWith('add')
    if (added || installed) {
      if (!personal(a)) {
        await deps.send(config, a, say('Etyme is added here. It writes to each person in a chat of their own, so amounts and names stay out of the channel.'))
        return { status: 200 }
      }
      const b = await bindAndRemember(config, a, deps)
      await deps.send(config, a, say(b.ok ? welcome(b.bound.personName, b.bound.companyName) : b.says))
      return { status: 200 }
    }

    // ── A button pressed: Action.Submit arrives as a message with a value,
    //    a Universal Action as an invoke ──
    const invoke = a.type === 'invoke' && a.name === 'adaptiveCard/action'
    const raw = invoke ? (a.value as { action?: { data?: unknown } } | undefined)?.action?.data : a.type === 'message' ? a.value : undefined
    if (raw !== undefined && raw !== null) {
      const action = readCardAction(raw)
      const said = await (async (): Promise<ActionAnswer> => {
        if (!action) return { says: 'That button is not one of Etyme’s, so nothing was done.' }
        const b = await bindAndRemember(config, a, deps)
        if (!b.ok) return { says: b.says }
        return deps.answer(action, b.bound)
      })()
      if (said.answered) await deps.update(config, a, asMessage(answeredCard(said.answered.title, said.answered.sentence))).catch(() => undefined)
      if (invoke) {
        return { status: 200, body: { statusCode: 200, type: 'application/vnd.microsoft.activity.message', value: said.says } }
      }
      await deps.send(config, a, say(said.says))
      return { status: 200 }
    }

    // ── Somebody wrote to the bot ──
    if (a.type === 'message') {
      if (!personal(a)) {
        await deps.send(config, a, say(IN_A_ROOM))
        return { status: 200 }
      }
      const b = await bindAndRemember(config, a, deps)
      if (!b.ok) {
        await deps.send(config, a, say(b.says))
        return { status: 200 }
      }
      const card = await deps.asked(b.bound.personId, b.bound.companyId)
      await deps.send(config, a, card ?? say(`Nothing needs you at ${b.bound.companyName} today. I will write here when something does.`))
      return { status: 200 }
    }

    return { status: 200 }
  } catch (err) {
    // Staff hear; Teams is told it failed and may retry.
    await reportError('teams/messages', err, { path: '/api/teams/messages' }).catch(() => undefined)
    return { status: 500 }
  }
}
