'use client'

import { useCallback, useEffect, useState } from 'react'
import { readJson } from '@/lib/read-response'
import { FormMessage } from '@/components/ui/form'
import { Panel } from './panel-bits'

/**
 * "Hide courses on our public page" (record 120, answer 3). The Owner's
 * switch, through /api/settings/site. An Admin reads it and is told who
 * changes it. Courses appear on a public page only while Train to bench
 * is on and this is not set.
 */
export function CoursesOnPagePanel() {
  const [data, setData] = useState<{ coursesOffered?: boolean; coursesHidden: boolean; coursesShown: boolean; canHideCourses: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setData((await readJson(await fetch('/api/settings/site'))).data) } catch (e: any) { setErr(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  async function flip() {
    if (!data) return
    setBusy(true); setErr(null)
    try {
      await readJson(await fetch('/api/settings/site', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coursesHiddenOnStorefront: !data.coursesHidden }),
      }))
      await load()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  // A company that only buys is offered no courses: no panel.
  if (data && data.coursesOffered === false) return null

  return (
    <Panel title="Courses on our public page" subtitle="Courses are listed on your public page only while Train to bench is on and this is not set.">
      {!data && !err && <p className="text-[13px] text-etyme-muted">Opening the setting…</p>}
      {data && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-etyme-ink">{data.coursesHidden ? 'Courses are hidden on our public page.' : 'Courses may be listed on our public page.'}</p>
          {data.canHideCourses ? (
            <button
              type="button"
              role="switch"
              aria-checked={data.coursesHidden}
              aria-label="Hide courses on our public page"
              disabled={busy}
              onClick={flip}
              className="rounded-[8px] border border-etyme-rule bg-etyme-raised px-3 py-1.5 text-[13px] text-etyme-ink"
            >
              {data.coursesHidden ? 'Show courses' : 'Hide courses on our public page'}
            </button>
          ) : (
            <span className="text-[12px] text-etyme-muted">Only the firm’s Owner changes this.</span>
          )}
        </div>
      )}
      {err && <FormMessage tone="error">{err}</FormMessage>}
    </Panel>
  )
}
