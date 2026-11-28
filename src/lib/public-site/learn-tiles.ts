/**
 * The ten topic tiles of the free course, and the lessons behind each.
 *
 * Etyme's own words and examples. Every tile carries the numbers of the
 * lessons in the course's map that teach it (33 lessons, six modules), so
 * no tile is a topic the course does not teach, and a test fails on a tile
 * with no lesson and on a lesson no tile reaches.
 *
 * The page states what each tile teaches. A topic the lessons do not teach
 * is not named on a tile. The Deploy tile therefore carries no tool names:
 * its lessons are about building, watching, testing and running an AI
 * system in production, and that is what its line says.
 *
 * No server code: the Learn section is a browser component and imports this.
 */

export type TileIcon =
  | 'llm' | 'agents' | 'mcp' | 'rag' | 'training' | 'compute' | 'cloud' | 'cost' | 'performance' | 'deploy'

export interface LearnTile {
  /** Position on the path, 1 to 10. */
  n: number
  key: TileIcon
  name: string
  /** One plain line saying what the topic gives you. */
  line: string
  /** The lessons, by number in the course map, that teach this topic. */
  lessons: number[]
}

/** How many lessons the course map holds. */
export const LESSON_COUNT = 33

export const LEARN_TILES: LearnTile[] = [
  { n: 1, key: 'llm', name: 'LLMs', line: 'How the models actually work, in plain words.', lessons: [5, 17, 24] },
  { n: 2, key: 'agents', name: 'Agents', line: 'Helpers that do steps, not just answers.', lessons: [1, 2, 3, 4, 9, 14] },
  { n: 3, key: 'mcp', name: 'MCP', line: 'One plug for every tool, with no glue code per app.', lessons: [6, 7, 8] },
  { n: 4, key: 'rag', name: 'RAG + Data', line: 'Answers from your documents, with sources.', lessons: [11, 12, 13, 14, 15, 16] },
  { n: 5, key: 'training', name: 'Training', line: 'How models learn, and how they go wrong.', lessons: [16, 17, 18, 19, 20, 21] },
  { n: 6, key: 'compute', name: 'Compute', line: 'The machines underneath, and why they matter.', lessons: [22, 23, 24] },
  { n: 7, key: 'cloud', name: 'Cloud', line: 'Where AI runs when it leaves your laptop.', lessons: [25] },
  { n: 8, key: 'cost', name: 'Cost', line: 'What every call costs, and how to keep it down.', lessons: [10, 26] },
  { n: 9, key: 'performance', name: 'Performance', line: 'Faster, sharper answers, measured and not guessed.', lessons: [24, 28, 29] },
  { n: 10, key: 'deploy', name: 'Deploy', line: 'Build it, test it, ship it and keep it running.', lessons: [27, 28, 30, 31, 32, 33] },
]

export const LEARN_WORDS = {
  eyebrow: 'Learn AI',
  eyebrowStrong: 'The free course',
  headline: 'AI from Zero in 3 Hours.',
  free: 'Free.',
  lede: 'Ten topics, one path. Each tile lights as the path reaches it. This is the whole course, and what you will be good at.',
  finaleDoneTitle: 'Course complete — on your record',
  finaleDoneLine: 'Badge earned, credential page live, and a link you can share in one tap.',
  finaleJoinTitle: 'Then: join the bench →',
  finaleJoinLine: 'Your skills, your proof, your profile, in front of firms that hire.',
  replay: '↻ Replay',
} as const

/**
 * Where "Join the bench" goes: Tapin's own join-the-bench step on its
 * public page. A visitor reads it and chooses; no seat and no record is
 * made for her before her own yes there.
 */
export const JOIN_THE_BENCH_HREF = '/site/tapin'

/** Timing of the animation, in milliseconds. One place, so a test can read it. */
export const LEARN_TIMING = {
  firstTileAt: 250,
  tileEvery: 620,
  tileRise: 450,
  finaleExtra: 300,
  finaleRise: 550,
  fill: 7000,
} as const

/** When tile i (0 to 9) starts to light. */
export function tileDelayMs(i: number): number {
  return LEARN_TIMING.firstTileAt + i * LEARN_TIMING.tileEvery
}

/** When the closing pair of cards starts to rise. */
export function finaleDelayMs(tileCount = LEARN_TILES.length): number {
  return LEARN_TIMING.firstTileAt + tileCount * LEARN_TIMING.tileEvery + LEARN_TIMING.finaleExtra
}
