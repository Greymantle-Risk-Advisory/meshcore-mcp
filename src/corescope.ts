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

// POST variant for the handful of upstream endpoints that take a JSON body
// (they're POST because they need a body, not because they write anything —
// see SECURITY.md). Not edge-cached: a POST body isn't part of Cloudflare's
// default cache key, so caching here would risk serving one caller's
// response to another with a different body.
async function postJSON(baseUrl: string, path: string, body: unknown): Promise<unknown> {
	const url = new URL(path, baseUrl);
	const res = await fetch(url.toString(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		// Upstream returns a specific {"error": "..."} body on 400s for these
		// endpoints (e.g. "prefixes must be even-length hex") — surface that
		// instead of just the generic status text when it's available.
		let detail = res.statusText;
		try {
			const errBody = (await res.json()) as { error?: string };
			if (errBody?.error) detail = errBody.error;
		} catch {
			// body wasn't JSON (or was empty) — fall back to statusText
		}
		throw new CoreScopeError(res.status, `CoreScope request failed: ${res.status} ${detail}`);
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

// Mirrors upstream's own limit (cmd/server/routes.go handleBatchObservations)
// so a too-large request fails fast with a clear MCP error instead of a
// generic upstream 400.
const maxObservationHashes = 200;

export async function getBatchObservations(hashes: string[], baseUrl: string) {
	if (hashes.length > maxObservationHashes) {
		throw new CoreScopeError(
			400,
			`too many hashes (max ${maxObservationHashes}, got ${hashes.length})`,
		);
	}
	return postJSON(baseUrl, "/api/packets/observations", { hashes });
}

export async function decodePacket(hex: string, baseUrl: string) {
	const trimmed = hex.trim();
	if (!trimmed) {
		throw new CoreScopeError(400, "hex is required");
	}
	return postJSON(baseUrl, "/api/decode", { hex: trimmed });
}

export interface PathInspectContext {
	observerId?: string;
	since?: string;
	until?: string;
}

// Mirrors upstream's own bounds (cmd/server/path_inspect.go): 1-64 prefixes,
// even-length hex, all the same byte length, max 3 bytes (6 hex chars) each.
// Upstream validates all of this itself and returns a specific error message
// per violation, so this only checks the cheap, unambiguous case (count) —
// everything else is left to postJSON's error-detail passthrough rather than
// duplicating upstream's exact validation rules here.
const maxPathInspectPrefixes = 64;

export async function inspectPath(
	prefixes: string[],
	context: PathInspectContext | undefined,
	limit: number | undefined,
	baseUrl: string,
) {
	if (prefixes.length === 0 || prefixes.length > maxPathInspectPrefixes) {
		throw new CoreScopeError(
			400,
			`prefixes must be 1-${maxPathInspectPrefixes} items (got ${prefixes.length})`,
		);
	}
	return postJSON(baseUrl, "/api/paths/inspect", { prefixes, context, limit });
}
