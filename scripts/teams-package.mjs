#!/usr/bin/env node
/**
 * Build the Etyme app package for Microsoft Teams: a zip of
 * teams/manifest.json (with the bot id and the host filled in) and the
 * two icons, ready to sideload or hand to a Teams administrator.
 *
 *   MICROSOFT_APP_ID=<the Entra app id> ETYME_HOST=app.etyme.com \
 *     node scripts/teams-package.mjs
 *
 * Writes teams/build/etyme-teams.zip. Refuses, in a sentence, when either
 * value is missing or does not look right, rather than packaging a
 * manifest Teams will reject at upload. No dependency: the zip is
 * written here with Node's own zlib.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync, crc32 } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'teams')

const appId = (process.env.MICROSOFT_APP_ID ?? '').trim()
const host = (process.env.ETYME_HOST ?? process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appId)) {
  console.error('Set MICROSOFT_APP_ID to the Application (client) ID of the Entra app registration — a GUID like 1b2c3d4e-0000-0000-0000-000000000000. Nothing was built.')
  process.exit(1)
}
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) {
  console.error('Set ETYME_HOST to the address Etyme is served on, such as app.etyme.com, without https://. Nothing was built.')
  process.exit(1)
}

const manifest = readFileSync(join(dir, 'manifest.json'), 'utf8')
  .replaceAll('{{MICROSOFT_APP_ID}}', appId)
  .replaceAll('{{ETYME_HOST}}', host)
JSON.parse(manifest) // a broken template fails here, not at upload

const files = [
  { name: 'manifest.json', data: Buffer.from(manifest, 'utf8') },
  { name: 'color.png', data: readFileSync(join(dir, 'color.png')) },
  { name: 'outline.png', data: readFileSync(join(dir, 'outline.png')) },
]

// ── A plain zip: local headers, the deflated data, a central directory ──
const local = []
const central = []
let offset = 0
for (const f of files) {
  const name = Buffer.from(f.name, 'utf8')
  const body = deflateRawSync(f.data)
  const crc = crc32(f.data) >>> 0
  const head = Buffer.alloc(30)
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6); head.writeUInt16LE(8, 8)
  head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12); head.writeUInt32LE(crc, 14)
  head.writeUInt32LE(body.length, 18); head.writeUInt32LE(f.data.length, 22); head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28)
  local.push(head, name, body)
  const cd = Buffer.alloc(46)
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8); cd.writeUInt16LE(8, 10)
  cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0x21, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20)
  cd.writeUInt32LE(f.data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(offset, 42)
  central.push(cd, name)
  offset += head.length + name.length + body.length
}
const cdSize = central.reduce((n, b) => n + b.length, 0)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16)

mkdirSync(join(dir, 'build'), { recursive: true })
const out = join(dir, 'build', 'etyme-teams.zip')
writeFileSync(out, Buffer.concat([...local, ...central, end]))
console.log(`Built ${out} for bot ${appId} on ${host}. Upload it in Teams: Apps → Manage your apps → Upload an app.`)
