# Deploying to production

Production is **`smadavaram/etyme2040`**, branch `main`, served at
`https://etyme2040.vercel.app`. Development happens in
**`smadavaram/etyme-2017`**.

## The thing that costs an hour if you don't know it

**The two repositories share no common ancestor.** They hold the same
work as entirely different commit objects — `git merge-base` between them
returns nothing. So a plain `git push deploy <branch>:main` is *always*
rejected as a non-fast-forward, no matter how current your branch is, and
the error reads like a stale-clone problem when it isn't one.

And you cannot fix it by force-pushing. `etyme-2017` still carries the
legacy 2017 Rails tree — 7,834 files, `Gemfile`, `vendor/assets`, the
lot — which `etyme2040` deliberately does not have. Forcing your branch
over `main` would dump all of it into the production repo.

What *is* true, and what makes this easy: for `src/`, `prisma/`,
`scripts/`, `__tests__/`, `__integration__/`, `docs/` and every config
file, the two are byte-identical at the last shared point. Only the Rails
tree differs. So the work replays cleanly.

## The procedure

Replay your commits onto the production branch, rather than pushing your
own branch at it.

```
git remote add deploy https://github.com/smadavaram/etyme2040   # once
git fetch deploy main

git worktree add -b deploy-main /tmp/deploy-wt deploy/main
git -C /tmp/deploy-wt cherry-pick <last-deployed>..<your-branch-name>
```

**Name the branch, never write `HEAD`.** Inside the worktree `HEAD` is
`deploy-main`, so `<last-deployed>..HEAD` resolves to the replayed
history and git tries to cherry-pick it onto itself — which surfaces as
a wall of add/add conflicts on files you never touched, and reads like
the branches have diverged when nothing is wrong.

`<last-deployed>` is the commit in *your* repo matching the tip of
`deploy/main`. **It is not the sha `git log deploy/main` shows you.**
The replay creates new commit objects, so the same change carries one
sha on `deploy/main` and a different one on your branch. Use the
production-side sha as the base and the range resolves to the entire
2017 history — it is not reachable from that sha — and the cherry-pick
tries to replay a Rails hotfix, failing with add/add conflicts on
`.gitignore` and `README.md`. That is exactly what it looks like, and it
has happened.

Get the local sha by message, never by copying:

```
base=$(git log --format=%H --grep='<subject of the deploy/main tip>' -1 <your-branch>)
git -C /tmp/deploy-wt cherry-pick "$base"..<your-branch>
```

`git log --oneline "$base"..<your-branch>` before the pick should list
only the commits you mean to ship. If it lists hundreds, the base is
wrong.

Then verify before pushing. Both of these must hold:

```
# your work and the replay are identical across the app
git diff --stat HEAD deploy-main -- src prisma scripts __tests__ \
  __integration__ docs package.json next.config.mjs tailwind.config.ts \
  tsconfig.json vercel.json middleware.ts        # must be empty

# and no Rails file rode along
git diff --name-only <deploy-tip> deploy-main \
  | grep -cE "^(vendor/|Gemfile|Rakefile|bin/rails|config/|db/migrate)"   # must be 0
```

Push from the repository root, not from inside the worktree:

```
git push deploy deploy-main:main
git worktree remove --force /tmp/deploy-wt
```

## Schema changes

The build runs `scripts/db-sync.mjs` between `prisma generate` and
`next build`. It does nothing unless `DB_PUSH_ON_BUILD` is set to `1`,
`true`, `yes` or `on`.

**Set it before the push, not after.** A deploy that ships new code
against an old schema builds green and then returns 500 on every screen
that reads the changed table — a failed deploy wearing the face of a
successful one.

In the build log, look for:

```
db-sync: DB_PUSH_ON_BUILD=1 — reconciling the database to the schema.
```

If it says `is "..." which is not a yes` or `is not set`, the schema did
not move. Stop before using the site.

Unset the variable afterwards. A destructive step that runs on every
build eventually runs on the wrong build.

## Confirming a deploy actually landed

**Ask `/api/health` which commit it is serving.** Added 2026-09-26, for
the reason below:

```
curl -s https://etyme2040.vercel.app/api/health | python3 -m json.tool | grep -A 5 '"deploy"'
```

It reads `VERCEL_GIT_COMMIT_SHA` and names the sha and the branch.
Compare it against the tip you pushed to `deploy/main` — the production
sha, not the one on your own branch, since the replay makes new objects.
Locally it says so rather than guessing.

### Why that exists, and the two traps it replaces

The 26 September deploy had **no new route**, because every change was
inside routes that already existed. So the route test below had nothing
to ask for, and confirming the deploy meant taking the demo door, reading
`/api/requirements` and checking for a field only the new build sends. It
worked, and it is not a thing anybody should have to invent twice.

**Do not compare asset hashes.** A Vercel build does not reproduce a
local `next build` byte for byte, so a chunk filename from your `.next`
returns 404 on production whether or not the deploy landed. It reads
exactly like a failed deploy and it means nothing. Twenty minutes went
into that before the demo-door check settled it.

### The older checks, still useful

`/api/health`'s `ok` alone is not enough — it counts companies, so it
passes against a stale schema. Beyond the commit:

- **The route test.** Where the deploy *does* add a route, ask for it.
  404 means old code; 401 means it is deployed. `/api/placements/xyz` was
  the marker for the September 9th deploy.
- **The schema test.** Open a placement — `/dashboard/placements/<id>`.
  It reads `BuyContract.supplierSellContractId`, so it renders if the
  schema moved and 500s if it did not.
- **The behavior test**, which needs no new route and is what actually
  settled the 26th: take the demo door and read a field the new code
  sends.

  ```
  curl -s -c ck.txt -X POST https://etyme2040.vercel.app/api/demo \
    -H 'content-type: application/json' -d '{"as":"world-nike","desk":"programme"}'
  curl -s -b ck.txt 'https://etyme2040.vercel.app/api/requirements?limit=1'
  ```

`scripts/seed-placement-demo.mjs` creates one complete placement to open.

## Rebuilding the demo world after a deploy

`POST /api/seed-world` only ever adds: a world seeded in March goes on
reading as March, and a fix to how the seed writes something never
reaches rows that already exist. To carry a deploy's seed fixes and
today's dates into the live demo, rebuild it — once, after the deploy
has landed (check `/api/health` first):

```
curl -s -X POST https://etyme2040.vercel.app/api/seed-world/rebuild \
  -H "authorization: Bearer $CRON_SECRET" \
  -H 'content-type: application/json' \
  -d '{"confirm":"delete the demo world"}' | python3 -m json.tool
```

Then run the seed until it says the world is complete:

```
until curl -s -X POST https://etyme2040.vercel.app/api/seed-world \
    -H "authorization: Bearer $CRON_SECRET" | tee /dev/stderr \
  | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin)["data"]["done"] else 1)'
do sleep 2; done
```

Each call prints one line of JSON: `done`, the steps it `ran`, how many
it `skipped` as already finished, the `next` step and how many are
`remaining`. The loop stops on `"done": true`. A call that fails prints
an error with no `data`, the check fails, and the loop calls again —
which is safe, because every step is idempotent. If it goes on failing
with the same error, stop it (Ctrl-C) and read the error.

**Why a loop.** The world is about 9,600 queries on an empty database
and about 3,000 to walk again once it exists, measured locally on
2026-09-29. Against the production database in another building that is
more than one function call's sixty seconds, and until 2026-09-29 every
call started from the top, re-checked what was already there, and was
cut off before it reached what was not — eight calls in a row timed out
and the world never finished. Now the seed is a list of named steps
(`worldStepNames` in `lib/seed-world`). A call skips every step already
finished for this world at this deployment, runs the next ones until
thirty seconds have passed, and says what is left. Each finished step
leaves a `DEMO_SEED_STEP` row in the automation log, with no company,
which the next call reads. Expect about a dozen calls for a fresh world
and about five after a deploy — timed on 2026-09-29 through a proxy
adding 40 ms to every round trip, which is slower than production has
shown. Once it is done, a call costs two queries and writes nothing.

**Every step fits in the thirty seconds held back for it.** The first
stepped deploy stuck on `order-to-cash:books`, which timed out six calls
running: it read every posting, invoice and payment in the database —
not only the world's — and wrote each journal entry as its own
transaction, 1,728 queries for the world alone. The books are now four
shares that each write in one transaction; the postings are fourteen
shares, each client program two steps, and standing three. No step
makes more than about 320 queries on a fresh world or 215 walked again
— about fifteen seconds at the slowest production has shown, 46 ms a
query — and `__integration__/seed-step-size.test.ts` fails on any step
past 350.

**The seed writes the demo world and nothing else.** Every read in it is
bounded by the roster or by an address nobody can register, so a real
firm's postings, books, invoices, bills and submissions, and a real
person's CV and paperwork, are never touched
(`__integration__/seed-stays-in-its-world.test.ts`). Until 2026-09-29
several steps read the whole database; see that test for what each one
used to reach.

**A new deployment walks every step again**, because the marker carries
the deployment's commit and a new commit may seed more than the last
one did. That is the same bounded loop, not a timeout.

**Run the seed again, not the rebuild.** The rebuild starts the seed
itself and returns part way with `"done": false`; that is expected. A
second rebuild would delete the half-built world and start over.

**The time limit.** Both seed routes declare `maxDuration = 60`.
Checked on 2026-09-29: the repository has no `.vercel` project link and
`vercel.json` sets no function limits, so the plan could not be read
from here. With Fluid compute on (Project Settings → Functions) Vercel
allows 300 seconds on every plan; without it Hobby stops at 60, and a
deployment whose `maxDuration` is above what its plan allows fails to
build. So 60 stays until somebody confirms Fluid compute is on. Then
raise it in both `app/api/seed-world/route.ts` and
`app/api/seed-world/rebuild/route.ts`; the budget is read off it
(`seedBudgetMs` in `lib/seed-steps`), so each call does more and the
loop above is shorter, with no other change.

**What it deletes.** Every company on the seed's own roster (never by
the `world-` prefix — a real firm can have that slug), every other
company whose seats are all at reserved addresses (`.example`,
`.invalid`, `.local`), the people at reserved addresses, and every row
that points at any of them. It never touches a visitor's own sandbox,
a lead from the site, an incident or a run of the nightly job, and it
writes one `DEMO_WORLD_REBUILT` row to the automation log. The old
world's `DEMO_SEED_STEP` markers go with it, counted on that row.

**When it refuses.** `409 TIED_TO_REAL_DATA` means something real
points into the demo world — a real firm's contract with a demo
client, somebody at a real address seated at a demo firm, a real firm
that starred a demo person. Nothing was deleted; the message names
each tie. End or remove the tie, or leave the demo world as it is. No
secret is `401`, no secret configured is `503`, and a body without the
exact phrase is `400` — none of them deletes anything.
