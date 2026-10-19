import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { defaultPostureFor } from '@/lib/walls'
import { mayList, shellNotice, recordClientContact, type CompanyStanding } from '@/lib/off-system'

/**
 * GET   /api/clients — who this firm sells to, and which of them are here
 * POST  /api/clients — list one that is not
 * PATCH /api/clients — record the person at a listed client, or take one off
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
            askTheDesk({ doing: 'Putting a client on your register — the same role that records a contract —', needs: 'assignments.write', kind: caller.company?.kind, companyName: caller.company?.name }),
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

  // The person at the client, where one was given, in the firm's own
  // address book — the way the supplier path fills it. While the client is
  // not on Etyme this is also who may approve a week by email for it
  // (`clientOfRecord` in lib/week-approval): the supplier is trusted to
  // name the client's person. Written every time an address is given,
  // invited or not.
  const email = body.email ? String(body.email).trim().toLowerCase() : null
  const contactName = body.contactName ? String(body.contactName).trim() : null
  let contact: { email: string } | null = null
  let contactRefused: string | null = null
  if (email) {
    const contactVerdict = recordClientContact({
      callerCompanyId: companyId,
      client,
      email,
      contactName: contactName ?? email.split('@')[0],
      ownSeatEmails: (await prisma.context.findMany({
        where: { companyId, revokedAt: null },
        select: { person: { select: { primaryEmail: true } } },
      })).map((x) => x.person.primaryEmail),
    })
    if (contactVerdict.ok && !contactVerdict.remove) {
      await keepContact(companyId, client.id, contactVerdict.email, contactVerdict.contactName!, caller.person.id)
      contact = { email: contactVerdict.email }
    } else if (!contactVerdict.ok) {
      contactRefused = contactVerdict.says
    }
  }

  // An invitation only where the caller asked for one. It is the client's
  // door to take its record, and today nothing sends it: the letter to a
  // client is conversation's to write, so no screen offers the choice and
  // a claim link is never made for an address nobody chose to invite.
  let invite: { token: string; email: string } | null = null
  if (email && body.invite === true && !verdict.reuse) {
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
          contactName,
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
      payload: { clientCompanyId: client.id, msaId: msa.id, contact: contact?.email ?? null, invited: Boolean(invite) },
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
        contact,
        invited: invite ? { email: invite.email } : null,
        message:
          `${client.name} is on your register. You can record the contracts you already ` +
          `hold with them, and the purchase orders they handed you, today. ` +
          (contact ? `${contact.email} is recorded as your contact there. ` : '') +
          (contactRefused ? `${contactRefused} ` : '') +
          `Nothing reaches them until you invite somebody there.`,
      },
    },
    { status: 201 }
  )
}

/**
 * Record the person at a client this firm listed, or take one off.
 *
 * Body: `{ clientId, email, contactName?, remove? }`.
 *
 * POST writes the client's contact only when the client is first listed,
 * so a supplier that listed a client with no address — or the wrong one —
 * could never add it, and that client refused every approver for a week's
 * hours: the supplier could neither send "Approve by email" nor attach
 * the client's approval (`clientOfRecord` in lib/week-approval).
 *
 * **The supplier is trusted to name the client's person.** While the
 * client is not on Etyme, nobody at it can say who works there, so the
 * address the supplier records is what an approval by email is checked
 * against — that exact address, or another at its company domain. So a
 * colleague of the recorded person may approve too, and every such
 * approval says the client was not on Etyme. That is the founder's rule
 * for a client that is not here, stated so it is a choice and not a
 * surprise. It ends the day the client claims its record: from then its
 * own domain and seats decide, and this route refuses.
 *
 * The address is kept in the firm's own address book (`CompanyContact`),
 * the row POST writes. Nothing is sent and no claim link is made: an
 * invitation is a separate choice. Taking one off removes it, and revokes
 * an invitation to the same address; nothing already approved changes.
 */
export async function PATCH(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Clients')
  if (notStaff) return notStaff

  if (!hasPermission(caller.permissions, 'assignments.write')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({ doing: 'Recording the person at a client — the same role that records a contract —', needs: 'assignments.write', kind: caller.company?.kind, companyName: caller.company?.name }),
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))
  const clientId = typeof body.clientId === 'string' ? body.clientId : ''

  const [client, seats] = await Promise.all([
    clientId
      ? prisma.company.findUnique({ where: { id: clientId }, select: { id: true, name: true, claimedAt: true, listedById: true } })
      : null,
    prisma.context.findMany({
      where: { companyId, revokedAt: null },
      select: { person: { select: { primaryEmail: true } } },
    }),
  ])

  const verdict = recordClientContact({
    callerCompanyId: companyId,
    client,
    email: body.email,
    contactName: body.contactName,
    remove: body.remove === true,
    ownSeatEmails: seats.map((x) => x.person.primaryEmail),
  })
  if (!verdict.ok) {
    return NextResponse.json(
      { error: { code: verdict.code, message: verdict.says, ...(verdict.field ? { field: verdict.field } : {}) } },
      { status: verdict.status }
    )
  }
  const shell = client!

  if (verdict.remove) {
    // Off the address book, and off any invitation to the same address,
    // because both are read as the client's recorded person.
    const [gone, revoked] = await Promise.all([
      prisma.companyContact.deleteMany({ where: { companyId, atCompanyId: shell.id, email: verdict.email } }),
      prisma.supplierInvite.updateMany({
        where: { byId: companyId, companyId: shell.id, email: verdict.email, state: { not: 'REVOKED' } },
        data: { state: 'REVOKED' },
      }),
    ])
    if (gone.count + revoked.count === 0) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `${verdict.email} is not recorded for ${shell.name}.`, field: 'email' } },
        { status: 404 }
      )
    }
  } else {
    await keepContact(companyId, shell.id, verdict.email, verdict.contactName!, caller.person.id)
  }

  await prisma.automationLog.create({
    data: {
      companyId,
      action: verdict.remove ? 'CLIENT_CONTACT_REMOVED' : 'CLIENT_CONTACT_RECORDED',
      summary: verdict.remove
        ? `${caller.person.name} took ${verdict.email} off ${shell.name}`
        : `${caller.person.name} recorded ${verdict.email} at ${shell.name}`,
      reason: verdict.says,
      payload: { clientCompanyId: shell.id, email: verdict.email },
      reversible: true,
    },
  })

  return NextResponse.json({ data: { clientId: shell.id, email: verdict.email, removed: verdict.remove, message: verdict.says } })
}

/**
 * The person at a client in this firm's address book: added, or renamed
 * where the address is already there. One row per address per client.
 */
async function keepContact(companyId: string, atCompanyId: string, email: string, name: string, byId: string) {
  await prisma.companyContact.upsert({
    where: { companyId_atCompanyId_email: { companyId, atCompanyId, email } },
    update: { name },
    create: { companyId, atCompanyId, email, name, kind: 'HIRING_MANAGER', createdById: byId },
  })
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
