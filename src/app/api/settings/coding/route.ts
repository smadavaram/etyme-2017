import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readCaller, refuseUnlessPayerManager, logCodeChange } from './guard'
import { COMPANY_CODE_HELP } from '@/lib/counterparty'

/**
 * GET   /api/settings/coding  — the company code the client's books use
 * PATCH /api/settings/coding  — set it, or clear it with an empty box
 *
 * The code goes on every line of the invoice-lines file. Only the paying
 * company reads or writes it.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await readCaller(request)
  if (error) return error
  const refused = await refuseUnlessPayerManager(caller, 'Reading the company code')
  if (refused) return refused
  const row = await prisma.companyCoding.findUnique({ where: { companyId: caller.company!.id }, select: { companyCode: true } })
  return NextResponse.json({ data: { companyCode: row?.companyCode ?? null, says: COMPANY_CODE_HELP } })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await readCaller(request)
  if (error) return error
  const refused = await refuseUnlessPayerManager(caller, 'Changing the company code')
  if (refused) return refused

  const body = await request.json().catch(() => ({}))
  if (typeof body?.companyCode !== 'string' && body?.companyCode !== null) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Type the company code, or leave the box empty.', field: 'companyCode' } }, { status: 422 })
  }
  const code = typeof body.companyCode === 'string' ? body.companyCode.trim() : ''
  if (code.length > 20) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'A company code is at most 20 characters.', field: 'companyCode' } }, { status: 422 })
  }
  const companyId = caller.company!.id
  const value = code || null
  const row = await prisma.companyCoding.upsert({
    where: { companyId },
    create: { companyId, companyCode: value },
    update: { companyCode: value },
    select: { companyCode: true },
  })
  await logCodeChange(caller, 'COMPANY_CODE_CHANGED', value ? 'the company code' : 'the company code (cleared)')
  return NextResponse.json({ data: { companyCode: row.companyCode, says: COMPANY_CODE_HELP } })
}
