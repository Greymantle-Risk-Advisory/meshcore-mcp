// Thin read-only client for a CoreScope MeshCore analyzer instance. All
// endpoints used here are unauthenticated public GET routes (see upstream
// cmd/server/routes.go) — no API key required or sent.
//
// No default upstream is baked in here — every function takes an explicit
// baseUrl so this stays a generic CoreScope client rather than a proxy
// wired to one specific community's server. The deployed Worker resolves
// which instance to use from the CORESCOPE_BASE_URL env var (see
// src/index.ts) so anyone deploying this template points it at their own
// mesh's analyzer instead of inheriting the original author's.

export class CoreScopeError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
		this.name = "CoreScopeError";
	}
}

// MeshCore pubkeys (and the prefixes CoreScope accepts) are hex strings.
// Restricting to this shape blocks path-segment tricks like ".." or "%2e%2e"
// from being normalized by `new URL()` into a different /api/* route than
// the tool intended to expose (e.g. pubkey=".." on /api/nodes/{pk}/health
// would otherwise resolve to /api/health).
const pubkeyPattern = /^[0-9a-fA-F]{4,64}$/;

function assertValidPubkey(pubkey: string): void {
	if (!pubkeyPattern.test(pubkey)) {
		throw new CoreScopeError(400, `invalid pubkey: ${pubkey}`);
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

export function getStats(baseUrl: string) {
	return fetchJSON(baseUrl, "/api/stats");
}

export function getNodes(
	opts: { search?: string; role?: string; region?: string; limit?: string },
	baseUrl: string,
) {
	return fetchJSON(baseUrl, "/api/nodes", opts);
}

export async function getNodeDetail(pubkey: string, baseUrl: string) {
	assertValidPubkey(pubkey);
	return fetchJSON(baseUrl, `/api/nodes/${pubkey}`);
}

export async function getNodeHealth(pubkey: string, baseUrl: string) {
	assertValidPubkey(pubkey);
	return fetchJSON(baseUrl, `/api/nodes/${pubkey}/health`);
}

export async function getNodeNeighbors(pubkey: string, baseUrl: string) {
	assertValidPubkey(pubkey);
	return fetchJSON(baseUrl, `/api/nodes/${pubkey}/neighbors`);
}

export function getObservers(opts: { limit?: string }, baseUrl: string) {
	return fetchJSON(baseUrl, "/api/observers", opts);
}

export function getTopology(baseUrl: string) {
	return fetchJSON(baseUrl, "/api/analytics/topology");
}

export function getRFStats(baseUrl: string) {
	return fetchJSON(baseUrl, "/api/analytics/rf");
}
