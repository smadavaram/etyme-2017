/**
 * What the supply stations leave in the world for the stations after
 * them (submit, award): who is on whose bench, with whose consent.
 *
 * The World type (scripts/simulate/stage.ts) has no list for the bench
 * yet; that file is the architect's. Until it gains one, the facts live
 * on the same world object under `bench`, read and written only through
 * `benchOf`, so the JSON ledger carries them and a later station reads
 * `benchOf(ctx.world)` without knowing where they sit. When the World
 * type gains `bench: BenchFact[]`, this helper becomes one line.
 *
 * Pure. No database, no server.
 */
import { STAY_CHOICES } from '@/lib/bench-stay'
import type { World } from '../../stage'

export interface BenchFact {
  /** The listing id; for a firm's own employee with no listing, the person id. */
  id: string
  /** The seat that listed or flagged them. */
  by: string
  personId: string
  /** The consultant profile id, where the person has one. */
  consultantId: string | null
  name: string
  email: string
  /** The firm whose bench they are on. */
  firmSlug: string
  firmId: string
  /**
   * LISTING — a person who said yes to this firm marketing them.
   * SHARED — a listing a partner firm passed on, answered by the person.
   * EMPLOYEE — the firm's own W2 between projects or rolling off; the
   * employment is the consent, and they go forward as INTERNAL.
   */
  kind: 'LISTING' | 'SHARED' | 'EMPLOYEE'
  /** GRANTED, DECLINED or INVITED for a listing; EMPLOYEE for an employee. */
  state: string
  tier: 'MARKETING' | 'RETAINED' | null
  skills: string[]
  location: string | null
  /** Cents an hour, as the firm listed them. */
  rateMin: number | null
  rateMax: number | null
  /** The stay they chose with their yes, in days; null is until they cancel. */
  stayDays: number | null
  showInMatches: boolean
  /** True where the seed put them there and this run only read them. */
  seeded: boolean
  /** For an employee: the day they are free, ISO. */
  freeOn?: string | null
}

type WithBench = World & { bench?: BenchFact[] }

/** The bench facts on this world, created empty on first use. */
export function benchOf(world: World): BenchFact[] {
  const w = world as WithBench
  if (!w.bench) w.bench = []
  return w.bench
}

/** Live people a firm may put forward today: a granted listing or its own employee. */
export function liveOn(world: World, firmSlug?: string): BenchFact[] {
  return benchOf(world).filter(
    (b) => (b.state === 'GRANTED' || b.kind === 'EMPLOYEE') && (firmSlug == null || b.firmSlug === firmSlug)
  )
}

// ── People the run brings onto a bench ─────────────────────────────────

const FIRST = [
  'Aisha', 'Bruno', 'Camille', 'Dmitri', 'Esperanza', 'Farouk', 'Greta', 'Hiroshi', 'Ifeoma', 'Jonas',
  'Kavya', 'Lorenzo', 'Mei', 'Nikhil', 'Oksana', 'Pablo', 'Quinn', 'Rania', 'Soren', 'Tamsin',
  'Uchenna', 'Valeria', 'Wendell', 'Ximena', 'Yaw', 'Zofia', 'Anders', 'Beatrix', 'Cyrus', 'Delphine',
  'Emeka', 'Fiona', 'Gustavo', 'Hana', 'Ilya', 'Josefina', 'Kwabena', 'Leilani', 'Mateus', 'Niamh',
] as const
const LAST = [
  'Abara', 'Bergstrom', 'Castellanos', 'Dubois', 'Eriksen', 'Fonseca', 'Gallagher', 'Haddadi', 'Ishikawa', 'Jovanovic',
  'Kowalczyk', 'Lindgren', 'Mbeki', 'Nakamura', 'Oduya', 'Petrov', 'Quintana', 'Ramanathan', 'Sandoval', 'Takahashi',
  'Usman', 'Varga', 'Whitlock', 'Xiong', 'Yilmaz', 'Zielinski', 'Achterberg', 'Bianchi', 'Chowdhury', 'Delacroix',
  'Esposito', 'Fairweather', 'Grieve', 'Hollis', 'Iwu', 'Janssen', 'Kariuki', 'Lachance', 'Moreau', 'Nwachukwu',
] as const

/** The k-th new person's name: unique for the first 1,600, and never a seeded name. */
export function newPersonName(k: number): string {
  const f = FIRST[k % FIRST.length]
  const l = LAST[(k + Math.floor(k / FIRST.length)) % LAST.length]
  return `${f} ${l}`
}

/** An address nobody can register, so the run can sit as them (`reservedAddress`). */
export function newPersonEmail(name: string, k: number, firmSlug: string): string {
  const handle = name.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.')
  return `${handle}.${k}@${firmSlug.replace(/^world-/, '')}.bench.invalid`
}

/** The stays a person may choose with their yes (`lib/bench-stay`), until-cancelled first. */
export const STAYS: readonly (number | null)[] = [null, ...STAY_CHOICES]
