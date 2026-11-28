/**
 * The free training door's page: the words, the ten topic tiles and the
 * four answers to "What are you?".
 *
 * Etyme's own door (owner's ruling, relayed by Pax, 2026-11-28). It is
 * a doorway to a free course, and nothing here says Tapin sells
 * training. The course itself is paused, so the page says so plainly and
 * never links to it.
 *
 * No server code here: the form on the page is a browser component and
 * imports this file. The words that sit beside the tick, and the table
 * that routes an answer to a track, are held by `./course-door` (which
 * uses a server module); this file repeats them for the browser and a
 * test holds the two copies equal.
 */

/**
 * Where the door lives. /start is already the signed-in setup page
 * (`src/app/(auth)/start`), so this door sits at its own address until
 * the architect settles which of the two keeps /start.
 */
export const COURSE_DOOR_PATH = '/ai-from-zero'

/** The existing leads route, called as docs/course-door-lead-contract.md says. */
export const COURSE_DOOR_ENDPOINT = '/api/market/leads'

export const DOOR_WORDS = {
  eyebrow: 'Free training',
  headline: 'AI from Zero in 3 Hours',
  free: 'Free',
  promise: 'Free for everyone. You start from zero.',
  paused: 'The course is not open yet. We have not set a date for it.',
  gridHeading: 'What you will learn',
  askHeading: 'What are you?',
  askHint: 'Pick the closest one. It decides where you start.',
  emailLabel: 'Your email',
  guardianEmailLabel: 'A parent or guardian’s email',
  itSwitch: 'I work in IT',
  send: 'Tell me when it opens',
  back: 'Change my answer',
  doneHeading: 'You are on the list',
  doneOpens: 'When the course opens is not set yet.',
} as const

/** Same words as `CONSENT_WORDS` and `GUARDIAN_WORDS` in `./course-door`. */
export const CONSENT_LINE = "Email me when the course opens and about Etyme's free training. I can stop anytime."
export const GUARDIAN_LINE = 'This is the email of a parent or guardian, not a child. We keep no name or age for a child.'

export type DoorLabel = 'Worker' | 'Recruiter' | 'Fresher' | 'Kid'

/** The four answers. The track is what each routes to, as `TRACK_FOR` says. */
export const DOOR_ANSWERS: { label: DoorLabel; line: string; track: string }[] = [
  { label: 'Worker', line: 'I have a job and want to work with AI.', track: 'Non-IT' },
  { label: 'Recruiter', line: 'I find and place people.', track: 'Entry Level' },
  { label: 'Fresher', line: 'I am starting my career.', track: 'Entry Level' },
  { label: 'Kid', line: 'I am a student. A parent or guardian signs me up.', track: 'Kids/student' },
]

export const IT_TRACK_NAME = 'IT — Upgrade'

export type TileIcon =
  | 'llm' | 'agents' | 'mcp' | 'rag' | 'training' | 'compute' | 'cloud' | 'cost' | 'performance' | 'deploy'

export interface TopicTile {
  key: TileIcon
  name: string
  /** One plain line saying what the topic is. */
  gloss: string
  /** Set only where the owner's ruling gave the tile a sub-line. */
  sub?: string
}

export const TILES: TopicTile[] = [
  { key: 'llm', name: 'LLMs', gloss: 'How a language model works' },
  { key: 'agents', name: 'Agents', gloss: 'Software that takes steps for you' },
  { key: 'mcp', name: 'MCP', gloss: 'How a model reaches your tools' },
  { key: 'rag', name: 'RAG + Data', gloss: 'Answers drawn from your own documents' },
  { key: 'training', name: 'Training', gloss: 'How a model learns' },
  { key: 'compute', name: 'Compute', gloss: 'The hardware a model runs on' },
  { key: 'cloud', name: 'Cloud', gloss: 'Where models are hosted' },
  { key: 'cost', name: 'Cost', gloss: 'What running a model costs' },
  { key: 'performance', name: 'Performance', gloss: 'Speed and quality, and how to tell' },
  { key: 'deploy', name: 'Deploy', gloss: 'Putting it to work', sub: 'Docker · Kubernetes' },
]
