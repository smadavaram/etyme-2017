import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron-auth'
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
import { packetByKey, resolveItems, itemsToAsk, withRequirements, type HeldDocument } from '@/lib/packets'
import { coverGaps } from '@/lib/cover-gap'
import { documentFindings, requiredOfSupplier } from '@/lib/document-request'
import { everyDocumentLetter, sendDocumentLapses } from '@/lib/notify/documents'
import {
  lookAtCredentials,
  askForRenewal,
  CREDENTIAL_KINDS,
  CREDENTIAL_FINDING_NEEDS,
  isCredential,
} from '@/lib/credential-chase'
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
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const dry = request.nextUrl.searchParams.get('dry') === '1'

  // Holds that have run their thirty days go back before anything else
  // runs, so nobody is reported as represented by an agency that stopped
  // trying a month ago. Reads elsewhere already filter on the clock — this
  // is what makes the rows themselves honest.
  const holdsFreed = dry ? 0 : await sweepExpired(undefined, undefined, now)

  // The document loop's letters: a paper running out, or one a line
  // requires and nobody ever filed, told to the party that owes it and to
  // every party the lapse costs, once per milestone, through the name
  // wall. Before the early return below, because a document nobody filed
  // is not a finding and must still be told.
  const lapseLetters = dry
    ? 0
    : (await sendDocumentLapses((await everyDocumentLetter(now)).letters, now)).letters.length

  const findings = ordered([
    ...(await lookAtVerifications(now)),
    ...(await lookAtCoverGaps(now)),
    ...(await lookAtCredentials(now)),
    ...(await lookAtPurchaseOrders(now)),
    ...(await lookAtAccess(now)),
    ...(await lookAtPackets(now)),
    // Signed papers and checks running out, grouped by the party that owes
    // them, off the line's own required set. Every row is NOTIFY_ONLY:
    // nothing is reopened and no letter is sent from here.
    ...(await documentFindings(now)),
  ])

  // Nothing at all is the ordinary outcome and is reported as silence
  // rather than as a cheerful all-clear.
  if (findings.length === 0) {
    return NextResponse.json({
      data: {
        found: 0, acted: 0, told: 0, holdsFreed, lapseLetters,
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
      // A license is a person's and a certificate of insurance is a
      // firm's, so the two asks are raised against different subjects and
      // sent to different people. Same rung, same automation log, one
      // dispatch.
      const outcome = (CREDENTIAL_KINDS as readonly string[]).includes(f.kind)
        ? await askForRenewal({ personId: f.subjectId, askingCompanyId: f.companyId }, now)
        : await reopenFor(f, now)
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
      lapseLetters,
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
      id: true, companyId: true, personId: true, type: true, status: true,
      // The floor as well as the ceiling. Selecting only `expiresAt` made
      // a policy beginning next month read as cover held today, which is
      // how the chase came to be silent on the one gap it exists for.
      issuedAt: true, validFrom: true, expiresAt: true,
      company: { select: { name: true } },
      person: { select: { name: true } },
      // Only to tell a license apart from everything else a person holds.
      documentType: { select: { purpose: true, blocks: true, suppliedBy: true } },
    },
  })

  return watchVerifications(
    rows
      // A person's license is chased by `lookAtCredentials`, which knows
      // which firm places them and therefore which desk can do something.
      // Left here as well it would be said twice, and the copy said here
      // carries no company, so it would reach nobody.
      .filter((v) => !(v.personId && isCredential(v)))
      .map((v) => ({
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

/**
 * The weeks nobody is insured.
 *
 * `watchVerifications` above answers "what is about to run out", which is
 * silent on a supplier whose old policy lapsed and whose new one starts in
 * October: nothing expires this week, so nothing was said, and the days in
 * between were nobody's. Every certificate on file is read here rather
 * than only the ones expiring, because a gap is the distance between two
 * dates and one of them is usually outside the sixty-day window.
 */
async function lookAtCoverGaps(now: Date): Promise<Finding[]> {
  const rows = await prisma.verification.findMany({
    where: {
      companyId: { not: null },
      type: { in: ['INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER'] },
      status: { in: ['CLEAR', 'CONDITIONAL'] },
    },
    // `validFrom` is the whole point of this query: the day cover begins.
    select: {
      id: true, companyId: true, type: true, status: true,
      issuedAt: true, validFrom: true, expiresAt: true,
      company: { select: { name: true } },
    },
  })

  return coverGaps(
    rows.map((v) => ({
      id: v.id,
      companyId: v.companyId!,
      companyName: v.company?.name ?? 'This supplier',
      type: v.type,
      status: v.status,
      issuedAt: v.issuedAt,
      validFrom: v.validFrom,
      expiresAt: v.expiresAt,
    })),
    now
  )
}

async function lookAtPurchaseOrders(now: Date): Promise<Finding[]> {
  const rows = await prisma.workOrder.findMany({
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
    // Whose document this is and what kind — no dates. This lookup does
    // not judge the document; `heldDocs` below does, and it selects both
    // the day cover begins and the day it ends. A date read here and
    // nowhere else is how a floor comes to be half-read.
    select: {
      id: true, type: true, companyId: true, personId: true,
      company: { select: { id: true, name: true } },
    },
  })
  // A company's cover is chased here; a person's license is chased by
  // `askForRenewal` in lib/credential-chase, which the loop above routes
  // to. This used to return early on anything with a personId on the
  // reasoning that a person's documents belong to a conversation somebody
  // is already having — and nobody was having it.
  if (!verification?.companyId || !verification.company) {
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
        // The buy line naming them as the vendor, which is the ordinary
        // shape of a sub-vendor in a chain and was missing here.
        //
        // A prime buying through a sub holds a `BuyContract` against that
        // sub and the sub holds nothing of its own — so neither branch
        // above matched, the chase fell through to "they have no buyer",
        // and the letter went to the sub telling it to remind itself
        // while the prime that pays it, and that a lapse actually stops,
        // heard nothing. Found by a test that expected the prime's own
        // requirement in the letter and got a letter from the supplier
        // to the supplier.
        { buyContractsOut: { some: { vendorCompanyId: verification.companyId, state: { in: ['IN_PROGRESS', 'PAUSED'] } } } },
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
    // The floor, or the chase decides a policy beginning in October is
    // already on file in September and asks for nothing at all — which is
    // exactly the supplier nobody is chasing.
    select: { type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true },
  })
  const heldDocs: HeldDocument[] = held.map((v) => ({
    key: v.type,
    // Where the paper does not say when cover begins, the day it was
    // issued is the best floor there is — the same fallback clearance uses.
    validFrom: v.validFrom ?? v.issuedAt,
    expiresAt: v.expiresAt,
    accepted: v.status === 'CLEAR' || v.status === 'CONDITIONAL',
  }))

  // What the buyer's own orders require of this firm, merged over the
  // shipped annual list.
  //
  // Without this the chase and the ask disagreed about the same firm: a
  // client that wrote a certificate of good standing onto its order had
  // it refused at a start and chased by the finding above, and then the
  // letter that went out asked only for what `COMPLIANCE_ANNUAL` ships
  // with. `lib/document-request` is the one door for "what does this
  // party owe us", and the packets route already asks it — this is the
  // same question from the night job rather than from a desk.
  //
  // Nothing is merged where a firm is chasing itself: there is no buyer
  // above it whose order could have asked for anything, so the query
  // would read its own lines to itself and answer nothing.
  const theirs = chasingSelf
    ? null
    : await requiredOfSupplier({ companyId: askingCompanyId, supplierCompanyId: verification.companyId })
  // A waived item is not asked for. The desk that waived it put its name
  // on that decision and asking again relitigates it.
  const alsoWanted = (theirs?.items ?? []).filter((i) => !i.waived)
  const asked = alsoWanted.length ? withRequirements(spec, alsoWanted) : spec

  const asking = itemsToAsk(resolveItems(asked, heldDocs, now))
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
      // A supplier whose renewal is already on file cannot act on "renew
      // it". Where the finding is about a hole between two policies, the
      // finding's own sentence is the one to send.
      reopenedReason:
        f.kind === 'COVER_GAP' || f.kind === 'COVER_NOT_STARTED'
          ? f.detail
          : f.daysUntil !== null && f.daysUntil < 0
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
        // Which of them the shipped annual list would never have asked
        // for, and how many of the buyer's lines said so. An automation
        // log that cannot say where an item came from is a log a desk
        // cannot answer a supplier's "why are you asking me for this".
        fromTheirOrders: alsoWanted.map((i) => i.key),
        readOffLines: theirs?.lines.length ?? 0,
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
 * The rungs a standing fact is worth saying at.
 *
 * Descending, and a finding is said once at the first rung it is inside.
 * A certificate expiring in twenty-five days is said at thirty and not
 * again until fourteen, so the desk hears four times over a month rather
 * than thirty.
 */
const RUNGS = [30, 14, 7, 3, 1, 0]

/**
 * Which rung this finding is at, or null where it has no clock.
 *
 * Three answers, and the third is the one that decides the cadence of
 * everything already broken:
 *
 *   ONCE       the fact has no date — a link nobody used, a credential
 *              with no expiry recorded. It is said once and then it is
 *              said; saying it again tells nobody anything new.
 *   IN_n       it bites in n days or fewer. One letter per rung.
 *   OVERDUE_w  it already bit, w weeks ago. Once a week while it stays
 *              broken, because a blocking fact nobody has fixed does
 *              deserve a nudge — and nightly is not a nudge, it is the
 *              thing people build a mail rule to ignore.
 */
function milestoneOf(daysUntil: number | null): string {
  if (daysUntil == null) return 'ONCE'
  if (daysUntil < 0) return `OVERDUE_${Math.floor(-daysUntil / 7)}`
  return `IN_${RUNGS.find((r) => daysUntil <= r) ?? RUNGS[0]}`
}

/** One fact, one reader, one rung. The same shape the lapse letters use. */
function saidKeyFor(f: Finding, personId: string): string {
  return `${f.kind}:${f.subjectId}:${milestoneOf(f.daysUntil)}:${personId}`
}

/**
 * What has already been said to these people about these subjects.
 *
 * Read off the notifications themselves rather than a table of its own,
 * exactly as `lib/notify/documents` does: the record that somebody was
 * told is the thing that was sent to them, and a second table would be a
 * second thing to keep in step.
 */
async function alreadySaid(subjectIds: string[]): Promise<Set<string>> {
  if (subjectIds.length === 0) return new Set()
  const rows = await prisma.notification.findMany({
    where: { type: 'SYSTEM', entityId: { in: [...new Set(subjectIds)] } },
    select: { data: true },
  })
  const out = new Set<string>()
  for (const r of rows) {
    const d = r.data as { saidKey?: string; alsoSaid?: unknown } | null
    if (typeof d?.saidKey === 'string') out.add(d.saidKey)
    // The keys of the findings this one letter stood in for, so a fact
    // folded into somebody else's "Also:" line is not sent on its own
    // tomorrow.
    if (Array.isArray(d?.alsoSaid)) for (const k of d.alsoSaid) if (typeof k === 'string') out.add(k)
  }
  return out
}

/**
 * Tell the people who can act.
 *
 * Not everybody — a compliance warning sent to a recruiter is noise, and
 * noise is how a system trains people to ignore it. Each kind of finding
 * goes to whoever holds the permission that lets them do something.
 *
 * ── Once per rung, not once per night ────────────────────────────────
 *
 * Corrected 2026-09-21, after the release walk found this job writing
 * the same two rows every run forever. A certificate that expired in
 * March told the same compliance officer the same sentence every night
 * since, which is the failure CLAUDE.md names: a warning that always
 * fires is a click, not a warning. The lapse letters beside this were
 * fixed the same day and this is the same treatment, deliberately in
 * the same shape — a key per fact per reader per rung, read back off
 * the notifications that carry it.
 *
 * A **new** finding still goes out the night it appears, even where the
 * reader was told about something else yesterday: the keys are per fact,
 * so nothing is suppressed for having a noisy neighbour.
 */
async function tell(findings: Finding[], now: Date): Promise<number> {
  const NEEDS: Record<string, string> = {
    VERIFICATION_EXPIRED: 'vendors.manage',
    VERIFICATION_EXPIRING: 'vendors.manage',
    COVER_NOT_STARTED: 'vendors.manage',
    COVER_GAP: 'vendors.manage',
    // A contractor's license is looked after by whoever looks after
    // contractors — the recruiter, the resource manager, HR — and not by
    // the desk that chases suppliers for their insurance.
    CREDENTIAL_EXPIRED: CREDENTIAL_FINDING_NEEDS,
    CREDENTIAL_EXPIRING: CREDENTIAL_FINDING_NEEDS,
    CREDENTIAL_UNDATED: CREDENTIAL_FINDING_NEEDS,
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
  const said = await alreadySaid(findings.map((f) => f.subjectId))

  for (const [companyId, theirs] of byCompany) {
    const people = await prisma.context.findMany({
      where: { companyId, revokedAt: null },
      select: { personId: true, role: { select: { permissions: true } } },
    })

    for (const person of people) {
      const perms = person.role?.permissions ?? []
      const theirsToAct = theirs.filter((f) => {
        const needed = NEEDS[f.kind]
        return needed ? hasPermission(perms, needed as any) : false
      })
      // Everything at a rung this person has already been told about
      // drops out here. What is left is either new or has moved a rung
      // closer since the last time anybody said anything.
      const mine = theirsToAct.filter((f) => !said.has(saidKeyFor(f, person.personId)))
      if (mine.length === 0) continue

      const worst = mine[0]
      const keys = mine.map((f) => saidKeyFor(f, person.personId))
      for (const k of keys) said.add(k)

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
        data: {
          kinds: mine.map((f) => f.kind),
          count: mine.length,
          saidKey: keys[0],
          // The facts this one letter stood in for. Without them the
          // second and third findings in the "Also:" line would each be
          // sent on their own tomorrow, which is the same repeat wearing
          // a different sentence.
          alsoSaid: keys.slice(1),
        },
      })
    }
  }

  if (notifications.length > 0) await notifyBulk(notifications)
  return notifications.length
}
