import { runSurface, scorecard, type Report } from '../src/lib/evals/harness'
import { SURFACES } from '../src/lib/evals/surfaces'

/**
 * npm run evals              — the path that ships today, with no key
 * npm run evals -- --model   — the same cases against the model
 *
 * Written to be read by somebody who does not read code. One line per
 * thing the model touches, the failing cases named underneath in the
 * sentence they were written as.
 */
async function main() {
  const wantsModel = process.argv.includes('--model') || process.env.RUN_MODEL_EVALS === '1'
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY)

  if (wantsModel && !hasKey) {
    console.error('No ANTHROPIC_API_KEY, so there is no model to evaluate. Running the fallbacks instead.\n')
  }

  const mode = wantsModel && hasKey ? 'MODEL' : 'RULES'

  console.log(
    mode === 'MODEL'
      ? 'Against the model.\n'
      : 'Against the path that ships today — no key is configured, so every one of these runs its fallback.\n'
  )

  const reports: Report[] = []
  for (const surface of SURFACES) {
    if (mode === 'MODEL' && surface.fallback === 'NONE' && surface.key === 'match-scoring') {
      // Needs a database and a real bench. Said rather than skipped quietly.
      console.log(`  skip  ${surface.what}  — needs a live company to score against`)
      continue
    }
    reports.push(await runSurface(surface, mode))
  }

  console.log(scorecard(reports))

  const failed = reports.reduce((n, r) => n + (r.total - r.passed), 0)
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
