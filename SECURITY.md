# Security

## Threat model

This is a small, public, unauthenticated MCP server. It holds no secrets,
no user data, and no write capability — it's a read-only proxy over data
that's already public on [nebraskamesh.net](https://nebraskamesh.net). The
threat model is scoped accordingly: the goal isn't to protect private data
(there isn't any), it's to make sure this proxy can't be turned into a
vector for abusing something else — either Cloudflare resources on this
account, or the upstream CoreScope server, which belongs to the Nebraska
mesh community, not this project.

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

| Risk                                                                                                              | Mitigation                                                                                                                  | Where                                                             |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| SSRF to arbitrary hosts                                                                                           | Upstream base URL is a hardcoded constant; no caller input ever reaches the `fetch()` host                                  | `src/corescope.ts` (`DEFAULT_BASE_URL`)                           |
| Path confusion via crafted `pubkey` (e.g. `..` normalizing through `new URL()` into an unintended `/api/*` route) | `pubkey` is validated against a strict hex pattern before being used in any path                                            | `src/corescope.ts` (`assertValidPubkey`)                          |
| Hammering nebraskamesh.net through this proxy                                                                     | Per-IP Cloudflare Rate Limiting, 60 req/min                                                                                 | `wrangler.jsonc` (`ratelimits`), `src/index.ts`                   |
| Unbounded Durable Object accumulation (one per MCP session, no auth gating creation)                              | Every session self-destructs 15 minutes after creation regardless of activity, dropping its storage                         | `src/index.ts` (`SESSION_TTL_SECONDS`, `onStart`, `selfDestruct`) |
| Cache poisoning / cross-caller data bleed                                                                         | Cloudflare's edge cache key includes the full URL + query string, so different filter params land in distinct cache entries | `src/corescope.ts` (`cf.cacheEverything`)                         |

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

This is a hobby project with a small blast radius, but if you find a way to
turn it into an open proxy, a DoS amplifier, or anything else that reaches
past its own Durable Object, please open an issue or reach out to
[@commandline-johnny](https://github.com/commandline-johnny) directly
rather than filing a public issue with exploit details.
