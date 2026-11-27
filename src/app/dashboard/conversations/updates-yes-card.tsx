'use client'

import { useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'

/**
 * Her own yes to updates, for her own page (record 117). One sentence that
 * says where it stands and one button that changes it, in the same words the
 * route answers with. The page that holds it draws this and nothing else.
 */
export function UpdatesYesCard() {
  const [yes, setYes] = useState<boolean | null>(null)
  const [says, setSays] = useState('')
  const [busy, setBusy] = useState(false)

  async function load(method: 'GET' | 'POST' | 'DELETE') {
    setBusy(true)
    try {
      const body = await readJson(await fetch('/api/updates-consent', { method }))
      setYes(body.data.yes); setSays(body.data.says)
    } catch (err: any) { setSays(err.message) } finally { setBusy(false) }
  }
  useEffect(() => { void load('GET') }, [])

  return (
    <section className="panel">
      <h2 className="headline-serif text-[20px]">Updates from firms</h2>
      <p className="mt-2 text-[14px]">{says || 'Loading…'}</p>
      {yes !== null && (
        <button type="button" disabled={busy} onClick={() => load(yes ? 'DELETE' : 'POST')} className="mt-4 rounded-md bg-etyme-action px-4 py-2 text-[13px] text-white disabled:opacity-50">
          {yes ? 'Stop updates' : 'Yes, send me updates'}
        </button>
      )}
    </section>
  )
}
