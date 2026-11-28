import { notFound } from 'next/navigation'
import { learnTenant, videoFor } from '@/lib/training/learn-read'
import { trackOf, lessonByKey, course } from '@/lib/training/courses/index'
import { LessonShell } from '../../../_components/lesson-shell'

export default async function LessonPage({ params }: { params: Promise<{ tenant: string; track: string; lesson: string }> }) {
  const { tenant, track, lesson } = await params
  const t = await learnTenant(tenant)
  const tr = trackOf(track)
  if (!t || !tr || !lessonByKey(tr, lesson)) notFound()
  const video = await videoFor(t.id, tr.key, lesson)
  return <LessonShell tenant={t.slug} firm={t.name} version={`Version: ${course().version}`} track={tr} lessonKey={lesson} video={video} />
}
