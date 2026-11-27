'use client'

import { useEffect, useState } from 'react'
import { RefusedState, LoadingState } from '@/components/ui'

/**
 * The door to Training (record 133). Every training screen lives on the
 * firm's learning micro-site; this address only sends the reader there,
 * and says in a sentence why where the seat or the plugin refuses it.
 */
export default function TrainingDoor() {
  const [refused, setRefused] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/training').then(async (r) => {
      const body = await r.json().catch(() => ({}))
      if (r.ok && typeof body?.data?.learnPath === 'string') { window.location.replace(`${body.data.learnPath}/manage`); return }
      setRefused(body?.error?.message ?? 'This page is not part of your seat.')
    }).catch(() => setRefused('Training could not be opened. Try again.'))
  }, [])
  return refused ? <RefusedState says={refused} /> : <LoadingState says="Opening…" />
}
