import { NextRequest } from 'next/server'
import { asSampleSeat } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { SAMPLE_WORLD, type EmbedStep } from '@/lib/sample-seat'
import { GET as programGet } from '@/app/api/program/route'
import { GET as requisitionsGet } from '@/app/api/requisitions/route'
import { GET as suppliersGet } from '@/app/api/suppliers/route'
import { GET as submissionsGet } from '@/app/api/submissions/route'
import { GET as timesheetsGet } from '@/app/api/timesheets/route'
import { GET as invoicesGet } from '@/app/api/invoices/route'

/**
 * What each screen of the frame reads, as the sample seat.
 *
 * Through the same GET handlers the dashboard pages call, in-process and
 * inside `asSampleSeat`, so a figure in the frame is the dashboard's
 * figure and never a second derivation of it. On the server, all of a
 * screen's reads at once: the browser gets rows in the first response and
 * makes no request of its own to draw them.
 *
 * A read the route refuses comes back as its sentence, never as an empty
 * list: an empty list says "nothing here", which would be a lie.
 */

export type Read<T> = { ok: true; data: T } | { ok: false; says: string }

type Handler = (request: NextRequest) => Promise<Response>

async function read<T>(handler: Handler, path: string): Promise<Read<T>> {
  try {
    const res = await handler(new NextRequest(new URL(path, 'http://embed.local')))
    const body = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null
    if (res.ok && body?.data !== undefined) return { ok: true, data: body.data }
    return { ok: false, says: body?.error?.message ?? 'This screen could not be read just now.' }
  } catch {
    return { ok: false, says: 'This screen could not be read just now.' }
  }
}

/** Every screen's reads, by step. Each step is one round of parallel reads. */
export async function readStep(step: EmbedStep): Promise<Record<string, Read<any>>> {
  return asSampleSeat(async (): Promise<Record<string, Read<any>>> => {
    switch (step) {
      case 'overview': {
        const program = await read(programGet, '/api/program')
        return { program }
      }
      case 'source': {
        const [requisitions, suppliers] = await Promise.all([
          read(requisitionsGet, '/api/requisitions'),
          read(suppliersGet, '/api/suppliers'),
        ])
        return { requisitions, suppliers }
      }
      case 'submit': {
        // The client's own list faces inward: what suppliers sent it. The
        // dashboard asks with the company it read off /api/me; the frame
        // knows which company the sample is.
        const client = await prisma.company.findUnique({ where: { slug: SAMPLE_WORLD }, select: { id: true } })
        const submissions = client
          ? await read(submissionsGet, `/api/submissions?direction=received&companyId=${client.id}&limit=50`)
          : ({ ok: false, says: 'The sample company is not on this deployment yet.' } as const)
        return { submissions }
      }
      case 'approve': {
        const timesheets = await read(timesheetsGet, '/api/timesheets?status=SUBMITTED')
        return { timesheets }
      }
      case 'pay': {
        const invoices = await read(invoicesGet, '/api/invoices')
        return { invoices }
      }
    }
  })
}
