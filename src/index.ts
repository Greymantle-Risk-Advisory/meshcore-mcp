import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import * as corescope from "./corescope";

function jsonResult(data: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

// Public, read-only MCP proxy over the CoreScope MeshCore analyzer running
// at nebraskamesh.net. All wrapped endpoints are unauthenticated GET routes
// on the upstream — this server holds no credentials and performs no writes.
export class MeshcoreMCP extends McpAgent {
	server = new McpServer({
		name: "meshcore-mcp",
		version: "1.0.0",
	});

	async init() {
		this.server.registerTool(
			"mesh_stats",
			{
				description:
					"Network-wide summary stats for the Nebraska MeshCore mesh (node/observer/packet counts).",
				inputSchema: {},
			},
			async () => jsonResult(await corescope.getStats()),
		);

		this.server.registerTool(
			"mesh_nodes",
			{
				description:
					"List/search mesh nodes, optionally filtered by name search, role, or region.",
				inputSchema: {
					search: z.string().optional(),
					role: z.string().optional(),
					region: z.string().optional(),
					limit: z.string().optional(),
				},
			},
			async (opts) => jsonResult(await corescope.getNodes(opts)),
		);

		this.server.registerTool(
			"mesh_node_detail",
			{
				description:
					"Full detail for one node by pubkey: profile, health, and known neighbors.",
				inputSchema: { pubkey: z.string() },
			},
			async ({ pubkey }) => {
				const [detail, health, neighbors] = await Promise.all([
					corescope.getNodeDetail(pubkey),
					corescope.getNodeHealth(pubkey),
					corescope.getNodeNeighbors(pubkey),
				]);
				return jsonResult({ detail, health, neighbors });
			},
		);

		this.server.registerTool(
			"mesh_observers",
			{
				description:
					"List observer stations (the receivers feeding packet data into the analyzer).",
				inputSchema: { limit: z.string().optional() },
			},
			async (opts) => jsonResult(await corescope.getObservers(opts)),
		);

		this.server.registerTool(
			"mesh_topology",
			{
				description: "Mesh network topology / neighbor-graph analytics.",
				inputSchema: {},
			},
			async () => jsonResult(await corescope.getTopology()),
		);

		this.server.registerTool(
			"mesh_rf_stats",
			{
				description: "RF quality analytics across the mesh (SNR/RSSI distributions).",
				inputSchema: {},
			},
			async () => jsonResult(await corescope.getRFStats()),
		);
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/mcp") {
			// Key on caller IP so one noisy MCP client can't monopolize the
			// shared cap against nebraskamesh.net's upstream infra.
			const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
			const { success } = await env.RATE_LIMITER.limit({ key: ip });
			if (!success) {
				return new Response("Rate limit exceeded", { status: 429 });
			}
			return MeshcoreMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
