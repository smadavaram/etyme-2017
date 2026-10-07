import { prisma } from '@/lib/db'
import { notify, type NotifyParams } from '@/lib/notify'
import { teamsLinkKind } from '@/lib/notify/teams-link'
import { reportError } from '@/lib/alerts'

/**
 * A colleague signed in on the company's own domain, and the owner is
 * told who, and what to give them.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The founder, 2026-10-07 (CLAUDE.md, "Setup asks five things, then
 * stops"): somebody who signs in on a claimed domain gets a seat with a
 * default role at once, and the owner is told who joined and what to
 * give them. The seat is the architect's; this is the notice.
 *
 * ── What is said ─────────────────────────────────────────────────────
 *
 * One sentence that names the person, the address they came in on, the
 * company and the role they hold now, then one action:
 *
 *   "Priya Nair (priya@acme.com) joined Acme as Member. Give them a desk."
 *
 * The address is there because a name alone does not tell an owner
 * whether this is the Priya they hired or somebody using a shared inbox.
 * The record holds no pronoun, so the sentence says "them". The link
 * opens Users & permissions, where the desk is given.
 *
 * The joiner is told, in the app, that they are in and what happens
 * next. Only in the app: they have just signed in and are looking at it,
 * and on a company with a Teams channel an outward copy would post "You
 * are in" to everybody in the channel.
 *
 * ── Who hears, and on which channel ──────────────────────────────────
 *
 * Every Owner and Admin seat, in the app. Outside the app the company's
 * own rule holds: where it saved a Teams link, the channel hears it once
 * (five copies of one sentence in one channel is how a channel gets
 * muted); where it has none, each owner and admin gets an email.
 *
 * ── Told once ────────────────────────────────────────────────────────
 *
 * Sign-in can run twice for one person: a retry, a second tab, a seat
 * the architect re-grants. A joiner who already has a notice at this
 * company is not announced again, to the owners or to themselves.
 */

/** The seats that give a desk: the two that hold everything. */
export const GIVES_DESKS = ['Owner', 'Admin'] as const

/** Where a desk is given. */
export const ACCESS_PAGE = '/dashboard/access'

/** The mark a joined notice carries in `data.event`, which is how "told once" is read. */
export const JOINED_EVENT = 'COLLEAGUE_JOINED'
export const WELCOMED_EVENT = 'COLLEAGUE_WELCOMED'

export type Pronoun = 'she' | 'he' | 'they'

function objectOf(p: Pronoun | null | undefined): string {
  if (p === 'she') return 'her'
  if (p === 'he') return 'him'
  return 'them'
}

export interface Joiner {
  name: string
  email: string
  companyName: string
  roleName: string
  /** None is recorded today; "them" is said where the record has none. */
  pronoun?: Pronoun | null
}

/** The words the owners read. */
export function joinedSaid(j: Joiner): { title: string; body: string } {
  return {
    title: `${j.name} joined ${j.companyName}`,
    body: `${j.name} (${j.email}) joined ${j.companyName} as ${j.roleName}. Give ${objectOf(j.pronoun)} a desk.`,
  }
}

/**
 * The words the joiner reads. Where nobody holds an owner or admin seat,
 * "your owner has been told" would be untrue, so the sentence says who
 * to ask instead.
 */
export function welcomeSaid(input: { companyName: string; roleName: string; ownersTold: boolean }): {
  title: string
  body: string
} {
  const first = `You are in at ${input.companyName} as ${input.roleName}.`
  return {
    title: `You are in at ${input.companyName}`,
    body: input.ownersTold
      ? `${first} Your owner has been told; you will see more once they give you a desk.`
      : `${first} Nobody at ${input.companyName} holds the Owner or Admin desk yet, so ask whoever set it up to give you a desk in Users & permissions.`,
  }
}

export interface JoinedPlan {
  companyId: string
  joinerId: string
  joiner: Joiner
  /** Owner and Admin seats, most senior first, the joiner never among them. */
  ownerIds: string[]
  /** The company saved a Teams link that is not the retired kind. */
  teamsLinked: boolean
}

/**
 * Every notice for one joiner — pure, so who hears on which channel is
 * read as tests.
 */
export function joinedNotices(plan: JoinedPlan): NotifyParams[] {
  const owners = Array.from(new Set(plan.ownerIds)).filter((id) => id !== plan.joinerId)
  const { title, body } = joinedSaid(plan.joiner)
  const data = { event: JOINED_EVENT, joinerId: plan.joinerId, href: ACCESS_PAGE }

  const out: NotifyParams[] = owners.map((personId, i) => ({
    personId,
    companyId: plan.companyId,
    type: 'SYSTEM',
    title,
    body,
    entityId: plan.joinerId,
    data,
    // The channel once, or every inbox: never the same post five times.
    ...(plan.teamsLinked
      ? i === 0
        ? { channel: 'TEAMS' as const }
        : {}
      : { channel: 'EMAIL' as const }),
  }))

  const welcome = welcomeSaid({
    companyName: plan.joiner.companyName,
    roleName: plan.joiner.roleName,
    ownersTold: owners.length > 0,
  })
  out.push({
    personId: plan.joinerId,
    companyId: plan.companyId,
    type: 'SYSTEM',
    title: welcome.title,
    body: welcome.body,
    entityId: plan.joinerId,
    data: { event: WELCOMED_EVENT, joinerId: plan.joinerId, href: '/dashboard' },
  })
  return out
}

/**
 * Tell the owners that somebody joined, and tell the joiner they are in.
 *
 * Called by the seat, after it is granted. Never throws: a slow bell must
 * never hold up somebody's first sign-in. Resolves to how many owners and
 * admins were told, and whether the joiner was; both zero and false when
 * this joiner was already announced at this company.
 */
export async function tellOwnerSomebodyJoined(
  companyId: string,
  personId: string,
  roleName: string
): Promise<{ owners: number; joiner: boolean }> {
  const none = { owners: 0, joiner: false }
  try {
    const already = await prisma.notification.findFirst({
      where: {
        companyId,
        entityId: personId,
        type: 'SYSTEM',
        data: { path: ['event'], equals: JOINED_EVENT },
      },
      select: { id: true },
    })
    const welcomed = await prisma.notification.findFirst({
      where: {
        companyId,
        personId,
        entityId: personId,
        type: 'SYSTEM',
        data: { path: ['event'], equals: WELCOMED_EVENT },
      },
      select: { id: true },
    })
    if (already || welcomed) return none

    const [company, person, seats] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { name: true, teamsWebhookUrl: true } }),
      prisma.person.findUnique({ where: { id: personId }, select: { name: true, primaryEmail: true } }),
      prisma.context.findMany({
        where: {
          companyId,
          revokedAt: null,
          suspendedAt: null,
          personId: { not: personId },
          role: { name: { in: [...GIVES_DESKS] } },
        },
        orderBy: { grantedAt: 'asc' },
        select: { personId: true },
      }),
    ])
    if (!company || !person) return none

    const url = company.teamsWebhookUrl
    const notices = joinedNotices({
      companyId,
      joinerId: personId,
      joiner: { name: person.name, email: person.primaryEmail, companyName: company.name, roleName },
      ownerIds: seats.map((s) => s.personId),
      teamsLinked: Boolean(url) && teamsLinkKind(url) !== 'RETIRED',
    })

    // One at a time through `notify`, so every row is written, delivered
    // and its outcome recorded the way every other notice is — a FAILED
    // row with the reason where it could not be, and staff told.
    let owners = 0
    let joiner = false
    for (const n of notices) {
      const row = await notify(n)
      if (!row) continue
      if (n.personId === personId) joiner = true
      else owners++
    }
    return { owners, joiner }
  } catch (err) {
    void reportError('notify: could not tell the owners somebody joined', err, { companyId, personId }).catch(() => {})
    return none
  }
}
