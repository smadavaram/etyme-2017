/**
 * A thousand jobs, twenty hires through every rung, every kind of worker
 * (the founder, 2026-11-08): the run's flags and the report's two tables.
 * Pure; no database, no server.
 */
import { describe, it, expect } from 'vitest'
import { parseArgs } from '../../scripts/simulate/args'
import { Ledger } from '../../scripts/simulate/ledger'
import { reportMarkdown } from '../../scripts/simulate/report'
import { emptyWorld } from '../../scripts/simulate/stage'
import {
  chainHeadline, labelsFrom, readTallies, rungCount, rungLines, workerClassLines, workerClassRows, type Tallies,
} from '../../scripts/simulate/tallies'

const LABELS = [
  { key: 'CITIZEN', label: 'US citizen' },
  { key: 'F1_NO_PERMIT', label: 'International student with no CPT or OPT' },
]

function md(tallies: Tallies | undefined, chainHires?: number) {
  return reportMarkdown({
    stamp: 'x', startedAt: new Date(0), finishedAt: new Date(1000),
    options: { placements: 1000, weeks: 4, concurrency: 1, only: [], ...(chainHires != null ? { chainHires } : {}) },
    database: { name: 'etyme_sim_x', template: 't', kept: true }, base: 'http://localhost:1', build: 'reused',
    stages: [], world: emptyWorld(), ledger: new Ledger(), catalog: { seats: [], unreachable: [] }, opened: 0, tallies,
  })
}

describe('The founder says jobs, and the run takes the word', () => {
  it('--jobs sets the same count as --placements', () => {
    expect(parseArgs(['--jobs', '1000']).placements).toBe(1000)
    expect(parseArgs(['--jobs=750']).placements).toBe(750)
  })

  it('twenty chain hires are asked for unless the run says otherwise', () => {
    expect(parseArgs([]).chainHires).toBe(20)
    expect(parseArgs(['--chain-hires', '35']).chainHires).toBe(35)
  })

  it('a chain-hires count that is not a whole number above nought is refused in a sentence', () => {
    expect(() => parseArgs(['--chain-hires', '0'])).toThrow(/--chain-hires takes a whole number/)
  })

  it('the refusal of an unknown flag names --jobs and --chain-hires among the flags', () => {
    expect(() => parseArgs(['--hires', '3'])).toThrow(/--jobs.*--chain-hires/)
  })
})

describe('The report counts every kind of worker, in plain words', () => {
  it('a class is printed with its label, in the order supply lists them, with the reason it was refused at the start', () => {
    const rows = workerClassRows(
      [{ workAuth: 'F1_NO_PERMIT', people: 40, awarded: 3, started: 0, refused: 3, reason: 'An F-1 student with no CPT or OPT may not start US work.' },
        { workAuth: 'CITIZEN', people: 900, awarded: 50, started: 48, refused: 2, reason: 'No I-9 on file.' }],
      LABELS,
    )
    expect(rows.map((r) => r.label)).toEqual(['US citizen', 'International student with no CPT or OPT'])
    const lines = workerClassLines(rows).join('\n')
    expect(lines).toContain('| International student with no CPT or OPT | 40 | 3 | 0 | 3 | An F-1 student with no CPT or OPT may not start US work. |')
  })

  it('a class nobody counted reads "not counted", never nought', () => {
    const [row] = workerClassRows([], [{ key: 'CITIZEN', label: 'US citizen' }])
    expect(row.people).toBeNull()
    expect(workerClassLines([row]).join('\n')).toContain('| US citizen | not counted | not counted | not counted | not counted |')
  })

  it('a tally keyed by class as a record is read the same as a list', () => {
    const rows = workerClassRows({ CITIZEN: { people: 5, awarded: 1, started: 1, refused: 0 } }, LABELS)
    expect(rows[0]).toMatchObject({ key: 'CITIZEN', people: 5, started: 1 })
  })

  it('supply’s labels are read from a list or from a record', () => {
    expect(labelsFrom(LABELS)).toEqual([['CITIZEN', 'US citizen'], ['F1_NO_PERMIT', 'International student with no CPT or OPT']])
    expect(labelsFrom({ CITIZEN: 'US citizen' })).toEqual([['CITIZEN', 'US citizen']])
  })
})

describe('The report says how many rungs each award walked', () => {
  it('awards are counted into one, two, three and four or more rungs, and the four-rung ones are named', () => {
    const r = rungCount([
      { rungs: 1 }, { rungs: 2 }, { rungs: 2 }, { rungs: 3 },
      { rungs: 4, personName: 'Ravi Kumar', jobTitle: 'Data engineer', clientName: 'Northbend Athletic' },
      { rungs: 5, says: 'Linnea Qadri, Techpeple to Brightmoor to Northbend' },
    ])!
    expect(r.byRungs).toEqual({ '1': 1, '2': 2, '3': 1, '4+': 2 })
    expect(r.chain).toEqual(['Ravi Kumar for Data engineer at Northbend Athletic', 'Linnea Qadri, Techpeple to Brightmoor to Northbend'])
    expect(rungLines(r).join('\n')).toContain('| 4+ | 2 |')
  })

  it('a count already made by bucket is read as it came, with its named chain', () => {
    const r = rungCount({ byRungs: { 1: 10, 2: 4, 3: 1, '4+': 21 }, chain: ['one', 'two'] })!
    expect(r.byRungs['4+']).toBe(21)
    expect(r.chain).toEqual(['one', 'two'])
  })

  it('the headline says how many awards walked four rungs against the target, and how many short', () => {
    expect(chainHeadline({ byRungs: { '1': 0, '2': 0, '3': 0, '4+': 21 }, chain: [] }, 20)).toBe('21 awards walked four rungs (target 20, met).')
    expect(chainHeadline({ byRungs: { '1': 0, '2': 0, '3': 0, '4+': 1 }, chain: [] }, 20)).toBe('1 award walked four rungs (target 20, 19 short).')
  })

  it('where nobody counted the rungs the headline says so rather than a number', () => {
    expect(chainHeadline(null, 20)).toMatch(/were not counted this run/)
  })
})

describe('The two tables sit in the report under complete transactions', () => {
  it('the headline line, the class table and the rungs table are printed, with the target the run was given', () => {
    const out = md({
      workerClasses: workerClassRows([{ workAuth: 'CITIZEN', people: 1, awarded: 1, started: 1, refused: 0 }], LABELS),
      rungs: { byRungs: { '1': 0, '2': 0, '3': 0, '4+': 3 }, chain: ['a', 'b', 'c'] }, notes: [],
    }, 25)
    expect(out).toContain('3 awards walked four rungs (target 25, 22 short).')
    expect(out).toContain('## Every kind of worker')
    expect(out).toContain('## Awards by rungs walked')
    expect(out.indexOf('## Awards by rungs walked')).toBeLessThan(out.indexOf('## What closed at every station'))
    expect(out).toContain('--jobs 1000 --chain-hires 25')
  })

  it('a record made before the tables existed prints neither', () => {
    const out = md(undefined)
    expect(out).not.toContain('## Every kind of worker')
    expect(out).not.toContain('## Awards by rungs walked')
  })

  it('reading the counts at the end of a run never throws, whatever is in this build', () => {
    const t = readTallies(emptyWorld())
    expect(t).toHaveProperty('notes')
  })
})
