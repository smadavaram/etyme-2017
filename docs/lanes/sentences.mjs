// Every `describe` and `it` sentence in the integration walks, as data.
// The party documents list them under the stream each walk belongs to,
// so the founder reads test names rather than code. Re-extracted on every
// build: a sentence renamed in a test is renamed in the document.
import { readdirSync, readFileSync } from 'node:fs'

export function extractSentences(dir) {
  const out = []
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.test.ts')).sort()) {
    let describe = null
    for (const line of readFileSync(new URL(file, dir), 'utf8').split('\n')) {
      const m = line.match(/^\s*(describe|it|test)\((['"`])((?:\\.|(?!\2).)*)\2/)
      if (!m) continue
      const text = m[3].replace(/\\'/g, '’')
      if (m[1] === 'describe') describe = text
      else out.push({ file, describe, it: text })
    }
  }
  return out
}
