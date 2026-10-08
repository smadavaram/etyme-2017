/**
 * Writes docs/delivery-matrix.html from src/lib/matrix.ts.
 *
 *   npm run matrix
 *
 * Run it immediately before committing a matrix change, never earlier: it
 * bakes in whatever MATRIX holds at that moment (docs/how-agents-work.md).
 * Run with vite-node, which vitest already brings, so the "@/" imports
 * resolve the same way the tests resolve them and nothing new is installed.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deliveryMatrixHtml } from '@/lib/delivery-matrix-html'

const target = join(process.cwd(), 'docs', 'delivery-matrix.html')
const html = deliveryMatrixHtml()
writeFileSync(target, html)
console.log(`Wrote ${target} (${html.length.toLocaleString('en-US')} characters).`)
