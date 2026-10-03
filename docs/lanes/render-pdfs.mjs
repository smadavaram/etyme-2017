import { chromium } from 'playwright'
import { readdirSync } from 'node:fs'
const OUT = new URL('./out/', import.meta.url).pathname
const b = await chromium.launch({ args: ['--no-sandbox'] })
const p = await (await b.newContext({ viewport: { width: 1540, height: 1000 } })).newPage()
for (const f of readdirSync(OUT).filter((f) => /^\d[a-c]?-.*\.html$/.test(f)).sort()) {
  await p.goto('file://' + OUT + f, { waitUntil: 'load' }); await p.waitForTimeout(300)
  await p.emulateMedia({ media: 'print' })
  await p.pdf({ path: OUT + f.replace('.html', '.pdf'), preferCSSPageSize: true, printBackground: true })
}
await b.close(); console.log('rendered')
