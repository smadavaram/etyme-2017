import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { rolesFor } from '@/lib/company-defaults'
import { companyDomain, mayClaim } from '@/lib/supplier-list'

/**
 * GET  /api/claim/:token — who is this invitation for
 * POST /api/claim/:token — take possession of the supplier record
 *
 * A client listed twelve suppliers. Each is a real company record that
 * nobody has taken possession of yet: it can be sent a role and scored,
 * but it cannot sign in and the network cannot see it. This is where
 * somebody at that firm takes it.
 *
 * ── Who may claim ────────────────────────────────────────────────────
 *
 * The token alone is not enough. Invitations get forwarded, pasted into
 * group chats and left in shared inboxes, and a token that hands a
 * stranger a company — with its client relationships and its rates — is
 * a door with the key taped to it.
 *
 * So: the signed-in address must be the one that was invited, or share
 * its domain. A colleague at the same firm is the ordinary case and is
 * allowed; anybody else is refused and told to ask for their own.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const invite = await prisma.supplierInvite.findUnique({
    where: { token },
    include: {
      company: { select: { id: true, name: true, claimedAt: true } },
      by: { select: { name: true } },
    },
  })

  if (!invite || invite.state === 'REVOKED') {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That link is not valid any more.' } },
      { status: 404 }
    )
  }

  const email = await getSessionEmail()

  // How many roles are already waiting for them. It is the whole reason
  // to bother signing in, so it is the first thing the page can say.
  const waiting = await prisma.requirementInvitation.count({
    where: { toCompanyId: invite.companyId, status: { in: ['SENT', 'ACCEPTED'] } },
  })

  return NextResponse.json({
    data: {
      company: invite.company.name,
      invitedBy: invite.by.name,
      invitedEmail: invite.email,
      contactName: invite.contactName,
      alreadyClaimed: invite.company.claimedAt != null || invite.state === 'ACCEPTED',
      rolesWaiting: waiting,
      signedInAs: email,
      mayClaim: email ? mayClaim(email, invite.email) : null,
    },
  })
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const email = await getSessionEmail()

  if (!email) {
    return NextResponse.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sign in with your work address first, then open this link again.',
        },
      },
      { status: 401 }
    )
  }

  const invite = await prisma.supplierInvite.findUnique({
    where: { token },
    include: { company: { select: { id: true, name: true, domain: true, claimedAt: true } } },
  })

  if (!invite || invite.state === 'REVOKED') {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'That link is not valid any more.' } },
      { status: 404 }
    )
  }

  if (!mayClaim(email, invite.email)) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_YOURS',
          message:
            `This invitation was sent to ${invite.email}. Sign in with that address, ` +
            `or ask them to invite you from inside ${invite.company.name}.`,
        },
      },
      { status: 403 }
    )
  }

  const person =
    (await prisma.person.findUnique({ where: { primaryEmail: email }, select: { id: true, name: true } })) ??
    (await prisma.person.create({
      data: { name: invite.contactName ?? email.split('@')[0], primaryEmail: email },
    }))

  // Already in? Say so and send them on. Somebody clicking the link twice
  // should land in the same place, not be told off.
  const seat = await prisma.context.findFirst({
    where: { personId: person.id, companyId: invite.companyId, revokedAt: null },
    select: { id: true },
  })

  if (seat) {
    return NextResponse.json({
      data: { companyId: invite.companyId, company: invite.company.name, already: true, landing: '/dashboard' },
    })
  }

  // A shell has no roles, because nobody has ever signed in to it. The
  // first person through the door gets the owner's seat and the rest of
  // the roles are created alongside it — a company whose only role is
  // Owner can offer a colleague total control or nothing.
  const existingRoles = await prisma.role.findMany({
    where: { companyId: invite.companyId },
    select: { id: true, name: true },
  })

  const roles = existingRoles.length
    ? existingRoles
    : await Promise.all(
        rolesFor('VENDOR').map((r) =>
          prisma.role.create({
            data: {
              companyId: invite.companyId,
              name: r.name,
              permissions: r.permissions as string[],
              isDefault: r.isOwner ?? false,
            },
            select: { id: true, name: true },
          })
        )
      )

  const ownerName = rolesFor('VENDOR').find((r) => r.isOwner)?.name
  const owner = roles.find((r) => r.name === ownerName) ?? roles[0]

  const domain = companyDomain(email)

  // ── The domain, only if nobody else holds it ────────────────────────
  //
  // Company.domain is globally unique, and the same firm can be listed
  // by two different clients — two shells, one Apex Softech. The first
  // person to claim takes the domain; the second would collide and get
  // a 500 for doing nothing wrong.
  //
  // So the second claim goes through without the domain, and says so.
  // Joining them into one company is a merge, and a merge that happens
  // silently at sign-in is how a firm loses its history.
  const domainHeldBy =
    domain && invite.company.domain == null
      ? await prisma.company.findFirst({
          where: { domain, id: { not: invite.companyId } },
          select: { id: true, name: true },
        })
      : null

  const takeDomain = domain != null && invite.company.domain == null && domainHeldBy == null

  await prisma.$transaction([
    prisma.context.create({
      data: {
        personId: person.id,
        companyId: invite.companyId,
        roleId: owner.id,
        type: 'EMPLOYEE',
        grantReason: `Claimed a supplier invitation from ${invite.byId}`,
      },
    }),
    prisma.company.update({
      where: { id: invite.companyId },
      data: {
        claimedAt: new Date(),
        // Only where the record had none and nobody else holds it. A
        // domain that came from a paste is a guess; one that came from
        // the person who signed in is at least their own address.
        // Verification stays where it is — the OAuth tenant is the
        // authority and this is not it.
        ...(takeDomain ? { domain } : {}),
      },
    }),
    prisma.supplierInvite.update({
      where: { id: invite.id },
      data: { state: 'ACCEPTED', acceptedAt: new Date(), acceptedById: person.id },
    }),
  ])

  return NextResponse.json({
    data: {
      companyId: invite.companyId,
      company: invite.company.name,
      already: false,
      // Said out loud rather than swallowed. Somebody has to decide
      // whether these are one firm, and it is not us at sign-in.
      alsoHere: domainHeldBy
        ? `Another record for ${domainHeldBy.name} is already here on the same ` +
          `domain. This one stays separate until somebody joins them.`
        : null,
      landing: '/dashboard/invitations',
    },
  })
}
