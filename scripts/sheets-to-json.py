#!/usr/bin/env python3
"""
Turn a folder of vendor spreadsheets into one JSON file the seeder reads.

Why this is a separate step, and in Python: reading .xlsx in Node needs a
dependency, and CLAUDE.md says not to add one without asking. openpyxl is
already on the machine, this runs at development time, and nothing it
produces ships. The seeder that touches the database is TypeScript like
everything else.

What it will not do:

  It never carries a grouping by national origin. Files arrived named
  "Tier 1 Prime Vendors (Indians)" beside "Tier 1 American Prime
  Vendors", and one sheet headed DESI CLIENTS. The contacts in them are
  ordinary firms and are kept; the grouping is dropped and the drop is
  reported, because a record of having removed it is a defence and
  removing it quietly is not. Same rule as lib/work-authorisation.

  It never infers somebody's work authorisation from a sheet name it
  cannot read precisely. A tab called "H1's" says H-1B and that is
  recorded. A file called "GC_Citizens" says one of two different
  statuses and does not say which, so nothing is recorded and the
  report says why. A guess here is a guess about somebody's right to
  work.

Usage:  python3 scripts/sheets-to-json.py <folder> > seed.json
"""

import sys, os, json, re, glob, hashlib

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required: pip install openpyxl")

ORIGIN_WORDS = [
    'desi', 'indian', 'indians', 'american only', 'americans only',
    'whites', 'asians', 'hispanic', 'chinese only', 'nationality',
    'ethnicity', 'race', 'caste',
]

CONSUMER = {
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'live.com', 'msn.com', 'ymail.com', 'rediffmail.com', 'gmx.com',
    'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net',
}

EMAIL_RE = re.compile(r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')


def sorts_by_origin(label):
    t = ' ' + re.sub(r'[^a-z ]+', ' ', (label or '').lower()) + ' '
    return any(f' {w} ' in t for w in ORIGIN_WORDS)


def cell(v):
    return str(v).strip() if v is not None else ''


def emails_in(row):
    return [c for c in (cell(x) for x in row) if EMAIL_RE.match(c)]


def work_auth_from(sheet_label):
    """Only where the label is unambiguous. See the note above."""
    t = sheet_label.lower()
    if 'h1b' in t or "h1's" in t or 'h-1b' in t:
        return 'H1B'
    # "GC_Citizens" names two statuses and does not say which. Nothing
    # is recorded rather than half of it being invented.
    return None


def main(folder):
    people, contacts, refusals, notes = [], [], [], []
    seen_files = set()

    for path in sorted(glob.glob(os.path.join(folder, '*.xlsx'))):
        digest = hashlib.md5(open(path, 'rb').read()).hexdigest()
        if digest in seen_files:
            continue
        seen_files.add(digest)

        fname = os.path.basename(path)
        label = re.sub(r'^[0-9a-f]{8}-', '', fname).replace('Copy_of_', '').replace('.xlsx', '')
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)

        for ws in wb.worksheets:
            scope = f'{label} / {ws.title}'
            if sorts_by_origin(label) or sorts_by_origin(ws.title):
                refusals.append(
                    f'"{scope}" sorts people by where they are from. The contacts were '
                    f'imported; the grouping was not, and nothing records it.'
                )

            rows = [r for r in ws.iter_rows(values_only=True)
                    if any(v not in (None, '') for v in r)]
            if not rows:
                continue

            header = [cell(c) for c in rows[0]]
            kept_cols = [i for i, h in enumerate(header) if not sorts_by_origin(h)]
            for i, h in enumerate(header):
                if i not in kept_cols:
                    refusals.append(f'Column "{h}" in {scope} was dropped; no field records it.')

            hl = ' '.join(header).lower()
            is_candidates = 'skill' in hl
            auth = work_auth_from(f'{label} {ws.title}') if is_candidates else None
            if is_candidates and auth is None:
                notes.append(
                    f'{scope}: work authorisation left unrecorded. The sheet name names a '
                    f'category, not a status, and guessing one is a guess about somebody\'s '
                    f'right to work.'
                )

            body = rows if not any(EMAIL_RE.match(h) for h in header) else rows
            start = 1 if not any(EMAIL_RE.match(h) for h in header) else 0
            if start == 0:
                # A header row that is itself an address — the vendor
                # email lists are shaped this way.
                notes.append(f'{scope}: first row is an address, not a header. Read as data.')

            for r in body[start:]:
                found = emails_in(r)
                if not found:
                    continue
                email = found[0].lower()
                domain = email.split('@')[1]
                # Header-aware where there is a header. The RPO sheet has
                # COMPANY NAME before CONTACT PERSON, and taking the first
                # alphabetic cell filed every contact under their employer's
                # name.
                def by_header(*wanted):
                    for i, h in enumerate(header):
                        hn = h.lower()
                        if any(w in hn for w in wanted) and i < len(r):
                            v = cell(r[i])
                            if v and not EMAIL_RE.match(v):
                                return v
                    return ''

                name = by_header('contact person', 'consultant', 'candidate', 'client name')
                if not name:
                    name = by_header('name')
                if not name:
                    name = next((cell(x) for x in r if cell(x) and not EMAIL_RE.match(cell(x))
                                 and re.match(r"^[A-Za-z][A-Za-z .,'-]+$", cell(x))), '')
                company = by_header('company name', 'company')
                rec = {'email': email, 'name': name.title(), 'domain': domain, 'source': scope}
                if company and company.title() != name.title():
                    rec['company'] = company.title()

                if is_candidates:
                    vals = [cell(x) for x in r]
                    rec['skills'] = next((v for v in vals if ',' in v and not EMAIL_RE.match(v)
                                          and not re.match(r'^[\d .()+-]+$', v)), '')
                    rec['location'] = next((v for v in vals if re.search(r'[A-Za-z]{2,},|\b[A-Z]{2}\b', v)
                                            and v != rec['skills'] and not EMAIL_RE.match(v)), '')
                    rec['workAuth'] = auth
                    people.append(rec)
                elif domain not in CONSUMER:
                    contacts.append(rec)

        wb.close()

    json.dump({
        'contacts': contacts,
        'candidates': people,
        'refused': sorted(set(refusals)),
        'notes': sorted(set(notes)),
    }, sys.stdout, indent=1)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
