# AGENTS.md

Guidance for AI coding agents working in this repo.

## What this is

A public, read-only MCP server on a Cloudflare Worker that proxies a
CoreScope MeshCore analyzer instance. No database, no user accounts, no
secrets. See [docs/architecture.md](docs/architecture.md) for the request
flow and [SECURITY.md](SECURITY.md) for the threat model — read both before
touching `src/index.ts` or `src/corescope.ts`.

## Commands

```bash
npm install
npm test           # vitest — run before every commit
npm run type-check  # tsc --noEmit
npm run lint:fix    # oxlint --fix
npm run format      # oxfmt --write .
npm run dev         # wrangler dev, http://localhost:8787/mcp
npm run deploy      # wrangler deploy (requires Cloudflare auth)
```

`test`, `type-check`, `lint`, and `format:check` all run in CI
(`.github/workflows/ci.yml`) on every push and PR — run them locally before
committing, since a failing CI run on a one-person repo is just a slower
feedback loop, not a real gate.

## Conventions

- **TDD.** `src/corescope.ts` (the upstream client) is unit-tested with
  mocked `fetch` in `src/corescope.test.ts`. Add tests before adding
  behavior, not after — this codebase is small enough that "after" never
  actually happens.
- **No secrets, ever.** `CORESCOPE_BASE_URL` is a public URL, not a secret
  — it belongs in `wrangler.jsonc`'s `vars`, not `wrangler secret`. If a
  future change genuinely needs a secret, use `wrangler secret put`, never
  a committed file.
- **Every tool call must resolve its config through `guarded()`** in
  `src/index.ts`, not read `env.CORESCOPE_BASE_URL` directly — that's what
  turns "server misconfigured" into a readable MCP tool error instead of
  an unhandled exception.
- **New tools wrap exactly one thing.** Each `mesh_*` tool maps to one (or
  a small combined set of) CoreScope `GET` endpoint. Don't add a tool that
  needs new upstream write capability — this server is read-only by design
  (see SECURITY.md's "why there's no auth" section) and that's load-bearing
  for the whole no-auth posture, not incidental.
- **Local dev config**: copy `.dev.vars.example` to `.dev.vars` (gitignored)
  to point `wrangler dev` at a real CoreScope instance without touching
  `wrangler.jsonc`.

## Before touching `wrangler.jsonc`

Changes here (Durable Object bindings, rate limits, vars) have real
runtime consequences on a public, no-auth service. Re-read
[SECURITY.md](SECURITY.md)'s mitigations table first — most fields in that
file exist because of a specific abuse scenario, not by default-template
inertia.

## Before touching `.github/workflows/ci.yml`

The `deploy` job runs `wrangler deploy` with two Cloudflare credentials
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) on every push to `main`.
This is a public repo, so:

- Never change the `deploy` job's trigger to run on `pull_request` (only
  `push` to `main`) — that would expose both secrets to anyone who opens a
  PR, fork or not.
- Never add a step to `deploy` that echoes, logs, or otherwise surfaces
  `secrets.CLOUDFLARE_API_TOKEN` or `secrets.CLOUDFLARE_ACCOUNT_ID`.
- Never add `account_id` to `wrangler.jsonc` — it's intentionally absent so
  neither credential is committed, even though Cloudflare itself doesn't
  treat the account ID as sensitive. Wrangler picks it up from the
  `CLOUDFLARE_ACCOUNT_ID` env var instead.
- If you're proposing this change as a PR from a fork: expect the `deploy`
  job to simply not run for you (no secret access) — that's correct
  behavior, not a bug to work around.
