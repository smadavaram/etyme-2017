import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { isCalendarDate, cleanDues, dueLine, dayWords } from '@/lib/training/due'
import { cleanVideo, cleanLink, readVideo, framesOf, nextFrame, playsInPage, clock, FRAME_FADE_MS, FRAME_HOLD_MS, LESSON_STEPS } from '@/lib/training/video'
import { mayShowCredential, addToProfileUrl, newVerificationCode, ADD_TO_PROFILE_PARAMS, credentialPath, credentialCourseTitle } from '@/lib/training/credential'

const root = process.cwd()
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e)
    if (statSync(f).isDirectory()) walk(f, out); else if (/\.tsx?$/.test(e)) out.push(f)
  }
  return out
}
const src = (f: string) => readFileSync(f, 'utf8')

describe('what is due on a learner’s path', () => {
  const titles = { a: 'Your first prompt', b: 'Asking again' }
  const live = { state: 'ACTIVE', steps: ['a', 'b'], titles, today: '2026-12-01' }
  it('a path with no dates says nothing is due', () => {
    expect(dueLine({ ...live, dues: null, done: [] }).text).toBe('Nothing is due.')
    expect(dueLine({ ...live, dues: { dueOn: null, stepDues: null }, done: [] }).text).toBe('Nothing is due.')
  })
  it('the nearest open date is the one she reads, naming the lesson', () => {
    const r = dueLine({ ...live, dues: { dueOn: '2026-12-20', stepDues: { a: '2026-12-04', b: '2026-12-10' } }, done: [] })
    expect(r).toMatchObject({ text: 'Your first prompt is due Dec 4.', overdue: false, on: '2026-12-04' })
  })
  it('a lesson she has finished no longer owes its date, and the next one does', () => {
    const r = dueLine({ ...live, dues: { dueOn: '2026-12-20', stepDues: { a: '2026-12-04', b: '2026-12-10' } }, done: ['a'] })
    expect(r.text).toBe('Asking again is due Dec 10.')
  })
  it('a date in the past reads as overdue, in words', () => {
    const r = dueLine({ ...live, today: '2026-12-05', dues: { dueOn: null, stepDues: { a: '2026-12-04' } }, done: [] })
    expect(r).toMatchObject({ overdue: true, text: 'Overdue: Your first prompt was due Dec 4.' })
  })
  it('the whole path’s date is owed while any lesson is open and not after the last is done', () => {
    expect(dueLine({ ...live, dues: { dueOn: '2026-12-20', stepDues: null }, done: [] }).text).toBe('Your whole path is due Dec 20.')
    expect(dueLine({ ...live, dues: { dueOn: '2026-12-20', stepDues: null }, done: ['a', 'b'] }).text).toBe('Nothing is due.')
  })
  it('a finished path owes nothing whatever its dates say', () => {
    expect(dueLine({ ...live, state: 'COMPLETE', dues: { dueOn: '2026-12-20', stepDues: null }, done: [] }).text).toBe('Nothing is due.')
  })
  it('a real calendar day is accepted and an impossible one is refused', () => {
    expect(isCalendarDate('2026-12-04')).toBe(true)
    expect(isCalendarDate('2026-02-30')).toBe(false)
    expect(isCalendarDate('12/04/2026')).toBe(false)
    expect(dayWords('2026-01-09')).toBe('Jan 9')
  })
  it('a date for a lesson that is not on the path is refused in a sentence', () => {
    const r = cleanDues({ stepDues: { zzz: '2026-12-04' }, steps: ['a'] })
    expect(r).toMatchObject({ ok: false, field: 'stepDues' })
  })
  it('a lesson cannot be due after the whole path is', () => {
    const r = cleanDues({ dueOn: '2026-12-01', stepDues: { a: '2026-12-09' }, steps: ['a'] })
    expect(r).toMatchObject({ ok: false, message: 'A lesson cannot be due after the whole path is.' })
  })
  it('sending nothing leaves the dates as they are, and sending null clears them', () => {
    expect(cleanDues({ steps: ['a'] })).toEqual({ ok: true, dueOn: undefined, stepDues: undefined })
    expect(cleanDues({ dueOn: null, stepDues: null, steps: ['a'] })).toEqual({ ok: true, dueOn: null, stepDues: null })
  })
})

describe('a lesson anchored to a video', () => {
  const ok = { sourceUrl: 'https://videos.example/clip.mp4', startSec: 10, endSec: 200, steps: [{ step: 'intro', startSec: 10, endSec: 60 }, { step: 'example', startSec: 60, endSec: 120 }], frames: [{ step: 'intro', text: 'Say what you want.' }, { step: 'example', text: 'Read the answer.' }] }
  it('a link with a span, step spans and frames is read whole', () => {
    const r = cleanVideo(ok)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.video.steps).toHaveLength(2)
  })
  it('only a plain https link is taken, with no password in it', () => {
    expect(cleanLink('http://videos.example/a.mp4')).toBeNull()
    expect(cleanLink('https://user:pw@videos.example/a.mp4')).toBeNull()
    expect(cleanLink('javascript:alert(1)')).toBeNull()
    expect(cleanLink('not a link')).toBeNull()
  })
  it('a stored file is refused in a sentence, because no storage exists to hold it', () => {
    expect(cleanVideo({ ...ok, storedFileId: 'f1' })).toMatchObject({ ok: false, field: 'storedFileId' })
  })
  it('a step that sits outside the chosen span is refused', () => {
    expect(cleanVideo({ ...ok, steps: [{ step: 'intro', startSec: 0, endSec: 30 }] })).toMatchObject({ ok: false, field: 'steps' })
  })
  it('a step that ends before it starts, or is named twice, or is not a step of a lesson, is refused', () => {
    expect(cleanVideo({ ...ok, steps: [{ step: 'intro', startSec: 50, endSec: 40 }] })).toMatchObject({ ok: false })
    expect(cleanVideo({ ...ok, steps: [{ step: 'intro', startSec: 10, endSec: 20 }, { step: 'intro', startSec: 30, endSec: 40 }] })).toMatchObject({ ok: false })
    expect(cleanVideo({ ...ok, steps: [{ step: 'lunch', startSec: 10, endSec: 20 }] })).toMatchObject({ ok: false })
  })
  it('an end before the start is refused', () => {
    expect(cleanVideo({ sourceUrl: ok.sourceUrl, startSec: 50, endSec: 20 })).toMatchObject({ ok: false, field: 'endSec' })
  })
  it('a frame is one short line for one step, and at most twelve of them', () => {
    expect(cleanVideo({ ...ok, frames: [{ step: 'intro', text: '' }] })).toMatchObject({ ok: false, field: 'frames' })
    expect(cleanVideo({ ...ok, frames: [{ step: 'intro', text: Array(40).fill('word').join(' ') }] })).toMatchObject({ ok: false })
    expect(cleanVideo({ ...ok, frames: Array(13).fill({ step: 'intro', text: 'x' }) })).toMatchObject({ ok: false })
  })
  it('the animation fades in within 150 to 300 ms and a frame stays long enough to read', () => {
    expect(FRAME_FADE_MS).toBeGreaterThanOrEqual(150)
    expect(FRAME_FADE_MS).toBeLessThanOrEqual(300)
    expect(FRAME_HOLD_MS).toBeGreaterThanOrEqual(1500)
  })
  it('the frames step forward in order and wrap to the first', () => {
    expect(nextFrame(0, 3)).toBe(1)
    expect(nextFrame(2, 3)).toBe(0)
    expect(nextFrame(0, 0)).toBe(0)
    expect(framesOf(readVideo({ sourceUrl: ok.sourceUrl, startSec: 10, endSec: 200, steps: ok.steps, frames: ok.frames }), 'example')).toEqual([{ step: 'example', text: 'Read the answer.' }])
  })
  it('a stored row that no longer fits still reads as a link, never as a crash', () => {
    expect(readVideo({ sourceUrl: ok.sourceUrl, startSec: null, endSec: null, steps: 'garbage', frames: 7 })).toMatchObject({ sourceUrl: ok.sourceUrl, steps: [], frames: [] })
    expect(readVideo(null)).toBeNull()
  })
  it('a direct video file plays in the page and any other link opens as a link', () => {
    expect(playsInPage('https://v.example/a.mp4?x=1')).toBe(true)
    expect(playsInPage('https://v.example/watch?id=1')).toBe(false)
    expect(clock(75)).toBe('1:15')
    expect(LESSON_STEPS).toEqual(['intro', 'example', 'try-it', 'exercise'])
  })
  it('the animation slot draws every frame as a still list under reduced motion and plays nothing by itself', () => {
    const code = src(join(root, 'src/app/learn/_components/video-slot.tsx'))
    expect(code).toContain("prefers-reduced-motion: reduce")
    expect(code).toContain('data-frames="static"')
    expect(code).toMatch(/useState\(true\)/)
    expect(code).toMatch(/if \(!playing \|\| reduced/)
    expect(src(join(root, 'src/app/learn/learn.css'))).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/)
  })
  it('no server code under the learning site fetches a video link, so no third party is called from the server', () => {
    const server = [...walk(join(root, 'src/lib/training')), ...walk(join(root, 'src/app/api/learn')), ...walk(join(root, 'src/app/learn'))].filter((f) => !/_components/.test(f))
    for (const f of server) expect(src(f), f).not.toMatch(/\bfetch\(|axios|undici|node-fetch|https?\.get\(|XMLHttpRequest/)
  })
})

describe('the public credential page', () => {
  const shown = { companyId: 'c1', shownAt: new Date(), revokedAt: null }
  const base = { pluginOn: true, row: shown, tenantId: 'c1', enrollmentStatus: 'COMPLETED' }
  it('is shown for a completed course with her yes and no revoke, at the firm that issued it', () => {
    expect(mayShowCredential(base)).toEqual({ ok: true })
  })
  it('is refused where no id matches the record', () => {
    expect(mayShowCredential({ ...base, row: null })).toEqual({ ok: false, reason: 'NO_SUCH_CODE' })
  })
  it('is refused at another firm’s address even with the right id', () => {
    expect(mayShowCredential({ ...base, tenantId: 'c2' })).toEqual({ ok: false, reason: 'OTHER_FIRM' })
  })
  it('is refused until the course is complete', () => {
    expect(mayShowCredential({ ...base, enrollmentStatus: 'IN_PROGRESS' })).toEqual({ ok: false, reason: 'NOT_COMPLETE' })
  })
  it('is refused before her yes', () => {
    expect(mayShowCredential({ ...base, row: { ...shown, shownAt: null } })).toEqual({ ok: false, reason: 'NOT_SHOWN' })
  })
  it('is refused once she has taken it down', () => {
    expect(mayShowCredential({ ...base, row: { ...shown, revokedAt: new Date() } })).toEqual({ ok: false, reason: 'REVOKED' })
  })
  it('is refused while the firm’s plugin is off', () => {
    expect(mayShowCredential({ ...base, pluginOn: false })).toEqual({ ok: false, reason: 'PLUGIN_OFF' })
  })
  it('the verification id is long, random and never repeats', () => {
    const a = newVerificationCode(), b = newVerificationCode()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(20)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
  })
  it('the add-to-profile link is a plain address carrying only the documented certification fields', () => {
    const url = new URL(addToProfileUrl({ courseName: 'Working in the AI era', issuer: 'A Firm', issuedAt: new Date('2026-12-14T10:00:00Z'), certUrl: 'https://x.example/learn/a/credential/abc', certId: 'abc' }))
    expect(url.protocol).toBe('https:')
    expect([...url.searchParams.keys()].sort()).toEqual([...ADD_TO_PROFILE_PARAMS].sort())
    expect(url.searchParams.get('issueYear')).toBe('2026')
    expect(url.searchParams.get('issueMonth')).toBe('12')
    expect(url.searchParams.get('certId')).toBe('abc')
  })
  it('the public page address names the firm and the id', () => {
    expect(credentialPath('tapin', 'abc')).toBe('/learn/tapin/credential/abc')
  })
  it('nothing in the credential files calls out to the network: the link is only drawn, never fetched', () => {
    for (const f of ['src/lib/training/credential.ts', 'src/app/learn/[tenant]/credential/[id]/page.tsx', 'src/app/api/learn/[tenant]/credential/route.ts']) expect(src(join(root, f)), f).not.toMatch(/\bfetch\(|axios/)
  })
  it('the page is kept out of search engines and shows no price, rate or other firm', () => {
    const page = src(join(root, 'src/app/learn/[tenant]/credential/[id]/page.tsx'))
    expect(page).toContain('index: false')
    expect(page).not.toMatch(/rate|price|bench/i)
  })
})

describe('the credential page and the footer on a firm’s learning site', () => {
  const page = () => src(join(root, 'src/app/learn/[tenant]/credential/[id]/page.tsx'))
  it('the credential page prints its date through the one date formatter', () => {
    expect(page()).toContain("from '@/lib/format-date'")
    expect(page()).not.toContain('toLocaleDateString')
  })
  it('the credential page stacks its facts on a phone and splits them at sm', () => {
    expect(page()).toContain('grid-cols-1 sm:grid-cols-[120px_1fr]')
    expect(page()).not.toMatch(/className="[^"]*(?<!sm:)grid-cols-\[120px_1fr\]/)
  })
  it('another firm’s name is cut out of the course title on the page of the firm that issued it', () => {
    expect(credentialCourseTitle('Working in the AI era — Tapin onboarding', ['Tapin'], 'Acme Staffing')).toBe('Working in the AI era — onboarding')
  })
  it('the course title is left as written where the issuer is the creator', () => {
    expect(credentialCourseTitle('Working in the AI era — Tapin onboarding', ['Tapin'], 'Tapin')).toBe('Working in the AI era — Tapin onboarding')
  })
  it('a creator’s name inside a longer word is not cut', () => {
    expect(credentialCourseTitle('Tapinade basics', ['Tapin'], 'Acme')).toBe('Tapinade basics')
  })
  it('a title that is only the creator’s name is kept rather than printed empty', () => {
    expect(credentialCourseTitle('Tapin', ['Tapin'], 'Acme')).toBe('Tapin')
  })
  it('the credential page title is the course and the track, and the issuer is on its own line', () => {
    expect(page()).toContain("{v.courseTitle}{v.trackTitle ? ` — ${v.trackTitle}` : ''}")
    expect(page()).toContain('Issued by')
    expect(page()).not.toContain('finished this course at')
  })
  it('the footer says progress stays in this browser only to a visitor who is not signed in', () => {
    const layout = src(join(root, 'src/app/learn/[tenant]/layout.tsx'))
    expect(layout).not.toContain('stays in this browser')
    expect(layout).toContain('<VisitorNote')
    const note = src(join(root, 'src/app/learn/_components/visitor-note.tsx'))
    expect(note).toContain('stays in this browser until you sign in')
    expect(note).toMatch(/!r\.ok/)
  })
})
