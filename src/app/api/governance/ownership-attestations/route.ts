import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext, realPersonId } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { emit } from '@/lib/events'
import { pluginGate } from '@/lib/plugin-gate'
import { checkAttestationInput, currentAttestations, OWNERSHIP_FACTS, OWNERSHIP_WORDS, type OwnershipFact } from '@/lib/attestation/certification-held'
import { DIVERSITY_EVENTS, asEvent, mayRecordDiversity, refuseDiversity } from '@/lib/attestation/certification-door'

/**
 * GET  /api/governance/ownership-attestations   what the Owner has attested, newest answer per fact
 * POST /api/governance/ownership-attestations   the Owner attests a fact, or withdraws it (record 132)
 *
 * An ownership fact (minority-owned and the like) is the Owner's own
 * statement, with who and when. Append-only: a withdrawal is a new row
 * saying no. No agent ever writes one; the twin and agents are refused.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  if (!caller.company) return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Ownership facts belong to a company. Open them from a company seat.' } }, { status: 403 })
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const rows = await prisma.ownershipAttestation.findMany({ where: { companyId: caller.company.id }, orderBy: { attestedAt: 'asc' }, include: { attestedBy: { select: { name: true } } } })
  const may = await mayRecordDiversity(caller as never, 'attest an ownership fact')
  const now = currentAttestations(rows)
  return NextResponse.json({
    mayWrite: may.ok,
    data: OWNERSHIP_FACTS.map((fact) => {
      const r = now.find((x) => x.fact === fact)
      return { fact, words: OWNERSHIP_WORDS[fact], attested: r?.attested ?? false, by: r?.attestedBy.name ?? null, at: r?.attestedAt.toISOString() ?? null, note: r?.note ?? null }
    }),
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const may = await mayRecordDiversity(caller as never, 'attest an ownership fact')
  if (!may.ok) return refuseDiversity(caller as never, may)
  const off = await pluginGate(caller, 'PUBLIC_SECTOR')
  if (off) return off
  const by = realPersonId(caller)
  if (!by) return NextResponse.json({ error: { code: 'PERSON_REQUIRED', message: 'An integration cannot attest. An Owner has to.' } }, { status: 403 })
  const checked = checkAttestationInput(await request.json().catch(() => null))
  if (!checked.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: checked.says } }, { status: 422 })
  const companyId = caller.company!.id
  const { fact, attested, note } = checked.value
  const row = await prisma.ownershipAttestation.create({ data: { companyId, fact, attested, attestedById: by, note }, select: { id: true, attestedAt: true } })
  await emit({ type: asEvent(DIVERSITY_EVENTS.ownershipAttested), companyId, subjectType: 'OwnershipAttestation', subjectId: row.id, actorPersonId: by, payload: { fact, attested } })
  return NextResponse.json({ data: { id: row.id, fact: fact as OwnershipFact, words: OWNERSHIP_WORDS[fact], attested, at: row.attestedAt.toISOString() } }, { status: 201 })
}
