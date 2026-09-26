import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readReplyToken, questionFor, CHOICES } from '@/lib/reply-link'
import { recordAnswer, anyBench } from '@/lib/answers'
import { lastAsked } from '@/lib/messages'

/**
 * The one-click answer, in two halves.
 *
 * GET says what is being asked and what the button will do. POST does it.
 *
 * The split is the whole point. Email security scanners follow every link
 * in a message before a person ever sees it, so a GET that switched
 * somebody's messages off would be triggered by a spam filter rather than
 * by them — and "stop" is exactly the answer we must never record by
 * accident, because it is permanent and it is the one somebody would sue
 * about getting wrong in the other direction.
 */

async function context(token: string) {
  const t = readReplyToken(token)
  if (!t) return null

  const profile = await prisma.consultantProfile.findUnique({
    where: { personId: t.personId },
    select: { id: true, personId: true, textsOffAt: true, person: { select: { name: true } } },
  })
  if (!profile) return null

  const asked = await lastAsked(t.personId)
  const companyId = asked?.companyId ?? (await anyBench(t.personId).catch(() => null))
  const company = companyId
    ? await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })
    : null

  const choice = CHOICES[t.asked].find((c) => c.reply === t.reply)

  return { t, profile, company, choice }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const c = await context(token)

  if (!c || !c.choice) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'This link is not valid. It may have been retyped or altered.' } },
      { status: 404 }
    )
  }

  return NextResponse.json({
    data: {
      name: c.profile.person.name.trim().split(/\s+/)[0],
      // In the vendor's name, never ours. A consultant on two benches
      // never learns that from us.
      vendor: c.company?.name ?? null,
      question: questionFor(c.t.asked),
      answer: c.choice.label,
      /** Already told us to stop, so the page says so rather than asking again. */
      stopped: c.profile.textsOffAt !== null,
    },
  })
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const c = await context(token)

  if (!c || !c.choice) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'This link is not valid.' } },
      { status: 404 }
    )
  }

  const recorded = await recordAnswer({
    profileId: c.profile.id,
    personId: c.profile.personId,
    asked: c.t.asked,
    reply: c.t.reply,
    // What they told us, in the words they saw. The trail has to read the
    // same to them as it does to us.
    heard: c.choice.label,
  })

  return NextResponse.json({
    data: {
      said: recorded.says,
      needsFollowUp: recorded.needsFollowUp,
      answer: c.choice.label,
    },
  })
}
