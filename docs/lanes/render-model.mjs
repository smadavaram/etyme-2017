// Renders every drawing in the party documents to the PNGs the public
// documentation shows under public/model/, one per figure, named by the
// page of the party PDF it sits on (the names the documentation links to).
// Run after build-all.mjs:  node docs/lanes/render-model.mjs
import { chromium } from 'playwright'
import { readdirSync, readFileSync } from 'node:fs'

const OUT = new URL('./out/', import.meta.url).pathname
const MODEL = new URL('../../public/model/', import.meta.url).pathname
const PARTY = {
  client: '1-client', gsi: '2-gsi-systems-integrator', msp: '3-msp-program-office',
  prime: '4-prime-vendor', sub: '5-sub-vendor', bench: '6-bench-vendor', self: '7-self-employed',
  candidate: '8a-candidate-on-a-bench', cand_ind: '8b-candidate-independent', cand_emp: '8c-candidate-employee',
}
const WIDTH = 1629 // the width the documentation's images were drawn at

const existing = readdirSync(MODEL)
const DOCDIR = new URL('../../src/lib/public-site/docs/', import.meta.url).pathname
const DOCS = readdirSync(DOCDIR).filter((f) => f.endsWith('.ts')).map((f) => DOCDIR + f)
const read = (f) => readFileSync(f, 'utf8')
const b = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 1540, height: 1000 }, deviceScaleFactor: WIDTH / 1540 })
const p = await ctx.newPage()
for (const [prefix, file] of Object.entries(PARTY)) {
  const pages = existing
    .map((f) => f.match(new RegExp(`^${prefix}-p(\\d+)\\.png$`)))
    .filter(Boolean).map((m) => Number(m[1])).sort((a, c) => a - c)
  await p.goto('file://' + OUT + file + '.html', { waitUntil: 'load' })
  await p.emulateMedia({ media: 'print' })
  await p.waitForTimeout(200)
  let figs = await p.$$('figure .fig-scroll')
  const heads = await p.$$eval('figure', (fs) => fs.map((f) => f.closest('section')?.querySelector('h2')?.textContent ?? ''))
  // A drawing added after the documentation was written has no image yet:
  // the documentation names each image by the stream it draws, so a
  // drawing whose stream no image names is left out, and nothing else is.
  const named = DOCS.map((f) => [...read(f).matchAll(new RegExp(`alt=\\\\"([^\\\\]+), drawn from[^/]+/model/${prefix}-p\\d+\\.png`, 'g'))].map((m) => m[1])).flat()
  let extra = figs.length - pages.length
  const keep = figs.filter((_, i) => !(extra > 0 && !named.includes(heads[i]) && extra-- > 0))
  if (keep.length !== pages.length) {
    throw new Error(`${file}: ${figs.length} drawings but ${pages.length} images under public/model — the names would not line up`)
  }
  figs = keep
  for (let i = 0; i < figs.length; i++) await figs[i].screenshot({ path: `${MODEL}${prefix}-p${pages[i]}.png` })
  console.log(prefix, pages.length)
}
await b.close()
