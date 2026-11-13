import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { recordRefusal } from '@/lib/access-log'
import { rolesFor, type CompanyKind } from '@/lib/company-defaults'
import { defaultPostureFor } from '@/lib/walls'
import { maySetRecordedKind } from '@/lib/counterparty'

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
      reason: `Refused setting the kind of ${other?.name ?? params.id} from ${me.name}'s list: ${says}`,
    })
    return NextResponse.json({ error: { code, message: says, ...(field ? { field } : {}) } }, { status })
  }

  if (!other || other.isDemo !== (me.isDemo === true)) return refuse(404, 'NOT_FOUND', 'That company is not on your Companies list.')

  const verdict = maySetRecordedKind({
    to: body?.kind,
    me: { id: me.id, name: me.name },
    permissions: caller.permissions,
    other: { id: other.id, name: other.name, kind: other.kind, claimedAt: other.claimedAt, listedById: other.listedById, seats: other._count.contexts },
  })
  if (!verdict.ok) return refuse(verdict.status, verdict.code, verdict.says, verdict.field)

  if (!verdict.already) {
    const to = verdict.to as CompanyKind
    await prisma.$transaction(async (tx) => {
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
          summary: `${caller.person.name} set what kind of company ${other.name} is. ${verdict.says}`,
          reason: verdict.says,
          payload: { otherCompanyId: other.id, from: other.kind, to: verdict.to, byName: caller.person.name, personId: caller.person.id, position: null },
          reversible: true,
        },
      })
    })
  }
  return NextResponse.json({ data: { companyId: other.id, kind: verdict.to, changed: !verdict.already, message: verdict.says } })
}
