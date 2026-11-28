'use client'

import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import type { SendingDomainHealth } from '@/lib/notify/sending-domain'
import { Chip } from '@/components/ui'
import { Panel } from './panel-bits'

/**
 * The domain email is sent from, and its SPF, DKIM and DMARC records
 * (record 110): each "found", "not found" or "could not be checked",
 * with one sentence on what to do. Read from /api/settings/mail-domain,
 * which looks the records up in DNS. No secret is shown.
 */
export function SendingDomainPanel() {
  const [data, setData] = useState<SendingDomainHealth | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/settings/mail-domain')
      .then(readJson)
      .then((body) => { if (live) setData(body.data) })
      .catch((e: Error) => { if (live) setErr(e.message) })
    return () => { live = false }
  }, [])

  return (
    <Panel title="Email sending domain" subtitle="Every email from Etyme leaves from one verified address. These three DNS records let a mailbox trust it.">
      {!data && !err && <p className="text-[13px] text-etyme-muted">Looking up the DNS records…</p>}
      {err && <p className="text-[13px] text-etyme-danger">{err}</p>}
      {data && (
        <div className="grid gap-3">
          <p className="text-[13px] text-etyme-ink">{data.says}</p>
          {data.checks.map((c) => (
            <div key={c.record} className="flex items-start gap-3">
              <span className="w-[64px] shrink-0 font-mono text-[12px] text-etyme-ink pt-0.5">{c.record}</span>
              <Chip tone={c.state === 'found' ? 'verified' : c.state === 'not found' ? 'attention' : 'passive'}>{c.state}</Chip>
              <p className="text-[13px] text-etyme-muted">{c.says}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
