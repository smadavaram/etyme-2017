import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * Progress mechanics only (record 133). The training plugin and the door's
 * proof carry no coins or currency, no random reward, no public or global
 * leaderboard, and nothing that can be bought. Course lesson text is
 * content and is not read here; the Course table's own price columns are
 * the schema's and are exempt, because no training code reads or writes them.
 */
const root = process.cwd()
const walk = (dir: string, out: string[] = []): string[] => {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir)) {
    const f = join(dir, e)
    if (statSync(f).isDirectory()) walk(f, out); else if (/\.tsx?$/.test(e)) out.push(f)
  }
  return out
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const mechanics = [
  ...walk(join(root, 'src/lib/training/progress')), ...walk(join(root, 'src/lib/training/paths')),
  ...walk(join(root, 'src/app/learn')), ...walk(join(root, 'src/app/api/learn')),
  join(root, 'src/lib/training/learn-db.ts'), join(root, 'src/lib/training/learn-progress.ts'), join(root, 'src/lib/training/cohort-read.ts'),
  // The door's proof reader and section, where market has built them.
  ...walk(join(root, 'src/lib/public-site')).filter((f) => /learn|proof|featured|badge/i.test(f)),
]
const MONEY = /\b(coins?|tokens?|currency|currencies|wallets?|prices?|priced|purchas\w*|buy|buying|bought|checkout|spend|spent|spendable|redeem\w*|store credit|gems?|jackpot|lottery|raffle|loot|gacha|sweepstake\w*)\b/i
const CHANCE = /\b(random\w*|chance|lucky|mystery|spin|roll the dice|surprise reward)\b|Math\.random|randomInt|randomBytes\(/i
const BOARDS = /\b(leaderboard|top ten|top 10|global rank\w*|public rank\w*|hall of fame)\b/i

describe('progress mechanics hold no currency, chance, public ranking or purchase', () => {
  const files = mechanics.filter((f) => existsSync(f))
  it('the sweep reads the progress, path, route and screen files', () => {
    expect(files.length).toBeGreaterThan(20)
  })
  it('no training or door file speaks of coins, tokens, currency, prices or buying', () => {
    const hits = files.filter((f) => MONEY.test(stripComments(readFileSync(f, 'utf8')))).map((f) => f.replace(root, ''))
    expect(hits).toEqual([])
  })
  it('no training or door file draws a random reward', () => {
    // The verification code of a finished page is an unguessable address, not a reward; its generator is the one allowed use.
    const hits = files.filter((f) => !f.endsWith('src/lib/training/credential.ts') && CHANCE.test(stripComments(readFileSync(f, 'utf8')))).map((f) => f.replace(root, ''))
    expect(hits).toEqual([])
  })
  it('no training or door file builds a leaderboard or a public or global ranking', () => {
    const hits = files.filter((f) => BOARDS.test(stripComments(readFileSync(f, 'utf8')))).map((f) => f.replace(root, ''))
    expect(hits).toEqual([])
  })
  it('the cohort board is read only through a staff seat and the learner’s place only through the Owner’s switch', () => {
    const board = readFileSync(join(root, 'src/app/api/learn/cohort-board/route.ts'), 'utf8')
    expect(board).toMatch(/staffOnly\(/)
    const mine = readFileSync(join(root, 'src/lib/training/progress/read.ts'), 'utf8')
    expect(mine).toMatch(/mayReadRanking\(/)
  })
  it('no page address in the learning site is a ranking or a leaderboard', () => {
    const pages = walk(join(root, 'src/app/learn')).filter((f) => /page\.tsx$/.test(f)).map((f) => f.replace(root, ''))
    expect(pages.filter((p) => /rank|leader|board|score/i.test(p))).toEqual([])
  })
  it('nothing in the schema keeps a points balance on a learner, a badge or an enrollment', () => {
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8')
    for (const model of ['Enrollment', 'LearnBadge', 'LearnCredential', 'LearningPath']) {
      const body = schema.slice(schema.indexOf(`model ${model} {`)).split('\n}')[0]
      expect(body, model).not.toMatch(/^\s*(points|balance|coins|credits|wallet)\s/im)
    }
  })
  it('a badge row holds her yes and its dates and no number that could act as a balance', () => {
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8')
    const body = schema.slice(schema.indexOf('model LearnBadge {')).split('\n}')[0]
    expect(body).not.toMatch(/\bInt\b|\bFloat\b|\bDecimal\b|\bBigInt\b/)
  })
})
