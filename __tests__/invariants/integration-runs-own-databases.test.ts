import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runPidOf, staleRunDatabases } from '../../__integration__/database'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('Two integration runs at once never share a database (2026-11-09)', () => {
  it('every run gets an id of its own from the config, made of the main process and four letters, unless a database was named by hand', () => {
    const config = src('vitest.integration.config.ts')
    expect(config).toContain('if (!process.env.ETYME_TEST_DB && !process.env.ETYME_TEST_RUN)')
    expect(config).toContain('process.env.ETYME_TEST_RUN = `p${process.pid}_')
  })

  it('a run’s worker databases carry its id, and a name given by hand keeps its old shape', () => {
    const db = src('__integration__/database.ts')
    expect(db).toContain("export const BASE_DB = process.env.ETYME_TEST_DB || (RUN ? `etyme_test_${RUN}` : 'etyme_test')")
    expect(db).toContain('export const TEST_DB = RUN ? `${BASE_DB}_w${pool}`')
  })

  it('the process behind a run’s database is read off its name, and nothing else is read as a run’s', () => {
    expect(runPidOf('etyme_test_p4242_ab3d_w2')).toBe(4242)
    for (const n of ['etyme_test', 'etyme_test_w3', 'etyme_tpl_world_20261109_9185afd256ec', 'etyme_test_b', 'etyme']) {
      expect(runPidOf(n), n).toBeNull()
    }
  })

  it('a database left by a run whose process is gone is swept, and a run still going or this run is never touched', () => {
    const names = ['etyme_test_p11_aaaa_w1', 'etyme_test_p22_bbbb_w1', 'etyme_test_p33_cccc_w2', 'etyme_test_w2', 'etyme_tpl_empty_x']
    const alive = (pid: number) => pid === 22
    expect(staleRunDatabases(names, alive, 'etyme_test_p33_cccc_')).toEqual(['etyme_test_p11_aaaa_w1'])
  })

  it('the global setup sweeps what dead runs left and drops this run’s databases when it ends, and keeps the shared templates', () => {
    const setup = src('__integration__/global-setup.ts')
    expect(setup).toContain('staleRunDatabases(databasesLike(RUN_DB_PREFIX), processAlive, RUN_DATABASES)')
    expect(setup).toContain('for (const db of databasesLike(RUN_DATABASES))')
    expect(setup).toContain("provide('worldTemplate', plan.world)")
  })
})
