import { NextResponse } from 'next/server'
import type { CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import {
  mayNameAccountManager, NAME_ACCOUNT_MANAGER_REFUSED, accountManagerNotSeated, accountManagerSays,
} from '@/lib/counterparty'

/**
 * The account manager on a client's record (founder, 2026-11-08,
 * "Commission is an object on the sell line and on the buy line"):
 * who sold the deal, so the award's sales commission has a name where the
 * job names no owner at this firm (demand's commission-earners reads it).
 *
 * GET /api/counterparties?accountManagerFor=<clientId>
 *   who is named now, and the colleagues who may be named (live seats at
 *   this firm), with whether the reader may name one.
 * PATCH /api/counterparties { accountManagerFor: <clientId>, personId | null }
 *   names one, or clears it. The Owner, an Admin or an Account Manager.
 *   A person not seated at this firm is refused in a sentence.
 *
 * Only this firm's own register: the client is the other company on a
 * row this firm keeps, and nothing about another firm's register is read.
 */

async function seatedHere(companyId: string, personId: string) {
  return prisma.context.findFirst({
    where: { companyId, personId, revokedAt: null, suspendedAt: null, type: { not: 'CONSULTANT' } },
    select: { person: { select: { id: true, name: true } } },
  })
}

async function readerMayName(roleId: string | null | undefined, permissions: readonly string[]) {
  const role = roleId ? await prisma.role.findUnique({ where: { id: roleId }, select: { name: true } }) : null
  return mayNameAccountManager(permissions, role?.name ?? null)
}

async function clientOnRecord(companyId: string, clientId: string) {
  // A client on this firm's register, or one an agreement makes a client.
  const [row, msa, company] = await Promise.all([
    prisma.counterparty.findFirst({
      where: { companyId, otherCompanyId: clientId, relationship: 'CLIENT' },
      select: {
        id: true, accountManager: { select: { id: true, name: true } },
        accountManagerSetBy: { select: { name: true } }, accountManagerSetAt: true,
      },
    }),
    prisma.masterAgreement.findFirst({ where: { vendorId: companyId, clientId }, select: { id: true } }),
    prisma.company.findUnique({ where: { id: clientId }, select: { id: true, name: true } }),
  ])
  if (!company || (!row && !msa)) return null
  return { company, row }
}

/** The GET: answered by the register route when it is asked `accountManagerFor`. */
export async function readAccountManager(caller: CallerContext, clientId: string) {
  const companyId = caller.company!.id

  const client = clientId ? await clientOnRecord(companyId, clientId) : null
  if (!client) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That firm is not a client on your register.' } }, { status: 404 })
  }
  const mayName = await readerMayName(caller.context?.roleId, caller.permissions)
  const colleagues = mayName
    ? await prisma.context.findMany({
        where: { companyId, revokedAt: null, suspendedAt: null, type: { not: 'CONSULTANT' } },
        select: { person: { select: { id: true, name: true } } },
        orderBy: { person: { name: 'asc' } },
        take: 500,
      })
    : []
  const unique = [...new Map(colleagues.map((c) => [c.person.id, c.person])).values()]
  const named = client.row?.accountManager ?? null
  return NextResponse.json({
    data: {
      client: client.company,
      accountManager: named,
      // Who named them and when, where it was named on a screen; null on a seeded name.
      setBy: client.row?.accountManagerSetBy?.name ?? null,
      setAt: client.row?.accountManagerSetAt?.toISOString() ?? null,
      says: accountManagerSays(named?.name ?? null, client.company.name),
      mayName,
      ...(mayName ? {} : { refusedSays: NAME_ACCOUNT_MANAGER_REFUSED }),
      colleagues: unique,
    },
  })
}

/** The write: answered by the register route's PATCH when it names `accountManagerFor`. */
export async function nameAccountManager(caller: CallerContext, body: { accountManagerFor?: unknown; personId?: unknown }) {
  const companyId = caller.company!.id
  const firm = caller.company!.name

  if (!(await readerMayName(caller.context?.roleId, caller.permissions))) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: NAME_ACCOUNT_MANAGER_REFUSED } }, { status: 403 })
  }
  const clientId = typeof body?.accountManagerFor === 'string' ? body.accountManagerFor : ''
  const personId = body?.personId === null ? null : typeof body?.personId === 'string' ? body.personId : undefined
  if (personId === undefined) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say who the account manager is, or clear it.', field: 'personId' } },
      { status: 422 },
    )
  }
  const client = clientId ? await clientOnRecord(companyId, clientId) : null
  if (!client) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That firm is not a client on your register.' } }, { status: 404 })
  }

  let named: { id: string; name: string } | null = null
  if (personId) {
    const seat = await seatedHere(companyId, personId)
    if (!seat) {
      const who = await prisma.person.findUnique({ where: { id: personId }, select: { name: true } })
      return NextResponse.json(
        { error: { code: 'NOT_SEATED', message: accountManagerNotSeated(who?.name ?? 'That person', firm), field: 'personId' } },
        { status: 422 },
      )
    }
    named = seat.person
  }

  // The register row is written where only an agreement made the client one.
  // Who named the account manager, and when, are kept with every change.
  const setBy = caller.isService ? null : caller.person.id
  const setAt = new Date()
  await prisma.counterparty.upsert({
    where: { companyId_otherCompanyId_relationship: { companyId, otherCompanyId: client.company.id, relationship: 'CLIENT' } },
    create: {
      companyId, otherCompanyId: client.company.id, relationship: 'CLIENT', status: 'ACTIVE',
      createdById: caller.isService ? null : caller.person.id, accountManagerId: named?.id ?? null,
      accountManagerSetById: setBy, accountManagerSetAt: setAt,
    },
    update: { accountManagerId: named?.id ?? null, accountManagerSetById: setBy, accountManagerSetAt: setAt },
  })
  return NextResponse.json({ data: { accountManager: named, says: accountManagerSays(named?.name ?? null, client.company.name) } })
}
