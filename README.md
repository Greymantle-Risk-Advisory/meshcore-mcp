# meshcore-mcp

[![CI](https://github.com/Greymantle-Risk-Advisory/meshcore-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Greymantle-Risk-Advisory/meshcore-mcp/actions/workflows/ci.yml) 

> **Built with spec-driven AI development.** This project was designed and
> implemented using AI-assisted, specification-first development practices
> (Claude Code), under the direction and review of a senior engineer and
> security professional at [Greymantle Risk Advisory](https://github.com/Greymantle-Risk-Advisory).
> Architecture, security posture, and every change were human-reviewed
> before merge — see [SECURITY.md](SECURITY.md) for the threat model and
> [docs/architecture.md](docs/architecture.md) for the design rationale.

A public, read-only [MCP](https://modelcontextprotocol.io) server that
exposes live telemetry from a [CoreScope](https://github.com/Kpa-clawbot/CoreScope)
MeshCore analyzer instance as MCP tools.

Runs as a Cloudflare Worker. No auth — every wrapped endpoint is an
unauthenticated public `GET` route on the upstream analyzer, so this server
holds no credentials and performs no writes. See
[docs/architecture.md](docs/architecture.md) for the request flow and
[SECURITY.md](SECURITY.md) for the threat model and abuse-resistance
measures (rate limiting, session TTL, input validation) already in place.

## Configuration

No upstream is baked in. Set `CORESCOPE_BASE_URL` in `wrangler.jsonc`
(`vars`) to the CoreScope instance you want this server to proxy before
deploying — it's a plain public URL, not a secret, so a `vars` entry is
fine. Left at its placeholder value, every tool call fails with a clear
config error instead of silently hitting some other mesh's server.

`MESH_NAME` (also in `vars`) is your mesh's human-readable name, used in
MCP tool descriptions (e.g. "Network-wide summary stats for _Nebraska
Mesh_"). Purely cosmetic — falls back to a generic phrase if unset, no
config error like `CORESCOPE_BASE_URL`.

## Tools

| Tool               | Description                                        | Params                                  |
| ------------------ | -------------------------------------------------- | --------------------------------------- |
| `mesh_stats`       | Network-wide summary (node/observer/packet counts) | —                                       |
| `mesh_nodes`       | List/search nodes                                  | `search?`, `role?`, `region?`, `limit?` |
| `mesh_node_detail` | Profile + health + neighbors for one node          | `pubkey` (hex)                          |
| `mesh_observers`   | List observer stations                             | `limit?`                                |
| `mesh_topology`    | Neighbor-graph / topology analytics                | —                                       |
| `mesh_rf_stats`    | SNR/RSSI distributions across the mesh             | —                                       |

## Develop

```bash
cp .dev.vars.example .dev.vars   # point local dev at a real CoreScope instance
npm install
npm test          # vitest
npm run type-check
npm run dev        # wrangler dev, serves on http://localhost:8787/mcp
```

`.dev.vars` is gitignored and only used by `wrangler dev` — it never ships.
Deployed config lives in `wrangler.jsonc`'s `vars` (see Configuration above).

## Deploy

**Automatic:** every push to `main` that passes CI deploys via
`.github/workflows/ci.yml`'s `deploy` job
([cloudflare/wrangler-action](https://github.com/cloudflare/wrangler-action)).
Neither the account ID nor the API token is committed anywhere — both are
repo secrets, set once:

```bash
gh secret set CLOUDFLARE_ACCOUNT_ID --repo Greymantle-Risk-Advisory/meshcore-mcp
gh secret set CLOUDFLARE_API_TOKEN --repo Greymantle-Risk-Advisory/meshcore-mcp
```

Run those yourself in your own terminal so neither value is ever pasted
into a chat, PR, or commit — `gh` prompts for each without echoing.

- **Account ID**: Workers & Pages → Overview in the Cloudflare dashboard
  (right sidebar), or `wrangler whoami`. It's a 32-character hex string,
  not your account email.
- **API token**: create a _custom_ token (not the "Edit Cloudflare
  Workers" template — that bundles Routes/KV/R2 permissions this project
  doesn't use) scoped to exactly one permission: **Account → Workers
  Scripts → Edit**. That single scope covers the Worker script, Durable
  Object migrations, and bindings — everything `wrangler deploy` needs
  for a `*.workers.dev` deployment with no custom domain.

The deploy job only runs on `push` to `main`, never on `pull_request` (GitHub
Actions doesn't expose secrets to fork PRs by default anyway, but this
is an explicit second gate, not just a reliance on that default). See
[SECURITY.md](SECURITY.md) for the full reasoning.

**Manual:** `wrangler` also needs the account ID as a real env var for
local commands (`wrangler.jsonc` intentionally has no `account_id` field):

```bash
CLOUDFLARE_ACCOUNT_ID=<your account id> npm run deploy
```

## Connect a client

Cloudflare AI Playground: https://playground.ai.cloudflare.com/, enter the
deployed `/mcp` URL.

Claude Desktop (via [mcp-remote](https://www.npmjs.com/package/mcp-remote)):

```json
{
	"mcpServers": {
		"meshcore": {
			"command": "npx",
			"args": ["mcp-remote", "https://<your-worker>.workers.dev/mcp"]
		}
	}
}
```

## License

[GPL-3.0-or-later](LICENSE). This project is released **unsupported and
with no warranty of any kind** — see the license for the full disclaimer.
That said, pull requests are welcome; see [AGENTS.md](AGENTS.md) for the
conventions this codebase expects.
