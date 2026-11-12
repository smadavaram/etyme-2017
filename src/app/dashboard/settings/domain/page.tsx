'use client'

import Link from 'next/link'
import { usePageSection } from '@/components/page-section'
import { PageHead, Panel } from '@/components/ui'
import { ConnectDomain } from './connect-domain'

/**
 * Settings → Your domain: the same screen as the setup checklist's "Your
 * domain" item, reached from Settings → Company. One record to add, one
 * button to check, the answer in a sentence. Skippable: a company with no
 * domain works as it does today.
 */
export default function DomainPage() {
  const eyebrow = usePageSection('/dashboard/settings/domain')
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead
        eyebrow={eyebrow}
        title="Your domain"
        subtitle="Prove your company owns its domain with one DNS record. Etyme checks it for you."
      />
      <Panel>
        <ConnectDomain />
      </Panel>
      <p className="mt-4 text-[13px] text-etyme-muted">
        <Link href="/dashboard/settings" className="text-etyme-action underline-offset-2 hover:underline">Back to Settings</Link>
      </p>
    </div>
  )
}
