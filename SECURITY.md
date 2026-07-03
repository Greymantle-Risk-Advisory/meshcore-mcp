# Security

## Threat model

This is a small, public, unauthenticated MCP server. It holds no secrets,
no user data, and no write capability — it's a read-only proxy over data
that's already public on whichever CoreScope instance the operator
configures (`CORESCOPE_BASE_URL`; no default is baked in). The threat model
is scoped accordingly: the goal isn't to protect private data (there isn't
any), it's to make sure this proxy can't be turned into a vector for
abusing something else — either Cloudflare resources on the deploying
account, or the upstream CoreScope server, which belongs to whichever mesh
community runs it, not this project.

## Why there's no auth

Every endpoint this server wraps (`/api/stats`, `/api/nodes`,
`/api/observers`, `/api/analytics/*`) is an unauthenticated public `GET`
route on the upstream CoreScope instance itself. Adding auth here wouldn't
protect anything that isn't already open — it would just add complexity for
no security benefit. CoreScope's own write/admin routes (`PUT`, `POST`,
`/api/admin/*`) require an API key on the upstream and are never touched by
this server; see `src/corescope.ts`, which only ever issues bare `GET`
requests.

## Mitigations in place

| Risk                                                                                                              | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Where                                                             |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| SSRF to arbitrary hosts                                                                                           | Upstream base URL comes only from the deploy-time `CORESCOPE_BASE_URL` var, resolved server-side; no MCP tool input (args, headers) ever reaches the `fetch()` host                                                                                                                                                                                                                                                                                                           | `wrangler.jsonc` (`vars`), `src/index.ts` (`guarded`)             |
| Path confusion via crafted `pubkey` (e.g. `..` normalizing through `new URL()` into an unintended `/api/*` route) | `pubkey` is validated against a strict hex pattern before being used in any path                                                                                                                                                                                                                                                                                                                                                                                              | `src/corescope.ts` (`assertValidPubkey`)                          |
| Hammering the configured CoreScope instance through this proxy                                                    | Per-IP Cloudflare Rate Limiting, 60 req/min                                                                                                                                                                                                                                                                                                                                                                                                                                   | `wrangler.jsonc` (`ratelimits`), `src/index.ts`                   |
| Unbounded Durable Object accumulation (one per MCP session, no auth gating creation)                              | Every session self-destructs 15 minutes after creation regardless of activity, dropping its storage                                                                                                                                                                                                                                                                                                                                                                           | `src/index.ts` (`SESSION_TTL_SECONDS`, `onStart`, `selfDestruct`) |
| Cache poisoning / cross-caller data bleed                                                                         | Cloudflare's edge cache key includes the full URL + query string, so different filter params land in distinct cache entries                                                                                                                                                                                                                                                                                                                                                   | `src/corescope.ts` (`cf.cacheEverything`)                         |
| Fresh deploy silently proxying to an unintended/unowned instance                                                  | `CORESCOPE_BASE_URL` defaults to an obvious placeholder; every tool call fails with a clear config error until it's set                                                                                                                                                                                                                                                                                                                                                       | `wrangler.jsonc`, `src/index.ts` (`PLACEHOLDER_BASE_URL`)         |
| CI-driven deploy leaking Cloudflare credentials to a malicious PR (this is a public repo — anyone can open one)   | `CLOUDFLARE_API_TOKEN` (scoped to a single Account → Workers Scripts → Edit permission, not the global API key) and `CLOUDFLARE_ACCOUNT_ID` are both repo secrets — never committed to `wrangler.jsonc`, even though the account ID isn't secret by Cloudflare's own classification. The deploy job runs only on `push` to `main`, never on `pull_request` — GitHub Actions doesn't expose secrets to fork PRs by default, and this is a second, explicit gate on top of that | `.github/workflows/ci.yml` (`deploy` job's `if:` and secrets)     |

## Known, accepted risk

**Indirect prompt injection via upstream data.** Node names and other
fields on the mesh are community-submitted content, and tool responses pass
that text straight through to the calling LLM (`jsonResult()` in
`src/index.ts`). A mesh operator could name a node something adversarial.
This is a generic, unresolved risk in any MCP server that wraps
user-generated content — there's no clean server-side fix, since the data
has to reach the model to be useful. Treat tool output from this server as
untrusted data, not instructions.

## Reporting an issue

This is a small project with a small blast radius, but if you find a way to
turn it into an open proxy, a DoS amplifier, or anything else that reaches
past its own Durable Object, please reach out to
[Greymantle Risk Advisory](https://github.com/Greymantle-Risk-Advisory)
directly rather than filing a public issue with exploit details.
