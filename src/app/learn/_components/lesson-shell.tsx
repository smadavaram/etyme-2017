'use client'
import { useState } from 'react'
import type { Track } from '@/lib/training/courses/types'
import { evaluateTryIt, checkExercise, type TryResult } from '@/lib/training/courses/try-it'
import type { LessonVideoView } from '@/lib/training/video'
import { percentDone } from '@/lib/training/learn-progress'
import { useProgress } from './use-progress'
import { JoinPanel } from './join-panel'
import { VideoSlot } from './video-slot'
import { CredentialPanel } from './credential-panel'

type Props = { tenant: string; firm: string; version: string; track: Track; lessonKey: string; video?: LessonVideoView | null }

/** One lesson per screen, with its track's chapters beside it (a drawer on a phone). */
export function LessonShell({ tenant, firm, version, track, lessonKey, video = null }: Props) {
  const flat = track.levels.flatMap((lv) => lv.chapters.flatMap((ch) => ch.lessons.map((l) => ({ l, level: lv.title, chapter: ch.title }))))
  const keys = flat.map((f) => f.l.key)
  const i = keys.indexOf(lessonKey)
  const cur = flat[i]
  const { progress, signedIn, finish, tick } = useProgress(tenant, track.key, keys)
  const pct = percentDone(progress, keys)
  const prev = i > 0 ? keys[i - 1] : null
  const next = i < keys.length - 1 ? keys[i + 1] : null
  const href = (k: string) => `/learn/${tenant}/${track.key}/${k}`
  const complete = keys.length > 0 && keys.every((k) => progress.done.includes(k))

  const Nav = ({ pos }: { pos: string }) => (
    <div className="flex justify-between my-4" data-pos={pos}>
      {prev ? <a className="underline" href={href(prev)}>Previous</a> : <span />}
      {next ? <a className="underline" href={href(next)}>Next</a> : <span />}
    </div>
  )

  const side = (
    <>
          <p className="tabular-nums" style={{ color: '#6B6862' }}>{version}</p>
          <p className="font-semibold mt-1">{track.title}</p>
          <div className="learn-bar my-2 hidden md:block"><span style={{ width: `${pct}%` }} /></div>
          <p className="tabular-nums mb-2" style={{ color: '#6B6862' }}>{pct}% done</p>
          {track.levels.map((lv) => (
            <div key={lv.key} className="mt-3">
              <p className="font-semibold">{lv.title}</p>
              {lv.chapters.map((ch) => (
                <div key={ch.key} className="mt-1">
                  <p style={{ color: '#6B6862' }}>{ch.title}</p>
                  <ul>
                    {ch.lessons.map((l) => (
                      <li key={l.key}>
                        <a href={href(l.key)} aria-current={l.key === lessonKey ? 'page' : undefined} className={l.key === lessonKey ? 'font-semibold' : ''} style={l.key === lessonKey ? { color: 'var(--learn-accent)' } : undefined}>
                          {progress.done.includes(l.key) ? '✓ ' : l.key === lessonKey ? '● ' : '○ '}{l.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
    </>
  )

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <div className="md:hidden sticky top-0 z-10 bg-[#F0EEE6] py-2" aria-label="Progress">
        <div className="learn-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>
      </div>
      <aside className="text-sm">
        <details className="md:hidden">
          <summary className="cursor-pointer font-semibold py-2">Chapters</summary>
          {side}
        </details>
        <div className="hidden md:block">{side}</div>
      </aside>
      <article>
        {cur && <Lesson key={cur.l.key} video={video} lesson={cur.l} label={`${cur.level} · ${cur.chapter}`} Nav={Nav} onRight={() => finish(cur.l.key)} done={progress.done.includes(cur.l.key)} />}
        {track.levels.map((lv) => (
          <details key={lv.key} className="mt-4 learn-example">
            <summary className="cursor-pointer font-semibold">Project: {lv.project.title}</summary>
            <ul className="mt-2 space-y-1">
              {lv.project.checklist.map((item) => {
                const on = (progress.ticks[lv.project.key] ?? []).includes(item)
                return <li key={item}><label><input type="checkbox" checked={on} onChange={(e) => tick(lv.project.key, item, e.target.checked)} /> {item}</label></li>
              })}
            </ul>
          </details>
        ))}
        {complete && (
          <>
            <div className="mt-6"><h2 className="text-lg font-semibold">What you are now good at</h2><ul className="list-disc pl-5">{track.goodAt.map((g) => <li key={g}>{g}</li>)}</ul></div>
            {track.recap && <div className="mt-4"><h2 className="text-lg font-semibold">What you did</h2><ul className="list-disc pl-5">{track.recap.map((r) => <li key={r.goodAt}><strong>{r.goodAt}.</strong> {r.youDid}</li>)}</ul></div>}
            {signedIn && <CredentialPanel tenant={tenant} track={track.key} />}
            <JoinPanel tenant={tenant} firm={firm} signedIn={signedIn} />
          </>
        )}
      </article>
    </div>
  )
}

function Lesson({ lesson: l, label, Nav, onRight, done, video }: { video: LessonVideoView | null; lesson: Track['levels'][0]['chapters'][0]['lessons'][0]; label: string; Nav: (p: { pos: string }) => JSX.Element; onRight: () => void; done: boolean }) {
  const [input, setInput] = useState(l.tryIt.starter)
  const [result, setResult] = useState<TryResult | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const ex = picked == null ? null : checkExercise(l, picked)
  return (
    <div>
      <p className="text-sm" style={{ color: '#6B6862' }}>{label}</p>
      <Nav pos="top" />
      <h1 className="text-2xl mb-2" style={{ fontFamily: "'Iowan Old Style', Palatino, Georgia, serif" }}>{l.title}</h1>
      <p className="max-w-prose">{l.intro}</p>
      <VideoSlot video={video} />
      <h2 className="text-lg font-semibold mt-6 mb-2">Example</h2>
      <div className="learn-example"><p className={l.example.mono ? 'learn-mono' : ''}>{l.example.text}</p></div>
      <h2 className="text-lg font-semibold mt-6 mb-2">Try it Yourself</h2>
      <div className="learn-try">
        <p className="mb-2">{l.tryIt.prompt}</p>
        <textarea aria-label="Your text" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="learn-run mt-2" onClick={() => setResult(evaluateTryIt(l, input))}>Run</button>
        <div className="learn-out mt-3" aria-live="polite">
          {result && (
            <div className="learn-fade">
              <p className="font-semibold">{result.output}</p>
              <ul className="mt-1 space-y-1">{result.lines.map((ln) => <li key={ln.text} className={ln.ok ? 'learn-ok' : 'learn-no'}>{ln.ok ? 'Yes: ' : 'Not yet: '}{ln.text}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
      <h2 className="text-lg font-semibold mt-6 mb-2">Exercise</h2>
      <p>{l.exercise.question}</p>
      {l.exercise.choices.map((c, n) => (
        <button key={c} className="learn-choice" onClick={() => { setPicked(n); if (checkExercise(l, n).right && !done) onRight() }}>{c}</button>
      ))}
      <div className="mt-3 min-h-[44px]" aria-live="polite">
        {ex && <p className={`learn-fade ${ex.right ? 'learn-ok' : 'learn-no'}`}>{ex.right ? 'Right. ' : 'Not quite. '}{ex.reason}</p>}
      </div>
      <Nav pos="bottom" />
    </div>
  )
}
