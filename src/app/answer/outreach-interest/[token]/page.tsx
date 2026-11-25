'use client'

import { readJson } from '@/lib/read-response'
import { EtymeLogo } from '@/components/logo'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * The page an "I'm interested" link opens (record 117). No account. One
 * button; opening the page changes nothing, because mail scanners open
 * links before people do. After the button the reader lands on the firm's
 * own page where it has one, and otherwise reads a plain thank-you.
 */
export default function InterestedPage() {
  const { token } = useParams<{ token: string }>()
  const [firm, setFirm] = useState<string | null>(null)
  const [closed, setClosed] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const body = await readJson(await fetch(`/api/answer/outreach-interest/${token}`))
        if (live) { setFirm(body.data.firm); if (body.data.already) setDone(`${body.data.firm} has been told and will reply to you by email.`) }
      } catch (err: any) { if (live) setClosed(err.message) }
    })()
    return () => { live = false }
  }, [token])

  async function press() {
    setBusy(true)
    try {
      const body = await readJson(await fetch(`/api/answer/outreach-interest/${token}`, { method: 'POST' }))
      if (body.data.landing) { window.location.assign(body.data.landing); return }
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
            <h1 className="headline-serif text-[27px]">Thank you</h1>
            <p className="mt-2 text-[14px]">{done}</p>
          </>
        )}
        {!closed && firm && !done && (
          <>
            <h1 className="headline-serif text-[27px]">Tell {firm} you are interested?</h1>
            <p className="mt-3 text-[14px] text-etyme-muted">
              {firm} is told, and replies to you by email. Letters like this stop.
            </p>
            <button type="button" onClick={press} disabled={busy} className="mt-5 rounded-md bg-etyme-action px-4 py-2 text-[13px] text-white disabled:opacity-50">{busy ? 'Saving…' : 'I’m interested'}</button>
          </>
        )}
      </div>
    </main>
  )
}
