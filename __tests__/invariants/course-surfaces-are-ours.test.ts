/**
 * Record 133, last section: everything a visitor sees is Etyme's own
 * product, in Etyme's voice. No reference to an outside video, creator,
 * transcript, source map or outside course on the door, the Learn section
 * or the course content: copy, code, comments, file names or test names.
 */
import { readdirSync, describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = process.cwd()

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((f) => {
    const rel = join(dir, f)
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel]
  })
}

const DOOR_AND_LEARN = [
  ...walk('src/app/(site)/learnai'),
  'src/lib/public-site/learn-section.tsx',
  'src/lib/public-site/learn-section.module.css',
  'src/lib/public-site/learn-tiles.ts',
  'src/lib/public-site/learn-icons.tsx',
  'src/lib/public-site/course-door-page.ts',
]
const COURSES = walk('src/lib/training/courses')

/** What may not be said, anywhere on these surfaces. */
const OUTSIDE = /transcript|creator|source[ -]?map|outside course|youtube|vimeo|udemy|coursera|adapted from|based on (a|the) (video|course)|as (taught|shown) (in|by)/i

describe('the door, the Learn section and the course content are Etyme’s own', () => {
  it('the door and the Learn section never mention an outside video, creator, transcript, source map or course', () => {
    for (const f of DOOR_AND_LEARN) {
      const text = readFileSync(join(ROOT, f), 'utf8')
      expect(text, f).not.toMatch(OUTSIDE)
      expect(text, f).not.toMatch(/video/i)
    }
  })

  it('the course content never mentions an outside creator, transcript, source map or course', () => {
    for (const f of COURSES) expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(OUTSIDE)
  })

  it('the course content speaks of video only as its own lesson’s video slot, never as somebody else’s video', () => {
    for (const f of COURSES) {
      const lines = readFileSync(join(ROOT, f), 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (!/video/i.test(line)) return
        // The lesson's own slot: the field, its type, and the words it shows.
        const ours = /\bvideo\??: |VideoAnchor|videoSlotWords|Watch the video|Video coming|Moments in the video|where a lesson has no video|sourceUrl|storedFileId/.test(line)
        expect(ours, `${f}:${i + 1}: ${line.trim()}`).toBe(true)
      })
    }
  })

  it('no file name on these surfaces names an outside source', () => {
    for (const f of [...DOOR_AND_LEARN, ...COURSES, 'docs/course-door-lead-contract.md']) {
      expect(relative(ROOT, join(ROOT, f)), f).not.toMatch(OUTSIDE)
    }
  })

  it('the door and the Learn section name no example person, so the course’s own examples are the only ones a learner meets', () => {
    for (const f of DOOR_AND_LEARN) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(/\b(Priya|Mara|Lindqvist|Pinnacle)\b/)
    }
  })

  it('the course examples are Milo at Maple Mart, and no older example name is left in any course file', () => {
    const dir = join(ROOT, 'src/lib/training/courses')
    for (const f of readdirSync(dir)) {
      expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/\b(Priya|Mara|Lindqvist|Pinnacle)\b/i)
    }
  })
})
