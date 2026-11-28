'use client'
import { useEffect, useRef, useState } from 'react'
import { clock, framesOf, nextFrame, playsInPage, FRAME_HOLD_MS, type LessonVideoView } from '@/lib/training/video'
import { videoSlotWords } from '@/lib/training/courses/shape'

const STEP_WORDS: Record<string, string> = { intro: 'Intro', example: 'Example', 'try-it': 'Try it', exercise: 'Exercise' }

/** True while the visitor asks for less motion. Starts true, so nothing moves before the browser has answered. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(m.matches)
    const on = () => setReduced(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return reduced
}

/**
 * The lesson's video and its animation. The link is opened by the learner's
 * own browser (nothing is fetched by the server). Each step of the lesson
 * may be tied to a span of the video; the frames play one after another,
 * each fading in over 200 ms. Under reduced motion nothing plays by itself
 * and nothing fades: every frame is simply listed, in order.
 */
export function VideoSlot({ video }: { video: LessonVideoView | null }) {
  const ref = useRef<HTMLVideoElement>(null)
  const reduced = useReducedMotion()
  const frames = framesOf(video)
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing || reduced || frames.length < 2) return
    const t = setInterval(() => setI((n) => nextFrame(n, frames.length)), FRAME_HOLD_MS)
    return () => clearInterval(t)
  }, [playing, reduced, frames.length])

  if (!video) return <div className="learn-video mt-4" data-video>{videoSlotWords(null)}</div>
  const inPage = playsInPage(video.sourceUrl)
  const seek = (a: number) => { const v = ref.current; if (v) { v.currentTime = a; void v.play() } }
  const start = video.startSec ?? 0
  return (
    <div className="learn-video mt-4" data-video data-anchored>
      {inPage
        ? <video ref={ref} controls preload="none" style={{ width: '100%', borderRadius: 8 }} src={`${video.sourceUrl}#t=${start}${video.endSec ? `,${video.endSec}` : ''}`} />
        : <a className="underline" href={video.sourceUrl} target="_blank" rel="noopener noreferrer">Watch the video{video.startSec != null ? ` (from ${clock(start)}${video.endSec ? ` to ${clock(video.endSec)}` : ''})` : ''}</a>}
      {video.steps.length > 0 && (
        <ul className="mt-2 text-sm" data-video-steps>
          {video.steps.map((s) => (
            <li key={s.step}>
              {inPage ? <button className="underline" onClick={() => seek(s.startSec)}>{STEP_WORDS[s.step]}: {clock(s.startSec)} to {clock(s.endSec)}</button> : <span>{STEP_WORDS[s.step]}: {clock(s.startSec)} to {clock(s.endSec)}</span>}
            </li>
          ))}
        </ul>
      )}
      {frames.length > 0 && (reduced
        ? <ol className="mt-3 list-decimal pl-5 text-sm" data-frames="static">{frames.map((f, n) => <li key={n}>{STEP_WORDS[f.step]}: {f.text}</li>)}</ol>
        : (
          <div className="mt-3" data-frames="animated">
            <p key={i} className="learn-fade" aria-live="polite" data-frame={i}>{STEP_WORDS[frames[i].step]}: {frames[i].text}</p>
            <div className="mt-1 flex gap-3 text-sm">
              <button className="underline" onClick={() => setI((n) => (n + frames.length - 1) % frames.length)}>Back</button>
              <button className="underline" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play the steps'}</button>
              <button className="underline" onClick={() => setI((n) => nextFrame(n, frames.length))}>Next</button>
              <span className="tabular-nums" style={{ color: '#6B6862' }}>{i + 1} of {frames.length}</span>
            </div>
          </div>
        ))}
    </div>
  )
}
