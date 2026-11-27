import { notFound } from 'next/navigation'
import { learnTenant } from '@/lib/training/learn-read'
import { MentorQueue } from '../../_components/mentor-queue'

/** The paths waiting for this mentor's yes, with the days they are due. */
export default async function MentorPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const t = await learnTenant(tenant)
  if (!t) notFound()
  return <MentorQueue tenant={t.slug} />
}
