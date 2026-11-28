import { notFound } from 'next/navigation'
import { learnTenant } from '@/lib/training/learn-read'
import { course } from '@/lib/training/courses/index'
import { MicroHome } from '../../_components/micro-home'

/** The learner's home: one next action, the path with progress, the mentor, what is due. Nothing else. */
export default async function LearnHome({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const t = await learnTenant(tenant)
  if (!t) notFound()
  const tracks = course().tracks.map((x) => ({ key: x.key, title: x.title, lessons: x.levels.flatMap((lv) => lv.chapters.flatMap((ch) => ch.lessons.map((l) => ({ key: l.key, title: l.title })))) }))
  return <MicroHome tenant={t.slug} tracks={tracks} />
}
