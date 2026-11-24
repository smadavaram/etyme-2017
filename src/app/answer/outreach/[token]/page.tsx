'use client'

import { readJson } from '@/lib/read-response'
import { EtymeLogo } from '@/components/logo'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * The page an unsubscribe link opens (record 116). No account. One
 * button; opening the page changes nothing, because mail scanners open
 * links before people do.
 */
export default function UnsubscribePage() {
  const { token } = useParams<{ token: string }>()
  const [firm, setFirm] = useState<string | null>(null)
  const [closed, setClosed] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const body = await readJson(await fetch(`/api/answer/outreach/${token}`))
        if (live) { setFirm(body.data.firm); if (body.data.already) setDone(`${body.data.firm} will send you no more outreach.`) }
      } catch (err: any) { if (live) setClosed(err.message) }
    })()
    return () => { live = false }
  }, [token])

  async function press() {
    setBusy(true)
    try {
      const body = await readJson(await fetch(`/api/answer/outreach/${token}`, { method: 'POST' }))
      setDone(body.data.says)
    } catch (err: any) { setClosed(err.message) } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[34rem] flex-col justify-center px-6 py-16">
      <EtymeLogo />
      <div className="panel mt-8">
        {closed && <p className="text-[14px] text-etyme-attention">{closed}</p>}
        {!closed && !firm && <p className="text-[13px] text-etyme-muted">Loading…</p>}
        {!closed && firm && done && (
          <>
            <h1 className="headline-serif text-[27px]">Done</h1>
            <p className="mt-2 text-[14px]">{done}</p>
          </>
        )}
        {!closed && firm && !done && (
          <>
            <h1 className="headline-serif text-[27px]">Stop letters from {firm}?</h1>
            <p className="mt-3 text-[14px] text-etyme-muted">
              {firm} will send you no more outreach. Messages about work already agreed, such as timesheets and bills, still reach you.
            </p>
            <button type="button" onClick={press} disabled={busy} className="mt-5 rounded-md bg-etyme-action px-4 py-2 text-[13px] text-white disabled:opacity-50">{busy ? "Saving…" : "Stop these letters"}</button>
          </>
        )}
      </div>
    </main>
  )
}
