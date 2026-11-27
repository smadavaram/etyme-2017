const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');

const OUT = process.argv[2] || 'out';
const ONLY = process.argv[3] || null;
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

(async () => {
  const sd = path.join(OUT, 'svg'), pd = path.join(OUT, 'png');
  fs.mkdirSync(pd, { recursive: true });
  let items = fs.readFileSync(path.join(OUT, 'manifest.txt'), 'utf8')
    .trim().split('\n').map(l => { const [fn, w, h] = l.split('\t'); return { fn, w: +w, h: +h }; });
  if (ONLY) items = items.filter(i => i.fn.includes(ONLY));

  const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--font-render-hinting=none'] });
  for (const it of items) {
    const page = await browser.newPage({ viewport: { width: it.w, height: it.h }, deviceScaleFactor: 1 });
    const svg = fs.readFileSync(path.join(sd, it.fn), 'utf8');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden}svg{display:block}</style>${svg}`,
      { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(pd, it.fn.replace('.svg', '.png')), clip: { x: 0, y: 0, width: it.w, height: it.h } });
    await page.close();
    process.stdout.write('.');
  }
  await browser.close();
  console.log(`\n${items.length} png -> ${pd}`);
})();
