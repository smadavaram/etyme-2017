'use client'

import { usePageSection } from '@/components/page-section'
import { PageHead } from '@/components/ui'
import { BenchPaySection } from './bench-pay'

/**
 * Bench pay, on a page of its own as well as a tab of Settings, because
 * the finance desk sets it and does not open the company's settings —
 * roles, walls and cost centers are not its to read.
 */
export default function BenchPayPage() {
  const section = usePageSection('/dashboard/settings/bench-pay')
  // The heading is drawn by the section once the read answers, so a desk
  // that is refused reads the sentence alone (round seven, problem 6).
  return (
    <BenchPaySection
      head={
        <PageHead
          eyebrow={section}
          title="Bench pay"
          subtitle="What you pay people waiting for a project, and whether public holidays are paid while they wait."
        />
      }
    />
  )
}
