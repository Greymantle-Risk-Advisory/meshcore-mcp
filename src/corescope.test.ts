import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CoreScopeError,
	getNodeDetail,
	getNodeHealth,
	getNodeNeighbors,
	getNodes,
	getStats,
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
});
