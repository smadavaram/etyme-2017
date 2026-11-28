'use client'

import { useRef, useState } from 'react'
import {
  COURSE_DOOR_ENDPOINT, DOOR_ANSWERS, DOOR_WORDS, CONSENT_LINE, GUARDIAN_LINE, IT_TRACK_NAME, courseDoorBody,
  type DoorLabel,
} from '@/lib/public-site/course-door-page'
import s from './door.module.css'

/**
 * "What are you?", then an address, then one plain sentence. One action
 * a screen: the four answers, then the email, then the thanks. Calls the
 * course door's own route as docs/course-door-lead-contract.md says; the route, not
 * this form, decides the track.
 */
export function DoorForm() {
  const [who, setWho] = useState<DoorLabel | null>(null)
  const [inIT, setInIT] = useState(false)
  const [email, setEmail] = useState('')
  const [yes, setYes] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const shown = useRef(Date.now())
  const trap = useRef<HTMLInputElement>(null)

  const chosen = DOOR_ANSWERS.find((a) => a.label === who) ?? null
  const track = chosen ? (who === 'Worker' && inIT ? IT_TRACK_NAME : chosen.track) : null

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!who || busy) return
    setBusy(true)
    setSaid(null)
    try {
      const r = await fetch(COURSE_DOOR_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(courseDoorBody({
          who, email, yes, inIT, trap: trap.current?.value ?? '', filledInMs: Date.now() - shown.current,
        })),
      })
      const j = (await r.json().catch(() => null)) as { data?: { says?: string }; error?: { message?: string } } | null
      if (r.ok) { setDone(j?.data?.says ?? DOOR_WORDS.doneOpens); return }
      setSaid(j?.error?.message ?? 'That did not go through. Nothing was saved. Try again in a minute.')
    } catch {
      setSaid('That did not go through. Nothing was saved. Try again in a minute.')
    } finally {
      setBusy(false)
    }
  }

  if (done !== null) {
    return (
      <div className={s.panel} role="status">
        <h3 className={s.h3}>{DOOR_WORDS.doneHeading}</h3>
        <p className={s.p}>{done}</p>
        <p className={s.p}>{DOOR_WORDS.doneOpens}</p>
      </div>
    )
  }

  if (!who) {
    return (
      <fieldset className={s.panel}>
        <legend className={s.h3}>{DOOR_WORDS.askHeading}</legend>
        <p className={s.p}>{DOOR_WORDS.askHint}</p>
        <div className={s.answers}>
          {DOOR_ANSWERS.map((a) => (
            <button key={a.label} type="button" className={s.answer} onClick={() => setWho(a.label)}>
              <span className={s.answerName}>{a.label}</span>
              <span className={s.answerLine}>{a.line}</span>
            </button>
          ))}
        </div>
      </fieldset>
    )
  }

  const kid = who === 'Kid'
  return (
    <form className={s.panel} onSubmit={send} noValidate>
      <h3 className={s.h3}>{who}</h3>
      <p className={s.p}>You start at: <strong>{track}</strong></p>
      {who === 'Worker' && (
        <label className={s.check}>
          <input type="checkbox" checked={inIT} onChange={(e) => setInIT(e.target.checked)} />
          <span>{DOOR_WORDS.itSwitch}</span>
        </label>
      )}
      <label className={s.label} htmlFor="door-email">{kid ? DOOR_WORDS.guardianEmailLabel : DOOR_WORDS.emailLabel}</label>
      <input id="door-email" className={s.input} type="email" autoComplete="email" inputMode="email" required
        value={email} onChange={(e) => setEmail(e.target.value)} />
      {kid && <p className={s.small}>{GUARDIAN_LINE}</p>}
      <label className={s.check}>
        <input type="checkbox" checked={yes} onChange={(e) => setYes(e.target.checked)} />
        <span>{CONSENT_LINE}</span>
      </label>
      {/* A box only a script fills in. */}
      <input ref={trap} name="company_website" tabIndex={-1} autoComplete="off" aria-hidden="true" className={s.trap} />
      {said && <p className={s.said} role="alert">{said}</p>}
      <button type="submit" className={s.primary} disabled={busy}>{busy ? 'Sending' : DOOR_WORDS.send}</button>
      <button type="button" className={s.link} onClick={() => { setWho(null); setSaid(null) }}>{DOOR_WORDS.back}</button>
    </form>
  )
}
