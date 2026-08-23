import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { defaultPostureFor } from '@/lib/walls'
import {
  readSupplierList, listSentence, nameFromDomain, type SupplierRow,
} from '@/lib/supplier-list'

/**
 * GET  /api/suppliers        — who this client buys from, and where each stands
 * POST /api/suppliers/read   — read a paste, write nothing
 * POST /api/suppliers        — list them, and invite the ones who are new
 *
 * The growth loop, and the reason the demand side is worth building
 * first. A client arrives with twelve suppliers and an MSA with each.
 * They paste that list, and every firm in it becomes a supplier they can
 * send a role to today — whether or not that firm has ever heard of us.
 *
 * The supplier finds out because a role arrived, which is the only
 * message a staffing firm has ever opened on the first try.
 *
 * ── Two rules that keep this from being spam ─────────────────────────
 *
 * A shell can be sent a role and can be scored. It cannot sign in, is
 * invisible to the network, and is never counted as a company that chose
 * to be here. And where the firm is already on the platform under its own
 * name, the client is attached to the real one rather than a second copy
 * — the second client to list Cloudepa must reach the same Cloudepa.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Suppliers')
  if (notStaff) return notStaff

  const companyId = caller.company!.id

  const [invites, agreements] = await Promise.all([
    prisma.supplierInvite.findMany({
      where: { byId: companyId, state: { not: 'REVOKED' } },
      include: {
        company: {
          select: { id: true, name: true, domain: true, claimedAt: true, listedById: true },
        },
      },
      orderBy: { sentAt: 'desc' },
    }),
    prisma.masterAgreement.findMany({
      where: { clientId: companyId },
      select: { vendorId: true, signedAt: true, vendor: { select: { id: true, name: true, claimedAt: true } } },
    }),
  ])

  // One row per firm, however many contacts were listed there.
  const byCompany = new Map<string, any>()

  for (const a of agreements) {
    byCompany.set(a.vendorId, {
      companyId: a.vendorId,
      name: a.vendor.name,
      joined: a.vendor.claimedAt != null,
      agreement: true,
      signedAt: a.signedAt?.toISOString() ?? null,
      contacts: [],
      invitedAt: null,
      where: a.vendor.claimedAt ? 'Working with you here.' : 'Listed by you. Not signed in yet.',
    })
  }

  for (const i of invites) {
    const row = byCompany.get(i.companyId) ?? {
      companyId: i.companyId,
      name: i.company.name,
      joined: i.company.claimedAt != null,
      agreement: false,
      signedAt: null,
      contacts: [],
      invitedAt: null,
      where: '',
    }
    row.contacts.push({ email: i.email, name: i.contactName, state: i.state })
    row.invitedAt = row.invitedAt ?? i.sentAt.toISOString()
    row.joined = row.joined || i.state === 'ACCEPTED'
    byCompany.set(i.companyId, row)
  }

  const rows = [...byCompany.values()].map((r) => ({
    ...r,
    where: r.joined
      ? 'Signed in. Can be sent a role.'
      : r.invitedAt
        ? 'Invited. Can still be sent a role — they will find out when one arrives.'
        : 'Listed by you. Not invited yet.',
  }))

  const joined = rows.filter((r) => r.joined).length

  return NextResponse.json({
    data: {
      suppliers: rows,
      summary:
        rows.length === 0
          ? 'No suppliers yet. Paste the list you already email.'
          : `${rows.length} ${rows.length === 1 ? 'supplier' : 'suppliers'}, ${joined} signed in.`,
    },
  })
}

/**
 * POST — list them, and invite the ones who are new.
 *
 * Idempotent on the address. A client who pastes the same list twice has
 * twelve suppliers, not twenty-four, and nobody is emailed again.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Suppliers')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))

  // Either a raw paste, or the rows after somebody has corrected them on
  // screen. The second is what actually gets sent — the first is only
  // here so a caller can do both in one step.
  const rows: SupplierRow[] = Array.isArray(body?.rows)
    ? body.rows
    : readSupplierList(String(body?.text ?? '')).rows

  const usable = rows.filter((r) => r.email && (r.company || r.domain))
  if (usable.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: 'NOTHING_TO_ADD',
          message:
            'Nothing in that had both an address and a company. Say which firm each personal address belongs to.',
        },
      },
      { status: 422 }
    )
  }

  const made: any[] = []

  for (const row of usable) {
    const name = row.company ?? nameFromDomain(row.domain!)

    // ── Which company this is, in three steps ───────────────────────
    //
    // 1. The real firm, already here under its own name and having
    //    proved the domain. Attach to it — a second copy of Cloudepa is
    //    worse than no Cloudepa: two scorecards, two histories, and a
    //    consultant who is a duplicate of themselves.
    //
    // 2. A shell this same client already listed for that domain. Two
    //    contacts at one firm is one supplier, not two.
    //
    // 3. Otherwise a new shell — and it gets no `domain` at all. That
    //    column is globally unique and a pasted address proves nothing:
    //    a client typing "cloudepa.com" must not be able to take the
    //    domain from the real Cloudepa, be handed it, or collide with a
    //    stranger's sandbox. The domain is recorded on the invitation
    //    and moves onto the company when somebody signs in and claims it.
    const claimed = row.domain
      ? await prisma.company.findFirst({
          where: {
            domain: row.domain,
            claimedAt: { not: null },
            isDemo: caller.company!.isDemo,
          },
          select: { id: true, name: true, claimedAt: true },
        })
      : null

    const listedBefore =
      claimed || !row.domain
        ? null
        : await prisma.supplierInvite.findFirst({
            where: { byId: companyId, domain: row.domain },
            select: { company: { select: { id: true, name: true, claimedAt: true } } },
          })

    const existing = claimed ?? listedBefore?.company ?? null

    const supplier =
      existing ??
      (await prisma.company.create({
        data: {
          name,
          slug: await freeSlug(name),
          // Deliberately null. See above.
          domain: null,
          domainVerified: false,
          kind: 'VENDOR',
          currency: 'USD',
          outsideAccess: defaultPostureFor('VENDOR'),
          listedById: companyId,
          isDemo: caller.company!.isDemo,
        },
      }))

    // An agreement stub, so the screen does not hold their first
    // submission back for having no relationship on file. Unsigned,
    // which is the honest state of most of this industry between a
    // handshake and a start date, and already a state this model has.
    const already = await prisma.masterAgreement.findFirst({
      where: { vendorId: supplier.id, clientId: companyId },
      select: { id: true },
    })
    if (!already) {
      await prisma.masterAgreement.create({
        data: { vendorId: supplier.id, clientId: companyId, paymentTerms: 30 },
      })
    }

    const invite = await prisma.supplierInvite.upsert({
      where: { byId_email: { byId: companyId, email: row.email } },
      create: {
        companyId: supplier.id,
        byId: companyId,
        email: row.email,
        contactName: row.contactName ?? null,
        domain: row.domain ?? null,
        line: row.line ?? null,
        token: randomBytes(24).toString('base64url'),
      },
      // Nobody is emailed twice for pasting the same list twice.
      update: {},
    })

    made.push({
      companyId: supplier.id,
      name: supplier.name,
      email: row.email,
      alreadyHere: existing != null && existing.claimedAt != null,
      claimUrl: `/claim/${invite.token}`,
      state: invite.state,
    })
  }

  const firms = new Set(made.map((m) => m.companyId)).size

  return NextResponse.json({
    data: {
      added: made,
      summary: `${firms} ${firms === 1 ? 'supplier' : 'suppliers'} on your list. You can send them a role now — they will find out when one arrives.`,
    },
  })
}

/**
 * A slug nobody is using.
 *
 * Numbered on collision, the same as 2017's create_slug. Two firms called
 * Apex Staffing is an ordinary Tuesday.
 */
async function freeSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'supplier'

  for (let n = 0; n < 50; n++) {
    const slug = n === 0 ? base : `${base}-${n + 1}`
    const taken = await prisma.company.findUnique({ where: { slug }, select: { id: true } })
    if (!taken) return slug
  }
  return `${base}-${randomBytes(3).toString('hex')}`
}
