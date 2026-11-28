'use client'

import { useEffect, useState } from 'react'
import { RefusedState, LoadingState } from '@/components/ui'

/**
 * The door to Project teams (records 133, 134). Every team screen lives on
 * the firm's own project teams site; this address only sends the reader
 * there, and says in a sentence why where the seat or the plugin refuses it.
 */
export default function ProjectTeamsDoor() {
  const [refused, setRefused] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/pods').then(async (r) => {
      const body = await r.json().catch(() => ({}))
      if (r.ok && typeof body?.data?.sitePath === 'string') { window.location.replace(body.data.sitePath); return }
      setRefused(body?.error?.message ?? 'This page is not part of your seat.')
    }).catch(() => setRefused('Project teams could not be opened. Try again.'))
  }, [])
  return refused ? <RefusedState says={refused} /> : <LoadingState says="Opening…" />
}
