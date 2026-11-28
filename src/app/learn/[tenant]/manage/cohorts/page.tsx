import { notFound } from 'next/navigation'
import { learnTenant } from '@/lib/training/learn-read'
import { Cohorts } from '../../../_components/manage/cohorts'
import { ManageTabs } from '../../../_components/manage/manage-tabs'

/** Cohorts: planned, assessed, certified, and asked onto the bench (record 133). */
export default async function ManageCohorts({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const t = await learnTenant(tenant)
  if (!t) notFound()
  return (
    <>
      <ManageTabs tenant={t.slug} here="cohorts" />
      <div className="page-head mb-6"><h1>Cohorts</h1></div>
      <Cohorts />
    </>
  )
}
