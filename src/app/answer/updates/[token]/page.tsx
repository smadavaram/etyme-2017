'use client'

import { readJson } from '@/lib/read-response'
import { EtymeLogo } from '@/components/logo'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * The page a link in an update letter opens (record 117). No account. One
 * button; opening the page changes nothing, because mail scanners open
 * links before people do. The link either stops updates or gives the yes.
 */
export default function UpdatesLinkPage() {
  const { token } = useParams<{ token: string }>()
  const [purpose, setPurpose] = useState<'STOP' | 'YES' | null>(null)
  const [closed, setClosed] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const body = await readJson(await fetch(`/api/answer/updates/${token}`))
        if (!live) return
        setPurpose(body.data.purpose)
        if (body.data.already) setDone(body.data.purpose === 'STOP' ? 'No firm sends you updates.' : 'You already said yes to updates.')
      } catch (err: any) { if (live) setClosed(err.message) }
    })()
    return () => { live = false }
  }, [token])

  async function press() {
    setBusy(true)
    try {
      const body = await readJson(await fetch(`/api/answer/updates/${token}`, { method: 'POST' }))
      setDone(body.data.says)
    } catch (err: any) { setClosed(err.message) } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[34rem] flex-col justify-center px-6 py-16">
      <EtymeLogo />
      <div className="panel mt-8">
        {closed && <p className="text-[14px] text-etyme-attention">{closed}</p>}
        {!closed && !purpose && <p className="text-[13px] text-etyme-muted">Loading…</p>}
        {!closed && purpose && done && (
          <>
            <h1 className="headline-serif text-[27px]">Done</h1>
            <p className="mt-2 text-[14px]">{done}</p>
          </>
        )}
        {!closed && purpose === 'STOP' && !done && (
          <>
            <h1 className="headline-serif text-[27px]">Stop updates?</h1>
            <p className="mt-3 text-[14px] text-etyme-muted">
              No firm will send you updates until you say yes again. Messages about work already agreed, such as timesheets, still reach you.
            </p>
            <button type="button" onClick={press} disabled={busy} className="mt-5 rounded-md bg-etyme-action px-4 py-2 text-[13px] text-white disabled:opacity-50">{busy ? 'Saving…' : 'Stop updates'}</button>
          </>
        )}
        {!closed && purpose === 'YES' && !done && (
          <>
            <h1 className="headline-serif text-[27px]">Get updates?</h1>
            <p className="mt-3 text-[14px] text-etyme-muted">
              Firms that keep you on their list of candidates may write to you about work. Each letter has a link that stops them.
            </p>
            <button type="button" onClick={press} disabled={busy} className="mt-5 rounded-md bg-etyme-action px-4 py-2 text-[13px] text-white disabled:opacity-50">{busy ? 'Saving…' : 'Yes, send me updates'}</button>
          </>
        )}
      </div>
    </main>
  )
}
