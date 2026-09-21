'use client'

import { useEffect, useState, useCallback } from 'react'
import { readJson } from '@/lib/read-response'
import {
  paperRows, outstanding, paperworkHeadline, FILE_NOT_TAKEN_YET,
  type PaperRow,
} from './paperwork-rows'

/**
 * Your paperwork — the page every chase letter names.
 *
 * ── The crack this closes ──
 *
 * The letters say "Upload it from your Paperwork page." There was no
 * such page, and the section that existed listed the three documents
 * Helena Marsh already holds under a subtitle promising "…and what is
 * still being asked of you". So the one thing a worker is chased for was
 * the one thing her own page could not show her.
 *
 * It is now a page of its own at `/dashboard/my-work/paperwork`, so a
 * letter can name it and land her on it in one click, and the same
 * section still sits on her work page under `id="paperwork"` with a link
 * through. Both doors, one component, so they cannot disagree.
 *
 * ── Four kinds of row ──
 *
 * Something she owes reads as something to act on, with what happens if
 * it does not arrive said in words. Something on file reads as on file,
 * with the day it runs out. Something waived is marked, stays on the
 * list, and is not counted against her. Nothing here is a status code.
 *
 * ── Two kinds of ask are answered in different places ──
 *
 * A document sent for signature is answered here, through
 * `/api/documents/:id/:todo`. An ask that came in a packet is answered
 * at the packet's own link — its id is a packet item and there is no
 * document row behind it, so posting here would post to nothing.
 *
 * ── And the one the letters are actually about ──
 *
 * A requirement nobody has opened a request against had nowhere to post
 * to for a day, and this page said so rather than drawing a button that
 * would 404. `etyme-regulatory` built the door: the row carries
 * `openAskAt` and `documentTypeKey`, and one press asks for a request
 * and then sends the file to it. Two calls, one button, and she is told
 * what happened in the route's own sentence — including the refusal,
 * where she names a document nobody wants.
 */

function Chip({ children, tone = 'passive' }: {
  children: React.ReactNode
  tone?: 'attention' | 'verified' | 'action' | 'passive'
}) {
  const tones = {
    attention: 'bg-etyme-attention/10 text-etyme-attention',
    verified: 'bg-etyme-verified/10 text-etyme-verified',
    action: 'bg-etyme-action/10 text-etyme-action',
    passive: 'bg-etyme-rule/50 text-etyme-muted',
  }
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

function toneFor(r: PaperRow): 'attention' | 'verified' | 'action' | 'passive' {
  if (r.kind === 'OWED') return r.waived ? 'passive' : (r.stopsWork ? 'attention' : 'action')
  if (r.kind === 'HELD') return /Ran out|Runs out/.test(r.word) ? 'attention' : 'verified'
  return r.todo ? 'action' : 'passive'
}

const GROUPS: { kind: PaperRow['kind']; title: string; blurb: string }[] = [
  { kind: 'OWED', title: 'Still needed from you', blurb: 'Documents your placements require that are not on your file yet. Send one in and whoever asked for it is told; they record whether it is accepted.' },
  { kind: 'DOCUMENT', title: 'Sent to you to sign', blurb: 'Papers somebody sent you. You answer these here.' },
  { kind: 'REQUEST', title: 'Asked for', blurb: 'Somebody has opened a request. You answer these at the link it came with.' },
  { kind: 'HELD', title: 'On your file', blurb: 'What we already hold about you, and the day each one runs out.' },
]

export function YourPapers({ standalone = false }: { standalone?: boolean }) {
  const [rows, setRows] = useState<PaperRow[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [fileUrl, setFileUrl] = useState<Record<string, string>>({})
  const [said, setSaid] = useState<string | null>(null)
  const [refused, setRefused] = useState<{ id: string; says: string } | null>(null)
  const [picked, setPicked] = useState<Record<string, File>>({})

  const load = useCallback(async () => {
    setFailed(null)
    try {
      const j = await readJson(await fetch('/api/me/papers'))
      setRows(paperRows(j?.data ?? {}))
    } catch (e: any) {
      // A page that cannot read its own file says so. An empty list here
      // would tell somebody she owes nothing, which is the one wrong
      // answer that costs her a start.
      setRows(null)
      setFailed(e?.message || 'Your paperwork could not be loaded just now. Try again in a moment.')
    }
  }, [])
  useEffect(() => { load() }, [load])

  const post = (url: string, body: unknown) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  async function answer(r: PaperRow) {
    setBusy(r.id)
    setSaid(null)
    setRefused(null)
    try {
      // Nobody has opened a request for this one, so the first press
      // opens it and the second half of the same press sends the file.
      // A refusal here — a document nobody is asking her for — lands on
      // the page as the route's own sentence and stops before any file
      // is sent anywhere.
      let id = r.askId ?? (r.id.startsWith('owed:') ? null : r.id)
      if (!id && r.openAskAt && r.documentTypeKey) {
        const opened = await readJson(await post(r.openAskAt, { documentTypeKey: r.documentTypeKey }))
        id = opened?.data?.askId ?? null
        if (!id) throw new Error('Nothing came back to send it to. Try again in a moment.')
      }
      if (!id) throw new Error('There is nowhere to send this one yet.')

      const to = `/api/documents/${id}/${r.todo === 'sign' ? 'sign' : 'upload'}`

      // She chose a file. Try the file itself first — a photograph of a
      // certificate is what somebody actually has — and where the door
      // will not take bytes yet, say the true thing rather than fail
      // quietly. The link beside it still works.
      const file = picked[r.id]
      if (file && r.todo !== 'sign') {
        const form = new FormData()
        form.append('file', file)
        form.append('fileName', file.name)
        const res = await fetch(to, { method: 'POST', body: form })
        if (!res.ok) {
          setRefused({ id: r.id, says: FILE_NOT_TAKEN_YET })
          return
        }
        const sent = await readJson(res)
        setSaid(sent?.data?.says ?? 'Sent. They will be told it has arrived.')
        setPicked({ ...picked, [r.id]: undefined as unknown as File })
        await load()
        return
      }

      const body = r.todo === 'sign'
        ? { attests: true }
        : { fileUrl: fileUrl[r.id] ?? '', fileName: file?.name ?? undefined }
      const j = await readJson(await post(to, body))
      setSaid(j?.data?.says ?? 'Sent. They will be told it has arrived.')
      setFileUrl({ ...fileUrl, [r.id]: '' })
      await load()
    } catch (e: any) {
      // A refusal is a sentence about this row, beside this row, and not
      // a green line at the top of the page pretending something worked.
      setRefused({ id: r.id, says: e?.message || 'That did not go through.' })
    } finally {
      setBusy(null)
    }
  }

  const Wrapper = standalone ? 'div' : 'section'

  // ── Loading ───────────────────────────────────────────────────────
  if (rows === null && !failed) {
    return (
      <Wrapper id="paperwork" className="mb-8">
        <h2 className="font-serif text-lg text-etyme-ink mb-1">Your paperwork</h2>
        <p className="text-sm text-etyme-muted">Reading your file…</p>
      </Wrapper>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────
  if (failed) {
    return (
      <Wrapper id="paperwork" className="mb-8">
        <h2 className="font-serif text-lg text-etyme-ink mb-1">Your paperwork</h2>
        <p className="text-sm text-etyme-attention mb-3">{failed}</p>
        <button onClick={load} className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium">
          Try again
        </button>
      </Wrapper>
    )
  }

  const all = rows ?? []
  const todo = outstanding(all)
  const headline = paperworkHeadline(all)

  return (
    <Wrapper id="paperwork" className="mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        {/* On its own page the h1 above already says it; a second
            heading with the same words reads as two sections. */}
        {!standalone && <h2 className="font-serif text-lg text-etyme-ink">Your paperwork</h2>}
        {!standalone && (
          <a href="/dashboard/my-work/paperwork" className="text-sm text-etyme-action hover:underline">
            Open your paperwork
          </a>
        )}
      </div>
      <p className="text-sm text-etyme-muted mb-2">
        Everything on your file, with the day each one runs out, and what is still being asked of you.
      </p>
      {/* The sentence that was missing: she is told where she stands
          before she reads a single row. */}
      <p className={`text-sm mb-3 ${todo.length ? 'text-etyme-attention' : 'text-etyme-muted'}`}>{headline}</p>

      {said && <p className="mb-2 text-sm text-etyme-verified">{said}</p>}

      {/* ── Empty ───────────────────────────────────────────────────
          Nothing on file and nothing owed. Said, not shown as a blank
          list under a promise. */}
      {all.length === 0 && (
        <div className="bg-etyme-surface border border-etyme-rule rounded-lg p-5 text-sm text-etyme-muted">
          Nothing has been asked of you and nothing is on your file yet. When a placement needs a
          document from you, it appears here and you will be told.
        </div>
      )}

      {GROUPS.map((g) => {
        const group = all.filter((r) => r.kind === g.kind)
        if (group.length === 0) return null
        return (
          <div key={g.kind} className="mb-5">
            <div className="text-[10px] uppercase tracking-[0.12em] text-etyme-faint font-medium mb-1">{g.title}</div>
            <p className="text-xs text-etyme-muted mb-2">{g.blurb}</p>
            <div className={`bg-etyme-surface border rounded-lg divide-y divide-etyme-rule ${
              g.kind === 'OWED' && group.some((r) => !r.waived) ? 'border-etyme-attention/30' : 'border-etyme-rule'
            }`}>
              {group.map((r) => (
                <div key={`${r.kind}:${r.id}`} className="p-4 flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <div className="text-etyme-ink flex items-center gap-2">
                      {r.name}
                      <Chip tone={toneFor(r)}>{r.word}</Chip>
                    </div>
                    {/* Who asked for it, in their own words. A worker who
                        does not know who wants a document cannot send it
                        to anybody. */}
                    {r.from && <div className="text-xs text-etyme-muted mt-1">{r.from}</div>}
                    {!r.from && r.askedBy && <div className="text-xs text-etyme-muted mt-1">{r.askedBy}</div>}
                    {/* What happens if it does not arrive, in a sentence. */}
                    {r.consequence && (
                      <div className={`text-xs mt-1 ${r.stopsWork && !r.waived && !r.awaiting ? 'text-etyme-attention' : 'text-etyme-muted'}`}>
                        {r.consequence}
                      </div>
                    )}
                    {refused?.id === r.id && (
                      <div className="text-xs text-etyme-attention mt-1">{refused.says}</div>
                    )}
                  </div>

                  {r.todo === 'open' && r.link && (
                    <a href={r.link}
                      className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90">
                      Answer it
                    </a>
                  )}
                  {r.todo === 'upload' && (
                    <div className="flex flex-col gap-2 min-w-[260px]">
                      {/* The first way, and the one somebody standing in
                          a hospital corridor actually has: the photo on
                          her phone. */}
                      <label className="text-xs text-etyme-muted">
                        Take a photo or choose a file
                        <input
                          type="file"
                          accept="image/*,application/pdf,.doc,.docx"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) setPicked({ ...picked, [r.id]: f })
                          }}
                          className="mt-1 block w-full text-sm text-etyme-ink file:mr-3 file:px-3 file:py-2 file:rounded file:border-0 file:text-sm file:font-medium file:bg-etyme-action file:text-white"
                        />
                      </label>
                      {/* The second way, and the one that works today. */}
                      <label className="text-xs text-etyme-muted">
                        Or paste a link to it
                        <input
                          value={fileUrl[r.id] ?? ''}
                          onChange={(e) => setFileUrl({ ...fileUrl, [r.id]: e.target.value })}
                          placeholder="https://…"
                          className="mt-1 block w-full border border-etyme-rule rounded px-3 py-2 text-sm bg-etyme-raised"
                        />
                      </label>
                      <button onClick={() => answer(r)}
                        disabled={busy === r.id || (!picked[r.id] && !(fileUrl[r.id] ?? '').trim())}
                        className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
                        {busy === r.id ? 'Sending…' : 'Send it in'}
                      </button>
                    </div>
                  )}
                  {r.todo === 'sign' && (
                    <button onClick={() => answer(r)} disabled={busy === r.id}
                      className="px-4 py-2 bg-etyme-action text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50">
                      Sign as myself
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </Wrapper>
  )
}
