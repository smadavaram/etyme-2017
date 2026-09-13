import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The route that builds the demo world on a deployment.
 *
 * Re-run on production to add the HR and Procurement desks, it returned
 * nothing useful and changed nothing at Nike: a serverless function gets
 * ten seconds by default, and the seed needs more than that even when it
 * has nothing new to write. The limit is pinned here because nothing
 * else would catch it — the integration suite runs the seed in-process
 * with no clock on it.
 */

const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/seed-world/route.ts'), 'utf8')

describe('the world seed route', () => {
  it('is given a minute on the server, because the default ten seconds is not enough to walk twenty firms', () => {
    expect(ROUTE).toMatch(/^export const maxDuration = 60$/m)
  })

  it('still tells the caller the seed is idempotent, so a timeout is answered by running it again', () => {
    expect(ROUTE).toContain('The seed is idempotent — running it again resumes where it stopped.')
  })
})
