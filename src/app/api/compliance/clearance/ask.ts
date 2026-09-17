import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { notify } from '@/lib/notify'
import { hasPermission } from '@/lib/permissions'
import { packetByKey, startPacketFor } from '@/lib/packets'
import { startPreview, hrNotice, type StartPreview } from '@/lib/contract-clearance'

/**
 * Asking for the papers when somebody is placed, not when somebody tries
 * to start them.
 *
 * ── The gap this closes ──────────────────────────────────────────────
 *
 * `contractClearance` was called from exactly one place: inside the
 * activate route, at the moment the contract manager pressed the button.
 * So the sequence was — the client awards, a draft contract appears, and
 * the first time anybody asks whether this person's paperwork is in
 * order is when somebody tries to start them. The answer then arrives as
 * a refusal, to whoever pressed the button, rather than as work to HR,
 * who is the desk that can actually do something about it.
 *
 * CLAUDE.md already has the sentence for this, learned on the client
 * dashboard: the desk that acts is the desk that hears.
 *
 * ── Two properties it has to have ────────────────────────────────────
 *
 * **Idempotent.** Running it twice asks nobody twice. The nightly
 * credential chase already works this way and for the same reason: a
 * consultant emailed the same link three times stops opening any of
 * them. The key is an open contract-start ask against this person from
 * this firm — not the contract, because the documents belong to the
 * person. An I-9 is not owed once per placement.
 *
 * **Never asks for what is already held.** The clearance resolves
 * against the person's verifications first, so a background check filed
 * in March is not asked for again in September.
 *
 * ── Who is asked for what ────────────────────────────────────────────
 *
 * The worker is asked for the documents a worker owes — the I-9, proof
 * of right to work, a background check, the license they practice on.
 * The firm's own papers — the NDA it writes, its own insurance — are
 * reported to HR as HR's work and no link is emailed, because nobody
 * sends a firm a link to ask itself. The supplier's insurance already
 * has a chase that owns it (`api/cron/watch`, `lib/cover-gap`) and
 * asking here as well would ask the same broker twice.
 */

/** The verdict in the clearance's own words, and what was done about it. */
export interface ClearanceAskResult {
  contractId: string
  personName: string
  clientName: string | null
  roleTitle: string | null
  startDate: Date | null
  preview: StartPreview
  /** The packet raised, where one was. */
  packetId: string | null
  /** True where an open ask was already in hand and nothing new went out. */
  alreadyAsked: boolean
  /** Who at the firm was told, by person id. */
  told: string[]
  /** What happened, in a sentence. Never a code. */
  says: string
}

const CERTS = ['INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER'] as const

/**
 * Every column the arithmetic reads.
 *
 * Written once and shared by both queries, because a floor read on one
 * side and not the other is how this went wrong before: `validFrom` says
 * when a document starts covering, and `provider` and `result` carry the
 * license number and the state a refusal has to name.
 */
const FLOOR_AND_CEILING = {
  type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true,
  verifiedAt: true, provider: true, result: true, formEdition: true,
} as const

/** Everything the preview needs about one placement. */
async function factsFor(contractId: string) {
  const contract = await prisma.sellContract.findUnique({
    where: { id: contractId },
    select: {
      id: true, companyId: true, personId: true, state: true,
      startDate: true, endDate: true,
      person: { select: { id: true, name: true, primaryEmail: true } },
      company: { select: { id: true, name: true } },
      clientCompany: { select: { id: true, name: true } },
      endClientCompany: { select: { id: true, name: true } },
      requirement: { select: { title: true } },
    },
  })
  if (!contract) return null

  const [personVerifications, supplierCertificates, documentTypes] = await Promise.all([
    prisma.verification.findMany({ where: { personId: contract.personId }, select: FLOOR_AND_CEILING }),
    prisma.verification.findMany({
      where: { companyId: contract.companyId, type: { in: [...CERTS] } },
      select: FLOOR_AND_CEILING,
    }),
    prisma.documentType.findMany({ where: { companyId: contract.companyId } }).catch(() => []),
  ])

  return { contract, personVerifications, supplierCertificates, documentTypes }
}

/** The preview for one placement, on a given day. */
export async function previewFor(contractId: string, now = new Date()): Promise<
  { contract: NonNullable<Awaited<ReturnType<typeof factsFor>>>['contract']; preview: StartPreview } | null
> {
  const facts = await factsFor(contractId)
  if (!facts) return null
  const { contract } = facts

  // The client the person actually stands in front of. Where a prime
  // buys from a sub, the end client is the site and the sentence names it.
  const clientName = contract.endClientCompany?.name ?? contract.clientCompany?.name ?? null

  const preview = startPreview({
    personName: contract.person.name,
    personVerifications: facts.personVerifications as any,
    supplierName: contract.company?.name ?? 'the supplier',
    supplierCertificates: facts.supplierCertificates as any,
    clientName,
    // Read on the first day where that is still ahead — a certificate
    // that lapses the week before the start does not clear the start.
    on: contract.startDate && contract.startDate > now ? contract.startDate : now,
    through: contract.endDate,
    role: contract.requirement?.title ?? null,
    documentTypes: facts.documentTypes as any,
    startDate: contract.startDate ?? null,
  })

  return { contract, preview }
}

/**
 * Raise the clearance request for one placement, and tell HR.
 *
 * Safe to call from the award, from the papering of the contract, from
 * a screen, or twice in the same second. `actorPersonId` is whoever
 * caused it — the person who awarded — so the log says who, and null
 * where the system did it on its own.
 */
export async function askForClearance(input: {
  contractId: string
  actorPersonId?: string | null
  now?: Date
}): Promise<ClearanceAskResult | { contractId: string; says: string; preview: null }> {
  const now = input.now ?? new Date()
  const found = await previewFor(input.contractId, now)
  if (!found) {
    return {
      contractId: input.contractId,
      preview: null,
      says: 'There is no placement with that id, so there is nothing to ask for.',
    }
  }
  const { contract, preview } = found
  const clientName = contract.endClientCompany?.name ?? contract.clientCompany?.name ?? null
  const roleTitle = contract.requirement?.title ?? null

  const base = {
    contractId: contract.id,
    personName: contract.person.name,
    clientName,
    roleTitle,
    startDate: contract.startDate ?? null,
    preview,
  }

  // ── Already in hand ────────────────────────────────────────────────
  //
  // An open contract-start ask against this person from this firm is the
  // ask. Keyed on the person rather than the contract because the
  // documents are the person's: an I-9 is not owed once per placement,
  // and two placements in one week must not produce two emails.
  const already = await prisma.documentPacket.findFirst({
    where: {
      companyId: contract.companyId,
      subjectPersonId: contract.personId,
      purpose: 'CONTRACT_START',
      completedAt: null,
      cancelledAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true, items: { select: { label: true, state: true } } },
  })

  if (already) {
    return {
      ...base,
      packetId: already.id,
      alreadyAsked: true,
      told: [],
      says: `${contract.person.name} has already been asked for their start paperwork, so nothing was sent again.`,
    }
  }

  if (preview.askOfPerson.length === 0) {
    // Nothing to ask the worker for. HR still hears where the firm's own
    // papers or its own cover are outstanding — that is its work, and a
    // silent PASS on a placement with lapsed cover is the 2017 bug.
    const told = await tellHR(contract, preview, [], now)
    return {
      ...base,
      packetId: null,
      alreadyAsked: false,
      told,
      says:
        preview.outcome === 'PASS'
          ? `${contract.person.name} has everything on file. Nobody was asked for anything.`
          : `Nothing is ${contract.person.name}'s to produce. ${preview.says}`,
    }
  }

  // ── Somebody to record as having asked ─────────────────────────────
  //
  // HR first, because it is HR's chase; the account owner where a firm
  // has not seated an HR person yet. A firm with nobody at all cannot be
  // recorded as asking, and saying so is better than a packet created by
  // a person who does not exist.
  const staff = await prisma.context.findMany({
    where: { companyId: contract.companyId, revokedAt: null },
    select: { personId: true, role: { select: { permissions: true } } },
  })
  const hr = staff.filter((s) => hasPermission(s.role?.permissions ?? [], 'consultants.write'))
  const creatorId = input.actorPersonId ?? hr[0]?.personId ?? staff[0]?.personId ?? null
  if (!creatorId) {
    return {
      ...base,
      packetId: null,
      alreadyAsked: false,
      told: [],
      says:
        `Nobody at ${contract.company?.name ?? 'the supplier'} has a seat yet, so there is nobody to record as ` +
        `asking for ${contract.person.name}'s paperwork. Invite the person who does HR here, then ask again.`,
    }
  }

  if (!contract.person.primaryEmail) {
    const told = await tellHR(contract, preview, [], now)
    return {
      ...base,
      packetId: null,
      alreadyAsked: false,
      told,
      says:
        `${contract.person.name} has no email address on file, so there is nowhere to send the request. ` +
        `Add an address, then ask again.`,
    }
  }

  const spec = packetByKey(startPacketFor(roleTitle))
  const label = spec?.label ?? 'Starting somebody'

  // Why they are being asked, written to them. Not "your contract is in
  // DRAFT" — the worker has no idea what that is.
  const whenPhrase = contract.startDate
    ? ` You are due to start${clientName ? ` at ${clientName}` : ''} on ${contract.startDate.toISOString().slice(0, 10)}.`
    : ''
  const reason =
    `You have been placed${roleTitle ? ` as ${roleTitle}` : ''}${clientName ? ` at ${clientName}` : ''}.` +
    `${whenPhrase} These are the papers we need before your first day.`

  const packet = await prisma.documentPacket.create({
    data: {
      companyId: contract.companyId,
      packetKey: spec?.key ?? 'CONTRACT_START_W2',
      label,
      purpose: 'CONTRACT_START',
      direction: 'COLLECT',
      subjectPersonId: contract.personId,
      recipientEmail: contract.person.primaryEmail,
      recipientName: contract.person.name,
      token: randomBytes(32).toString('base64url'),
      // Long enough to cover a start that is weeks out, and never open
      // for ever: a link with no end outlives the reason it was sent.
      expiresAt: new Date(now.getTime() + 60 * 86_400_000),
      createdById: creatorId,
      reopenedReason: reason,
      items: {
        create: preview.askOfPerson.map((a, position) => ({
          key: a.key,
          label: a.label,
          hint: a.hint,
          required: a.required,
          position,
          state: 'PENDING',
        })),
      },
    },
    select: { id: true },
  })

  await prisma.automationLog.create({
    data: {
      companyId: contract.companyId,
      action: 'PACKET_REQUESTED',
      summary:
        `Asked ${contract.person.name} for ${preview.askOfPerson.length} document(s) before starting` +
        `${clientName ? ` at ${clientName}` : ''} — ${label}`,
      reason:
        `The placement was made, so the papers are asked for now rather than when somebody tries to start them. ` +
        preview.says,
      payload: {
        packetId: packet.id,
        contractId: contract.id,
        personId: contract.personId,
        asked: preview.askOfPerson.map((a) => a.key),
        blocking: preview.blocking.map((b) => b.key),
        outcome: preview.outcome,
        startDate: contract.startDate?.toISOString() ?? null,
      },
      // Cancelling the request undoes this entirely.
      reversible: true,
    },
  })

  void emit({
    type: 'packet.requested',
    companyId: contract.companyId,
    subjectType: 'DocumentPacket',
    subjectId: packet.id,
    actorPersonId: input.actorPersonId ?? null,
    payload: {
      atPlacement: true,
      contractId: contract.id,
      subjectPersonId: contract.personId,
      itemCount: preview.askOfPerson.length,
      outcome: preview.outcome,
    },
  })

  // The worker hears, on their own channel, with the link that is theirs.
  void notify({
    personId: contract.personId,
    companyId: contract.companyId,
    type: 'SYSTEM',
    title: `${contract.company?.name ?? 'Your agency'} needs ${preview.askOfPerson.length} document(s) before you start`,
    body: `${reason} ${preview.askOfPerson.map((a) => a.label).join(', ')}.`,
    entityId: packet.id,
    channel: 'EMAIL',
  })

  const told = await tellHR(contract, preview, preview.askOfPerson.map((a) => a.label), now)

  return {
    ...base,
    packetId: packet.id,
    alreadyAsked: false,
    told,
    says:
      `Asked ${contract.person.name} for ${preview.askOfPerson.length} document(s), and told ` +
      `${told.length} person(s) here that the placement needs clearing.`,
  }
}

/**
 * Tell the desk that clears a start that one is coming.
 *
 * `consultants.write` is HR's permission at a staffing firm — the same
 * one the recruiter and the resource manager hold, which is right: those
 * are the three desks that look after the firm's own people. Everyone
 * who holds it hears once, by email as well as in the app, because a
 * person who cannot start is worth leaving the app for.
 *
 * Nobody is told where the paperwork is already in order. A notice that
 * fires on every placement is a click, not a notice.
 */
async function tellHR(
  contract: { id: string; companyId: string; person: { name: string }; requirement: { title: string } | null },
  preview: StartPreview,
  askedOfPerson: string[],
  _now: Date
): Promise<string[]> {
  const notice = hrNotice(preview, {
    personName: contract.person.name,
    roleTitle: contract.requirement?.title ?? null,
    askedOfPerson,
  })
  if (!notice) return []

  const staff = await prisma.context.findMany({
    where: { companyId: contract.companyId, revokedAt: null },
    select: { personId: true, role: { select: { permissions: true } } },
  })
  const hr = staff.filter((s) => hasPermission(s.role?.permissions ?? [], 'consultants.write'))

  const seen = new Set<string>()
  const told: string[] = []
  for (const s of hr) {
    if (seen.has(s.personId)) continue
    seen.add(s.personId)
    told.push(s.personId)
    void notify({
      personId: s.personId,
      companyId: contract.companyId,
      type: 'CONTRACT',
      title: notice.title,
      body: notice.body,
      entityId: contract.id,
      channel: 'EMAIL',
      data: { contractId: contract.id, outcome: preview.outcome },
    })
  }
  return told
}

// ── HR's queue ────────────────────────────────────────────────────────

/** One placement waiting on HR, in the words HR reads. */
export interface ClearanceQueueRow {
  contractId: string
  personId: string
  personName: string
  clientName: string | null
  roleTitle: string | null
  startDate: string | null
  daysUntilStart: number | null
  outcome: 'WARN' | 'BLOCK'
  /** The clearance's own sentence — the same one activation refuses with. */
  says: string
  fix: string | null
  headline: string
  outstanding: string | null
  /** True where the worker has already been sent a link. */
  asked: boolean
}

/**
 * Every placement at this firm that has not started and is not clear.
 *
 * Exported for whoever draws a queue — HR's own page, and the decisions
 * route, which is etyme-demand's file. Returns the rows and nothing
 * about how they are rendered; a caller adds its own kind and its own
 * permission gate.
 *
 * A placement whose paperwork is in order is not in the list. Work is
 * what is left to do.
 */
export async function clearanceQueue(
  companyId: string,
  opts: { now?: Date; limit?: number } = {}
): Promise<ClearanceQueueRow[]> {
  const now = opts.now ?? new Date()
  const limit = opts.limit ?? 25

  const contracts = await prisma.sellContract.findMany({
    where: {
      companyId,
      // Before the first day, and before anybody pressed activate. Once a
      // contract is running, clearance is a different question and the
      // activate route already refused or recorded a reason.
      state: { in: ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] },
    },
    orderBy: { startDate: 'asc' },
    take: limit,
    select: { id: true, personId: true },
  })

  const rows: ClearanceQueueRow[] = []
  for (const c of contracts) {
    const found = await previewFor(c.id, now)
    if (!found) continue
    const { contract, preview } = found
    if (preview.outcome === 'PASS') continue

    const asked = await prisma.documentPacket.findFirst({
      where: {
        companyId,
        subjectPersonId: contract.personId,
        purpose: 'CONTRACT_START',
        cancelledAt: null,
      },
      select: { id: true },
    })

    rows.push({
      contractId: contract.id,
      personId: contract.personId,
      personName: contract.person.name,
      clientName: contract.endClientCompany?.name ?? contract.clientCompany?.name ?? null,
      roleTitle: contract.requirement?.title ?? null,
      startDate: contract.startDate?.toISOString() ?? null,
      daysUntilStart: preview.daysUntilStart,
      outcome: preview.outcome as 'WARN' | 'BLOCK',
      says: preview.says,
      fix: preview.fix,
      headline: preview.headline,
      outstanding: preview.outstanding,
      asked: !!asked,
    })
  }

  // What stops a start first, then what starts soonest. A desk opening
  // this page should read the refusals before the warnings.
  return rows.sort((a, b) => {
    if (a.outcome !== b.outcome) return a.outcome === 'BLOCK' ? -1 : 1
    return (a.daysUntilStart ?? 9999) - (b.daysUntilStart ?? 9999)
  })
}
