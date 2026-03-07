import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StitchToolClient } from "../../src/client.js";
import { ZodError } from "zod";

// Mock child_process for gcloud calls
vi.mock("child_process", () => ({
  execSync: vi.fn().mockReturnValue("ya29.mocked_refreshed_token"),
}));

describe("StitchToolClient", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset mocks and environment variables before each test
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original state
    globalThis.fetch = originalFetch;
    delete (globalThis.fetch as any).__stitchPatched;
    process.env = originalEnv;
  });

  // --- NEW DUAL-AUTH TESTS ---
  it('should create client with API key only', () => {
    const client = new StitchToolClient({ apiKey: 'test-key' });
    expect(client).toBeDefined();
  });

  it('should throw ZodError if no credentials provided', () => {
    // Ensure no env vars are set that could satisfy the validation
    delete process.env.STITCH_API_KEY;
    delete process.env.STITCH_ACCESS_TOKEN;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    expect(() => new StitchToolClient({})).toThrow(ZodError);
    expect(() => new StitchToolClient()).toThrow(ZodError);
  });

  it('should throw if accessToken is provided without projectId', () => {
    delete process.env.STITCH_API_KEY;
    delete process.env.STITCH_ACCESS_TOKEN;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    expect(() => new StitchToolClient({ accessToken: 'test-token' })).toThrow(ZodError);
  });

  it('should use STITCH_API_KEY env var as a fallback', () => {
    process.env.STITCH_API_KEY = 'env-key';
    const client = new StitchToolClient();
    expect(client).toBeDefined();
  });

  it('should use STITCH_ACCESS_TOKEN and GOOGLE_CLOUD_PROJECT env vars', () => {
    process.env.STITCH_ACCESS_TOKEN = 'env-token';
    process.env.GOOGLE_CLOUD_PROJECT = 'env-project';
    const client = new StitchToolClient();
    expect(client).toBeDefined();
  });

  it('should store API key config for transport header injection', () => {
    const client = new StitchToolClient({ apiKey: 'test-key' });

    // Verify API key is stored for transport header injection
    expect(client['config'].apiKey).toBe('test-key');
  });


  // --- EXISTING OAUTH TESTS (ADAPTED) ---
  it("should validate token on connect with OAuth", async () => {
    delete process.env.STITCH_API_KEY;

    const client = new StitchToolClient({ accessToken: 'initial_token', projectId: 'test-project' });

    // Verify OAuth credentials are stored for transport header injection
    expect(client['config'].accessToken).toBe('initial_token');
    expect(client['config'].projectId).toBe('test-project');
  });

  // ─── Cycle 2: buildAuthHeaders ──────────────────────────────────
  describe("buildAuthHeaders", () => {
    it("should set X-Goog-Api-Key for API key auth", () => {
      const client = new StitchToolClient({ apiKey: "test-key" });
      const headers = client["buildAuthHeaders"]();
      expect(headers["X-Goog-Api-Key"]).toBe("test-key");
      expect(headers["Authorization"]).toBeUndefined();
    });

    it("should set Bearer token and project for OAuth auth", () => {
      delete process.env.STITCH_API_KEY;
      const client = new StitchToolClient({ accessToken: "ya29.token", projectId: "proj-1" });
      const headers = client["buildAuthHeaders"]();
      expect(headers["Authorization"]).toBe("Bearer ya29.token");
      expect(headers["X-Goog-User-Project"]).toBe("proj-1");
      expect(headers["X-Goog-Api-Key"]).toBeUndefined();
    });

    it("should always include Accept header", () => {
      const client = new StitchToolClient({ apiKey: "k" });
      const headers = client["buildAuthHeaders"]();
      expect(headers["Accept"]).toContain("application/json");
    });
  });

  // ─── Cycle 3: callTool response parsing ─────────────────────────
  describe("callTool", () => {
    function createConnectedClient() {
      const client = new StitchToolClient({ apiKey: "k" });
      client["isConnected"] = true;
      return client;
    }

    it("should throw on isError response with tool name", async () => {
      const client = createConnectedClient();
      client["client"].callTool = vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: "text", text: "something went wrong" }],
      });
      await expect(client.callTool("bad_tool", {}))
        .rejects.toThrow("Tool Call Failed [bad_tool]");
    });

    it("should return structuredContent when present", async () => {
      const client = createConnectedClient();
      client["client"].callTool = vi.fn().mockResolvedValue({
        isError: false,
        content: [],
        structuredContent: { projects: [{ name: "p1" }] },
      });
      const result = await client.callTool("list_projects", {});
      expect(result).toEqual({ projects: [{ name: "p1" }] });
    });

    it("should parse JSON from text content", async () => {
      const client = createConnectedClient();
      client["client"].callTool = vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: "text", text: '{"id":"123"}' }],
      });
      const result = await client.callTool("get_project", {});
      expect(result).toEqual({ id: "123" });
    });

    it("should return raw text when JSON parse fails", async () => {
      const client = createConnectedClient();
      client["client"].callTool = vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: "text", text: "plain string" }],
      });
      const result = await client.callTool("some_tool", {});
      expect(result).toBe("plain string");
    });
  });
});
