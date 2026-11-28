/**
 * The free training door's page (Etyme's own door, Pax's ruling of
 * 2026-11-28): the tiles, the four answers, and what the page may say.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  DOOR_ANSWERS, DOOR_WORDS, CONSENT_LINE, GUARDIAN_LINE, IT_TRACK_NAME, COURSE_DOOR_PATH, COURSE_DOOR_ENDPOINT,
  WHAT_ARE_YOU_HREF, DOOR_HREF, courseDoorBody,
} from '@/lib/public-site/course-door-page'
import { TRACK_FOR, IT_TRACK, CONSENT_WORDS, GUARDIAN_WORDS, LEAD_TYPES } from '@/lib/public-site/course-door'
import { START_HREF } from '@/lib/nav-table'
import { PUBLIC_PAGES, NOT_MARKETING } from '@/lib/public-site/pages'

const ROOT = process.cwd()
const DIR = 'src/app/(site)/learnai'
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const doorFiles = ['page.tsx', 'door-form.tsx', 'door.module.css'].map((f) => `${DIR}/${f}`)

describe('the free training door: what are you', () => {
  it('the four answers are Worker, Recruiter, Fresher and Kid, as the lead route takes them', () => {
    expect(DOOR_ANSWERS.map((a) => a.label)).toEqual(['Worker', 'Recruiter', 'Fresher', 'Kid'])
    expect(new Set(DOOR_ANSWERS.map((a) => a.label))).toEqual(new Set(LEAD_TYPES))
  })

  it('each answer shows the same track the lead route will give it', () => {
    for (const a of DOOR_ANSWERS) expect(a.track).toBe(TRACK_FOR[a.label])
    expect(IT_TRACK_NAME).toBe(IT_TRACK)
  })

  it('the words beside the tick are the words the lead route checks', () => {
    expect(CONSENT_LINE).toBe(CONSENT_WORDS)
    expect(GUARDIAN_LINE).toBe(GUARDIAN_WORDS)
  })

  it('a visible "I work in IT" switch is offered to a Worker and to nobody else', () => {
    const form = read(`${DIR}/door-form.tsx`)
    expect(DOOR_WORDS.itSwitch).toBe('I work in IT')
    expect(form).toMatch(/who === 'Worker' && \(/)
    expect(read('src/lib/public-site/course-door-page.ts')).toContain("worksInIT: a.who === 'Worker' && a.inIT")
  })

  it('a Kid is asked for a parent or guardian’s address and nothing about the child', () => {
    const form = read(`${DIR}/door-form.tsx`)
    expect(courseDoorBody({ who: 'Kid', email: 'p@home.example', yes: true, inIT: false, trap: '', filledInMs: 4000 }).guardianEmail).toBe(true)
    expect(form).toContain('GUARDIAN_LINE')
    expect(form).not.toMatch(/name="(name|age|school|dob)"/i)
  })
})

describe('the free training door: lead capture and the paused course', () => {
  it('the form sends to the course door route and no other', () => {
    const form = read(`${DIR}/door-form.tsx`)
    expect(COURSE_DOOR_ENDPOINT).toBe('/api/market/course-door')
    expect(form).toContain('COURSE_DOOR_ENDPOINT')
    expect(form).not.toContain('/api/market/leads')
  })

  it('the page says plainly the course is not open and no date is set', () => {
    expect(DOOR_WORDS.paused).toBe('The course is not open yet. We have not set a date for it.')
    expect(read(`${DIR}/page.tsx`)).toContain('DOOR_WORDS.paused')
  })

  it('after capture the page shows only the sentence the route returned, and links to no course', () => {
    const form = read(`${DIR}/door-form.tsx`)
    expect(form).toContain('data?.says')
    expect(form).not.toMatch(/href=|router\.push|\/learn/)
  })

  it('the form, a browser file, imports no server-only file', () => {
    const form = read(`${DIR}/door-form.tsx`)
    expect(form.startsWith("'use client'")).toBe(true)
    expect(form).not.toMatch(/public-site\/course-door'/)
    expect(form).not.toMatch(/from 'crypto'|@\/lib\/db/)
  })

  it('a script’s hidden box and the time on screen travel with the entry', () => {
    const body = courseDoorBody({ who: 'Fresher', email: 'a@work.example', yes: true, inIT: false, trap: '', filledInMs: 4000 })
    expect(Object.keys(body).sort()).toEqual(
      ['company_website', 'consent', 'email', 'filledInMs', 'guardianEmail', 'leadType', 'worksInIT'])
  })

  it('the page body keeps the tick exactly as the visitor left it', () => {
    expect(courseDoorBody({ who: 'Worker', email: 'a@work.example', yes: false, inIT: true, trap: '', filledInMs: 4000 }).consent).toBe(false)
    expect(courseDoorBody({ who: 'Worker', email: 'a@work.example', yes: true, inIT: true, trap: '', filledInMs: 4000 }).worksInIT).toBe(true)
    expect(courseDoorBody({ who: 'Recruiter', email: 'a@work.example', yes: true, inIT: true, trap: '', filledInMs: 4000 }).worksInIT).toBe(false)
  })
})

describe('the free training door: the page itself', () => {
  it('the page is on the list of public pages held to their own test, with its reason, and its file exists', () => {
    const e = NOT_MARKETING.find((x) => x.prefix === `${DIR}/`)
    expect(e?.why).toContain('free training door')
    expect(existsSync(join(ROOT, DIR, 'page.tsx'))).toBe(true)
  })

  it('the Learn section on the door continues into What are you, and the home page’s button goes to the door with no form', () => {
    expect(WHAT_ARE_YOU_HREF).toBe('#what-are-you')
    expect(DOOR_HREF).toBe('/learnai')
    expect(read(`${DIR}/page.tsx`)).toContain('WHAT_ARE_YOU_HREF')
    expect(read(`${DIR}/page.tsx`)).toContain('id="what-are-you"')
  })

  it('the door is served at /learnai, the signed-in setup page is at /setup, and /start is nowhere', () => {
    expect(COURSE_DOOR_PATH).toBe('/learnai')
    expect(START_HREF).toBe('/setup')
    expect(existsSync(join(ROOT, 'src/app/(auth)/setup/page.tsx'))).toBe(true)
    expect(existsSync(join(ROOT, 'src/app/(auth)/start'))).toBe(false)
    expect(existsSync(join(ROOT, 'src/app/(site)/start'))).toBe(false)
    expect(PUBLIC_PAGES.some((x) => x.route === '/start' || x.route === '/learnai')).toBe(false)
  })

  it('/ai-from-zero sends everybody on to /learnai', () => {
    const old = read('src/app/(site)/ai-from-zero/page.tsx')
    expect(old).toContain('redirect(COURSE_DOOR_PATH)')
  })

  it('the edge treats /setup as an app page on a firm’s address and does not name /start or /learnai', () => {
    const mw = read('src/middleware.ts')
    const paths = /const APP_PATHS = \[([^\]]*)\]/.exec(mw)![1]
    expect(paths).toContain("'/setup'")
    expect(paths).not.toContain("'/start'")
    expect(paths).not.toContain("'/learnai'")
  })

  it('the page says nothing about Tapin selling training, and names no price', () => {
    for (const f of doorFiles.slice(0, 2)) expect(read(f), f).not.toMatch(/Tapin|\$\s?\d|per month/i)
  })

  it('the look is Etyme’s own brand kit: cream canvas, serif, Inter, violet, 12px corners, no navy, teal, Sora or Manrope', () => {
    const css = read(`${DIR}/door.module.css`)
    expect(css).toMatch(/--canvas: #F0EEE6/)
    expect(css).toMatch(/--violet: #5228FF/)
    expect(css).toContain('border-radius: 12px')
    expect(css).toContain('var(--font-inter)')
    for (const f of [...doorFiles, 'src/lib/public-site/learn-section.module.css']) {
      expect(read(f), f).not.toMatch(/Sora|Manrope|teal|#14213d|fonts\.googleapis/i)
    }
    expect(css).toContain('prefers-reduced-motion: reduce')
  })
})
