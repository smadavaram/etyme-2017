'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePageSection } from '@/components/page-section'
import { Chip, EmptyState, ErrorState, LoadingState, PageHead, Panel, RefusedState } from '@/components/ui'
import { Act, SavedLine, useSaved } from '../act-form'
import { petitionWords } from '../act-spec'
import { approveBody, approveFields, recordNoticeBody, recordNoticeFields, removalBody, removalFields } from './bodies'
import { formatDay } from '@/lib/format-date'

/**
 * Notices, a tab of Contracts (record 112, chain 6: Keep it legal).
 *
 * The log of notices posted at each site, the day each may come down, and
 * the public access files each petition's filing starts. A person posts,
 * removes and approves; Etyme publishes and removes nothing, and nothing
 * here blocks. A removal before its day, or a file ready after its day,
 * is allowed with a reason on the record.
 */

interface Entity { id: string; name: string }
interface Notice { id: string; kind: string; site: string | null; postedOn: string; periodEndsOn: string; takenDownOn: string | null; fileRef: string | null }
interface Notices { notices: Notice[]; sites: Entity[]; entities: Entity[]; mayRecord: boolean; rules: { noticeWorkingDays: number } }
interface AccessFile { id: string; person: string | null; kind: string; filedOn: string | null; readyBy: string; readyOn: string | null; approved: boolean }
interface Files { files: AccessFile[]; entities: Entity[]; mayApprove: boolean; rules: { accessFileWorkingDays: number } }

const PROPOSED = 'Proposed rule, not yet confirmed with its source.'
const days = (n: number) => `${n} working ${n === 1 ? 'day' : 'days'}`

async function read<T>(url: string): Promise<{ data: T | null; refused: string | null; failed: string | null }> {
  try {
    const res = await fetch(url)
    const body = await res.json().catch(() => ({}))
    if (res.status === 403) return { data: null, refused: body?.error?.message ?? 'This is not part of your seat.', failed: null }
    if (!res.ok) return { data: null, refused: null, failed: body?.error?.message ?? 'That could not be read. Try again.' }
    return { data: body.data as T, refused: null, failed: null }
  } catch {
    return { data: null, refused: null, failed: 'The server could not be reached. Check your connection and try again.' }
  }
}

export default function NoticesPage() {
  const section = usePageSection('/dashboard/compliance/notices')
  const [notices, setNotices] = useState<Notices | null>(null)
  const [files, setFiles] = useState<Files | null>(null)
  const [says, setSays] = useState<{ notices: string | null; files: string | null }>({ notices: null, files: null })
  const [failed, setFailed] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { saved, tell } = useSaved()

  const load = useCallback(async () => {
    const [n, f] = await Promise.all([read<Notices>('/api/compliance/notice-postings'), read<Files>('/api/compliance/access-files')])
    setNotices(n.data); setFiles(f.data)
    setSays({ notices: n.refused, files: f.refused })
    setFailed(n.failed ?? f.failed)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  const done = (says: string) => { tell(says); load() }

  if (loading) return <LoadingState />
  if (says.notices && says.files) return <RefusedState says={says.notices} />

  return (
    <div className="min-w-0">
      <PageHead
        eyebrow={section}
        title="Notices"
        subtitle="Notices posted at your sites and the public access files, with the day each is due. A person posts, takes down and approves. Nothing here stops work."
      />
      <SavedLine says={saved} />
      {failed && <ErrorState says={failed} action={{ label: 'Try again', onClick: load }} />}

      <div className="space-y-6">
        {says.notices ? <RefusedState says={says.notices} /> : notices && (
          <Panel
            title="Posted notices"
            subtitle={`A notice stays up ${days(notices.rules.noticeWorkingDays)}, counted on your days off and holidays. ${PROPOSED}`}
          >
            {notices.mayRecord && <div className="mb-4 min-w-0">
              <Act label="Record a posted notice" fields={() => recordNoticeFields(notices.sites, notices.entities)} url="/api/compliance/notice-postings"
                body={(v) => recordNoticeBody(v, notices.sites, notices.entities)} onDone={done} />
            </div>}
            {notices.notices.length === 0 ? (
              <EmptyState compact says="No notice has been recorded yet." detail="Record each notice when it goes up, and you are told the day it may come down." />
            ) : (
              <ul className="divide-y divide-etyme-rule">
                {notices.notices.map((n) => (
                  <li key={n.id} className="py-3 min-w-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[13.5px] text-etyme-ink break-words">{n.kind} at {n.site ?? 'a site no longer listed'} {n.takenDownOn ? <Chip tone="verified">Taken down</Chip> : <Chip tone="attention">Up</Chip>}</p>
                        <p className="mt-1 text-[13px] text-etyme-muted break-words">
                          Posted on {formatDay(n.postedOn)}. May come down on {formatDay(n.periodEndsOn)}.{' '}
                          {n.takenDownOn ? `Taken down on ${formatDay(n.takenDownOn)}.` : 'Not taken down yet.'}
                          {n.fileRef ? ` Copy: ${n.fileRef}.` : ''}
                        </p>
                      </div>
                      {notices.mayRecord && !n.takenDownOn && (
                        <Act label="Record its removal" fields={(v) => removalFields(v.takenDownOn ?? '', n.periodEndsOn, notices.entities)}
                          url={`/api/compliance/notice-postings/${n.id}`} method="PATCH" body={(v) => removalBody(v, n.periodEndsOn, notices.entities)} onDone={done} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {says.files ? <RefusedState says={says.files} /> : files && (
          <Panel
            title="Public access files"
            subtitle={`Each is due ${days(files.rules.accessFileWorkingDays)} after the petition is filed. ${PROPOSED} Etyme publishes nothing.`}
          >
            {files.files.length === 0 ? (
              <EmptyState compact says="No public access file is being tracked." detail="Record the day a petition was filed, on the Checklists tab, and its file is tracked from that day." />
            ) : (
              <ul className="divide-y divide-etyme-rule">
                {files.files.map((f) => (
                  <li key={f.id} className="py-3 min-w-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[13.5px] text-etyme-ink break-words">{f.person ?? 'Somebody'}: {petitionWords(f.kind)} {f.approved ? <Chip tone="verified">Approved</Chip> : <Chip tone="attention">Not approved</Chip>}</p>
                        <p className="mt-1 text-[13px] text-etyme-muted">
                          {f.filedOn ? `Filed ${formatDay(f.filedOn)}. ` : ''}Due {formatDay(f.readyBy)}.{f.readyOn ? ` Ready ${formatDay(f.readyOn)}.` : ''}
                        </p>
                      </div>
                      {files.mayApprove && !f.approved && (
                        <Act label="Approve" fields={(v) => approveFields(v.readyOn ?? '', f.readyBy, files.entities)}
                          url={`/api/compliance/access-files/${f.id}`} method="PATCH" body={(v) => approveBody(v, f.readyBy, files.entities)} onDone={done} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </div>
  )
}
