import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { readSupplierList, listSentence } from '@/lib/supplier-list'

/**
 * POST /api/suppliers/read
 *
 * Read a pasted vendor list and hand it straight back. Writes nothing.
 *
 * A separate step on purpose. A procurement manager pasting a list wants
 * to see what we made of it and fix the two rows we got wrong before
 * anything is created — creating twelve companies and then asking them
 * to check would be the wrong way round, and the wrong ones are hard to
 * take back out.
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Suppliers')
  if (notStaff) return notStaff

  const body = await request.json().catch(() => ({}))
  const read = readSupplierList(String(body?.text ?? ''))

  return NextResponse.json({
    data: { ...read, summary: listSentence(read) },
  })
}
