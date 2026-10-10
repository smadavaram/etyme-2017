import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import {
  myPapers,
  outstandingItems,
  typeKeyForTemplate,
  type AskedPacket,
  type HeldKeyRecord,
  type HeldRecord,
  type OutstandingItem,
  type SentDocument,
} from '@/lib/document-request'
import { requirementsFor } from '@/lib/document-requirements'
import { orderedNotCollected } from '@/lib/attestation'
import { humanKey, labelFor, typeByKey } from '@/lib/document-type'

/**
 * GET /api/me/papers — the documents asked of me, by whom, and what each needs.
 *
 * A consultant's own view: their W-9 for Pinnacle, the NDA Nike wants
 * signed, the license renewal the nightly chase asked them for. Never
 * another person's, and nothing about what the companies say to each
 * other. A document sent for signature is answered from the same page
 * with /api/documents/:id/upload and /sign; a packet is answered at the
 * link it came with.
 *
 * ── Three tables, because two things ask and one thing already holds ──
 *
 * This read `DocInstance` only, and the nightly license chase raises a
 * `DocumentPacket` against the person — so an ICU nurse asked by email
 * for her renewal opened this page and found nothing on it. The page is
 * derived from everything that actually asks her for something now, which
 * is CLAUDE.md's rule for a list: fill from the work, not from data entry.
 *
 * ── Why no AccessLog row ──
 *
 * Every read of another person's data writes one. This is not one: both
 * halves are scoped to `caller.person.id`, so the only person whose
 * paperwork can come back is the caller's own. Reading your own file is
 * not a read of somebody else's, and logging it would bury the reads that
 * are — a log where every row is innocent is a log nobody audits.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const me = caller.person.id

  const [instances, packets, held] = await Promise.all([
    prisma.docInstance.findMany({
      where: {
        OR: [
          { subjectType: 'PERSON', subjectId: me },
          { sellContract: { personId: me } },
          { buyContract: { candidates: { some: { personId: me, state: 'ACTIVE' } } } },
        ],
      },
      include: { template: { select: { name: true, needsSignature: true, company: { select: { name: true } } } } },
      orderBy: [{ sentAt: { sort: 'desc', nulls: 'last' } }],
    }),
    // Asked for through a packet: a renewal, a start pack, an immigration
    // filing. Only where the person is the subject — a packet about
    // somebody else, or about a company, is not theirs to read.
    prisma.documentPacket.findMany({
      where: { subjectPersonId: me },
      include: {
        company: { select: { name: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    // ── What is already on file about them ──
    //
    // The same per-person query the client's compliance desk runs, read
    // from the other end. Until today a worker could see what somebody
    // had asked her for and never what she already held, so the day her
    // license runs out — the one fact about her own file she cannot get
    // anywhere else, and the one she is the only person who can fix —
    // was on a screen at the agency and on no screen of hers. The chase
    // does not fire until sixty days out; she can see it now.
    prisma.verification.findMany({
      where: { personId: me },
      select: {
        id: true, type: true, status: true, provider: true,
        // Read so her own page can say "Sterling, reference 4471"
        // rather than an unattributed green line. Nothing in production
        // writes it yet; the row says so when it does not.
        referenceId: true,
        issuedAt: true, validFrom: true, expiresAt: true,
      },
      orderBy: { type: 'asc' },
    }),
  ])

  const documents: SentDocument[] = instances.map((r) => ({
    id: r.id,
    status: r.status,
    templateName: r.template.name,
    needsSignature: r.template.needsSignature,
    issuerName: r.template.company.name,
    sentAt: r.sentAt,
    signedAt: r.signedAt,
  }))

  const asked: AskedPacket[] = packets.map((p) => ({
    id: p.id,
    label: p.label,
    askedBy: p.company.name,
    recipientEmail: p.recipientEmail,
    token: p.token,
    expiresAt: p.expiresAt,
    cancelledAt: p.cancelledAt,
    createdAt: p.createdAt,
    // The sentence the person was given. `reopenedReason` is the chase's
    // own words, written to them in the second person — "your license
    // runs out in 24 days" — which is why it may be shown here.
    reason: p.reopenedReason,
    items: p.items.map((i) => ({
      id: i.id,
      label: i.label,
      state: i.state,
      required: i.required,
      receivedAt: i.receivedAt,
      position: i.position,
    })),
  }))

  // The type dictionary decides what a row is called and whether a lapse
  // stops the work — the same door clearance reads, so the worker's page
  // and the refusal at activation cannot name the same document two
  // different things.
  const onFile: HeldRecord[] = held.map((v) => ({
    id: v.id,
    key: v.type,
    label: labelFor(v.type),
    status: v.status,
    provider: v.provider,
    reference: v.referenceId,
    validFrom: v.validFrom ?? v.issuedAt,
    expiresAt: v.expiresAt,
    stopsWork: typeByKey(v.type)?.blocks ?? false,
  }))

  // ── What the lines she is on require of her ────────────────────────
  //
  // The crack the release walk found on 2026-09-21: every chase letter
  // ends "upload it from your Paperwork page" and this route read three
  // tables, none of which is the one that says what a line requires. So
  // the document she was being chased for was not on her page at all.
  //
  // Read through the one door, `lib/document-requirements`, so the items
  // she is shown and the items the refusal at activation is built from
  // are the same items rather than two lists that agree by coincidence.
  const owed = await whatSheOwes(me, held, instances, new Date())

  // Where a request has already been opened for one of them, the row is
  // that request's — it has an id, and the page answers it at
  // /api/documents/:id/upload like every other paper.
  //
  // The items she owes are handed to the matcher as the dictionary, so a
  // request opened for "Hot floor induction" reads back to the type the
  // client invented rather than to nothing. A paper nobody can identify
  // satisfies nothing and gets chased forever, which is the failure this
  // avoids rather than the one it causes.
  //
  // An answered request is still THE request for that document. Skipping
  // a SIGNED or UPLOADED one put the row back on `owed:<KEY>` the moment
  // she answered it, so the next press opened a second request for the
  // same paper — one document sent twice on a seeded walk. A request
  // that is still open is preferred over one already answered, because
  // that is the one there is anything left to do about.
  const asksByKey: Record<string, string> = {}
  const named = owed.map((o) => ({ key: o.key, label: o.label }))
  const answered = ['SIGNED', 'UPLOADED']
  for (const takeAnswered of [false, true]) {
    for (const r of instances) {
      if (answered.includes(r.status) !== takeAnswered) continue
      const key = typeKeyForTemplate(r.template.name, named, { guess: false })
      if (key && !asksByKey[key]) asksByKey[key] = r.id
    }
  }

  return NextResponse.json({
    data: {
      papers: myPapers({
        myEmail: caller.person.primaryEmail ?? null,
        documents,
        packets: asked,
        held: onFile,
        owed,
        asksByKey,
      }),
    },
  })
}

/** A check that actually came back. Anything still running holds nothing. */
const CAME_BACK = ['CLEAR', 'CONDITIONAL']

/** Sent, and nobody has looked at it yet. */
const WITH_THEM = ['PENDING', 'IN_PROGRESS']

/**
 * Every document this person owes on every line she is live on.
 *
 * Only `owedBy: 'WORKER'` — the firm's insurance and the customer's
 * agreement are on the same set and are not hers to produce, and putting
 * them on her page would ask her for somebody else's paperwork.
 *
 * Deduplicated by type: two placements that both want a background check
 * want one background check, and listing it twice reads as two chases.
 */
async function whatSheOwes(
  personId: string,
  held: { type: string; status: string; issuedAt: Date | null; validFrom: Date | null; expiresAt: Date | null }[],
  papers: SignedPaperRow[],
  on: Date
): Promise<OutstandingItem[]> {
  // Anything not finished. Said as what it is not, because the two
  // enums differ — a buy line has BENCH_PAID, INTERNAL and TRAINING and
  // a sell line has none of them — and a list of the live ones would go
  // stale on the next state somebody adds.
  const live = { notIn: ['ENDED', 'CANCELLED'] as never[] }

  const [sellLines, buyCandidates] = await Promise.all([
    prisma.sellContract.findMany({
      where: { personId, state: live },
      select: { id: true },
      take: 20,
    }),
    prisma.buyContractCandidate.findMany({
      where: { personId, state: 'ACTIVE', buyContract: { state: live } },
      select: { buyContractId: true },
      take: 20,
    }),
  ])

  const onFile: HeldKeyRecord[] = held.map((v) => ({
    key: v.type,
    validFrom: v.validFrom ?? v.issuedAt ?? null,
    expiresAt: v.expiresAt ?? null,
    accepted: CAME_BACK.includes(v.status),
    // Sent and with whoever asked. It holds nothing, and it is no longer
    // her move — asking her again for what is sitting in somebody's
    // queue is how a worker learns the page is not worth reading.
    received: WITH_THEM.includes(v.status),
  }))

  const sets = await Promise.all([
    ...sellLines.map((l) => requirementsFor({ sellContractId: l.id })),
    ...buyCandidates.map((c) => requirementsFor({ buyContractId: c.buyContractId })),
  ])

  const byKey = new Map<string, OutstandingItem>()
  for (const set of sets) {
    if (!set) continue
    const items = outstandingItems({
      items: set.items,
      // Both halves of the paperwork, not one. A `Verification` is a
      // check somebody ran; a `DocInstance` is a paper somebody sent,
      // and a document she uploaded last night lives only in the second.
      // Reading the first alone is what asked her again this morning for
      // the file she had already sent — the exact failure the sent state
      // was built to prevent, arriving because nothing ever reached it.
      // The line's own set is the dictionary, so a paper filed against
      // "Hot floor induction" reads back to the type that asked for it.
      held: [...onFile, ...papersAsHeld(papers, set.items)],
      owedBy: ['WORKER'],
      on,
    })
    for (const item of items) {
      const already = byKey.get(item.key)
      // Two lines can ask for the same document and disagree about
      // whether its absence stops the work. The stricter line wins: a
      // start that is blocked is blocked whatever the other order says.
      if (!already || (item.stopsWork && !already.stopsWork)) byKey.set(item.key, item)
    }
  }
  return [...byKey.values()]
}

/** A `DocInstance` row, as the arithmetic needs it. */
type SignedPaperRow = {
  id: string
  status: string
  validFrom: Date | null
  expiresAt: Date | null
  signedAt: Date | null
  countersignedAt: Date | null
  template: { name: string }
}

/**
 * What papers already sent amount to against a line's required set.
 *
 * Two statuses and they are not the same fact, which is why this is not
 * `heldFromDocInstances`:
 *
 *   SIGNED     she attested to it. There is nothing further for anybody
 *              to do, so it counts as held.
 *   UPLOADED   a file arrived and nobody has looked at it. It holds
 *              nothing — a document nobody has checked is not a document
 *              on file — and it is no longer HER move, which is the
 *              whole of the sent state.
 *
 * `lib/contract-clearance` counts both as held when it builds a verdict,
 * so nothing here blocks a start that was not blocked before: the
 * difference is what SHE is told about her own file, and telling her it
 * is confirmed when nobody has confirmed it is the 2017 bug wearing a
 * friendlier face.
 */
/**
 * The names a paper can be recognized by.
 *
 * An item for a type nobody defined arrives labeled with its own key —
 * SITE_RESPIRATOR_FIT_TEST — and the request opened for it was named
 * from the humanized label, "Site respirator fit test". So the two never
 * matched, and a document she had just sent went on reading "Not on
 * file" the moment she reloaded. Found on the walk, 2026-09-21.
 *
 * Both names, so the match is exact either way and still never a guess.
 */
function namesOf(items: { key: string; label: string }[]): { key: string; label: string }[] {
  return items.flatMap((i) =>
    i.label === i.key
      ? [i, { key: i.key, label: humanKey(i.key) }]
      : [i]
  )
}

function papersAsHeld(
  papers: SignedPaperRow[],
  items: { key: string; label: string }[]
): HeldKeyRecord[] {
  const out: HeldKeyRecord[] = []
  for (const r of papers) {
    if (r.status !== 'SIGNED' && r.status !== 'UPLOADED') continue
    // Never guessed. A paper is credited against a requirement only
    // where its own name IS that document's name — which it is, because
    // the request that opened it was named from the item it answers.
    // Guessing from a word in a title put one uploaded paper on two
    // rows of a worker's file, one of them reporting a document that
    // does not exist.
    const key = typeKeyForTemplate(r.template.name, namesOf(items), { guess: false })
    if (!key) continue
    const signed =
      r.countersignedAt && r.signedAt
        ? r.countersignedAt > r.signedAt
          ? r.countersignedAt
          : r.signedAt
        : (r.countersignedAt ?? r.signedAt ?? null)
    out.push({
      key,
      validFrom: r.validFrom ?? signed ?? null,
      expiresAt: r.expiresAt ?? null,
      accepted: r.status === 'SIGNED',
      received: r.status === 'UPLOADED',
    })
  }
  return out
}

// ── Sending the document she is being chased for ──────────────────────
//
// Found on 2026-09-21, after supply landed the worker's page against the
// outstanding list this route computes. Every chase letter ends "upload
// it from your Paperwork page", the page now names the document — and
// there was no door that received a file against a `DocumentRequirement`
// at all. `/api/documents/:id/upload` wants a `DocInstance`, and an
// outstanding row has no id of its own because nobody has asked yet.
//
// A requirement is a RULE and a request is an ACT, and the gap between
// them is the whole crack: the rule says the line needs a hot floor
// induction, and until some company opens a request nobody has asked
// anybody for anything. So this opens the request, on her own say-so,
// against the firm the line makes responsible for chasing her — and
// then the file goes to `/api/documents/:id/upload`, the same door and
// the same rule as every other paper. Nothing here records a file and
// nothing here verifies one: a worker attests, a desk verifies, and a
// route that did both would be the judgment this system does not make.

/**
 * POST /api/me/papers — open a request for a document I am being asked
 * for, so I have somewhere to send it.
 *
 * Body: `{ documentTypeKey }`. Returns `{ askId, uploadTo, says }`.
 *
 * Only a type she actually owes on a line she is actually on. A person
 * who could open a request for anything could put a document on her own
 * file that nobody asked for, against a firm she does not work for.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const me = caller.person.id

  const body = (await request.json().catch(() => ({}))) as { documentTypeKey?: string }
  const key = (body.documentTypeKey ?? '').trim()
  if (!key) {
    return refuse('Say which document you are sending. Every item on your list names one.', 400, 'NO_TYPE')
  }

  const [checks, papers] = await Promise.all([
    prisma.verification.findMany({
      where: { personId: me },
      select: { type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true },
    }),
    // Read for the same reason the page reads them: a paper she sent is
    // a paper she has sent, and a door that cannot see it offers to open
    // a request for something already answered.
    prisma.docInstance.findMany({
      where: {
        OR: [
          { subjectType: 'PERSON', subjectId: me },
          { sellContract: { personId: me } },
          { buyContract: { candidates: { some: { personId: me, state: 'ACTIVE' } } } },
        ],
      },
      select: {
        id: true, status: true, validFrom: true, expiresAt: true, signedAt: true,
        countersignedAt: true, template: { select: { name: true } },
      },
    }),
  ])

  const found = await lineOwing(me, key, checks, papers, new Date())

  // ── A check she cannot produce ─────────────────────────────────────
  //
  // The founder, 2026-09-22: "background check companies are the ones
  // that confirm background pass or fail — the risk is passed there to
  // background check companies; our job would be to collect all info
  // and pass it to them to verify."
  //
  // So there is no file for her to attach. The screening company sends
  // the report to the firm that ordered it, and a door that took one
  // from her would be recording a document she cannot have obtained
  // honestly — and would let anybody put a clear background check on
  // their own file.
  //
  // Answered BEFORE "nobody is asking you for that", because this is
  // true whether or not a line requires one: a worker who reaches for
  // this needs to be told what is actually happening, not that nothing
  // is. Where a line does name a firm the sentence names it; where
  // none does, it says the firm placing you rather than inventing one.
  if (orderedNotCollected(key)) {
    const label = labelFor(key)
    const firm = found?.companyName ?? 'The firm placing you'
    return refuse(
      `${label.charAt(0).toUpperCase() + label.slice(1)} is not a document you hold. ` +
        `${firm} orders it from a screening company and the report goes to them — what you ` +
        `are asked for is your consent and the details it is run against, which they will ` +
        `come to you for. There is nothing for you to send here.`,
      409,
      'NOT_HERS_TO_SEND'
    )
  }

  if (!found) {
    return refuse(
      `Nobody is asking you for that. Your paperwork page lists what is still owed on the work you are ` +
        `on — if something is missing from it, whoever placed you is the one to tell.`,
      404,
      'NOT_ASKED'
    )
  }

  // Already answered, and still in date. There is nothing to open: the
  // paper is with them and the request that holds it is the request for
  // this document. Returning it rather than refusing her means a second
  // press lands on the row she already sent, where `mayAct` tells her it
  // is on file — which is the true thing to say.
  if (found.answeredBy && found.state === 'AWAITING_REVIEW') {
    return NextResponse.json({
      data: {
        askId: found.answeredBy,
        uploadTo: `/api/documents/${found.answeredBy}/upload`,
        says:
          `${found.label.charAt(0).toUpperCase() + found.label.slice(1)} is already with ` +
          `${found.companyName}. They have it and nobody has checked it yet — there is nothing ` +
          `further for you to do about it today.`,
      },
    })
  }

  // Already asked and not yet answered: that request is the one. Found
  // by type rather than by template, because a template renamed between
  // two presses left one document asked for twice on the walk that found
  // this, and a worker chased twice for one paper stops reading the
  // chases.
  if (found.openAsk) {
    return NextResponse.json({
      data: {
        askId: found.openAsk,
        uploadTo: `/api/documents/${found.openAsk}/upload`,
        says:
          `${found.label.charAt(0).toUpperCase() + found.label.slice(1)} is open for you to send to ` +
          `${found.companyName}. Attach the file and they will be told it has arrived. ` +
          `They record whether it is accepted — sending it is not the same as it being checked.`,
      },
    })
  }

  // One request per document per line. A second press is the same
  // request rather than a second one, so a worker who taps twice is not
  // chased twice for the paper she already sent.
  const template = await templateFor(found.companyId, found.label)
  const mine = {
    templateId: template.id,
    subjectType: 'PERSON',
    subjectId: me,
    ...(found.side === 'SELL' ? { sellContractId: found.lineId } : { buyContractId: found.lineId }),
  }

  // An answered request is still the request for that document. This
  // used to exclude SIGNED and UPLOADED, so a second press after an
  // upload opened a second request for the same paper — one document
  // sent twice on a seeded walk. Pressing send twice is one request;
  // `mayAct` is what says "it is already on file", and it says it about
  // the request that actually holds the file.
  //
  // The exception is a renewal. Where the paper on file has run out or
  // has not begun, the next one is a NEW paper — reusing the old request
  // would refuse her with "already on file" about a certificate that
  // expired in March, which is a refusal nobody can act on.
  const renewing = found.state === 'LAPSED' || found.state === 'NOT_YET_VALID'
  const existing = await prisma.docInstance.findFirst({
    where: renewing ? { ...mine, status: { notIn: ['SIGNED', 'UPLOADED'] } } : mine,
    // Whatever is still open first; an answered one only where there is
    // nothing open, so a reopened chase does not resolve to a closed row.
    orderBy: [{ status: 'asc' }, { sentAt: 'desc' }],
    select: { id: true },
  })

  const ask =
    existing ??
    (await prisma.docInstance.create({
      data: {
        templateId: template.id,
        subjectType: 'PERSON',
        subjectId: me,
        ...(found.side === 'SELL' ? { sellContractId: found.lineId } : { buyContractId: found.lineId }),
        status: 'SENT',
        sentAt: new Date(),
        note: `Opened by ${caller.person.name} from their own paperwork page, against ${found.asked}.`,
      },
      select: { id: true },
    }))

  return NextResponse.json({
    data: {
      askId: ask.id,
      uploadTo: `/api/documents/${ask.id}/upload`,
      says:
        `${found.label.charAt(0).toUpperCase() + found.label.slice(1)} is open for you to send to ` +
        `${found.companyName}. Attach the file and they will be told it has arrived. ` +
        `They record whether it is accepted — sending it is not the same as it being checked.`,
    },
  })
}

function refuse(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

/**
 * The line that asks this person for this document, where one does.
 *
 * Read through `lib/document-requirements` and `outstandingItems` — the
 * same two the page is drawn from — so a document she can send is
 * exactly a document she is shown, and neither can drift.
 */
async function lineOwing(
  personId: string,
  key: string,
  checks: { type: string; status: string; issuedAt: Date | null; validFrom: Date | null; expiresAt: Date | null }[],
  papers: SignedPaperRow[],
  on: Date
): Promise<{
  side: 'SELL' | 'BUY'
  lineId: string
  companyId: string
  companyName: string
  label: string
  asked: string
  /** Where the item stands, so a renewal is not answered with "already on file". */
  state: string
  /**
   * The request that already holds a paper for this item, where one
   * does. Matched on the type rather than on the template, so a
   * template somebody renamed does not become a second request.
   */
  answeredBy: string | null
  /**
   * A request already open for this item and not yet answered. Matched
   * on the type for the same reason: a template renamed between two
   * presses left one document asked for twice on the walk that found it.
   */
  openAsk: string | null
} | null> {
  const live = { notIn: ['ENDED', 'CANCELLED'] as never[] }
  const [sellLines, buyCandidates] = await Promise.all([
    prisma.sellContract.findMany({
      where: { personId, state: live },
      select: { id: true, companyId: true, company: { select: { name: true } } },
      take: 20,
    }),
    prisma.buyContractCandidate.findMany({
      where: { personId, state: 'ACTIVE', buyContract: { state: live } },
      select: { buyContractId: true, buyContract: { select: { companyId: true, company: { select: { name: true } } } } },
      take: 20,
    }),
  ])

  const onFile: HeldKeyRecord[] = checks.map((v) => ({
    key: v.type,
    validFrom: v.validFrom ?? v.issuedAt ?? null,
    expiresAt: v.expiresAt ?? null,
    accepted: CAME_BACK.includes(v.status),
    received: WITH_THEM.includes(v.status),
  }))

  const candidates: { side: 'SELL' | 'BUY'; lineId: string; companyId: string; companyName: string }[] = [
    ...sellLines.map((l) => ({ side: 'SELL' as const, lineId: l.id, companyId: l.companyId, companyName: l.company?.name ?? 'the firm that placed you' })),
    ...buyCandidates.map((c) => ({
      side: 'BUY' as const,
      lineId: c.buyContractId,
      companyId: c.buyContract.companyId,
      companyName: c.buyContract.company?.name ?? 'the firm that pays you',
    })),
  ]

  for (const c of candidates) {
    const set = await requirementsFor(c.side === 'SELL' ? { sellContractId: c.lineId } : { buyContractId: c.lineId })
    if (!set) continue
    const item = outstandingItems({
      items: set.items,
      held: [...onFile, ...papersAsHeld(papers, set.items)],
      owedBy: ['WORKER'],
      on,
    }).find(
      (i) => i.key === key && i.state !== 'WAIVED'
    )
    if (item) {
      // What already answers it, by type. A second press is that
      // request and not a new one, whatever the template ended up
      // called — `mayAct` is what says "it is already on file", and it
      // has to say it about the row that actually holds the file.
      const forThis = papers.filter(
        (r) => typeKeyForTemplate(r.template.name, namesOf(set.items), { guess: false }) === key
      )
      const answered = forThis.find((r) => r.status === 'SIGNED' || r.status === 'UPLOADED')
      const open = forThis.find((r) => r.status !== 'SIGNED' && r.status !== 'UPLOADED')
      return {
        ...c,
        label: item.label,
        asked: item.asked,
        state: item.state,
        answeredBy: answered?.id ?? null,
        openAsk: open?.id ?? null,
      }
    }
  }
  return null
}

/**
 * The template a request for this document hangs off.
 *
 * Named exactly as the document is — "hot floor induction", not "Form
 * 7" — because `typeKeyForTemplate` reads a signed paper back to its
 * type off its own name, and a paper nobody can identify satisfies
 * nothing and gets chased forever.
 */
async function templateFor(companyId: string, label: string) {
  const name = label.charAt(0).toUpperCase() + label.slice(1)
  const found = await prisma.docTemplate.findFirst({
    where: { companyId, name },
    select: { id: true },
  })
  if (found) return found
  return prisma.docTemplate.create({
    data: { companyId, name, audience: 'CANDIDATE', needsSignature: false },
    select: { id: true },
  })
}
