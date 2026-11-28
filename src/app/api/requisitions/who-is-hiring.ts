import { NextResponse } from 'next/server'
import type { getCallerContext } from '@/lib/api-context'
import { isConsultantSeat } from '@/lib/seat'
import { seatedDesk } from '@/lib/resolve-client-company'

/**
 * Whose job requests these are. Moved out of the route on 2026-10-28 so
 * the job form's site read (`./sites`) answers "which company's sites"
 * from the same four answers the raise does: a seat in a client's program
 * reads that client's sites, everybody else their own firm's.
 */

/**
 * The company these roles belong to, and the caller as they act there.
 *
 * Four answers and no fifth: a client is hiring for itself; a firm in a
 * seat is hiring for the client that granted it; a prime, a GSI, a sub
 * or a bench vendor is hiring for its own firm; and a program office
 * with no seat, or somebody with no company at all, is buying nobody and
 * is told so rather than shown an empty list.
 */
export async function whoIsHiring(
  caller: NonNullable<Awaited<ReturnType<typeof getCallerContext>>['caller']>,
  named: string | null
): Promise<
  | { client: { id: string; name: string }; seat: any; acting: typeof caller; error: null }
  | { client: null; seat: null; acting: null; error: NextResponse }
> {
  if (!caller.company) {
    return {
      client: null, seat: null, acting: null,
      error: NextResponse.json(
        {
          error: {
            code: 'NOT_HIRING',
            message:
              'A job belongs to the company that is hiring. You are signed in as a person ' +
              'rather than at a firm, so there is no company to open one for.',
          },
        },
        { status: 403 }
      ),
    }
  }

  // A seat on a bench is a seat to file hours and answer for yourself,
  // never to read the firm's demand. A consultant holds a context at the
  // agency that benches them, so "the caller's company" is that agency —
  // which would have handed them its whole pipeline of open roles.
  if (isConsultantSeat(caller)) {
    return {
      client: null, seat: null, acting: null,
      error: NextResponse.json(
        {
          error: {
            code: 'NOT_HIRING',
            message:
              'Jobs a firm is hiring for are the firm\'s own. Yours are on your page — ' +
              'what you have been put forward for, and where each one stands.',
          },
        },
        { status: 403 }
      ),
    }
  }

  const desk = await seatedDesk(caller, named)

  // Naming somebody else's company is refused out loud rather than
  // quietly answered with your own roles, which would leave a reader
  // staring at a list that is not the one they asked for. A seat is the
  // only thing that makes another company's id legitimate here, and a
  // revoked seat is not a seat: `seatedDesk` comes back with the
  // caller's own firm, and the id they asked about is no longer theirs
  // to ask about.
  if (named && desk?.companyId !== named) {
    return {
      client: null, seat: null, acting: null,
      error: NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message:
              caller.company.kind === 'CLIENT'
                ? "You may only read your own company's jobs."
                : `Those jobs belong to the company that opened them. ${caller.company.name} reads ` +
                  'its own, and a client\'s from a seat that client granted it — ask an owner or the ' +
                  'program manager there for one.',
          },
        },
        { status: 403 }
      ),
    }
  }

  // A program office places nobody, so it has no roles of its own: the
  // ones it works on are a client's, and the seat is what reaches them.
  const office = !desk?.seat && caller.company.kind === 'MSP'
  if (!desk || office) {
    return {
      client: null, seat: null, acting: null,
      error: NextResponse.json(
        {
          error: {
            code: 'NOT_HIRING',
            message:
              `${caller.company.name} is not tied to a client yet. An MSP places ` +
              `nobody, so the jobs it opens are a client's — and it opens them from a seat ` +
              `the client granted it. Ask an owner or the program manager at that client to ` +
              `grant ${caller.company.name} a seat in their program.`,
          },
        },
        { status: 403 }
      ),
    }
  }

  return {
    client: { id: desk.companyId, name: desk.companyName },
    seat: desk.seat,
    acting: desk.acting,
    error: null,
  }
}
