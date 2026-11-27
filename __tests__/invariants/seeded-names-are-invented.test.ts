import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RENAMED_FIRMS, renameInText, renamePairs } from '@/lib/seed-renames'
import { FIRMS as WORLD_FIRMS } from '@/lib/seed-world'
import { NETWORK } from '../../__integration__/fixtures/network'

/**
 * The demo is shown outside, so nothing in it names a real person or firm.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * Decided 2026-11-22 (record 110): the demo tenant must be safe to show
 * to a buyer. A read of every seed found seventeen invented people
 * carrying a name a public figure holds, and several firms, banks,
 * insurers and screening companies carrying a real company's name. Each
 * has an invented name now (`docs/demo-names.md`).
 *
 * ── Why the names are hashes ─────────────────────────────────────────
 *
 * A guard has to know what it refuses, and this one refuses real
 * people. Writing their names here would put them back in the
 * repository. So the list holds the first sixteen hex digits of each
 * retired name's SHA-256, lower-cased, and the guard hashes every run of
 * one, two and three words in every seed. `docs/demo-names.md` holds the
 * sheet a person reads.
 *
 * It is a list of what was found, not a register of the famous. No test
 * can tell an invented name from a real one by looking at it. A new
 * name is still judged by the person who writes it.
 */

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const hash = (s: string) => createHash('sha256').update(s.toLowerCase()).digest('hex').slice(0, 16)

/** Seeded people renamed on 2026-11-22: a public figure holds each name. */
const RETIRED_PEOPLE = new Set([
  '2dcf837b28278540', 'd4b591b552b5f4e7', 'ff758f4e84af9dfe', '4716551f99cd6f9e', '25e55c8ce18c8f2e',
  'd60b6e34ceb3c8f4', 'a53240cea73f83ca', 'df936e437de52d58', 'f9ca0c4a205147da', '67729b6daaa60916',
  '6d4d63647b56d682', '5f1bf447b6ae8b55', 'a7681cc4694a5ed7', 'c81122b253570513', '7d67306647fdab4f',
  '1259e161eec4a3b5', 'd3db0f4295310a30',
])

/** Real banks, insurers, screening companies and staffing firms the seeds named until 2026-11-22. */
const RETIRED_FIRMS = new Set([
  'b13e50de8738dca6', 'e5ab94c563b2031c', '318063a500431a2c', '311ff2d71234e230', 'bc8a00f7f6fb535f',
  'd820f7eb8dd20696', '6deb06c926d8fdbe', '6f273f8143f0105a', '401cb0a3c9577a6a', '262220c9311e0bb3',
  '46f79c4fd0a58fe5', 'b72e1c8f367cadb2', '828546c757be9334', '1066951d070e44ac', '06e13fc229ba4e50',
])

/** Every file that writes a seeded or sample row, found by name so a new one is read too. */
function seedFiles(): string[] {
  const inLib = readdirSync(join(root, 'src/lib'))
    .filter((f) => /^(seed-|demo-).*\.ts$/.test(f))
    .map((f) => `src/lib/${f}`)
  const under = (dir: string): string[] =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? under(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []
    )
  return [
    ...inLib,
    ...under('src/lib/seed-scale'),
    ...under('src/lib/seed-corvane'),
    'src/lib/twin/seed-demo.ts',
    'src/lib/twin/seed-tenure-demo.ts',
    'src/lib/identity/seed-mock.ts',
    'src/lib/public-site/home-sample.ts',
    'src/lib/public-site/door-map-seed.ts',
    'src/lib/public-site/sample-desk.ts',
    'src/app/demo/seats.ts',
    'src/app/demo/page.tsx',
    'src/components/try-demo.tsx',
    'prisma/seed.ts',
    '__integration__/fixtures/network.ts',
  ]
}

/** Where a text holds a run of one to three words whose hash is on the list. */
function found(text: string, list: Set<string>): string[] {
  const out: string[] = []
  text.split('\n').forEach((line, i) => {
    // A closing quote or a possessive is not part of the name.
    const words = (line.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*/g) ?? []).map((w) => w.replace(/(['’]s)?['’-]*$/, ''))
    for (let at = 0; at < words.length; at++) {
      for (let n = 1; n <= 3 && at + n <= words.length; n++) {
        if (list.has(hash(words.slice(at, at + n).join(' ')))) out.push(`line ${i + 1}`)
      }
    }
  })
  return out
}

describe('No seeded person carries a name a public figure holds', () => {
  const files = seedFiles()

  it('reads every seed file, and real words out of each one', () => {
    expect(files.length).toBeGreaterThan(40)
    expect(files).toContain('src/lib/seed-world.ts')
    expect(files).toContain('src/lib/seed-corvane/plan.ts')
    for (const f of files) expect(read(f).length, f).toBeGreaterThan(100)
  })

  it('no seed, sample panel or demo door holds a person’s name that was retired on 2026-11-22', () => {
    const left = files.flatMap((f) => found(read(f), RETIRED_PEOPLE).map((where) => `${f} ${where}`))
    expect(left, 'A retired name is back in a seed. docs/demo-names.md holds the invented name to use.').toEqual([])
  })

  it('the visitor’s own demo cannot draw a retired name from its first and last names', () => {
    const source = read('src/lib/demo-volume.ts')
    const pool = (name: string) =>
      [...(source.match(new RegExp(`const ${name} = \\[([^\\]]+)\\]`))?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    const first = pool('FIRST')
    const last = pool('LAST')
    expect(first.length).toBeGreaterThan(20)
    expect(last.length).toBeGreaterThan(20)
    const drawn = first.flatMap((f) => last.map((l) => `${f} ${l}`)).filter((n) => RETIRED_PEOPLE.has(hash(n)))
    expect(drawn.length).toBe(0)
  })

  it('the guard still bites: a listed name written into a seed line is found, and a clean line is not', () => {
    const probe = new Set([hash('Zebedee Quillfeather')])
    expect(found("  { name: 'Zebedee Quillfeather', role: 'Data engineer' },", probe)).toEqual(['line 1'])
    expect(found("  { name: 'Zebedee Quill', role: 'Data engineer' },", probe)).toEqual([])
  })
})

describe('No seeded bank, insurer, screening company or supplier carries a real firm’s name', () => {
  it('no seed names a real bank, insurer, screening company or staffing firm that was retired on 2026-11-22', () => {
    const left = seedFiles().flatMap((f) => found(read(f), RETIRED_FIRMS).map((where) => `${f} ${where}`))
    expect(left, 'A real firm is named in a seed. Use an invented one: docs/demo-names.md lists them.').toEqual([])
  })

  it('every seeded screening company is one of the four invented ones', () => {
    const plan = read('src/lib/seed-scale/papers/plan.ts')
    expect(plan).toContain("PROVIDERS = ['Stonegate Screening', 'Harrowline Checks', 'Fairmark Screening', 'Clearwell Checks']")
    const seeded = seedFiles().flatMap((f) =>
      [...read(f).matchAll(/type: 'BACKGROUND_CHECK'[^\n]*provider: '([^']+)'/g)].map((m) => m[1])
    )
    expect(seeded.length).toBeGreaterThan(5)
    expect([...new Set(seeded)].sort()).toEqual(['Harrowline Checks', 'Stonegate Screening'])
  })
})

describe('No job on a public page is titled with a product one vendor sells', () => {
  /**
   * The walk of 2026-11-22 read a job on two public doors titled with a
   * hospital-software product's name. The two words of that title, as
   * hashes, so the guard does not spell them. A skill is not read here:
   * the world seed still holds product names as skills, and
   * `docs/demo-names.md` says why.
   */
  const RETIRED_TITLE_WORDS = new Set(['49a70bd1e731c8cd', 'de79dda4d18e5f79'])
  const wordsOf = (text: string) => text.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? []
  const retiredIn = (text: string) => wordsOf(text).filter((w) => RETIRED_TITLE_WORDS.has(hash(w)))
  const publicFiles = readdirSync(join(root, 'src/lib/public-site')).filter((f) => /\.tsx?$/.test(f)).map((f) => `src/lib/public-site/${f}`)

  it('no public page file holds a word of the product-named job title, in a title, a skill or a sentence', () => {
    expect(publicFiles.length).toBeGreaterThan(20)
    const found = publicFiles.flatMap((f) => retiredIn(read(f)).map(() => f))
    expect(found).toEqual([])
  })

  it('no seeded job, role or headline is titled with it, and no seeded note says it', () => {
    const TITLED = /\b(?:role|title|job|headline|disagreedNote|says): '([^']*)'/g
    const found: string[] = []
    for (const f of seedFiles()) {
      for (const m of read(f).matchAll(TITLED)) if (retiredIn(m[1]).length > 0) found.push(f)
    }
    expect(found).toEqual([])
  })

  it('the guard still bites: the retired title is found when it is written, and the new one is not', () => {
    const old = ['cipE', 'rekaeB'].map((w) => [...w].reverse().join('')).join(' ') + ' analyst'
    expect(retiredIn(old)).toHaveLength(2)
    expect(retiredIn('Laboratory systems analyst')).toEqual([])
  })
})

describe('The calling-list fixture holds invented people at reserved addresses', () => {
  it('every firm’s domain is at .example, so no real company’s domain is registered by a test', () => {
    expect(NETWORK.length).toBe(6)
    for (const f of NETWORK) expect(f.domain, f.name).toMatch(/\.example$/)
  })

  it('every person’s address is at the firm’s own reserved domain', () => {
    for (const f of NETWORK) {
      for (const p of f.people) expect(p.email.endsWith(`@${f.domain}`), p.name).toBe(true)
    }
  })

  it('no firm or person on the list carries a retired name', () => {
    const said = NETWORK.flatMap((f) => [f.name, ...f.people.map((p) => p.name)]).join('\n')
    expect(found(said, RETIRED_FIRMS)).toEqual([])
    expect(found(said, RETIRED_PEOPLE)).toEqual([])
  })
})

describe('The bench vendor’s misspelled name and three real firms’ names are renamed in place', () => {
  const PREFIX = 'world-'
  const today = RENAMED_FIRMS.filter((f) => f.on === '2026-11-22')

  it('four seeded firms were renamed on 2026-11-22: Tecwyn, Tellisford, Conisby and Merrowfield Bank', () => {
    expect(today.map((f) => f.toName)).toEqual(['Tecwyn', 'Tellisford', 'Conisby', 'Merrowfield Bank'])
    expect(today.map((f) => f.toSlug)).toEqual(['tecwyn', 'tellisford', 'conisby', 'merrowfield-bank'])
  })

  it('the three program clients\u2019 slugs moved off the real companies\u2019 names on 2026-11-27', () => {
    const later = RENAMED_FIRMS.filter((f) => f.on === '2026-11-27')
    expect(later.map((f) => f.toSlug)).toEqual(['northbend', 'cavanaugh', 'talvern'])
    expect(later.map((f) => f.companyName)).toEqual(['Northbend Athletic', 'Cavanaugh Glassworks', 'Talvern Medical'])
    expect(WORLD_FIRMS.map((f) => f.slug)).toEqual(expect.arrayContaining(['northbend', 'cavanaugh', 'talvern']))
  })

  it('the world seed seats every renamed firm under its new slug and never its old one', () => {
    const slugs = WORLD_FIRMS.map((f) => f.slug)
    for (const f of RENAMED_FIRMS) {
      expect(slugs, f.toSlug).toContain(f.toSlug)
      expect(slugs, f.toSlug).not.toContain(f.fromSlug)
    }
  })

  it('the integrator’s own row takes its whole name, Tellisford Solutions', () => {
    const integrator = today.find((f) => f.toSlug === 'tellisford')
    expect(integrator?.companyName).toBe('Tellisford Solutions')
    expect(WORLD_FIRMS.find((f) => f.slug === 'tellisford')?.name).toBe('Tellisford Solutions')
  })

  it('a sentence naming the integrator by one word or by its whole name reads the new name both ways', () => {
    const f = today.find((x) => x.toSlug === 'tellisford')!
    const said = renameInText(`${f.fromName} Solutions bought from Tecwyn. ${f.fromName} pays on Friday. ${PREFIX}${f.fromSlug}-ap`, f, PREFIX)
    expect(said).toBe('Tellisford Solutions bought from Tecwyn. Tellisford pays on Friday. world-tellisford-ap')
  })

  it('a firm with a two-word name is renamed in its sentence, its slug and its cost center code', () => {
    const f = today.find((x) => x.toSlug === 'merrowfield-bank')!
    const code = `APPS-${f.fromName.split(' ')[0].toUpperCase()}-4100`
    const said = renameInText(`${f.fromName} signed. via ${f.fromSlug}. ${PREFIX}${f.fromSlug}-hr. ${code}`, f, PREFIX)
    expect(said).toBe('Merrowfield Bank signed. via merrowfield-bank. world-merrowfield-bank-hr. APPS-MERROWFIELD-4100')
  })

  it('reads the address before the bare name for every renamed firm, so no address is half renamed', () => {
    for (const f of RENAMED_FIRMS) {
      expect(renamePairs(f, PREFIX)[0]).toEqual([PREFIX + f.fromSlug, PREFIX + f.toSlug])
    }
  })

  it('every reason on the rename map is a sentence that does not spell the old name', () => {
    for (const f of RENAMED_FIRMS) {
      expect(f.why.length).toBeGreaterThan(20)
      expect(f.why.toLowerCase()).not.toContain(f.fromName.toLowerCase())
    }
  })
})
