// Thin read-only client for the CoreScope MeshCore analyzer API.
// All endpoints used here are unauthenticated public GET routes (see
// upstream cmd/server/routes.go) — no API key required or sent.

export const DEFAULT_BASE_URL = "https://nebraskamesh.net";

export class CoreScopeError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
		this.name = "CoreScopeError";
	}
}

async function fetchJSON(
	baseUrl: string,
	path: string,
	params?: Record<string, string | undefined>,
): Promise<unknown> {
	const url = new URL(path, baseUrl);
	for (const [key, value] of Object.entries(params ?? {})) {
		if (value !== undefined && value !== "") url.searchParams.set(key, value);
	}
	// cf.cacheTtl uses Cloudflare's edge cache so repeated tool calls don't
	// hammer the origin — a good-citizen default for a public MCP proxy.
	const res = await fetch(url.toString(), {
		cf: { cacheTtl: 30, cacheEverything: true },
	});
	if (!res.ok) {
		throw new CoreScopeError(
			res.status,
			`CoreScope request failed: ${res.status} ${res.statusText}`,
		);
	}
	return res.json();
}

export function getStats(baseUrl = DEFAULT_BASE_URL) {
	return fetchJSON(baseUrl, "/api/stats");
}

export function getNodes(
	opts: { search?: string; role?: string; region?: string; limit?: string },
	baseUrl = DEFAULT_BASE_URL,
) {
	return fetchJSON(baseUrl, "/api/nodes", opts);
}

export function getNodeDetail(pubkey: string, baseUrl = DEFAULT_BASE_URL) {
	return fetchJSON(baseUrl, `/api/nodes/${encodeURIComponent(pubkey)}`);
}

export function getNodeHealth(pubkey: string, baseUrl = DEFAULT_BASE_URL) {
	return fetchJSON(baseUrl, `/api/nodes/${encodeURIComponent(pubkey)}/health`);
}

export function getNodeNeighbors(pubkey: string, baseUrl = DEFAULT_BASE_URL) {
	return fetchJSON(
		baseUrl,
		`/api/nodes/${encodeURIComponent(pubkey)}/neighbors`,
	);
}

export function getObservers(
	opts: { limit?: string },
	baseUrl = DEFAULT_BASE_URL,
) {
	return fetchJSON(baseUrl, "/api/observers", opts);
}

export function getTopology(baseUrl = DEFAULT_BASE_URL) {
	return fetchJSON(baseUrl, "/api/analytics/topology");
}

export function getRFStats(baseUrl = DEFAULT_BASE_URL) {
	return fetchJSON(baseUrl, "/api/analytics/rf");
}
