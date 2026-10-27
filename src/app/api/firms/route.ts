import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { staffOnly } from '@/lib/seat'
import { findFirmByWord } from '@/lib/company-create'
import type { CompanyKind } from '@/lib/company-defaults'

/**
 * GET /api/firms?q=palliser&as=MSP
 *
 * One firm on Etyme, named in a box by somebody at a company: a client
 * granting an MSP a seat, an MSP asking a client for one. By its Etyme
 * address, or by its exact name where exactly one firm of that kind holds
 * it (`findFirmByWord`). Never a list and never a partial match, so this
 * is not a directory of the network: it answers only somebody who already
 * knows the name. It returns what the firm's own public address already
 * says — name, address, kind — and nothing about anybody's people.
 */
const KINDS: Record<string, { kinds: CompanyKind[]; word: string }> = {
  MSP: { kinds: ['MSP'], word: 'MSP' },
  CLIENT: { kinds: ['CLIENT'], word: 'client' },
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Finding a firm')
  if (notStaff) return notStaff

  const url = new URL(request.url)
  const want = KINDS[String(url.searchParams.get('as') ?? '').toUpperCase()]
  if (!want) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say which kind of firm you are looking for: an MSP or a client.' } },
      { status: 422 }
    )
  }
  const answer = await findFirmByWord(String(url.searchParams.get('q') ?? ''), {
    kinds: want.kinds, kindWord: want.word, isDemo: caller.company?.isDemo === true,
  })
  if (!answer.ok) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: answer.says } }, { status: 404 })
  }
  const { id, name, slug, kind, says } = answer.firm
  return NextResponse.json({ data: { firm: { id, name, slug, kind }, says } })
}
