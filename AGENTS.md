# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
`dashjie-games` — an **npm workspaces monorepo** (Node ≥ 22, ESM) with several web games sharing one install/test/build/Cloudflare-R2 deploy pipeline. Standard commands live in the root [`README.md`](./README.md); prefer running them from the repo root so they forward to the right workspace.

Workspaces:
- `apps/korea-tactics` (`@dashjie/korea-tactics`) — 决战朝鲜, the main playable game (Vite + TypeScript). Has the richest tooling: vitest unit tests, puppeteer-based layout/playtest checks, and a Monte-Carlo balance simulator.
- `apps/jinyong-heroes` (`@dashjie/jinyong-heroes`) — 金庸群侠传 Classic Engine (Vite + TS + vitest); headless core, no imported original assets.
- `apps/studio-site` (`@dashjie/studio-site`) — `/games/` catalog index page; plain `node` build + `node --test`.
- `packages/deploy` (`@dashjie/deploy`) — syncs each app's `dist/` to Cloudflare R2.

### Running / testing (all from repo root unless noted)
- Dev server (main game): `npm run dev:korea` → Vite on `http://localhost:5173/`. This serves korea-tactics; open the root URL to reach the title screen ("新的战役" starts a campaign).
- Dev server (jinyong landing): `npm run dev:jinyong`.
- Typecheck / test / build across all workspaces: `npm run typecheck`, `npm run test`, `npm run build` (each forwards with `--workspaces --if-present`).
- Full CI-equivalent gauntlet (see [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)): additionally `npm run test:mobile`, `npm run test:viewport`, `npm run test:playtest`, and `npm run sim -- --seeds=80 --campaign-seeds=20 --quiet`.

### Non-obvious gotchas
- `korea-tactics`'s `npm run test` is slow (~40s; 162 tests) because several suites run many simulated battles. This is expected, not a hang.
- `test:mobile` / `test:viewport` / `test:playtest` drive a headless browser via `puppeteer-core` + `@sparticuz/chromium` (no separate Chrome install needed). They pass in the cloud VM. Note `@sparticuz/chromium` prints an `EBADENGINE` warning on Node 22.14 (it wants ≥ 22.17); the warning is harmless and the tests still pass.
- Running `npm run sim` (and the balance gate) **rewrites the tracked file `apps/korea-tactics/reports/balance.md`**. After running the simulator locally, `git checkout -- apps/korea-tactics/reports/balance.md` to avoid committing an unrelated report diff.
- `npm run deploy:r2` needs Cloudflare R2 credentials (`CLOUDFLARE_ACCOUNT_ID`/`CF_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`/`AWS_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`/`AWS_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`/`R2_BUCKET`) and is not needed for local development.
