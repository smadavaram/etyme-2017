import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { runSurface, scorecard, noInventedNumbers, avoids, FILLER } from '@/lib/evals/harness'
import { SURFACES, COVERAGE } from '@/lib/evals/surfaces'

/**
 * Four features here send text to a model and use what comes back, and
 * none of them had a test of what actually comes back — only of the code
 * around it. That gap is the one that bites late: a prompt change that
 * starts inventing a number does not fail a unit test, and reaches a
 * customer.
 *
 * These run the path that ships. With no API key configured — which is the
 * state this system is in — every surface runs its rule-based fallback, so
 * that is what runs here, with no network and no flakiness.
 *
 * Set RUN_MODEL_EVALS=1 with a key to run the same cases against the model.
 */

describe('what ships today, with no model key', () => {
  for (const surface of SURFACES) {
    it(`${surface.what.toLowerCase()} passes every case on its fallback`, async () => {
      const report = await runSurface(surface, 'RULES')

      // The failing cases, named as the sentences they were written as.
      const failed = report.results
        .filter((r) => !r.passed)
        .map((r) => `${r.case}: ${r.error ?? r.failures.join('; ')}`)

      expect(failed, failed.join('\n')).toEqual([])
      expect(report.total).toBeGreaterThan(0)
    })
  }
})

describe('no model surface ships without evals', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.tsx?$/.test(entry)) out.push(full)
    }
    return out
  }

  it('lists every file that talks to the model, and covers each with cases', () => {
    // The rule with teeth. A fifth thing that imports the SDK fails this
    // until somebody writes cases for it — which is the only way a rule
    // like this survives contact with a deadline.
    const root = join(process.cwd(), 'src')
    const talkers = walk(root)
      .filter((f) => /from ['"]@anthropic-ai\/sdk['"]|import\(['"]@anthropic-ai\/sdk['"]\)/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(process.cwd().length + 1))
      // A route that only names the environment variable in a message is
      // not a model surface.
      .filter((f) => f.startsWith('src/lib/'))
      .sort()

    expect(talkers).toEqual(Object.keys(COVERAGE).sort())
  })

  it('points every covered file at a surface that exists', () => {
    const keys = new Set(SURFACES.map((s) => s.key))
    for (const [file, key] of Object.entries(COVERAGE)) {
      expect(keys.has(key), `${file} points at "${key}", which is not a surface`).toBe(true)
    }
  })

  it('says out loud which surfaces have no fallback', () => {
    // Not forbidden. A surface that simply does not work without a key is
    // a decision somebody should take knowingly, and this is where it is
    // written down rather than discovered.
    const noFallback = SURFACES.filter((s) => s.fallback === 'NONE').map((s) => s.what)
    expect(noFallback).toEqual(['Scoring a consultant against a role'])
  })
})

describe('the graders themselves', () => {
  it('catches a number nobody was given', () => {
    // The failure that matters most: a model writing "over 50 placements"
    // about a company with seven.
    expect(noInventedNumbers([7])('Over 50 placements.')).toMatch(/invented 50/)
    expect(noInventedNumbers([7])('7 placements.')).toBeNull()
  })

  it('reads a number with a comma in it', () => {
    expect(noInventedNumbers([1200])('1,200 placements.')).toBeNull()
  })

  it('catches the words that make copy read as generated', () => {
    expect(avoids(FILLER, 'filler')('A leading provider of talent.')).toMatch(/leading/)
    expect(avoids(FILLER, 'filler')('SAP FICO people, out of New Jersey.')).toBeNull()
  })
})

describe('the scorecard', () => {
  it('reads as something a person can act on', async () => {
    const reports = await Promise.all(SURFACES.map((s) => runSurface(s, 'RULES')))
    const card = scorecard(reports)
    expect(card).toMatch(/cases pass\./)
    expect(card).toMatch(/public page/i)
  })
})
