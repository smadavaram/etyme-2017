/**
 * What each seeded order asks for on paper, and the one line that
 * answers differently.
 *
 * ── Why the seed writes these and not the defaults ───────────────────
 *
 * `lib/document-requirements` computes a default set for every line from
 * its shape, and writes nothing. A row exists only where somebody
 * actually decided something — so what belongs in the seed is exactly
 * what a client decided: the set on its own order, and the one item a
 * named person waived on one line with a reason.
 *
 * Seeding the defaults as rows would contradict the design they
 * demonstrate, the same way seeding all twenty document types would
 * (see the note at the top of `lib/seed-standing`).
 *
 * ── The crack the demo is supposed to show ───────────────────────────
 *
 * "Ensure the loop of documents never cracks between parties." A demo
 * where every document is on file proves nothing about a loop. So
 * Cavanaugh Glassworks' order to Wrenfield Technical — the one placement
 * in this world with no agreement behind it — requires a master service
 * agreement that nobody ever papered. The requirement is real, the
 * agreement is absent, and the screen can say so in a sentence.
 *
 * Nothing reads these rows yet; rewiring clearance, the packets, the
 * outbound pack and supplier onboarding to read them is
 * `etyme-regulatory`'s next piece of work.
 */

import { prisma as db } from '@/lib/db'
import { day } from '@/lib/seed-days'

export interface SeedContext {
  firmBySlug: Map<string, { id: string }>
  seatBySlug: Map<string, { personId: string; email: string }>
  domain: string
  prefix: string
}

export interface DocumentRequirements {
  /** Orders that carry a required set. */
  orders: number
  /** Rows written across all of them. */
  items: number
  /** Lines answering their order differently. */
  lineOverrides: number
}

type OwedBy = 'WORKER' | 'SUPPLIER' | 'CUSTOMER' | 'US'

interface Ask {
  key: string
  owedBy: OwedBy
  required?: boolean
  blocks?: boolean | null
  note?: string | null
}

/**
 * What a client asks of every supplier on every order.
 *
 * The person's work authorization and their background check, because a
 * client is answerable for who is on its site; the supplier's cover and
 * its standing to trade, because a client is answerable for the firm it
 * lets through the gate; and the agreement itself.
 *
 * Nothing here is invented for the demo — it is the set CLAUDE.md's
 * paperwork table already names, written on the document that carries
 * the client's rules instead of hardcoded in three desks' own lists.
 */
const CLIENT_ASKS: Ask[] = [
  { key: 'I9_EVERIFY', owedBy: 'WORKER' },
  // Not the worker's: the screening company posts the report to whoever
  // ordered it, and a client's order asking a consultant for her own
  // background report asks her for post she never receives.
  { key: 'BACKGROUND_CHECK', owedBy: 'US' },
  { key: 'INSURANCE_GL', owedBy: 'SUPPLIER' },
  { key: 'INSURANCE_WC', owedBy: 'SUPPLIER' },
  { key: 'GOOD_STANDING', owedBy: 'SUPPLIER' },
  { key: 'MSA', owedBy: 'SUPPLIER' },
]

/**
 * What a firm asks of the firm below it.
 *
 * A prime buying from a sub-vendor asks for the same cover and the same
 * standing — it is answerable to its client for the firm it puts on the
 * client's site — and for the agreement between the two of them. The
 * person's own file stays one rung down, with the firm that employs
 * them, rather than being copied up at every hop.
 */
const CHAIN_ASKS: Ask[] = [
  { key: 'INSURANCE_GL', owedBy: 'SUPPLIER' },
  { key: 'INSURANCE_WC', owedBy: 'SUPPLIER' },
  { key: 'GOOD_STANDING', owedBy: 'SUPPLIER' },
  { key: 'MSA', owedBy: 'SUPPLIER' },
]

/**
 * The one document each client invented for itself, asked for on its own
 * orders.
 *
 * This is the whole reason the table exists: a furnace floor induction is
 * not a staffing document, no migration created it, and it reaches the
 * line through the client's order like anything else. The types
 * themselves are written by `lib/seed-standing`; these are the orders
 * asking for them.
 */
const OWN_TYPE_ASKS: Record<string, Ask> = {
  nike: { key: 'PRODUCT_CONFIDENTIALITY', owedBy: 'WORKER', note: 'Unreleased product lines. Signed before the first day on site.' },
  corning: { key: 'HOT_FLOOR_INDUCTION', owedBy: 'WORKER', note: 'Site-specific. Another plant’s induction does not count.' },
  'terumo-bct': { key: 'STERILE_FIELD_TRAINING', owedBy: 'WORKER', note: 'Anybody going into a clean room needs it.' },
}

/** The clients that also require their own non-disclosure agreement. */
const NDA_CLIENTS = ['nike', 'terumo-bct']

async function deskAt(ctx: SeedContext, clientSlug: string, key: string) {
  return db.person.findUnique({
    where: { primaryEmail: `${ctx.prefix}${clientSlug}-${key}@${ctx.domain}` },
    select: { id: true, name: true },
  })
}

export async function seedDocumentRequirements(ctx: SeedContext): Promise<DocumentRequirements> {
  const out: DocumentRequirements = { orders: 0, items: 0, lineOverrides: 0 }

  const firms = await db.company.findMany({
    where: { slug: { startsWith: ctx.prefix } },
    select: { id: true, slug: true, kind: true },
  })
  const firmById = new Map(firms.map((f) => [f.id, f]))
  /** The slug without the demo prefix — 'corning', not 'world-corning'. */
  const bare = (slug: string) => slug.slice(ctx.prefix.length)

  const orders = await db.workOrder.findMany({
    where: { issuedBy: { slug: { startsWith: ctx.prefix } } },
    select: { id: true, issuedById: true, msaId: true, startDate: true },
    orderBy: { number: 'asc' },
  })

  for (const order of orders) {
    const issuer = firmById.get(order.issuedById)
    if (!issuer) continue
    const slug = bare(issuer.slug)
    const isClient = issuer.kind === 'CLIENT'

    const asks: Ask[] = [...(isClient ? CLIENT_ASKS : CHAIN_ASKS)]
    const own = OWN_TYPE_ASKS[slug]
    if (own) asks.push(own)
    if (NDA_CLIENTS.includes(slug)) asks.push({ key: 'NDA', owedBy: 'SUPPLIER' })

    // The agreement-less order, named rather than left to be noticed.
    // Cavanaugh sent Wrenfield a purchase order for one season and
    // nobody papered an agreement; the requirement stands and the paper
    // is not there.
    const noAgreement = isClient && order.msaId === null

    let wrote = 0
    for (const ask of asks) {
      const already = await db.documentRequirement.findFirst({
        where: { workOrderId: order.id, documentTypeKey: ask.key },
        select: { id: true },
      })
      if (already) continue
      await db.documentRequirement.create({
        data: {
          workOrderId: order.id,
          documentTypeKey: ask.key,
          required: ask.required ?? true,
          owedBy: ask.owedBy,
          blocks: ask.blocks ?? null,
          note:
            ask.key === 'MSA' && noAgreement
              ? 'Required on this order, and no agreement was ever signed. One purchase order for one season.'
              : (ask.note ?? null),
          createdAt: order.startDate,
        },
      })
      wrote++
    }
    if (wrote > 0) out.orders++
    out.items += wrote
  }

  // ── The one line that answers differently ──────────────────────────
  //
  // Aisha Bello started at Cavanaugh Glassworks with no background check
  // on file — the world seed has said so since it was written. What it
  // never had was anybody deciding anything about it. The plant's
  // compliance officer waived the item on that line, in her own words,
  // with her name and the day on the record: WARN, capture a reason,
  // proceed, which is Addendum E's rule for everything that is not
  // legally grounded.
  const cavanaugh = ctx.firmBySlug.get('corning')
  if (cavanaugh) {
    const line = await db.sellContract.findFirst({
      where: { clientCompanyId: cavanaugh.id, person: { name: 'Aisha Bello' } },
      select: { id: true, workOrderId: true },
    })
    const officer = await deskAt(ctx, 'corning', 'compliance')
    if (line && officer) {
      const already = await db.documentRequirement.findFirst({
        where: { sellContractId: line.id, documentTypeKey: 'BACKGROUND_CHECK' },
        select: { id: true },
      })
      if (!already) {
        const parent = line.workOrderId
          ? await db.documentRequirement.findFirst({
              where: { workOrderId: line.workOrderId, documentTypeKey: 'BACKGROUND_CHECK' },
              select: { id: true },
            })
          : null
        await db.documentRequirement.create({
          data: {
            sellContractId: line.id,
            documentTypeKey: 'BACKGROUND_CHECK',
            required: true,
            owedBy: 'WORKER',
            inheritedFromId: parent?.id ?? null,
            waivedReason:
              'The plant runs its own screening on every badge holder before a card is issued, and hers is on file here.',
            waivedById: officer.id,
            waivedAt: day(-55),
            createdAt: day(-55),
          },
        })
        out.lineOverrides++
      }
    }
  }

  return out
}
