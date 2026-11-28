import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCallerContext } from '@/lib/api-context'
import { hasPermission } from '@/lib/permissions'
import { mayWriteWant } from '@/lib/bench-filter'

/**
 * PATCH /api/bench/wants/:id  { close: true }
 *
 * The firm stops asking. The row is kept with the day it closed, never
 * deleted, so an offer a partner made against it still says what it
 * answered. Only the firm that wrote the ask may close it, from a desk
 * that runs the bench.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const { id } = await params

  const may = mayWriteWant({ companyKind: caller.company?.kind ?? null, writesPeople: hasPermission(caller.permissions, 'consultants.write') })
  if (!may.ok) return NextResponse.json({ error: { code: 'FORBIDDEN', message: may.says } }, { status: 403 })

  const body = (await request.json().catch(() => null)) as { close?: unknown } | null
  if (body?.close !== true) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Say close: true to stop asking. An ask is not edited; close it and write a new one.' } }, { status: 422 })
  }

  const want = await prisma.benchWant.findUnique({ where: { id }, select: { companyId: true, closedAt: true } })
  // Another firm's ask, or none, reads the same: nothing here to close.
  if (!want || want.companyId !== caller.company?.id) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Your firm has no such ask.' } }, { status: 404 })
  }
  if (want.closedAt) {
    return NextResponse.json({ data: { message: 'Already closed. Partners no longer read it.' } })
  }
  await prisma.benchWant.update({ where: { id }, data: { closedAt: new Date() } })
  return NextResponse.json({ data: { message: 'Closed. Partners no longer read it.' } })
}
