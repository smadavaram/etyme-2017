import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { seedChain, type Seat } from '@/lib/demo-chain'
import { seedDemoCompany, DEMO_DAYS } from '@/lib/demo-seed'
import { seedDemoClientCompany } from '@/lib/demo-seed-client'
import { seedDemoConsultant } from '@/lib/demo-seed-consultant'
import { DEMO_COOKIE, COOKIE_DAYS, sign, read, addressFor } from '@/lib/demo-session'

/**
 * POST /api/demo — give this visitor their own seeded workspace
 * GET  /api/demo — is this visitor already in one?
 *
 * Every visitor gets their own company, seeded and isolated. Two people
 * looking around at once never see each other's data, and either can
 * break their own copy freely — which is the only way a demo is worth
 * anything, because the first thing anybody does is click the red button.
 *
 * No sign-up. A prospect who has to create an account before seeing
 * anything looks at the form and leaves, and we never learn whether the
 * product was any good.
 */

/**
 * Which chair the visitor sits in.
 *
 * Not a toggle inside one workspace. A client and a vendor see different
 * companies, different navigation and different data, and a demo that
 * pretended one account could be both would be demonstrating a product
 * we do not sell.
 */
/**
 * Which door somebody came through.
 *
 * HIRING and BENCH are kept because the home page has linked to them
 * since it existed, and a demo link that stops working is worse than a
 * coarse one. They now mean "the client's chair" and "the bench
 * vendor's chair" — the two ends of the chain.
 *
 * The five seats are the real answer. The schema knows five kinds of
 * company and the demo offered three doors, so an MSP and a GSI had no
 * way in at all and a prime and a bench vendor got the same world
 * despite sitting on opposite sides of the same trade.
 */
export type Side = 'HIRING' | 'BENCH' | 'CANDIDATE' | Seat

/** Names that read like a staffing firm without naming a real one. */
const NAMES = [
  'Halloway Talent', 'Brightmoor Staffing', 'Kestrel Consulting',
  'Alderway Partners', 'Marchfield Group', 'Two Rivers Talent',
  'Pinehurst Staffing', 'Norwood Consulting',
]

/** And names that read like a company that buys contract staff. */
const BUYERS = [
  'Northfield Instruments', 'Calder Manufacturing', 'Harlow Health',
  'Ravensmere Energy', 'Stanmore Logistics', 'Ashcombe Financial',
]

export async function POST(request: NextRequest) {
  // Already in one? Send them back to it rather than making another. A
  // visitor who refreshes should not accumulate workspaces.
  const existing = read(request.cookies.get(DEMO_COOKIE)?.value)
  if (existing) {
    const person = await prisma.person.findUnique({
      where: { primaryEmail: existing },
      select: { contexts: { where: { revokedAt: null }, select: { company: { select: { id: true, name: true, isDemo: true } } } } },
    })
    const company = person?.contexts[0]?.company
    if (company?.isDemo) {
      return NextResponse.json({
        data: { companyId: company.id, companyName: company.name, resumed: true },
      })
    }
  }

  // ── The seeded world ────────────────────────────────────────────
  //
  // `{ as: "world-cloudepa" }` takes a seat in the twenty-firm market
  // scripts/seed-world.mjs builds, rather than minting another private
  // five-company copy. That is what makes signing in as CloudEPA and
  // signing in as Harlow Health two views of the same placement instead
  // of two unrelated worlds with the same placeholder names.
  //
  // Three things it will not do. It creates nothing — the seat must
  // already exist. It only ever names a `world-` company, so a signed
  // cookie cannot be talked into a real one. And those companies are
  // `isDemo: false`, so the reset button below leaves them alone: this
  // world is reference data many people look at, not one visitor's
  // sandbox to break.
  const body = await request.json().catch(() => ({}))
  const asWorld = typeof (body as any)?.as === 'string' ? String((body as any).as) : null
  if (asWorld) {
    if (!asWorld.startsWith('world-')) {
      return NextResponse.json(
        { error: { code: 'NOT_A_WORLD_SEAT', message: 'Only a seeded world company can be taken this way.' } },
        { status: 400 }
      )
    }
    const company = await prisma.company.findUnique({
      where: { slug: asWorld },
      select: {
        id: true, name: true, kind: true,
        contexts: {
          where: { revokedAt: null, NOT: { roleId: null } },
          select: { person: { select: { primaryEmail: true } } },
          take: 1,
        },
      },
    })
    const email = company?.contexts[0]?.person.primaryEmail
    if (!company || !email) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_SEEDED',
            message: `No seat at ${asWorld}. POST /api/seed-world to build it first.`,
          },
        },
        { status: 404 }
      )
    }
    const res = NextResponse.json({
      data: {
        companyId: company.id, companyName: company.name, kind: company.kind,
        world: asWorld,
        // Where this seat belongs. /dashboard is the vendor's Today view
        // and /dashboard/program is the client's programme overview —
        // two pages for two company types, not two versions of one. A
        // flat '/dashboard' here dropped a client onto the vendor's.
        landing:
          company.kind === 'CLIENT' || company.kind === 'MSP' || company.kind === 'GSI'
            ? '/dashboard/program'
            : '/dashboard',
      },
    })
    res.cookies.set(DEMO_COOKIE, sign(email), {
      httpOnly: true, sameSite: 'lax', path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_DAYS * 24 * 60 * 60,
    })
    return res
  }

  // Which door they came through. Defaults to the buyer's chair: the
  // demand side is the one being sold first, and a visitor who arrives
  // with no preference should land where the product is sharpest.
  const asked = String(body?.side ?? '').toUpperCase()
  // 'BENCH' is both the old door and the bench vendor's seat. They mean
  // the same thing, so the collision is harmless and the old links keep
  // working.
  const SEATS: Seat[] = ['CLIENT', 'MSP', 'GSI', 'PRIME', 'BENCH']
  const side: Side =
    SEATS.includes(asked as Seat) ? (asked as Seat)
    : asked === 'BENCH' ? 'BENCH'
    : asked === 'CANDIDATE' ? 'CANDIDATE'
    : 'HIRING'

  // The old two doors, mapped onto their seats in the chain.
  const seat: Seat | null =
    SEATS.includes(side as Seat) ? (side as Seat)
    : side === 'HIRING' ? 'CLIENT'
    : null

  const handle = randomBytes(6).toString('hex')
  const email = addressFor(handle)
  // CANDIDATE names its own agency inside seedDemoConsultant — the visitor
  // is not in charge of a company on that side, so this pick is unused.
  const pool = side === 'BENCH' ? NAMES : side === 'CANDIDATE' ? NAMES : BUYERS
  const companyName = pool[Math.floor(Math.random() * pool.length)]
  const slug = `demo-${handle}`

  // Inside the try, along with everything else that touches the database.
  //
  // This one sat outside it, so a database that was reachable but had no
  // tables threw before the handler below could say anything — and the
  // first deploy answered a visitor with a blank 500. An empty 500 is
  // the worst error a product can give: it tells the person nothing and
  // it tells whoever has to fix it nothing either.
  let person: { id: string; name: string } | null = null
  let seeded

  try {
    person = await prisma.person.create({
      data: { name: 'You', primaryEmail: email },
    })

    if (seat) {
      // One chain, entered from the seat they picked. Every firm is
      // created either way — a chain with four of its five links missing
      // is the two-party demo again.
      seeded = await seedChain({ personId: person.id, personName: person.name, seat, slug })
    } else {
      seeded = await seedDemoConsultant({
        personId: person.id,
        personName: person.name,
        companyName,
        slug,
      })
    }
  } catch (err: any) {
    // A half-built workspace is worse than none: the visitor lands on
    // screens that are empty for the wrong reason. Clear it and say so.
    if (person) await prisma.person.delete({ where: { id: person.id } }).catch(() => {})

    const why = String(err?.message ?? err)
    console.error('demo: could not seed', why)

    // Two failures that look identical to a visitor and are completely
    // different to whoever has to fix them: a database nobody can reach,
    // and a database with no tables in it. Said apart, because "try
    // again later" is wrong advice for the second one.
    const unreachable = /P1001|Can't reach database|ECONNREFUSED|ETIMEDOUT/i.test(why)
    const noTables = /P2021|P2022|does not exist in the current database|relation .* does not exist/i.test(why)

    return NextResponse.json(
      {
        error: {
          code: unreachable ? 'DATABASE_UNREACHABLE' : noTables ? 'DATABASE_NOT_SET_UP' : 'DEMO_FAILED',
          message: unreachable
            ? 'The database is not answering. Nothing was left behind — try again in a minute.'
            : noTables
              ? 'The database is reachable but has no tables yet. Somebody needs to push the schema.'
              : 'Could not build a demo workspace just now. Nothing was left behind.',
        },
      },
      { status: 500 }
    )
  }

  const res = NextResponse.json({
    data: {
      companyId: seeded.companyId,
      companyName: seeded.companyName,
      counts: seeded.counts,
      side,
      landing:
        side === 'BENCH' ? '/dashboard'
        : side === 'CANDIDATE' ? '/dashboard/my-work'
        : '/dashboard/program',
      expiresInDays: DEMO_DAYS,
      resumed: false,
    },
  })

  res.cookies.set(DEMO_COOKIE, sign(email), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_DAYS * 24 * 60 * 60,
  })

  return res
}

export async function GET(request: NextRequest) {
  const email = read(request.cookies.get(DEMO_COOKIE)?.value)
  if (!email) return NextResponse.json({ data: { inDemo: false } })

  const person = await prisma.person.findUnique({
    where: { primaryEmail: email },
    select: {
      contexts: {
        where: { revokedAt: null },
        select: { company: { select: { id: true, name: true, isDemo: true, demoExpiresAt: true } } },
      },
    },
  })

  const company = person?.contexts[0]?.company
  if (!company?.isDemo) return NextResponse.json({ data: { inDemo: false } })

  const daysLeft = company.demoExpiresAt
    ? Math.max(0, Math.ceil((company.demoExpiresAt.getTime() - Date.now()) / 86_400_000))
    : null

  return NextResponse.json({
    data: { inDemo: true, companyId: company.id, companyName: company.name, daysLeft },
  })
}

/**
 * DELETE /api/demo — throw this workspace away and start again.
 *
 * The demo is meant to be broken. Somebody who has broken it should be
 * able to get a clean one without waiting a fortnight or emailing us.
 */
export async function DELETE(request: NextRequest) {
  const email = read(request.cookies.get(DEMO_COOKIE)?.value)
  if (!email) return NextResponse.json({ data: { cleared: false } })

  const person = await prisma.person.findUnique({
    where: { primaryEmail: email },
    select: { id: true, contexts: { select: { companyId: true, company: { select: { isDemo: true } } } } },
  })

  for (const c of person?.contexts ?? []) {
    // Only ever a demo company. A signed cookie is not authority to
    // delete a real one.
    if (c.company?.isDemo && c.companyId) {
      await prisma.company.delete({ where: { id: c.companyId } }).catch(() => {})
    }
  }
  if (person) await prisma.person.delete({ where: { id: person.id } }).catch(() => {})

  const res = NextResponse.json({ data: { cleared: true } })
  res.cookies.delete(DEMO_COOKIE)
  return res
}
