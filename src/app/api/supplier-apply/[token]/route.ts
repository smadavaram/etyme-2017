import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { desksFor, deskPeople } from '@/lib/supplier-desks'
import { provideItems, vendorItems, type ChecklistItem } from '@/lib/supplier-onboarding'

/**
 * GET  /api/supplier-apply/[token]  — what the client asks for, and what is already in
 * POST /api/supplier-apply/[token]  — the firm supplies its side
 *
 * No sign-in. The link is the firm's, sent to the contact the client
 * named; it stops working once the client has decided. Files are
 * recorded by name and size against the item they answer — the firm's
 * side goes to PROVIDED, and only Procurement's own verifying makes it
 * HELD. In time this page is the supplier's door into the client
 * portal; today it is one page that asks for exactly what the trade
 * asks for.
 */
async function find(token: string) {
  return prisma.supplierRequest.findUnique({
    where: { token },
    include: { company: { select: { name: true } } },
  })
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await find(token)
  if (!row) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That link is not one we sent, or it has expired.' } }, { status: 404 })
  const checklist = row.checklist as unknown as ChecklistItem[]
  const app = (row.application ?? null) as Record<string, unknown> | null
  return NextResponse.json({
    data: {
      client: row.company.name,
      firm: row.name,
      contactName: row.contactName,
      decided: row.state === 'APPROVED' || row.state === 'DECLINED',
      state: row.state,
      asks: vendorItems(checklist).map((i) => ({ key: i.key, label: i.label, required: i.required, state: i.state, fileName: i.fileName ?? null })),
      application: app,
    },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await find(token)
  if (!row) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That link is not one we sent, or it has expired.' } }, { status: 404 })
  if (row.state === 'APPROVED' || row.state === 'DECLINED') {
    return NextResponse.json({ error: { code: 'DECIDED', message: `${row.company.name} has already decided on ${row.name}; this link has done its job.` } }, { status: 409 })
  }
  const body = await request.json().catch(() => ({}))
  const now = new Date()
  const str = (k: string) => (typeof body?.[k] === 'string' ? body[k].trim() : '')
  const references = Array.isArray(body?.references)
    ? body.references.map((r: any) => ({ name: String(r?.name ?? '').trim(), company: String(r?.company ?? '').trim(), email: String(r?.email ?? '').trim(), phone: String(r?.phone ?? '').trim() })).filter((r: any) => r.name || r.company)
    : []
  const docs: { key: string; fileName: string; size: number }[] = Array.isArray(body?.docs)
    ? body.docs.filter((d: any) => typeof d?.key === 'string' && typeof d?.fileName === 'string').map((d: any) => ({ key: d.key, fileName: d.fileName, size: Number(d.size ?? 0) }))
    : []
  const bank = body?.bank && typeof body.bank === 'object'
    ? { bankName: String(body.bank.bankName ?? '').trim(), accountName: String(body.bank.accountName ?? '').trim(), last4: String(body.bank.last4 ?? '').replace(/\D/g, '').slice(-4) }
    : null
  const skills: string[] = typeof body?.skills === 'string' ? body.skills.split(/[,;]/).map((x: string) => x.trim()).filter(Boolean) : Array.isArray(body?.skills) ? body.skills : []

  const provided: { key: string; fileName?: string | null }[] = docs.map((d) => ({ key: d.key, fileName: d.fileName }))
  if (bank?.bankName && bank.accountName && bank.last4.length === 4) provided.push({ key: 'BANK', fileName: `${bank.bankName} ····${bank.last4}` })
  if (str('experience')) provided.push({ key: 'EXPERIENCE', fileName: null })
  if (references.length >= 2) provided.push({ key: 'REFERENCES', fileName: `${references.length} references` })

  const prior = (row.application ?? {}) as Record<string, unknown>
  const application = {
    ...prior,
    legalName: str('legalName') || prior.legalName || null,
    address: str('address') || prior.address || null,
    duns: str('duns') || prior.duns || null,
    website: str('website') || prior.website || null,
    experience: str('experience') || prior.experience || null,
    references: references.length ? references : (prior.references ?? []),
    bank: bank?.last4 ? bank : (prior.bank ?? null),
    skills: skills.length ? skills : (prior.skills ?? []),
    docs: [...((prior.docs as any[]) ?? []).filter((d) => !docs.some((n) => n.key === d.key)), ...docs.map((d) => ({ ...d, at: now.toISOString() }))],
    submittedAt: now.toISOString(),
  }
  const checklist = provideItems(row.checklist as unknown as ChecklistItem[], provided, now)
  await prisma.supplierRequest.update({
    where: { id: row.id },
    data: { application: application as unknown as object, checklist: checklist as unknown as object, state: 'IN_REVIEW', skills: skills.length ? skills : row.skills },
  })

  // Whichever desk it is on hears that the firm's side is in; before
  // the lead has decided, Procurement, whose desk comes first with paper.
  const desks = await desksFor(row.companyId, row.recommendedById)
  const stage = (['PROCUREMENT', 'HR', 'FINANCE'] as const).find((s) => s === row.stage) ?? 'PROCUREMENT'
  for (const personId of await deskPeople(row.companyId, stage, desks)) {
    void notify({
      personId, companyId: row.companyId, type: 'SYSTEM', entityId: row.id,
      title: `${row.name} sent its paperwork`,
      body: `${provided.length} of ${vendorItems(checklist).length} items are in from ${row.name}. Verify them when it reaches your desk.`,
      data: { href: '/dashboard/suppliers' },
    })
  }

  const still = vendorItems(checklist).filter((i) => i.required && i.state === 'MISSING').map((i) => i.label)
  return NextResponse.json({
    data: {
      asks: vendorItems(checklist).map((i) => ({ key: i.key, label: i.label, required: i.required, state: i.state, fileName: i.fileName ?? null })),
      says: still.length
        ? `Received, thank you. ${row.company.name} still needs: ${still.join('; ')}. Come back to this link when you have them.`
        : `Received, thank you. ${row.company.name}’s Procurement team has everything it asked you for; they will verify it and you will hear from them.`,
    },
  }, { status: 201 })
}
