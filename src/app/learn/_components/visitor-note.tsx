'use client'
import { useEffect, useState } from 'react'

/**
 * "Your progress stays in this browser until you sign in." Said only to a
 * visitor. A signed-in worker's progress is on her record, so the line
 * would be untrue for her; nothing is said until the server has answered.
 */
export function VisitorNote({ tenant }: { tenant: string }) {
  const [visitor, setVisitor] = useState(false)
  useEffect(() => {
    let alive = true
    fetch(`/api/learn/${tenant}/progress`, { credentials: 'same-origin' })
      .then((r) => { if (alive && !r.ok && r.status !== 404) setVisitor(true) })
      .catch(() => {})
    return () => { alive = false }
  }, [tenant])
  return visitor ? <span> Your progress stays in this browser until you sign in.</span> : null
}
