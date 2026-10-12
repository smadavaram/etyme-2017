/**
 * Where the bot can reach a person in Teams, kept so it can speak first.
 *
 * A bot may only start a message in a chat it has already been part of,
 * so on every message and every install the bot notes the conversation
 * and the Teams identity it was bound to, one row per person per company
 * seat (`TeamsConversation`, the architect's table). The nightly digest
 * reads it. Every read and write of it goes through this file.
 *
 * The row is the address, never a message, and it cascades away with the
 * person and with the company.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export interface TeamsReference {
  personId: string
  companyId: string
  contextId: string
  tenantId: string
  aadObjectId: string
  /** "29:…" — the person's id in Teams, which opens a one-to-one chat. */
  teamsUserId: string
  serviceUrl: string
  /** The one-to-one chat with the bot, once there is one. */
  personalConversationId: string | null
  /** The bot's own id in the conversation, "28:…". */
  botId: string | null
}

function readRef(row: { personId: string; companyId: string; tenantId: string; conversationReference: unknown }): TeamsReference | null {
  const d = row.conversationReference as Partial<TeamsReference> | null
  if (!d || typeof d.serviceUrl !== 'string' || typeof d.teamsUserId !== 'string') return null
  return {
    personId: row.personId,
    companyId: row.companyId,
    contextId: String(d.contextId ?? ''),
    tenantId: row.tenantId,
    aadObjectId: String(d.aadObjectId ?? ''),
    teamsUserId: d.teamsUserId,
    serviceUrl: d.serviceUrl,
    personalConversationId: typeof d.personalConversationId === 'string' ? d.personalConversationId : null,
    botId: typeof d.botId === 'string' ? d.botId : null,
  }
}

/**
 * Note where a bound person is in Teams. A channel message keeps the
 * personal chat already noted; a personal message replaces it.
 */
export async function rememberConversation(
  ref: Omit<TeamsReference, 'personalConversationId' | 'botId'> & { personalConversationId?: string | null; botId?: string | null },
): Promise<void> {
  const prior = await prisma.teamsConversation.findUnique({
    where: { personId_companyId: { personId: ref.personId, companyId: ref.companyId } },
    select: { personId: true, companyId: true, tenantId: true, conversationReference: true },
  })
  const before = prior ? readRef(prior) : null
  const next: TeamsReference = {
    ...ref,
    personalConversationId: ref.personalConversationId ?? before?.personalConversationId ?? null,
    botId: ref.botId ?? before?.botId ?? null,
  }
  const conversationReference = next as unknown as Prisma.InputJsonValue
  await prisma.teamsConversation.upsert({
    where: { personId_companyId: { personId: ref.personId, companyId: ref.companyId } },
    create: { personId: ref.personId, companyId: ref.companyId, tenantId: ref.tenantId, conversationReference },
    update: { tenantId: ref.tenantId, conversationReference },
  })
}

/** Where a person at a company can be reached in Teams; null where nowhere. */
export async function conversationFor(personId: string, companyId: string): Promise<TeamsReference | null> {
  const row = await prisma.teamsConversation.findUnique({
    where: { personId_companyId: { personId, companyId } },
    select: { personId: true, companyId: true, tenantId: true, conversationReference: true },
  })
  return row ? readRef(row) : null
}

/** How many people the bot has been bound to — the bot's "set up" fact for /ready. */
export async function boundCount(): Promise<number> {
  return prisma.teamsConversation.count()
}
