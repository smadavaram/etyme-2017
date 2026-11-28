import { notFound } from 'next/navigation'
import { learnTenant } from '@/lib/training/learn-read'
import { ManagePage } from '../../_components/manage/manage-page'
import { ManageTabs } from '../../_components/manage/manage-tabs'

/**
 * Skills against open jobs, courses and who is on each (record 133). The
 * seat's own permissions are asked by /api/training, not by this page.
 */
export default async function ManageCourses({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const t = await learnTenant(tenant)
  if (!t) notFound()
  return (<><ManageTabs tenant={t.slug} here="courses" /><ManagePage tenant={t.slug} /></>)
}
