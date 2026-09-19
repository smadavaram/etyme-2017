import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { defaultPostureFor } from '@/lib/walls'
import { mayList, shellNotice, type CompanyStanding } from '@/lib/off-system'

/**
 * GET  /api/clients — who this firm sells to, and which of them are here
 * POST /api/clients — list one that is not
 *
 * ── The door that was missing ────────────────────────────────────────
 *
 * A client arrives with twelve suppliers and lists them, each becoming a
 * company record nobody has taken possession of yet. That path has been
 * built since the beginning (`/api/suppliers`).
 *
 * The other direction had nothing. A staffing firm that hears about this
 * from a peer, signs up on a Tuesday and wants to put its current book in
 * could not: every contract it holds names a client that is not on the
 * platform, `POST /api/contracts` required `clientCompanyId` to name a
 * company that already exists, and no route made one. So the firm that
 * arrives first — the one that will bring its clients with it — was the
 * one the product could not serve.
 *
 * This is the same door, the same way round: a shell with `claimedAt`
 * null and `listedById` set, invitable and claimable through the
 * existing `SupplierInvite` path. The model is named for the direction it
 * was built in; it holds "the shell" and "the firm that listed it", which
 * is what this needs too.
 *
 * ── What it must not become ──────────────────────────────────────────
 *
 * Any firm claiming any client. A shell is not a claim on anybody — it
 * cannot sign in, the network cannot see it, and it is never counted as a
 * company that chose to be here. But a shell wearing a real tenant's name
 * and domain would be, so a firm already here under that domain is
 * refused in words rather than copied. `lib/off-system` holds the rule.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Clients')
  if (notStaff) return notStaff

  const companyId = caller.company!.id

  const [agreements, listed, counterparties] = await Promise.all([
    prisma.masterAgreement.findMany({
      where: { vendorId: companyId },
      select: {
        clientId: true,
        signedAt: true,
        client: { select: { id: true, name: true, claimedAt: true, listedById: true } },
      },
    }),
    prisma.company.findMany({
      where: { listedById: companyId, claimedAt: null },
      select: { id: true, name: true, claimedAt: true, listedById: true },
    }),
    prisma.counterparty.findMany({
      where: { companyId, relationship: 'CLIENT' },
      select: {
        otherCompany: { select: { id: true, name: true, claimedAt: true, listedById: true } },
      },
    }),
  ])

  const byId = new Map<string, CompanyStanding & { signedAt: Date | null }>()
  for (const a of agreements) {
    byId.set(a.clientId, { ...a.client, signedAt: a.signedAt })
  }
  for (const c of [...listed, ...counterparties.map((c) => c.otherCompany)]) {
    if (!byId.has(c.id)) byId.set(c.id, { ...c, signedAt: null })
  }

  const rows = [...byId.values()].map((c) => ({
    id: c.id,
    name: c.name,
    /** On the system, or only on your register. */
    onEtyme: c.claimedAt != null,
    /** You put them here, and they have not taken possession. */
    yours: c.claimedAt == null && c.listedById === companyId,
    agreementSigned: c.signedAt != null,
    says: shellNotice(c) ?? `${c.name} is on Etyme.`,
  }))

  return NextResponse.json({
    data: {
      clients: rows.sort((a, b) => a.name.localeCompare(b.name)),
      offSystem: rows.filter((r) => !r.onEtyme).length,
      canList: hasPermission(caller.permissions, 'assignments.write'),
    },
  })
}

/**
 * List a client that is not on Etyme.
 *
 * Needs `assignments.write` — the permission that already governs
 * recording a contract, because listing a client with no contract behind
 * it is data entry nobody asked for, and the one flow this exists to
 * serve is "put my current book in".
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Clients')
  if (notStaff) return notStaff

  if (!hasPermission(caller.permissions, 'assignments.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'Putting a client on your register needs the assignments.write permission — it is the same desk that records a contract. Ask whoever runs your company\'s access.',
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))

  const name = String(body.name ?? '').trim()
  const domain = body.domain
    ? String(body.domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    : null

  // A real firm already here under that domain. Never copied — a second
  // record of a tenant is two histories and a name on a row they cannot
  // see. Demo companies are kept to their own world, the same way the
  // supplier path does it.
  const claimedAtDomain = domain
    ? await prisma.company.findFirst({
        where: { domain, claimedAt: { not: null }, isDemo: caller.company!.isDemo },
        select: { id: true, name: true, claimedAt: true, listedById: true },
      })
    : null

  // One firm listing the same client twice is one client.
  const alreadyListed = await prisma.company.findFirst({
    where: {
      listedById: companyId,
      claimedAt: null,
      name: { equals: name, mode: 'insensitive' },
    },
    select: { id: true, name: true, claimedAt: true, listedById: true },
  })

  const verdict = mayList({ callerCompanyId: companyId, claimedAtDomain, alreadyListed, name })

  if (!verdict.ok) {
    return NextResponse.json(
      {
        error: {
          code: claimedAtDomain ? 'ALREADY_HERE' : 'VALIDATION',
          message: verdict.says,
          field: claimedAtDomain ? 'domain' : 'name',
          ...(claimedAtDomain ? { companyId: claimedAtDomain.id } : {}),
        },
      },
      { status: claimedAtDomain ? 409 : 422 }
    )
  }

  const client =
    verdict.reuse ??
    (await prisma.company.create({
      data: {
        name,
        slug: await freeSlug(name),
        // Deliberately null, exactly as on the supplier path. `domain` is
        // globally unique and a typed address proves nothing: listing
        // "northbend.example" must not take the domain from the real firm
        // or collide with a stranger. It is recorded on the invitation
        // and moves onto the company when somebody claims it.
        domain: null,
        domainVerified: false,
        kind: 'CLIENT',
        currency: 'USD',
        outsideAccess: defaultPostureFor('CLIENT'),
        listedById: companyId,
        claimedAt: null,
        isDemo: caller.company!.isDemo,
      },
      select: { id: true, name: true, claimedAt: true, listedById: true },
    }))

  // The paper stub, so a contract recorded against them tomorrow has an
  // agreement to hang on. Unsigned, which is the honest state of a
  // relationship whose paperwork lives in somebody's filing cabinet.
  const existingMsa = await prisma.masterAgreement.findFirst({
    where: { vendorId: companyId, clientId: client.id },
    select: { id: true },
  })
  const msa =
    existingMsa ??
    (await prisma.masterAgreement.create({
      data: { vendorId: companyId, clientId: client.id, paymentTerms: 30 },
      select: { id: true },
    }))

  // The register row. Partnership died of exactly this omission — a
  // relationship model no flow ever wrote.
  await prisma.counterparty.upsert({
    where: {
      companyId_otherCompanyId_relationship: {
        companyId,
        otherCompanyId: client.id,
        relationship: 'CLIENT',
      },
    },
    update: {},
    create: {
      companyId,
      otherCompanyId: client.id,
      relationship: 'CLIENT',
      status: 'ACTIVE',
      createdById: caller.person.id,
    },
  })

  // An invitation, where an address was given. It is the claim path — the
  // day somebody at that firm signs in with it, every row already points
  // at this company id and becomes theirs.
  let invite: { token: string; email: string } | null = null
  const email = body.email ? String(body.email).trim().toLowerCase() : null
  if (email && !verdict.reuse) {
    const existing = await prisma.supplierInvite.findFirst({
      where: { byId: companyId, email },
      select: { token: true, email: true },
    })
    invite =
      existing ??
      (await prisma.supplierInvite.create({
        data: {
          companyId: client.id,
          byId: companyId,
          email,
          contactName: body.contactName ? String(body.contactName).trim() : null,
          domain,
          token: randomBytes(24).toString('hex'),
        },
        select: { token: true, email: true },
      }))
  }

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'CLIENT_LISTED',
      summary: `${caller.person.name} put ${client.name} on the register`,
      reason: verdict.says,
      payload: { clientCompanyId: client.id, msaId: msa.id, invited: Boolean(invite) },
      reversible: true,
    },
  })

  return NextResponse.json(
    {
      data: {
        client: {
          id: client.id,
          name: client.name,
          onEtyme: false,
          yours: true,
        },
        msaId: msa.id,
        invited: invite ? { email: invite.email } : null,
        message:
          `${client.name} is on your register. You can record the contracts you already ` +
          `hold with them, and the purchase orders they handed you, today. ` +
          (invite
            ? `${invite.email} has a link to take possession of the record when they want it.`
            : `Nothing reaches them until you invite somebody there.`),
      },
    },
    { status: 201 }
  )
}

/**
 * A slug nobody is using.
 *
 * Numbered on collision, the same as the supplier path and the same as
 * 2017's create_slug. Two firms called Apex Health is an ordinary
 * Tuesday.
 */
async function freeSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'client'

  for (let n = 0; n < 50; n++) {
    const slug = n === 0 ? base : `${base}-${n + 1}`
    const taken = await prisma.company.findUnique({ where: { slug }, select: { id: true } })
    if (!taken) return slug
  }
  return `${base}-${randomBytes(3).toString('hex')}`
}
