import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { myPapers, type AskedPacket, type HeldRecord, type SentDocument } from '@/lib/document-request'
import { labelFor, typeByKey } from '@/lib/document-type'

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
    validFrom: v.validFrom ?? v.issuedAt,
    expiresAt: v.expiresAt,
    stopsWork: typeByKey(v.type)?.blocks ?? false,
  }))

  return NextResponse.json({
    data: {
      papers: myPapers({
        myEmail: caller.person.primaryEmail ?? null,
        documents,
        packets: asked,
        held: onFile,
      }),
    },
  })
}
