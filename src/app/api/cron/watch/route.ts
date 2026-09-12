import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { notifyBulk, type NotifyParams } from '@/lib/notify'
import { emit } from '@/lib/events'
import { hasPermission } from '@/lib/permissions'
import {
  watchVerifications,
  watchPurchaseOrders,
  watchAccess,
  watchPackets,
  ordered,
  digest,
  type Finding,
} from '@/lib/watch'
import { packetByKey, resolveItems, itemsToAsk, type HeldDocument } from '@/lib/packets'
import { sweepExpired } from '@/lib/holds'

/**
 * GET /api/cron/watch
 *
 * The thing that notices, and then does something.
 *
 * Everything else in this system records. A packet reopens when insurance
 * expires — but only when somebody opens the packets page. Access expires
 * and nobody is told. A purchase order runs out and the first anybody
 * hears is a supplier chasing a payment that will not match.
 *
 * This runs daily, works out what is worth acting on, tells the people who
 * can act, and where it can, acts: an insurance certificate two months
 * from lapsing has its request reopened and sent before anybody asks.
 *
 * Every action writes an AutomationLog row with a plain-English reason and
 * an honest reversible flag, because CLAUDE.md requires it of anything the
 * system does unprompted — and because a system that acts without saying
 * why is one people switch off.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const dry = request.nextUrl.searchParams.get('dry') === '1'

  // Holds that have run their thirty days go back before anything else
  // runs, so nobody is reported as represented by an agency that stopped
  // trying a month ago. Reads elsewhere already filter on the clock — this
  // is what makes the rows themselves honest.
  const holdsFreed = dry ? 0 : await sweepExpired(undefined, undefined, now)

  const findings = ordered([
    ...(await lookAtVerifications(now)),
    ...(await lookAtPurchaseOrders(now)),
    ...(await lookAtAccess(now)),
    ...(await lookAtPackets(now)),
  ])

  // Nothing at all is the ordinary outcome and is reported as silence
  // rather than as a cheerful all-clear.
  if (findings.length === 0) {
    return NextResponse.json({
      data: {
        found: 0, acted: 0, told: 0, holdsFreed,
        summary: holdsFreed > 0
          ? `${holdsFreed} representation ${holdsFreed === 1 ? 'hold' : 'holds'} went back. Nothing else worth anybody’s attention.`
          : 'Nothing worth anybody’s attention.',
      },
    })
  }

  let acted = 0
  const actions: string[] = []
  // Why it could not act, when it could not. A watcher that says it will
  // act and then silently does not is worse than one that never claimed
  // to: nobody knows a thing is unhandled until it bites.
  const couldNotAct: string[] = []

  if (!dry) {
    for (const f of findings.filter((x) => x.action === 'REOPEN_PACKET')) {
      const outcome = await reopenFor(f, now)
      if (outcome.done) {
        acted++
        actions.push(outcome.done)
      } else if (outcome.because) {
        couldNotAct.push(`${f.headline} — ${outcome.because}`)
      }
    }
  }

  const told = dry ? 0 : await tell(findings, now)

  return NextResponse.json({
    data: {
      found: findings.length,
      holdsFreed,
      blocking: findings.filter((f) => f.urgency === 'BLOCKING').length,
      acted,
      told,
      actions,
      couldNotAct,
      summary: digest(findings),
      findings: findings.slice(0, 50).map((f) => ({
        kind: f.kind,
        urgency: f.urgency,
        headline: f.headline,
        detail: f.detail,
        daysUntil: f.daysUntil,
      })),
    },
  })
}

// ── Looking ───────────────────────────────────────────────────────────

async function lookAtVerifications(now: Date): Promise<Finding[]> {
  const rows = await prisma.verification.findMany({
    where: {
      expiresAt: { not: null, lte: new Date(now.getTime() + 60 * 86_400_000) },
      status: { in: ['CLEAR', 'CONDITIONAL'] },
    },
    select: {
      id: true, companyId: true, personId: true, type: true, status: true, expiresAt: true,
      company: { select: { name: true } },
      person: { select: { name: true } },
    },
  })

  return watchVerifications(
    rows.map((v) => ({
      id: v.id,
      companyId: v.companyId,
      personId: v.personId,
      type: v.type,
      status: v.status,
      expiresAt: v.expiresAt,
      subjectName: v.company?.name ?? v.person?.name ?? 'Somebody',
    })),
    now
  )
}

async function lookAtPurchaseOrders(now: Date): Promise<Finding[]> {
  const rows = await prisma.purchaseOrder.findMany({
    where: { status: 'OPEN' },
    select: {
      id: true, issuedById: true, number: true, amount: true, endDate: true, status: true,
      issuedTo: { select: { name: true } },
      invoices: { select: { total: true, status: true } },
      sellContracts: { where: { state: { in: ['IN_PROGRESS', 'PAUSED'] } }, select: { id: true } },
    },
  })

  return watchPurchaseOrders(
    rows.map((po) => ({
      id: po.id,
      companyId: po.issuedById,
      number: po.number,
      supplierName: po.issuedTo.name,
      amountCents: Math.round(Number(po.amount) * 100),
      invoicedCents: po.invoices
        .filter((i) => !['VOID', 'CANCELLED'].includes(i.status))
        .reduce((s, i) => s + Math.round(Number(i.total) * 100), 0),
      endDate: po.endDate,
      status: po.status,
      liveContracts: po.sellContracts.length,
    })),
    now
  )
}

async function lookAtAccess(now: Date): Promise<Finding[]> {
  const rows = await prisma.context.findMany({
    where: { revokedAt: null, companyId: { not: null } },
    select: {
      id: true, companyId: true, expiresAt: true, lastUsedAt: true, grantedAt: true,
      person: { select: { name: true } },
      role: { select: { name: true } },
    },
  })

  return watchAccess(
    rows.map((c) => ({
      contextId: c.id,
      companyId: c.companyId!,
      personName: c.person.name,
      roleName: c.role?.name ?? null,
      expiresAt: c.expiresAt,
      lastUsedAt: c.lastUsedAt,
      grantedAt: c.grantedAt,
    })),
    now
  )
}

async function lookAtPackets(now: Date): Promise<Finding[]> {
  const rows = await prisma.documentPacket.findMany({
    where: { completedAt: null, cancelledAt: null },
    select: {
      id: true, companyId: true, label: true, recipientEmail: true,
      expiresAt: true, createdAt: true,
      items: { select: { required: true, state: true } },
    },
  })

  return watchPackets(
    rows.map((p) => ({
      id: p.id,
      companyId: p.companyId,
      label: p.label,
      recipientEmail: p.recipientEmail,
      expiresAt: p.expiresAt,
      createdAt: p.createdAt,
      outstandingRequired: p.items.filter((i) => i.required && i.state !== 'ACCEPTED' && i.state !== 'RECEIVED').length,
    })),
    now
  )
}

// ── Acting ────────────────────────────────────────────────────────────

/**
 * Reopen the request for something about to lapse.
 *
 * The whole point: the ask is already waiting when somebody looks, rather
 * than being a thing they must remember to start. Nothing is sent twice —
 * an open request for the same subject means this is already in hand.
 */
interface ActOutcome {
  done: string | null
  /** Empty when there was simply nothing to do. */
  because: string | null
}

async function reopenFor(f: Finding, now: Date): Promise<ActOutcome> {
  const verification = await prisma.verification.findUnique({
    where: { id: f.subjectId },
    select: {
      id: true, type: true, companyId: true, personId: true, expiresAt: true,
      company: { select: { id: true, name: true } },
    },
  })
  // Only a company's own cover is chased automatically. A person's
  // documents belong to a conversation somebody is already having.
  if (!verification?.companyId || !verification.company) {
    // A person's documents belong to a conversation somebody is already
    // having, so this is not a failure.
    return { done: null, because: null }
  }

  const spec = packetByKey('COMPLIANCE_ANNUAL')
  if (!spec) return { done: null, because: 'no annual refresh packet is defined' }

  // Whoever buys from this supplier — they are the ones a lapse stops, so
  // they are the ones who chase it.
  //
  // sellContractsIn is the client side of a contract, so this reads as
  // "companies that are the client on a live contract whose vendor is
  // them". Asking through sellContractsOut would have been circular: those
  // are already this company's own contracts.
  const holder = await prisma.company.findFirst({
    where: {
      OR: [
        { sellContractsIn: { some: { companyId: verification.companyId, state: { in: ['IN_PROGRESS', 'PAUSED'] } } } },
        // A firm holding this supplier on its counterparty register is a
        // firm whose placements a lapse would stop.
        { counterparties: { some: { otherCompanyId: verification.companyId, status: 'ACTIVE' } } },
      ],
    },
    select: { id: true, name: true },
  })

  // With nobody buying from them, there is no relationship to chase
  // through and the company is left to renew its own cover.
  const askingCompanyId = holder?.id ?? verification.companyId
  const chasingSelf = askingCompanyId === verification.companyId

  const already = await prisma.documentPacket.findFirst({
    where: {
      companyId: askingCompanyId,
      subjectCompanyId: verification.companyId,
      packetKey: spec.key,
      completedAt: null,
      cancelledAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true },
  })
  // Already in hand. Two lapsing certificates produce two findings and one
  // request, which is the right number.
  if (already) return { done: null, because: null }

  const held = await prisma.verification.findMany({
    where: { companyId: verification.companyId },
    select: { type: true, status: true, expiresAt: true },
  })
  const heldDocs: HeldDocument[] = held.map((v) => ({
    key: v.type,
    expiresAt: v.expiresAt,
    accepted: v.status === 'CLEAR' || v.status === 'CONDITIONAL',
  }))

  const asking = itemsToAsk(resolveItems(spec, heldDocs, now))
  if (asking.length === 0) return { done: null, because: null }

  // The thing that triggered this must actually be one of the things being
  // asked for. Otherwise a company holding a longer-dated certificate gets
  // a request for an optional W-9 and no explanation of why — which reads
  // as the system generating work for its own sake.
  if (!asking.some((a) => a.key === verification.type)) {
    return { done: null, because: null }
  }

  // Somebody to send it to, and somebody to record as having created it.
  const contact = await prisma.context.findFirst({
    where: { companyId: verification.companyId, revokedAt: null },
    orderBy: { grantedAt: 'asc' },
    select: { person: { select: { id: true, primaryEmail: true, name: true } } },
  })
  const creator = await prisma.context.findFirst({
    where: { companyId: askingCompanyId, revokedAt: null, role: { permissions: { hasSome: ['*', 'vendors.manage'] } } },
    select: { personId: true },
  })
  if (!contact) {
    return {
      done: null,
      because: `nobody at ${verification.company.name} has ever signed in, so there is no address to send to. Add a contact for them.`,
    }
  }
  if (!creator) {
    return {
      done: null,
      because: 'nobody here holds vendors.manage, so there is nobody to record as having asked',
    }
  }

  const packet = await prisma.documentPacket.create({
    data: {
      companyId: askingCompanyId,
      packetKey: spec.key,
      label: spec.label,
      purpose: spec.purpose,
      direction: 'COLLECT',
      subjectCompanyId: verification.companyId,
      recipientEmail: contact.person.primaryEmail,
      recipientName: contact.person.name,
      token: randomBytes(32).toString('base64url'),
      expiresAt: new Date(now.getTime() + 45 * 86_400_000),
      createdById: creator.personId,
      // Said to the recipient, so being asked again is not a mystery.
      reopenedReason:
        f.daysUntil !== null && f.daysUntil < 0
          ? `Your cover lapsed ${Math.abs(f.daysUntil)} days ago, which stops us placing anybody through you until it is renewed.`
          : `Your cover expires in ${f.daysUntil} days. Renewing before then means nothing has to stop.`,
      items: {
        create: asking.map((item, position) => ({
          key: item.key,
          label: item.label,
          hint: item.hint,
          required: item.required,
          position,
          state: 'PENDING',
        })),
      },
    },
    select: { id: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId: askingCompanyId,
      action: 'PACKET_REOPENED',
      summary: chasingSelf
        ? `Reminded ${verification.company.name} to renew ${asking.length} document(s) — ${f.headline}`
        : `Asked ${verification.company.name} for ${asking.length} document(s) — ${f.headline}`,
      // Plain English, as CLAUDE.md requires of anything done unprompted.
      reason: f.detail,
      payload: {
        packetId: packet.id,
        verificationId: verification.id,
        subjectCompanyId: verification.companyId,
        asked: asking.map((a) => a.key),
        daysUntil: f.daysUntil,
      },
      // Cancelling the request undoes this entirely.
      reversible: true,
    },
  })

  void emit({
    type: 'packet.requested',
    companyId: askingCompanyId,
    subjectType: 'DocumentPacket',
    subjectId: packet.id,
    // Nobody clicked anything. Recorded as the system's own act.
    actorKind: 'AUTOMATION',
    payload: {
      reopened: true,
      reason: f.kind,
      subjectCompanyId: verification.companyId,
      itemCount: asking.length,
    },
  })

  return {
    done: chasingSelf
      ? `Reminded ${verification.company.name} to renew ${asking.length} document(s)`
      : `Asked ${verification.company.name} for ${asking.length} document(s) on behalf of ${holder!.name}`,
    because: null,
  }
}

/**
 * Tell the people who can act.
 *
 * Not everybody — a compliance warning sent to a recruiter is noise, and
 * noise is how a system trains people to ignore it. Each kind of finding
 * goes to whoever holds the permission that lets them do something.
 */
async function tell(findings: Finding[], now: Date): Promise<number> {
  const NEEDS: Record<string, string> = {
    VERIFICATION_EXPIRED: 'vendors.manage',
    VERIFICATION_EXPIRING: 'vendors.manage',
    PO_EXHAUSTED: 'invoices.issue',
    PO_NEARLY_SPENT: 'invoices.issue',
    PO_ENDING: 'invoices.issue',
    ACCESS_EXPIRED: 'team.manage',
    ACCESS_EXPIRING: 'team.manage',
    ACCESS_NEVER_USED: 'team.manage',
    ACCESS_DORMANT: 'team.manage',
    PACKET_LINK_DEAD: 'vendors.manage',
    PACKET_GOING_QUIET: 'vendors.manage',
  }

  // Grouped per company and per permission, so one person gets one message
  // rather than eleven.
  const byCompany = new Map<string, Finding[]>()
  for (const f of findings) {
    if (!f.companyId) continue
    byCompany.set(f.companyId, [...(byCompany.get(f.companyId) ?? []), f])
  }

  const notifications: NotifyParams[] = []

  for (const [companyId, theirs] of byCompany) {
    const people = await prisma.context.findMany({
      where: { companyId, revokedAt: null },
      select: { personId: true, role: { select: { permissions: true } } },
    })

    for (const person of people) {
      const perms = person.role?.permissions ?? []
      const mine = theirs.filter((f) => {
        const needed = NEEDS[f.kind]
        return needed ? hasPermission(perms, needed as any) : false
      })
      if (mine.length === 0) continue

      const worst = mine[0]
      notifications.push({
        personId: person.personId,
        companyId,
        type: 'SYSTEM',
        title: worst.headline,
        body:
          mine.length === 1
            ? worst.detail
            : `${worst.detail}\n\nAlso: ${mine.slice(1, 4).map((f) => f.headline).join('; ')}${mine.length > 4 ? `, and ${mine.length - 4} more` : ''}.`,
        entityId: worst.subjectId,
        // Something already stopping work is worth leaving the app for.
        channel: worst.urgency === 'BLOCKING' ? 'EMAIL' : 'IN_APP',
        data: { kinds: mine.map((f) => f.kind), count: mine.length },
      })
    }
  }

  if (notifications.length > 0) await notifyBulk(notifications)
  return notifications.length
}
