'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { readJson } from '@/lib/read-response'

/**
 * The first line of a person's own page when a firm has asked to market
 * them and they have not answered: one line per firm, and the answer is
 * on My benches. Asking is not granting — nobody markets them until they
 * say yes — so this is a question for them, not news about them.
 */
export function askedLines(invited: ReadonlyArray<{ company: string }>): string[] {
  return invited.map((i) => `${i.company} has asked to market you. Say yes or no`)
}

export function AskedToMarket() {
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    let gone = false
    fetch('/api/me/benches')
      .then((r) => readJson<{ data?: { invited?: { company: string }[] } }>(r))
      .then((j) => { if (!gone) setLines(askedLines(j.data?.invited ?? [])) })
      .catch(() => { /* a page that cannot ask still shows the rest */ })
    return () => { gone = true }
  }, [])
  if (lines.length === 0) return null
  return (
    <div className="mb-6 space-y-2">
      {lines.map((l) => (
        <Link key={l} href="/dashboard/my-benches"
          className="block rounded-lg border border-etyme-attention/40 bg-etyme-attention/5 px-4 py-3 text-sm text-etyme-ink hover:underline">
          {l} →
        </Link>
      ))}
    </div>
  )
}
