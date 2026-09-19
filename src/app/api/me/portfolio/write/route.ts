import { NextRequest, NextResponse } from 'next/server'
import { getSessionEmail } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { writeBioBest } from '@/lib/consultant-portfolio'
import { factsFor, ensureOwnPage } from '@/lib/portfolio-data'

/**
 * POST /api/me/portfolio/write — write the words for them.
 *
 * The same split a company's page uses. The voice is written; the facts
 * never are. Engagements, years per skill, when they are free — all read
 * live from their work every time the page is served, so a written
 * sentence can go out of style but never out of date.
 *
 * Offered rather than automatic. Somebody who has written their own line
 * should not lose it because a contract ended.
 *
 * Like the page itself, this no longer needs a bench behind it. The facts
 * come from the work, and the row that stores the two sentences is made
 * by this save if it is not there yet — private and off, because writing
 * a line about yourself is not publishing it.
 */
export async function POST(request: NextRequest) {
  const email = await getSessionEmail()
  if (!email) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not signed in' } },
      { status: 401 }
    )
  }

  const person = await prisma.person.findUnique({
    where: { primaryEmail: email },
    select: { id: true, consultant: { select: { id: true, bioIntro: true, bioWrittenBy: true } } },
  })

  if (!person) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not signed in' } },
      { status: 401 }
    )
  }

  const made = await ensureOwnPage(person.id)
  if ('refused' in made) {
    return NextResponse.json(
      { error: { code: 'NOT_YOUR_PAGE', message: made.refused.says } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const existing = person.consultant ?? { id: made.id, bioIntro: null, bioWrittenBy: null }

  // Replacing something they wrote is worth asking about once.
  if (existing.bioWrittenBy === 'PERSON' && existing.bioIntro && body.replaceMine !== true) {
    return NextResponse.json(
      {
        error: {
          code: 'WOULD_REPLACE_YOURS',
          message: 'You wrote this yourself. Writing it again would replace your words — send replaceMine: true if that is what you want.',
          yours: existing.bioIntro,
        },
      },
      { status: 409 }
    )
  }

  const facts = await factsFor(person.id)
  if (!facts) {
    // Only reachable if the person vanished between two queries. Said as
    // a sentence all the same.
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'We cannot find your record to write from.' } },
      { status: 404 }
    )
  }

  const written = await writeBioBest(facts, new Date())

  await prisma.consultantProfile.update({
    where: { id: existing.id },
    data: {
      bioHeadline: written.headline,
      bioIntro: written.intro,
      bioWrittenBy: written.writtenBy,
    },
  })

  return NextResponse.json({
    data: {
      headline: written.headline,
      intro: written.intro,
      writtenBy: written.writtenBy,
      // Said plainly rather than quietly producing a lesser result.
      note: written.writtenBy === 'MODEL'
        ? 'Written from your own work. Edit any of it — nothing here is locked.'
        : 'No writing key is set, so this is written from your work by rule. It is plainer, and everything in it is still true.',
      message: 'Every number on your page stays live. Only these words are stored.',
    },
  })
}
