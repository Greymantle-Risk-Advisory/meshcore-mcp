import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import * as corescope from "./corescope";

function jsonResult(data: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function errorResult(message: string) {
	return {
		content: [{ type: "text" as const, text: message }],
		isError: true as const,
	};
}

// Matches the placeholder in wrangler.jsonc's `vars.CORESCOPE_BASE_URL`. No
// real upstream is baked in — a fresh deploy that forgets to set this
// should fail loudly with a helpful tool error, not silently start sending
// traffic to whatever instance the template's original author used.
const PLACEHOLDER_BASE_URL = "https://changeme.invalid";

// Runs a tool body, resolving the configured CoreScope base URL and turning
// any thrown error (missing config, invalid pubkey, upstream failure) into
// an MCP tool error result instead of an unhandled exception.
async function guarded(env: Env, work: (baseUrl: string) => Promise<unknown>) {
	try {
		const baseUrl = env.CORESCOPE_BASE_URL;
		if (!baseUrl || baseUrl === PLACEHOLDER_BASE_URL) {
			throw new Error(
				"This server has no CoreScope instance configured. The operator " +
					"needs to set CORESCOPE_BASE_URL in wrangler.jsonc to their " +
					"CoreScope deployment's URL before this tool can be used.",
			);
		}
		return jsonResult(await work(baseUrl));
	} catch (err) {
		return errorResult(err instanceof Error ? err.message : String(err));
	}
}

// Each MCP session backs onto its own Durable Object (Cloudflare's `agents`
// framework). With no auth, anyone can open a session, so without a ceiling
// an attacker could accumulate unbounded DOs over time. SESSION_TTL_SECONDS
// caps every session's lifetime from creation — self-destructing (dropping
// its storage) regardless of activity — so the live/stored DO count stays
// bounded by (rate-limit-capped creation rate) x (this TTL) instead of
// growing without limit. See onStart()/selfDestruct() below.
const SESSION_TTL_SECONDS = 15 * 60;

// Public, read-only MCP proxy over an operator-configured CoreScope MeshCore
// analyzer instance (CORESCOPE_BASE_URL). All wrapped endpoints are
// unauthenticated GET routes on the upstream — this server holds no
// credentials and performs no writes.
export class MeshcoreMCP extends McpAgent {
	server = new McpServer({
		name: "meshcore-mcp",
		version: "1.0.0",
	});

	async onStart(props?: Record<string, unknown>) {
		await super.onStart(props);
		// idempotent: true means this schedule is only created once per
		// session (repeat calls on DO wake are no-ops) — the TTL runs from
		// first connect, it does not reset on activity.
		await this.schedule(SESSION_TTL_SECONDS, "selfDestruct", undefined, {
			idempotent: true,
		});
	}

	async selfDestruct() {
		await this.destroy();
	}

	async init() {
		// Cosmetic only (unlike CORESCOPE_BASE_URL, an empty/placeholder value
		// here has no security implication) — just falls back to a generic
		// phrase so tool descriptions still read sensibly if unset.
		const meshName = this.env.MESH_NAME || "this MeshCore network";

		this.server.registerTool(
			"mesh_stats",
			{
				description: `Network-wide summary stats for ${meshName} (node/observer/packet counts).`,
				inputSchema: {},
			},
			async () => guarded(this.env, (baseUrl) => corescope.getStats(baseUrl)),
		);

		this.server.registerTool(
			"mesh_nodes",
			{
				description: `List/search nodes on ${meshName}, optionally filtered by name search, role, or region.`,
				inputSchema: {
					search: z.string().optional(),
					role: z.string().optional(),
					region: z.string().optional(),
					limit: z.string().optional(),
				},
			},
			async (opts) => guarded(this.env, (baseUrl) => corescope.getNodes(opts, baseUrl)),
		);

		this.server.registerTool(
			"mesh_node_detail",
			{
				description: `Full detail for one node on ${meshName} by pubkey: profile, health, and known neighbors.`,
				inputSchema: { pubkey: z.string() },
			},
			async ({ pubkey }) =>
				guarded(this.env, async (baseUrl) => {
					const [detail, health, neighbors] = await Promise.all([
						corescope.getNodeDetail(pubkey, baseUrl),
						corescope.getNodeHealth(pubkey, baseUrl),
						corescope.getNodeNeighbors(pubkey, baseUrl),
					]);
					return { detail, health, neighbors };
				}),
		);

		this.server.registerTool(
			"mesh_observers",
			{
				description: `List observer stations on ${meshName} (the receivers feeding packet data into the analyzer).`,
				inputSchema: { limit: z.string().optional() },
			},
			async (opts) => guarded(this.env, (baseUrl) => corescope.getObservers(opts, baseUrl)),
		);

		this.server.registerTool(
			"mesh_topology",
			{
				description: `${meshName} network topology / neighbor-graph analytics.`,
				inputSchema: {},
			},
			async () => guarded(this.env, (baseUrl) => corescope.getTopology(baseUrl)),
		);

		this.server.registerTool(
			"mesh_rf_stats",
			{
				description: `RF quality analytics across ${meshName} (SNR/RSSI distributions).`,
				inputSchema: {},
			},
			async () => guarded(this.env, (baseUrl) => corescope.getRFStats(baseUrl)),
		);
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/mcp") {
			// Key on caller IP so one noisy MCP client can't monopolize the
			// shared cap against the configured CoreScope instance's upstream infra.
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
