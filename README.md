# meshcore-mcp

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

```bash
npm run deploy
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
