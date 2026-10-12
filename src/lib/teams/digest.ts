/**
 * The nightly word in Teams, after the twin has run.
 *
 *   tellProgramOwnerOnTeams(companyId)
 *
 * Called by the twin's nightly run after `runTwin` (the architect's
 * lib/twin/run.ts). One card per person, each item with its own buttons:
 * "3 invoice receipts need approval · 1 time-limit risk".
 *
 * ── Who gets what ────────────────────────────────────────────────────
 *
 * Nobody gets a message they cannot act on. The program owner — the seat
 * the twin acts under — is told the time-limit risks, which are theirs.
 * An invoice receipt goes to whoever may actually approve it: a person at
 * the company holding the desk the question needs, who is not the person
 * on whose authority the twin asked (the approval door refuses that
 * person, so a button for them would be a button that only says no).
 * Where the program owner may approve too, it is on their card.
 *
 * ── How often ────────────────────────────────────────────────────────
 *
 * A nudge has a cost. Each item is said when it first appears, and once
 * more when an invoice receipt is two days from due — never every night
 * in between. What was said is read off the notice that said it, the way
 * cron/watch does, so there is no second table to keep in step. With
 * nothing new, nothing is sent: an empty digest teaches people to stop
 * reading.
 *
 * ── How it travels ───────────────────────────────────────────────────
 *
 * In the person's own chat with the Etyme bot where the bot has one
 * (lib/teams/store), opening it where the bot knows the person but not
 * yet the chat. Otherwise — no keys, never bound, Teams refused — the
 * existing notice: the company's Teams Workflows channel, else email
 * (`notify` with channel TEAMS, lib/notification-delivery).
 */

import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { reportError } from '@/lib/alerts'
import { hasPermission, type Permission } from '@/lib/permissions'
import { programManagerAt } from '@/lib/twin/run'
import { teamsBotConfig } from '@/lib/teams/config'
import { conversationFor, rememberConversation } from '@/lib/teams/store'
import { openPersonalChat, sendToConversation } from '@/lib/teams/connector'
import { asMessage, digestCard, digestHeading, invoiceTitle, tenureTitle, type InvoiceApprovalFacts, type TenureAlertFacts } from '@/lib/teams/cards'
import { INVOICE_APPROVE, TENURE_TOLD, invoiceApprovalFacts, tenureAlertFacts } from '@/lib/teams/facts'

/** The note on a digest the bot itself delivered, so /ready can count it. */
export const TEAMS_BOT_SENT_NOTE = 'Sent by the Etyme bot in Teams'

const DAY = 24 * 60 * 60 * 1000
/** How near due an invoice receipt is said a second time. */
export const LAST_CALL_DAYS = 2
/** How far back a time-limit warning is still news. */
const RISK_WINDOW_DAYS = 8

const marker = (companyId: string) => `twin-digest:${companyId}`

export interface DigestItemKey {
  key: string
  /** The second time, just before it cannot be fixed. */
  lastCall?: string
}

/**
 * Which items to say tonight, pure: new ones, and once more those whose
 * last call has come. `due` says whether an item's last call has come.
 */
export function toSay<T extends { keys: DigestItemKey }>(items: readonly T[], said: ReadonlySet<string>, due: (item: T) => boolean): { item: T; keys: string[] }[] {
  const out: { item: T; keys: string[] }[] = []
  for (const it of items) {
    if (!said.has(it.keys.key)) {
      out.push({ item: it, keys: [it.keys.key, ...(it.keys.lastCall && due(it) ? [it.keys.lastCall] : [])] })
    } else if (it.keys.lastCall && !said.has(it.keys.lastCall) && due(it)) {
      out.push({ item: it, keys: [it.keys.lastCall] })
    }
  }
  return out
}

async function alreadySaid(personId: string, companyId: string): Promise<Set<string>> {
  const rows = await prisma.notification.findMany({
    where: { personId, entityId: marker(companyId) },
    select: { data: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  const out = new Set<string>()
  for (const r of rows) {
    const keys = (r.data as { saidKeys?: unknown } | null)?.saidKeys
    if (Array.isArray(keys)) for (const k of keys) if (typeof k === 'string') out.add(k)
  }
  return out
}

interface Recipient {
  personId: string
  permissions: readonly string[]
}

/** May this person answer this question? The approval door's own two rules, asked first. */
function mayDecide(r: Recipient, needs: string, authorityPersonId: string | null, requestedBy: string | null): boolean {
  if (r.personId === authorityPersonId || (requestedBy && r.personId === requestedBy)) return false
  return hasPermission(r.permissions, needs as Permission)
}

export interface DigestFor {
  invoices: InvoiceApprovalFacts[]
  risks: TenureAlertFacts[]
  keys: string[]
}

/**
 * What one person is to be told at one company. `all` ignores what was
 * already said — the answer to somebody asking the bot "what needs me".
 */
export async function digestFor(personId: string, companyId: string, opts: { all?: boolean; now?: Date } = {}): Promise<DigestFor> {
  const now = opts.now ?? new Date()
  const seat = await prisma.context.findFirst({
    where: { personId, companyId, revokedAt: null, suspendedAt: null, type: { not: 'CONSULTANT' } },
    select: { role: { select: { permissions: true } } },
    orderBy: { grantedAt: 'desc' },
  })
  if (!seat) return { invoices: [], risks: [], keys: [] }
  const me: Recipient = { personId, permissions: (seat.role?.permissions as string[] | undefined) ?? [] }
  const owner = await programManagerAt(companyId)

  const pending = await prisma.twinApproval.findMany({
    where: { companyId, decision: 'PENDING', twinAction: { action: INVOICE_APPROVE } },
    select: { id: true, needsPermission: true, twinAction: { select: { authorityPersonId: true, payload: true } } },
    orderBy: { requestedAt: 'asc' },
    take: 50,
  })
  const mine = pending.filter((a) =>
    mayDecide(me, a.needsPermission, a.twinAction.authorityPersonId, ((a.twinAction.payload ?? {}) as { requestedByPersonId?: string }).requestedByPersonId ?? null))
  const invoices: (InvoiceApprovalFacts & { keys: DigestItemKey })[] = []
  for (const a of mine) {
    const f = await invoiceApprovalFacts(a.id, companyId)
    if (f) invoices.push({ ...f, keys: { key: `invoice:${a.id}`, lastCall: `invoice:${a.id}:due` } })
  }

  const risks: (TenureAlertFacts & { keys: DigestItemKey })[] = []
  if (owner.personId === personId) {
    const told = await prisma.twinAction.findMany({
      where: { companyId, action: TENURE_TOLD, outcome: 'PERFORMED', ts: { gte: new Date(now.getTime() - RISK_WINDOW_DAYS * DAY) } },
      select: { id: true },
      orderBy: { ts: 'asc' },
      take: 50,
    })
    for (const t of told) {
      const f = await tenureAlertFacts(t.id, companyId, {
        personId,
        mayEscalate: (q) => mayDecide(me, q.needsPermission, q.authorityPersonId, null),
      }, now)
      if (f) risks.push({ ...f, keys: { key: `risk:${t.id}` } })
    }
  }

  if (opts.all) {
    return { invoices, risks, keys: [] }
  }
  const said = await alreadySaid(personId, companyId)
  const dueSoon = (f: { dueAt?: string | null }) => !!f.dueAt && new Date(f.dueAt).getTime() - now.getTime() <= LAST_CALL_DAYS * DAY
  const inv = toSay(invoices, said, dueSoon)
  const rk = toSay(risks, said, () => false)
  return {
    invoices: inv.map((x) => x.item),
    risks: rk.map((x) => x.item),
    keys: [...inv.flatMap((x) => x.keys), ...rk.flatMap((x) => x.keys)],
  }
}

/** The same digest as plain lines, for the channel or the email that stands in for the bot. */
export function digestLines(d: Pick<DigestFor, 'invoices' | 'risks'>): string {
  const lines = [
    ...d.invoices.map((f) => `• ${invoiceTitle(f)}${f.variances.length ? ` — ${f.variances[0]}` : ''}`),
    ...d.risks.map((f) => `• ${tenureTitle(f)}`),
  ]
  return `${lines.join('\n')}\n\nOpen Etyme to approve or look into each one.`
}

export interface TeamsDigestResult {
  personId: string
  via: 'BOT' | 'FALLBACK' | 'NOTHING'
  items: number
  why?: string
}

/** Send one person their digest, by the bot where it can, else the existing notice. */
async function sendDigest(personId: string, companyId: string, now: Date): Promise<TeamsDigestResult> {
  const d = await digestFor(personId, companyId, { now })
  const heading = digestHeading(d.invoices.length, d.risks.length)
  const card = digestCard(d.invoices, d.risks)
  if (!heading || !card) return { personId, via: 'NOTHING', items: 0 }
  const items = d.invoices.length + d.risks.length
  const record = { saidKeys: d.keys, href: '/dashboard', twinDigest: true }

  const config = teamsBotConfig()
  const ref = config ? await conversationFor(personId, companyId) : null
  let why = config ? (ref ? '' : 'The bot has never been opened by this person in Teams.') : 'The Teams bot has no keys on this deployment.'
  if (config && ref) {
    let chat = ref.personalConversationId
    if (!chat) {
      chat = await openPersonalChat(config, ref.serviceUrl, { teamsUserId: ref.teamsUserId, tenantId: ref.tenantId })
      if (chat) await rememberConversation({ ...ref, personalConversationId: chat }).catch(() => undefined)
    }
    if (chat) {
      const sent = await sendToConversation(config, ref.serviceUrl, chat, asMessage(card, heading))
      if (sent.ok) {
        await prisma.notification.create({
          data: {
            personId, companyId, type: 'SYSTEM', title: heading, body: digestLines(d),
            entityId: marker(companyId), data: record,
            channel: 'TEAMS', status: 'READ', deliveryState: 'SENT', deliveryNote: TEAMS_BOT_SENT_NOTE, deliveredAt: new Date(),
          },
        })
        return { personId, via: 'BOT', items }
      }
      why = `Teams did not take the card: ${sent.why}`
    } else {
      why = 'Teams would not open a chat with this person.'
    }
  }

  await notify({
    personId, companyId, type: 'SYSTEM', channel: 'TEAMS',
    title: heading, body: digestLines(d), entityId: marker(companyId), data: record,
  })
  return { personId, via: 'FALLBACK', items, why }
}

/**
 * The function the nightly run calls after `runTwin`. Never throws: a
 * failure is reported to staff and the run goes on to the next program.
 */
export async function tellProgramOwnerOnTeams(companyId: string, opts: { now?: Date } = {}): Promise<TeamsDigestResult[]> {
  const now = opts.now ?? new Date()
  try {
    const owner = await programManagerAt(companyId)
    const needs = await prisma.twinApproval.findMany({
      where: { companyId, decision: 'PENDING', twinAction: { action: INVOICE_APPROVE } },
      select: { needsPermission: true },
      distinct: ['needsPermission'],
    })
    const desks = needs.length
      ? await prisma.context.findMany({
          where: {
            companyId, revokedAt: null, suspendedAt: null, type: { not: 'CONSULTANT' },
            role: { permissions: { hasSome: [...needs.map((n) => n.needsPermission), '*'] } },
          },
          select: { personId: true },
          take: 20,
        })
      : []
    const people = [...new Set([...(owner.personId ? [owner.personId] : []), ...desks.map((d) => d.personId)])]
    const out: TeamsDigestResult[] = []
    for (const personId of people) {
      try {
        out.push(await sendDigest(personId, companyId, now))
      } catch (err) {
        await reportError('teams/digest', err, { companyId, personId }).catch(() => undefined)
        out.push({ personId, via: 'NOTHING', items: 0, why: 'It could not be sent; staff have been told.' })
      }
    }
    return out
  } catch (err) {
    await reportError('teams/digest', err, { companyId }).catch(() => undefined)
    return []
  }
}

/** For the person who asks the bot: their open items, said or not, as one card. */
export async function cardForAsker(personId: string, companyId: string): Promise<Record<string, unknown> | null> {
  const d = await digestFor(personId, companyId, { all: true })
  const card = digestCard(d.invoices, d.risks)
  const heading = digestHeading(d.invoices.length, d.risks.length)
  return card && heading ? asMessage(card, heading) : null
}

