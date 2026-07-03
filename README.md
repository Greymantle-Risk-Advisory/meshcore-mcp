# meshcore-mcp

A public, read-only [MCP](https://modelcontextprotocol.io) server exposing live
telemetry from the Nebraska Mesh [CoreScope](https://github.com/Kpa-clawbot/CoreScope)
MeshCore analyzer at [nebraskamesh.net](https://nebraskamesh.net).

Runs as a Cloudflare Worker. No auth — every wrapped endpoint is an
unauthenticated public `GET` route on the upstream analyzer, so this server
holds no credentials and performs no writes.

## Tools

- `mesh_stats` — network-wide summary (node/observer/packet counts)
- `mesh_nodes` — list/search nodes by name, role, or region
- `mesh_node_detail` — profile + health + neighbors for one node by pubkey
- `mesh_observers` — list observer stations
- `mesh_topology` — neighbor-graph / topology analytics
- `mesh_rf_stats` — SNR/RSSI distributions across the mesh

## Develop

```bash
npm install
npm test          # vitest
npm run type-check
npm run dev        # wrangler dev, serves on http://localhost:8787/mcp
```

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
