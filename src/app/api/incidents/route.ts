import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'

/**
 * POST /api/incidents   { message, stack?, path? }
 *
 * A browser telling us a screen fell over. Called by the error boundary
 * in app/error.tsx, which is the only thing a person sees when a page
 * throws; without this the page said "Something went wrong" and nobody
 * else ever learned that it had.
 *
 * Public, because the person whose screen broke may well be the one
 * whose session broke. So the body is bounded, nothing in it is
 * executed or rendered, and staff mail is held to one an hour per page
 * by reportError. Anything more elaborate is spam handling for a form
 * that a person's browser fills in, not a person.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const message = typeof body.message === 'string' ? body.message.slice(0, 500) : ''
  if (!message) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'A message is required.' } }, { status: 422 })
  }
  const path = typeof body.path === 'string' ? body.path.slice(0, 300) : null
  const stack = typeof body.stack === 'string' ? body.stack.slice(0, 4000) : null

  const err = new Error(message)
  if (stack) err.stack = stack
  await reportError(`browser ${path ?? '(unknown page)'}`, err, { side: 'BROWSER', path })

  return NextResponse.json({ data: { says: 'Recorded. Somebody will look.' } }, { status: 201 })
}
