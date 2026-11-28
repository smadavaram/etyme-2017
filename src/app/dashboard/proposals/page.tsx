'use client'

import { useEffect, useState } from 'react'
import { RefusedState, LoadingState } from '@/components/ui'

/**
 * The door to Proposals (records 133, 134). Every proposal and supplier
 * diversity screen lives on the firm's own proposals site; this address
 * only sends the reader there, and says in a sentence why where the seat
 * or the plugin refuses it.
 */
export default function ProposalsDoor() {
  const [refused, setRefused] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/proposals').then(async (r) => {
      const body = await r.json().catch(() => ({}))
      if (r.ok && typeof body?.sitePath === 'string') { window.location.replace(body.sitePath); return }
      setRefused(body?.error?.message ?? 'This page is not part of your seat.')
    }).catch(() => setRefused('Proposals could not be opened. Try again.'))
  }, [])
  return refused ? <RefusedState says={refused} /> : <LoadingState says="Opening…" />
}
