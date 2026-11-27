'use client'
import { useCallback, useEffect, useState } from 'react'
import { EMPTY_PROGRESS, markDone, readProgress, setTick, storageKey, type LearnProgress } from '@/lib/training/learn-progress'

/**
 * Progress for one track. A visitor's lives in this browser only. A
 * signed-in worker's is read from, and written to, her own record. The
 * server says which she is: it refuses a visitor, and a visitor's page
 * then writes nothing anywhere.
 */
export function useProgress(tenant: string, track: string, lessonKeys: string[]) {
  const [progress, setProgress] = useState<LearnProgress>(EMPTY_PROGRESS)
  const [signedIn, setSignedIn] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    const local = readProgress(safeParse(localStorage.getItem(storageKey(tenant, track))))
    setProgress(local)
    fetch(`/api/learn/${tenant}/progress?track=${track}`, { credentials: 'same-origin' })
      .then(async (r) => {
        if (!alive) return
        if (r.ok) {
          const j = await r.json()
          setSignedIn(true)
          setProgress(readProgress(j.data.progress))
        }
      })
      .catch(() => {})
      .finally(() => alive && setReady(true))
    return () => { alive = false }
  }, [tenant, track])

  const save = useCallback((next: LearnProgress, body: Record<string, unknown>) => {
    setProgress(next)
    if (signedIn) {
      fetch(`/api/learn/${tenant}/progress`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ track, ...body }) }).catch(() => {})
    } else {
      try { localStorage.setItem(storageKey(tenant, track), JSON.stringify(next)) } catch { /* private mode: progress lasts the visit */ }
    }
  }, [signedIn, tenant, track])

  return {
    progress, signedIn, ready,
    finish: (lessonKey: string) => save(markDone(progress, lessonKey, lessonKeys), { lessonKey }),
    tick: (project: string, item: string, on: boolean) => save(setTick(progress, project, item, on), { tick: { project, item, on } }),
  }
}

function safeParse(s: string | null): unknown { try { return s ? JSON.parse(s) : null } catch { return null } }
