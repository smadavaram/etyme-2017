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

`/api/health` is not enough — it only counts companies, so it passes
against a stale schema. Two better checks:

- **The route test.** Ask for a route that exists only in the new code.
  404 means old code; 401 means it is deployed. `/api/placements/xyz` was
  the marker for the September 9th deploy.
- **The schema test.** Open a placement — `/dashboard/placements/<id>`.
  It reads `BuyContract.supplierSellContractId`, so it renders if the
  schema moved and 500s if it did not.

`scripts/seed-placement-demo.mjs` creates one complete placement to open.
