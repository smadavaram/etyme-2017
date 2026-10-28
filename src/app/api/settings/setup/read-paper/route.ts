import { NextRequest, NextResponse } from 'next/server'
import { setupDoor, refused } from '../door'
import {
  readPaperByRules, textOfUpload, PAPER_WORDS, FILL_FIELD_WORDS, MAX_PAPER_BYTES, type ReadValue,
} from '@/lib/setup-fill'
import { readMissingWithModel } from '@/lib/setup-fill-model'

/**
 * POST /api/settings/setup/read-paper — a W-9 or a certificate of
 * insurance, as a file or its text; answers what it says, with the words
 * each value was read from. Writes nothing.
 *
 * "Fetch from any source" (founder, 2026-10-27): a paper the company
 * uploads is read by rules first, and by the model only where the company
 * turned it on, masked and logged; every value is shown with its quote
 * and confirmed by a person before it is recorded. The file itself is
 * read and not kept: the values go on the record only on Save, and the
 * certificate goes on file through the company's own papers.
 */

const ALLOWED = /^(application\/pdf|text\/plain|text\/csv)$/

export async function POST(request: NextRequest) {
  const door = await setupDoor(request, 'Reading a paper for setup')
  if (door.error) return door.error

  let text = ''
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string') return refused('Choose the file of your W-9 or your certificate of insurance.')
    if (file.size > MAX_PAPER_BYTES) return refused('That file is larger than 2 MB. A W-9 or a certificate is a page or two: send that page.')
    if (file.type && !ALLOWED.test(file.type)) return refused('Send the paper as a PDF or as text. Etyme cannot read a photo of it yet: type the values instead.')
    text = textOfUpload(Buffer.from(await file.arrayBuffer()), file.type, file.name)
  } else {
    const body = await request.json().catch(() => ({}))
    text = String(body.text ?? '').slice(0, MAX_PAPER_BYTES)
  }
  if (!text.trim()) {
    return refused('Etyme found no words in that file. A scanned page has none to read: type the values, or paste the text of the form.')
  }

  const rules = readPaperByRules(text)
  if (rules.kind === 'UNKNOWN') {
    return refused('This does not read as a W-9 or a certificate of insurance. Type the values instead.')
  }
  const model = await readMissingWithModel({
    companyId: door.caller.company.id, personId: door.personId, kind: rules.kind, text, missing: rules.missing,
  })
  const values: ReadValue[] = [...rules.values, ...model.values]
  return NextResponse.json({
    data: {
      kind: rules.kind,
      paper: PAPER_WORDS[rules.kind],
      values: values.map((v) => ({ ...v, label: FILL_FIELD_WORDS[v.field] })),
      missing: rules.missing.filter((f) => !values.some((v) => v.field === f)).map((f) => FILL_FIELD_WORDS[f]),
      says: values.length
        ? `Read from your ${PAPER_WORDS[rules.kind]}. Check each value against the paper, then use it. Nothing is saved until you press Save.`
        : `Etyme could not read the values on this ${PAPER_WORDS[rules.kind]}. Type them instead.`,
      modelSays: model.says || null,
    },
  })
}
