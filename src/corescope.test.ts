import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CoreScopeError,
	decodePacket,
	getBatchObservations,
	getNodeDetail,
	getNodeHealth,
	getNodeNeighbors,
	getNodes,
	getStats,
	inspectPath,
} from "./corescope";

function mockFetch(status: number, body: unknown) {
	return vi.fn(async (_input: string, _init?: RequestInit) => ({
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? "OK" : "Error",
		json: async () => body,
	}));
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("corescope client", () => {
	it("getStats hits /api/stats on the given base URL", async () => {
		const fetchMock = mockFetch(200, { totalNodes: 42 });
		vi.stubGlobal("fetch", fetchMock);

		const result = await getStats("https://example.test");

		expect(fetchMock).toHaveBeenCalledOnce();
		const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
		expect(calledUrl).toBe("https://example.test/api/stats");
		expect(result).toEqual({ totalNodes: 42 });
	});

	it("getNodes forwards query params, skipping undefined/empty ones", async () => {
		const fetchMock = mockFetch(200, { nodes: [] });
		vi.stubGlobal("fetch", fetchMock);

		await getNodes({ search: "cmlj", role: undefined, region: "" }, "https://example.test");

		const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
		expect(calledUrl).toBe("https://example.test/api/nodes?search=cmlj");
	});

	it("getNodeDetail builds the path from a valid hex pubkey", async () => {
		const fetchMock = mockFetch(200, {});
		vi.stubGlobal("fetch", fetchMock);

		await getNodeDetail("a1adcf98", "https://example.test");

		const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
		expect(calledUrl).toBe("https://example.test/api/nodes/a1adcf98");
	});

	it.each([
		["path traversal via ..", ".."],
		["path segment with a slash", "ab/cd"],
		["non-hex characters", "not-hex!"],
		["empty string", ""],
	])("rejects an invalid pubkey without calling fetch: %s", async (_label, badPubkey) => {
		const fetchMock = mockFetch(200, {});
		vi.stubGlobal("fetch", fetchMock);

		await expect(getNodeDetail(badPubkey, "https://example.test")).rejects.toThrow(
			CoreScopeError,
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("getNodeHealth and getNodeNeighbors also validate the pubkey", async () => {
		vi.stubGlobal("fetch", mockFetch(200, {}));

		await expect(getNodeHealth("..", "https://example.test")).rejects.toThrow(CoreScopeError);
		await expect(getNodeNeighbors("..", "https://example.test")).rejects.toThrow(
			CoreScopeError,
		);
	});

	it("throws CoreScopeError with status on a non-ok response", async () => {
		vi.stubGlobal("fetch", mockFetch(404, { error: "not found" }));

		await expect(getStats("https://example.test")).rejects.toMatchObject(
			new CoreScopeError(404, "CoreScope request failed: 404 Error"),
		);
	});

	it("getBatchObservations POSTs the hashes array as JSON", async () => {
		const fetchMock = mockFetch(200, { results: {} });
		vi.stubGlobal("fetch", fetchMock);

		await getBatchObservations(["abc123", "def456"], "https://example.test");

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://example.test/api/packets/observations");
		expect(init.method).toBe("POST");
		expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
		expect(JSON.parse(init.body as string)).toEqual({ hashes: ["abc123", "def456"] });
	});

	it("getBatchObservations rejects more than 200 hashes without calling fetch", async () => {
		const fetchMock = mockFetch(200, {});
		vi.stubGlobal("fetch", fetchMock);

		const hashes = Array.from({ length: 201 }, (_, i) => `hash${i}`);
		await expect(getBatchObservations(hashes, "https://example.test")).rejects.toThrow(
			CoreScopeError,
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("decodePacket POSTs the trimmed hex string", async () => {
		const fetchMock = mockFetch(200, { decoded: {} });
		vi.stubGlobal("fetch", fetchMock);

		await decodePacket("  a1b2c3  ", "https://example.test");

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://example.test/api/decode");
		expect(JSON.parse(init.body as string)).toEqual({ hex: "a1b2c3" });
	});

	it("decodePacket rejects an empty hex string without calling fetch", async () => {
		const fetchMock = mockFetch(200, {});
		vi.stubGlobal("fetch", fetchMock);

		await expect(decodePacket("   ", "https://example.test")).rejects.toThrow(CoreScopeError);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("inspectPath POSTs prefixes, context, and limit together", async () => {
		const fetchMock = mockFetch(200, { candidates: [] });
		vi.stubGlobal("fetch", fetchMock);

		await inspectPath(["ab12", "cd34"], { observerId: "obs1" }, 25, "https://example.test");

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://example.test/api/paths/inspect");
		expect(JSON.parse(init.body as string)).toEqual({
			prefixes: ["ab12", "cd34"],
			context: { observerId: "obs1" },
			limit: 25,
		});
	});

	it("inspectPath rejects zero or too many prefixes without calling fetch", async () => {
		const fetchMock = mockFetch(200, {});
		vi.stubGlobal("fetch", fetchMock);

		await expect(inspectPath([], undefined, undefined, "https://example.test")).rejects.toThrow(
			CoreScopeError,
		);
		await expect(
			inspectPath(
				Array.from({ length: 65 }, () => "ab"),
				undefined,
				undefined,
				"https://example.test",
			),
		).rejects.toThrow(CoreScopeError);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("surfaces the upstream error message on a POST 400, not just statusText", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: false,
			status: 400,
			statusText: "Bad Request",
			json: async () => ({ error: "prefixes must be even-length hex" }),
		}));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			inspectPath(["abc"], undefined, undefined, "https://example.test"),
		).rejects.toMatchObject(
			new CoreScopeError(
				400,
				"CoreScope request failed: 400 prefixes must be even-length hex",
			),
		);
	});
});
