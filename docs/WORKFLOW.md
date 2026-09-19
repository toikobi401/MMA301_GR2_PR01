# Team workflow

Two developers, one repository, no stepping on each other.

## Branches

`main` is always deployable. Never commit to it directly.

```
feat/library-search
fix/token-refresh-loop
chore/upgrade-expo
```

Open a pull request, let CI pass, then merge. CI runs typecheck, tests, and a
Docker build on every pull request.

## Splitting the work

| Owner | Scope |
|---|---|
| Developer A | `apps/server`, `packages/poker`, `infra` |
| Developer B | `apps/client` — screens and components |
| Both | `packages/shared` — change it together |

`packages/shared` is the seam. Agree on a schema there before either side
starts, and the two halves meet without a merge conflict.

## Commit messages

```
feat: add refresh token rotation
fix: stop player seeking past duration
docs: explain transcode cache eviction
chore: bump expo to 57.0.21
```

## Before pushing

```bash
npm run typecheck
npm test
```

Both must pass. CI will reject the pull request otherwise.

## When the database setup changes

Collections, validators, and indexes live in `infra/mongo/init/`. The script is
idempotent, so it is safe to re-run, but existing collections keep the
validator they were created with.

Say so in the pull request description: your teammate needs
`npm run docker:reset` to pick up a changed validator, and that wipes their
local data.

## Environment variables

Add every new variable in three places:

1. `packages/shared/src/env.ts` — so a missing value fails at boot
2. `.env.example` — so your teammate knows it exists
3. `infra/docker-compose.yml` — so the container receives it

Skipping step 2 is the most common cause of "it works on my machine".
