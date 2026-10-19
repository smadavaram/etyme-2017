'use client'

import { readJson } from '@/lib/read-response'
import { EtymeLogo } from '@/components/logo'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { BillPageView } from '@/lib/notify/bill-letter'

/**
 * A bill, opened from the email that carried it, with no account.
 *
 * Tapin's first day (2026-10-19): a supplier whose client is not on Etyme
 * sent a bill and nothing reached the client. Now the person the supplier
 * recorded there is emailed a link to this page. It shows the bill and
 * nothing else: each line with the rate on this bill, the period, the
 * total, when it is due, the signed weeks it is built from and where to
 * pay. Never a rate from any firm below the one that sent it.
 *
 * For a payer on Etyme, one more line: record it there.
 */
export default function BillPage() {
  const { token } = useParams<{ token: string }>()
  const [view, setView] = useState<BillPageView | null>(null)
  const [closed, setClosed] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const body = await readJson(await fetch(`/api/answer/bill/${token}`))
        if (live) setView(body.data)
      } catch (err: any) {
        if (live) setClosed(err.message)
      }
    })()
    return () => { live = false }
  }, [token])

  return (
    <main className="min-h-screen bg-etyme-canvas px-4 py-10 text-etyme-ink">
      <div className="mx-auto max-w-[720px]">
        <EtymeLogo />

        {!view && !closed && <p className="mt-8 text-[13px] text-etyme-muted">Loading the bill…</p>}

        {closed && (
          <section className="panel mt-8 space-y-2">
            <p className="stat-label">This link is closed</p>
            <p className="text-[14px] leading-relaxed">{closed}</p>
          </section>
        )}

        {view && (
          <div className="mt-8 space-y-6">
            <header>
              <p className="eyebrow">Bill from {view.supplierName} to {view.clientName}</p>
              <h1 className="headline-serif mt-2 text-[30px] leading-[1.1] text-balance">
                {view.number} · {view.total}, due {view.due}
              </h1>
              <p className="mt-3 max-w-[56ch] text-[14px] leading-relaxed text-etyme-muted">
                {view.period}. {view.status}. {view.builtFrom}
              </p>
            </header>

            <section className="panel space-y-2">
              <p className="stat-label">The lines</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] tabular-nums">
                  <thead>
                    <tr className="text-left text-etyme-muted">
                      <th className="py-2 pr-3 font-normal">Person</th>
                      <th className="py-2 pr-3 font-normal">Week</th>
                      <th className="py-2 pr-3 text-right font-normal">Hours</th>
                      <th className="py-2 pr-3 text-right font-normal">Rate</th>
                      <th className="py-2 text-right font-normal">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-etyme-rule">
                    {view.lines.map((l, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-3">{l.person ?? '—'}</td>
                        <td className="py-2 pr-3">{l.what}</td>
                        <td className="py-2 pr-3 text-right">{l.hours ?? '—'}</td>
                        <td className="py-2 pr-3 text-right">{l.rate ?? '—'}</td>
                        <td className="py-2 text-right">{l.amount}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-2 pr-3" colSpan={4}>Total</td>
                      <td className="py-2 text-right">{view.total}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {view.weeks.length > 0 && (
              <section className="panel space-y-2">
                <p className="stat-label">The signed weeks it is built from</p>
                <ul className="divide-y divide-etyme-rule">
                  {view.weeks.map((w, i) => (
                    <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-[13px]">
                      <span>{w.person}, {w.week}, {w.hours} h</span>
                      <span className="text-etyme-muted">{w.signed}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="panel space-y-2">
              <p className="stat-label">Where to pay</p>
              {view.remit ? (
                <p className="text-[14px] leading-relaxed">
                  {view.remit.method} to {view.remit.payTo}
                  {view.remit.bank ? `, ${view.remit.bank}` : ''}
                  {view.remit.account ? `, account ${view.remit.account}` : ''}.
                  {' '}Ask {view.supplierName} for the full details if you do not have them on file.
                </p>
              ) : (
                <p className="text-[14px] leading-relaxed">
                  {view.supplierName} has not recorded where to pay. Ask them for their payment details.
                </p>
              )}
            </section>

            {view.recordOnEtyme && (
              <section className="panel space-y-2">
                <p className="text-[14px] leading-relaxed">
                  {view.clientName} is on Etyme. Sign in to record the payment against this bill.
                </p>
                <a className="btn-primary inline-block" href={view.recordOnEtyme}>Record on Etyme</a>
              </section>
            )}

            <p className="text-[12px] text-etyme-muted">
              Read-only. No account needed. This link works until {view.expiresOn}.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
