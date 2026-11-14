import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { recordRefusal } from '@/lib/access-log'
import { rolesFor, type CompanyKind } from '@/lib/company-defaults'
import { defaultPostureFor } from '@/lib/walls'
import { maySetRecordedKind } from '@/lib/counterparty'
import { dealsWith, NOT_ON_YOUR_LIST } from '../../dealing'
import { standingWith } from '../../positions'

/**
 * PATCH /api/companies/:id/kind — { kind: 'VENDOR' | 'CLIENT' | 'MSP' | 'GSI' }
 *
 * Say what kind of company a firm on your own list is (founder,
 * 2026-11-12). Only a company the caller recorded itself, that nobody has
 * claimed and nobody is seated at; a firm on Etyme says its own Kind
 * through its Owner (`/api/settings/kind`). Setting the Kind never gives a
 * position, and a position never sets the Kind. The company gets the
 * roles that kind starts with, so the day somebody there takes the page
 * the claim has an Owner to seat. Recorded with who and when; nothing is
 * emailed.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Companies')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'You are not signed in at a company.' } }, { status: 403 })
  }
  const me = caller.company
  const body = await request.json().catch(() => ({}))
  const other = await prisma.company.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, kind: true, claimedAt: true, listedById: true, isDemo: true, _count: { select: { contexts: true } } },
  })

  const refuse = async (status: number, code: string, says: string, field?: string) => {
    await recordRefusal([{ companyId: other?.id ?? me.id }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: me.id,
      action: 'CONTRACT_VIEW',
      reason: `Refused setting the kind of ${other?.id ?? params.id} from ${me.name}'s list: ${says}`,
    })
    return NextResponse.json({ error: { code, message: says, ...(field ? { field } : {}) } }, { status })
  }

  // A company the caller neither recorded, nor holds on its register, nor
  // works with is answered exactly as an id that does not exist (review,
  // 2026-11-13): never its name, and never that it is on Etyme.
  if (!other || other.isDemo !== (me.isDemo === true) || !(await dealsWith(me.id, other))) return refuse(404, 'NOT_FOUND', NOT_ON_YOUR_LIST)

  // The sentence says "still not classified" only where it is (walk, 2026-11-14).
  const held = await standingWith(me.id, other)
  const verdict = maySetRecordedKind({
    to: body?.kind,
    me: { id: me.id, name: me.name },
    permissions: caller.permissions,
    other: { id: other.id, name: other.name, kind: other.kind, claimedAt: other.claimedAt, listedById: other.listedById, seats: other._count.contexts },
    positions: held?.positions ?? [],
  })
  if (!verdict.ok) return refuse(verdict.status, verdict.code, verdict.says, verdict.field)

  let message = verdict.says
  if (!verdict.already) {
    const to = verdict.to as CompanyKind
    await prisma.$transaction(async (tx) => {
      // An invitation already out was sent under the old kind, and the kind
      // is what the claim seats somebody into (`mayClaimRecorded`). So it is
      // withdrawn in the same change and the reply says so: nobody becomes
      // the Owner of a company whose kind they were never told (review,
      // 2026-11-13).
      const open = await tx.supplierInvite.findMany({ where: { companyId: other.id, state: 'PENDING' }, select: { id: true, email: true } })
      if (open.length > 0) {
        await tx.supplierInvite.updateMany({ where: { id: { in: open.map((i) => i.id) } }, data: { state: 'REVOKED' } })
        const who = open.map((i) => i.email).join(', ')
        message += ` The open invitation to ${who} was withdrawn, so nobody takes it under the old kind. Invite them again to send the new one.`
      }
      await tx.company.update({ where: { id: other.id }, data: { kind: to, outsideAccess: defaultPostureFor(to) } })
      // Nobody is seated there (the rule said so), so its roles are the
      // new kind's from scratch: never an older kind's set left behind.
      await tx.role.deleteMany({ where: { companyId: other.id, contexts: { none: {} } } })
      await tx.role.createMany({
        data: rolesFor(to).map((r) => ({ companyId: other.id, name: r.name, permissions: [...r.permissions], isDefault: true })),
        skipDuplicates: true,
      })
      await tx.automationLog.create({
        data: {
          companyId: me.id,
          action: 'COMPANY_KIND_SET',
          summary: `${caller.person.name} set what kind of company ${other.name} is. ${message}`,
          reason: message,
          payload: {
            otherCompanyId: other.id, from: other.kind, to: verdict.to, byName: caller.person.name, personId: caller.person.id, position: null,
            invitationsWithdrawn: open.map((i) => i.id),
          },
          reversible: true,
        },
      })
    })
  }
  return NextResponse.json({ data: { companyId: other.id, kind: verdict.to, changed: !verdict.already, message } })
}
