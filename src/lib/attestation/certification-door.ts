/**
 * The door to the Owner's two supplier-diversity acts (record 132, plugin 5):
 * record a certification, attest an ownership fact. Both are the Owner's, at a
 * company with a verified Owner. Never a twin or an agent, never an Admin.
 * The sweep that flips a lapsed certification by date lives here too.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { accessActor, recordRefusal } from '@/lib/access-log'
import { emit, type EventType } from '@/lib/events'
import { waitsForVerifiedOwner, PROVE_OWNERSHIP_HREF, PROVE_OWNERSHIP_PLACE } from '@/lib/owner-gate'
import { dueToLapse, kindName } from './certification-held'

// The three ledger names. They are written to the event ledger as strings;
// `EVENT_TYPES` in lib/events is the architect's and does not list them yet.
export const DIVERSITY_EVENTS = {
  certificationSet: 'diversity.certification_set',
  certificationLapsed: 'diversity.certification_lapsed',
  ownershipAttested: 'diversity.ownership_attested',
} as const
export const asEvent = (t: string) => t as EventType

type DoorCaller = {
  twin?: boolean
  agent?: boolean
  actorKind?: string | null
  person: { id: string }
  company: { id: string; name: string } | null
  context: { id?: string; roleId: string | null }
  readOnly?: boolean
}

export type MayRecord = { ok: true } | { ok: false; code: 'AGENT' | 'NOT_OWNER' | 'OWNER_NOT_VERIFIED' | 'NO_COMPANY'; says: string; href?: string }

/** Pure-ish: the sentence for who may not. Owner only; a verified Owner's company only. */
export async function mayRecordDiversity(caller: DoorCaller, doing: string): Promise<MayRecord> {
  if (caller.twin || caller.agent || caller.actorKind === 'TWIN' || caller.actorKind === 'AGENT') {
    return { ok: false, code: 'AGENT', says: `Ask Etyme and the agents never ${doing}. The Owner does, and only a person asserts what the firm is or holds.` }
  }
  if (!caller.company) return { ok: false, code: 'NO_COMPANY', says: 'Certifications belong to a company. Open them from a company seat.' }
  const role = caller.context.roleId
    ? await prisma.role.findFirst({ where: { id: caller.context.roleId, companyId: caller.company.id }, select: { name: true } })
    : null
  if (role?.name !== 'Owner') {
    return { ok: false, code: 'NOT_OWNER', says: `Only an Owner of ${caller.company.name} may ${doing}. An Admin may read them.` }
  }
  const c = await prisma.company.findUnique({ where: { id: caller.company.id }, select: { ownerProofRequiredAt: true, ownerVerifiedAt: true } })
  if (c && waitsForVerifiedOwner(c)) {
    return { ok: false, code: 'OWNER_NOT_VERIFIED', says: `To ${doing}, ${caller.company.name} first needs a verified Owner. Prove ownership under ${PROVE_OWNERSHIP_PLACE}.`, href: PROVE_OWNERSHIP_HREF }
  }
  return { ok: true }
}

/** The refusal, written to the access log and waited for before it is sent. */
export async function refuseDiversity(caller: DoorCaller, may: Extract<MayRecord, { ok: false }>): Promise<NextResponse> {
  if (caller.company) {
    await recordRefusal([{ companyId: caller.company.id }], {
      ...accessActor({ person: caller.person, company: caller.company, context: caller.context.id ? { id: caller.context.id } : null, readOnly: caller.readOnly }),
      action: 'DIVERSITY_REFUSED',
      reason: `Refused a supplier-diversity record (${may.code}).`,
    })
  }
  return NextResponse.json({ error: { code: may.code === 'OWNER_NOT_VERIFIED' ? 'OWNER_NOT_VERIFIED' : 'FORBIDDEN', message: may.says, ...(may.href ? { href: may.href } : {}) } }, { status: 403 })
}

/**
 * The day-by-day sweep: every certification set HELD whose expiry day is
 * past becomes LAPSED, with an automation row and a ledger event. The
 * reader (`certificationHeldOn`) already refuses a past expiry on its own,
 * so a missed sweep never makes a lapsed paper count; the sweep makes the
 * lapse visible and recorded.
 */
export async function lapseByDate(companyId: string | null, today: Date = new Date()): Promise<number> {
  const held = await prisma.supplierCertification.findMany({
    where: { status: 'HELD', expiresOn: { not: null }, ...(companyId ? { companyId } : {}) },
    select: { id: true, companyId: true, kind: true, otherName: true, status: true, expiresOn: true },
  })
  const due = dueToLapse(held, today)
  for (const c of due) {
    const flipped = await prisma.supplierCertification.updateMany({ where: { id: c.id, status: 'HELD' }, data: { status: 'LAPSED' } })
    if (flipped.count === 0) continue
    const name = kindName(c.kind, c.otherName)
    await prisma.automationLog.create({
      data: {
        companyId: c.companyId,
        action: 'CERTIFICATION_LAPSED',
        summary: `${name} certification marked lapsed: it expired on ${c.expiresOn!.toISOString().slice(0, 10)}.`,
        reason: 'A certification counts as held only while its expiry day is not past, so the expiry day passing flips it to lapsed.',
        payload: { certificationId: c.id },
        reversible: false,
      },
    })
    await emit({ type: asEvent(DIVERSITY_EVENTS.certificationLapsed), companyId: c.companyId, subjectType: 'SupplierCertification', subjectId: c.id, actorKind: 'AUTOMATION', payload: { kind: c.kind, otherName: c.otherName, expiredOn: c.expiresOn!.toISOString().slice(0, 10) } })
  }
  return due.length
}
