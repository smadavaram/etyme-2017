import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'

/**
 * GET    /api/settings/remit-to      — where customers send money
 * POST   /api/settings/remit-to      — add a set of details
 * PATCH  /api/settings/remit-to      — edit, or make default
 * DELETE /api/settings/remit-to?id=  — remove one
 *
 * Read on every coded invoice and creatable nowhere, so a real company
 * could raise an invoice that did not say where to pay it.
 *
 * Only the last four digits of an account are stored. That is what an
 * invoice prints and what a person uses to recognise their own account;
 * holding the full number would make this table worth stealing, and it
 * buys nothing — the payment itself happens in a bank, not here.
 */

async function guard(request: NextRequest, write: boolean) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { caller: null, error }
  if (!caller.company) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: { code: 'NO_COMPANY', message: 'Payment details belong to a company' } },
        { status: 403 }
      ),
    }
  }
  // Reading needs invoices.read because it appears on invoices. Writing is
  // held tighter: changing where money arrives is the single most valuable
  // edit in the system to an attacker.
  const needed = write ? 'settings.manage' : 'invoices.read'
  if (!hasPermission(caller.permissions, needed)) {
    return {
      caller: null,
      error: NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: write
              ? 'Changing where money arrives needs settings.manage'
              : 'Seeing payment details needs invoices.read',
          },
        },
        { status: 403 }
      ),
    }
  }
  return { caller, error: null }
}

export async function GET(request: NextRequest) {
  const { caller, error } = await guard(request, false)
  if (error) return error

  const rows = await prisma.remitTo.findMany({
    where: { companyId: caller!.company!.id },
    orderBy: [{ isDefault: 'desc' }, { legalName: 'asc' }],
    select: {
      id: true, legalName: true, addressLines: true, country: true, taxId: true,
      paymentMethod: true, bankName: true, accountLast4: true, routingLast4: true,
      isDefault: true,
      _count: { select: { invoices: true } },
    },
  })

  return NextResponse.json({
    data: {
      remitTos: rows.map((r) => ({ ...r, invoiceCount: r._count.invoices, _count: undefined })),
      canEdit: hasPermission(caller!.permissions, 'settings.manage'),
      // An invoice with no remit-to says nothing about where to pay it, and
      // the customer finds out by asking.
      warning: rows.length === 0
        ? 'No payment details. Invoices will not say where to send money.'
        : rows.some((r) => r.isDefault)
          ? null
          : 'None of these is the default, so new invoices will not pick one automatically.',
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await guard(request, true)
  if (error) return error
  const companyId = caller!.company!.id

  const body = await request.json().catch(() => ({}))
  const legalName = String(body.legalName ?? '').trim()
  if (!legalName) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'The legal entity name that goes on the invoice. It is often not your trading name.',
          field: 'legalName',
        },
      },
      { status: 422 }
    )
  }

  const method = String(body.paymentMethod ?? 'ACH').toUpperCase()
  if (!['ACH', 'WIRE', 'CHECK'].includes(method)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Payment method is ACH, WIRE or CHECK', field: 'paymentMethod' } },
      { status: 422 }
    )
  }

  // Refuse anything longer than four digits rather than silently truncating
  // it. Somebody pasting a full account number needs to know this is not
  // where it goes, not have it quietly stored and trimmed.
  for (const field of ['accountLast4', 'routingLast4'] as const) {
    const v = body[field]
    if (v !== undefined && v !== null && v !== '' && !/^\d{1,4}$/.test(String(v))) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'Only the last four digits are stored here. Etyme never holds a full account number — the payment happens in your bank, not in this system.',
            field,
          },
        },
        { status: 422 }
      )
    }
  }

  const makeDefault = Boolean(body.isDefault) || (await prisma.remitTo.count({ where: { companyId } })) === 0

  if (makeDefault) {
    await prisma.remitTo.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } })
  }

  const remitTo = await prisma.remitTo.create({
    data: {
      companyId,
      legalName,
      addressLines: Array.isArray(body.addressLines) ? body.addressLines.map(String) : [],
      country: String(body.country ?? 'US').toUpperCase().slice(0, 2),
      taxId: body.taxId ? String(body.taxId).trim() : null,
      paymentMethod: method,
      bankName: body.bankName ? String(body.bankName).trim() : null,
      accountLast4: body.accountLast4 ? String(body.accountLast4) : null,
      routingLast4: body.routingLast4 ? String(body.routingLast4) : null,
      isDefault: makeDefault,
    },
  })

  // Changing where money arrives is worth a trail even when it is the
  // first one.
  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'REMIT_TO_ADDED',
      summary: `${caller!.person.name} added payment details for ${legalName}${makeDefault ? ' and made them the default' : ''}`,
      reason: 'Added in settings',
      payload: { remitToId: remitTo.id, legalName, method, isDefault: makeDefault },
      reversible: true,
    },
  })

  return NextResponse.json({ data: { remitTo, message: `${legalName} saved.` } }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const { caller, error } = await guard(request, true)
  if (error) return error
  const companyId = caller!.company!.id

  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? '')
  const existing = await prisma.remitTo.findFirst({ where: { id, companyId } })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such payment details here' } },
      { status: 404 }
    )
  }

  if (body.isDefault === true) {
    await prisma.remitTo.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } })
  }

  const remitTo = await prisma.remitTo.update({
    where: { id },
    data: {
      ...(typeof body.legalName === 'string' && body.legalName.trim() ? { legalName: body.legalName.trim() } : {}),
      ...(Array.isArray(body.addressLines) ? { addressLines: body.addressLines.map(String) } : {}),
      ...(typeof body.country === 'string' ? { country: body.country.toUpperCase().slice(0, 2) } : {}),
      ...('taxId' in body ? { taxId: body.taxId ? String(body.taxId).trim() : null } : {}),
      ...('bankName' in body ? { bankName: body.bankName ? String(body.bankName).trim() : null } : {}),
      ...('isDefault' in body ? { isDefault: Boolean(body.isDefault) } : {}),
    },
  })

  await prisma.automationLog.create({
    data: {
      companyId,
      action: 'REMIT_TO_CHANGED',
      summary: `${caller!.person.name} changed payment details for ${remitTo.legalName}`,
      reason: 'Edited in settings',
      payload: { remitToId: id },
      reversible: true,
    },
  })

  return NextResponse.json({ data: { remitTo, message: 'Saved.' } })
}

export async function DELETE(request: NextRequest) {
  const { caller, error } = await guard(request, true)
  if (error) return error

  const id = request.nextUrl.searchParams.get('id') ?? ''
  const existing = await prisma.remitTo.findFirst({
    where: { id, companyId: caller!.company!.id },
    select: { id: true, legalName: true, isDefault: true, _count: { select: { invoices: true } } },
  })
  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such payment details here' } },
      { status: 404 }
    )
  }

  // An invoice that already went out told somebody to pay these details.
  // Deleting them makes the sent invoice unexplainable.
  if (existing._count.invoices > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'IN_USE',
          message: `${existing.legalName} is on ${existing._count.invoices} invoice(s) already sent. Removing it would leave those invoices pointing at nothing.`,
        },
      },
      { status: 409 }
    )
  }

  await prisma.remitTo.delete({ where: { id } })

  return NextResponse.json({
    data: {
      removed: existing.legalName,
      warning: existing.isDefault ? 'That was your default. New invoices will not pick one until you set another.' : null,
    },
  })
}
