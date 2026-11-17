'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { PageHead, Panel, LoadingState, RefusedState, ErrorState } from '@/components/ui'

/** The old bank checks report, for Etyme's staff only. Read only. */
interface Report {
  says: string
  held: number
  suppliers: { supplier: string; last4: string | null; customers: string[] }[]
}

export default function BankCheckReportPage() {
  const [data, setData] = useState<Report | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    const res = await fetch('/api/superadmin/bank-checks')
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}))
      setRefused(body.error?.message ?? "This report is for Etyme's staff only.")
      return
    }
    try {
      setData((await readJson(res)).data)
    } catch (e: any) {
      setErr(e.message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  if (refused) return <RefusedState says={refused} />
  if (err) return <ErrorState says={err} action={{ label: 'Try again', onClick: load }} />
  if (!data) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Superadmin"
        title="Old bank checks"
        subtitle="Read only. Nothing here changes any record."
      />
      <Panel title="The count" subtitle={data.says}>
        <p className="text-[14px] text-etyme-ink">
          {data.held} suppliers would be held for every customer once the per-customer bank rule goes on, until each customer&apos;s Finance or AP clerk checks their bank again.
        </p>
      </Panel>
      <Panel title="Suppliers that would be held">
        {data.suppliers.length === 0 ? (
          <p className="text-[14px] text-etyme-muted">None. Every old check names its payer or has a payer&apos;s own check.</p>
        ) : (
          <ul className="space-y-3">
            {data.suppliers.map((s, i) => (
              <li key={i} className="text-[14px] text-etyme-ink">
                <span className="font-medium">{s.supplier}</span>
                <span className="tabular-nums text-etyme-muted"> · account ending {s.last4 ?? 'not on file'}</span>
                <span className="block text-[12px] text-etyme-muted">
                  {s.customers.length ? `Paid by ${s.customers.join(', ')}.` : 'No customer pays it yet.'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
