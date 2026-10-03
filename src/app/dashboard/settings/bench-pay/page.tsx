'use client'

import { useCompanyKind } from '@/components/session-provider'
import { sectionOfHref } from '@/lib/page-framing'
import { BenchPaySection } from './bench-pay'

/**
 * Bench pay, on a page of its own as well as a tab of Settings, because
 * the finance desk sets it and does not open the company's settings —
 * roles, walls and cost centers are not its to read.
 */
export default function BenchPayPage() {
  const kind = useCompanyKind()
  return (
    <>
      <div className="page-head mb-6">
        <p className="eyebrow">{sectionOfHref(kind, '/dashboard/settings/bench-pay') ?? ''}</p>
        <h1>Bench pay</h1>
        <p>What you pay people waiting for a project, and whether public holidays are paid while they wait.</p>
      </div>
      <BenchPaySection />
    </>
  )
}
