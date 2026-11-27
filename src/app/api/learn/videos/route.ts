import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { pluginGate } from '@/lib/plugin-gate'
import { trackOf, lessonByKey } from '@/lib/training/courses/index'
import { ensureCourse } from '@/lib/training/learn-db'
import { cleanVideo } from '@/lib/training/video'

/**
 * PUT and DELETE /api/learn/videos
 *
 * A firm anchors a video to one lesson of a track: a link the learner's own
 * browser opens, an optional span of it, the span each step of the lesson
 * plays, and the frames the animation shows. The server stores the link and
 * never fetches it. Body: { trackKey, lessonKey, sourceUrl, startSec?,
 * endSec?, steps?, frames? }. For whoever develops the bench here.
 */
async function door(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return { error }
  const notStaff = staffOnly(caller, 'Training')
  if (notStaff) return { error: notStaff }
  const off = await pluginGate(caller, 'TRAIN_TO_BENCH')
  if (off) return { error: off }
  if (!hasPermission(caller.permissions, 'consultants.write')) {
    return { error: NextResponse.json({ error: { code: 'FORBIDDEN', message: `Anchoring a video is for whoever develops the bench at ${caller.company!.name}.` } }, { status: 403 }) }
  }
  const body = await request.json().catch(() => ({}))
  const track = typeof body.trackKey === 'string' ? trackOf(body.trackKey) : null
  const lesson = track && typeof body.lessonKey === 'string' ? lessonByKey(track, body.lessonKey) : null
  if (!track || !lesson) return { error: NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That lesson is not in this track.', field: 'lessonKey' } }, { status: 404 }) }
  const course = await ensureCourse(caller.company!.id, track.key)
  return { caller, body, course: course!, lessonKey: lesson.lesson.key }
}

export async function PUT(request: NextRequest) {
  const d = await door(request)
  if ('error' in d && d.error) return d.error
  const { caller, body, course, lessonKey } = d as Exclude<typeof d, { error: NextResponse }>
  const v = cleanVideo(body)
  if (!v.ok) return NextResponse.json({ error: { code: 'VALIDATION', message: v.message, field: v.field } }, { status: 422 })
  const data = {
    sourceUrl: v.video.sourceUrl, storedFileId: null, startSec: v.video.startSec, endSec: v.video.endSec,
    steps: v.video.steps.length ? (v.video.steps as object) : Prisma.DbNull, frames: v.video.frames.length ? (v.video.frames as object) : Prisma.DbNull,
  }
  const row = await prisma.lessonVideo.upsert({
    where: { companyId_courseId_lessonKey: { companyId: caller.company!.id, courseId: course.id, lessonKey } },
    create: { companyId: caller.company!.id, courseId: course.id, lessonKey, createdByPersonId: caller.person.id, ...data },
    update: data, select: { id: true },
  })
  return NextResponse.json({ data: { id: row.id, ...v.video } })
}

export async function DELETE(request: NextRequest) {
  const d = await door(request)
  if ('error' in d && d.error) return d.error
  const { caller, course, lessonKey } = d as Exclude<typeof d, { error: NextResponse }>
  const gone = await prisma.lessonVideo.deleteMany({ where: { companyId: caller.company!.id, courseId: course.id, lessonKey } })
  return NextResponse.json({ data: { removed: gone.count } })
}
