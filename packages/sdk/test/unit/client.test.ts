// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StitchToolClient,
  __resetStitchHostWarning,
} from "../../src/client.js";
import { ZodError } from "zod";

// Mock child_process for gcloud calls
vi.mock("child_process", () => ({
  execSync: vi.fn().mockReturnValue("ya29.mocked_refreshed_token"),
}));

describe("StitchToolClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original state. Env mutations go through vi.stubEnv, never
    // whole-object process.env swaps (order-sensitive under parallel suites).
    globalThis.fetch = originalFetch;
    delete (globalThis.fetch as any).__stitchPatched;
    vi.unstubAllEnvs();
  });

  // --- NEW DUAL-AUTH TESTS ---
  it("should create client with API key only", () => {
    const client = new StitchToolClient({ apiKey: "test-key" });
    expect(client).toBeDefined();
  });

  it("should throw ZodError if no credentials provided", () => {
    // Ensure no env vars are set that could satisfy the validation
    vi.stubEnv("STITCH_API_KEY", "");
    vi.stubEnv("STITCH_ACCESS_TOKEN", "");
    vi.stubEnv("STITCH_PROJECT_ID", "");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "");

    expect(() => new StitchToolClient({})).toThrow(ZodError);
    expect(() => new StitchToolClient()).toThrow(ZodError);
  });

  it("should throw if accessToken is provided without projectId", () => {
    vi.stubEnv("STITCH_API_KEY", "");
    vi.stubEnv("STITCH_ACCESS_TOKEN", "");
    vi.stubEnv("STITCH_PROJECT_ID", "");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "");

    expect(() => new StitchToolClient({ accessToken: "test-token" })).toThrow(
      ZodError,
    );
  });

  it("should use STITCH_API_KEY env var as a fallback", () => {
    vi.stubEnv("STITCH_API_KEY", "env-key");
    const client = new StitchToolClient();
    expect(client).toBeDefined();
  });

  it("should use STITCH_ACCESS_TOKEN and GOOGLE_CLOUD_PROJECT env vars", () => {
    vi.stubEnv("STITCH_ACCESS_TOKEN", "env-token");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "env-project");
    const client = new StitchToolClient();
    expect(client).toBeDefined();
  });

  it("should store API key config for transport header injection", () => {
    const client = new StitchToolClient({ apiKey: "test-key" });

    // Verify API key is stored for transport header injection
    expect(client["config"].apiKey).toBe("test-key");
  });

  // --- EXISTING OAUTH TESTS (ADAPTED) ---
  it("should validate token on connect with OAuth", async () => {
    vi.stubEnv("STITCH_API_KEY", "");

    const client = new StitchToolClient({
      accessToken: "initial_token",
      projectId: "test-project",
    });

    // Verify OAuth credentials are stored for transport header injection
    expect(client["config"].accessToken).toBe("initial_token");
    expect(client["config"].projectId).toBe("test-project");
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
      vi.stubEnv("STITCH_API_KEY", "");
      const client = new StitchToolClient({
        accessToken: "ya29.token",
        projectId: "proj-1",
      });
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

    it("should throw UNKNOWN_ERROR on generic isError response with tool name", async () => {
      const client = createConnectedClient();
      client["client"].callTool = vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: "text", text: "something went wrong" }],
      });
      await expect(client.callTool("bad_tool", {})).rejects.toMatchObject({
        code: "UNKNOWN_ERROR",
        message: expect.stringContaining("Tool Call Failed [bad_tool]"),
        recoverable: false,
      });
    });

    it("should throw NOT_FOUND on 'project not found' error", async () => {
      const client = createConnectedClient();
      client["client"].callTool = vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: "text", text: "project not found" }],
      });
      await expect(client.callTool("bad_tool", {})).rejects.toMatchObject({
        code: "NOT_FOUND",
        recoverable: false,
      });
    });

    it("should throw AUTH_FAILED on 'unauthorized' error", async () => {
      const client = createConnectedClient();
      client["client"].callTool = vi.fn().mockResolvedValue({
        isError: true,
        content: [
          {
            type: "text",
            text: "Request had invalid authentication credentials",
          },
        ],
      });
      await expect(client.callTool("bad_tool", {})).rejects.toMatchObject({
        code: "AUTH_FAILED",
        recoverable: false,
      });
    });

    it("should throw AUTH_FAILED on '401' error", async () => {
      const client = createConnectedClient();
      client["client"].callTool = vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: "text", text: "HTTP 401: Unauthenticated" }],
      });
      await expect(client.callTool("bad_tool", {})).rejects.toMatchObject({
        code: "AUTH_FAILED",
        recoverable: false,
      });
    });

    it("should throw RATE_LIMITED on 'rate limit exceeded' error", async () => {
      const client = createConnectedClient();
      client["client"].callTool = vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: "text", text: "rate limit exceeded" }],
      });
      await expect(client.callTool("bad_tool", {})).rejects.toMatchObject({
        code: "RATE_LIMITED",
        recoverable: true,
      });
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

  // ─── Branch 11: terminal close() ─────────────────────────────────
  describe("terminal close()", () => {
    it("REGRESSION: close() during an in-flight connect() resolves cleanly (no null-deref TypeError)", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      // Gate the inner MCP connect so doConnect parks on the await.
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      client["client"].connect = vi.fn().mockImplementation(() => gate);

      const connecting = client.connect();
      await Promise.resolve(); // let doConnect reach the await
      await client.close(); // nulls + closes the transport mid-connect
      release(); // inner connect now resolves; doConnect resumes the recheck

      // Must NOT reject with a TypeError from dereferencing the nulled
      // transport — it should resolve and leave the client cleanly closed.
      await expect(connecting).resolves.toBeUndefined();
      expect(client["isConnected"]).toBe(false);
      expect(client["isClosed"]).toBe(true);
    });

    it("callTool throws CLIENT_CLOSED after close()", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      await client.close();
      await expect(client.callTool("list_projects", {})).rejects.toMatchObject({
        code: "CLIENT_CLOSED",
        recoverable: false,
        message: expect.stringContaining("create a new StitchToolClient"),
      });
    });

    it("listTools, httpPost, and connect all throw CLIENT_CLOSED after close()", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      await client.close();
      await expect(client.listTools()).rejects.toMatchObject({
        code: "CLIENT_CLOSED",
      });
      await expect(client.httpPost("projects/p", {})).rejects.toMatchObject({
        code: "CLIENT_CLOSED",
      });
      await expect(client.connect()).rejects.toMatchObject({
        code: "CLIENT_CLOSED",
      });
    });

    it("close() is idempotent and resets connection state", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      const transportClose = vi.fn().mockResolvedValue(undefined);
      client["transport"] = { close: transportClose } as any;
      client["isConnected"] = true;

      await client.close();
      expect(transportClose).toHaveBeenCalledTimes(1);
      expect(client["isConnected"]).toBe(false);
      expect(client["connectPromise"]).toBeNull();
      expect(client["transport"]).toBeNull();

      // Second close is a no-op, not an error
      await expect(client.close()).resolves.toBeUndefined();
      expect(transportClose).toHaveBeenCalledTimes(1);
    });

    it("close() succeeds even if the transport close fails", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      client["transport"] = {
        close: vi.fn().mockRejectedValue(new Error("socket gone")),
      } as any;
      await expect(client.close()).resolves.toBeUndefined();
      expect(client["isClosed"]).toBe(true);
    });
  });

  // ─── Branch 11: reconnect path ───────────────────────────────────
  describe("reconnect path", () => {
    it("closes the previous transport and recreates the MCP Client before reconnecting", async () => {
      const connectSpy = vi
        .spyOn(Client.prototype, "connect")
        .mockResolvedValue(undefined);
      try {
        const client = new StitchToolClient({ apiKey: "k" });
        const firstMcpClient = client["client"];
        const oldTransport = { close: vi.fn().mockResolvedValue(undefined) };
        client["transport"] = oldTransport as any;

        await client.connect();

        // Old transport torn down BEFORE the new connection was made
        expect(oldTransport.close).toHaveBeenCalledTimes(1);
        expect(oldTransport.close.mock.invocationCallOrder[0]).toBeLessThan(
          connectSpy.mock.invocationCallOrder[0],
        );
        // Fresh MCP Client per transport (connect() twice on one Client
        // is undefined behavior)
        expect(client["client"]).not.toBe(firstMcpClient);
        expect(client["isConnected"]).toBe(true);
      } finally {
        connectSpy.mockRestore();
      }
    });

    it("ignores errors from closing the stale transport", async () => {
      const connectSpy = vi
        .spyOn(Client.prototype, "connect")
        .mockResolvedValue(undefined);
      try {
        const client = new StitchToolClient({ apiKey: "k" });
        client["transport"] = {
          close: vi.fn().mockRejectedValue(new Error("already dead")),
        } as any;
        await expect(client.connect()).resolves.toBeUndefined();
        expect(client["isConnected"]).toBe(true);
      } finally {
        connectSpy.mockRestore();
      }
    });

    it("connect failure resets state so a retry can succeed", async () => {
      const connectSpy = vi
        .spyOn(Client.prototype, "connect")
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce(undefined);
      try {
        const client = new StitchToolClient({ apiKey: "k" });
        await expect(client.connect()).rejects.toThrow("network down");
        expect(client["isConnected"]).toBe(false);
        expect(client["connectPromise"]).toBeNull();

        await expect(client.connect()).resolves.toBeUndefined();
        expect(client["isConnected"]).toBe(true);
      } finally {
        connectSpy.mockRestore();
      }
    });
  });

  // ─── Branch 11: unified config/env (D5 REVISED) ──────────────────
  describe("config env fallbacks", () => {
    beforeEach(() => {
      vi.stubEnv("STITCH_API_KEY", "");
      vi.stubEnv("STITCH_ACCESS_TOKEN", "");
      vi.stubEnv("STITCH_PROJECT_ID", "");
      vi.stubEnv("GOOGLE_CLOUD_PROJECT", "");
      vi.stubEnv("STITCH_BASE_URL", "");
      vi.stubEnv("STITCH_HOST", "");
    });

    it("prefers STITCH_PROJECT_ID over GOOGLE_CLOUD_PROJECT", () => {
      vi.stubEnv("STITCH_ACCESS_TOKEN", "tok");
      vi.stubEnv("STITCH_PROJECT_ID", "stitch-proj");
      vi.stubEnv("GOOGLE_CLOUD_PROJECT", "gcp-proj");
      const client = new StitchToolClient();
      expect(client["config"].projectId).toBe("stitch-proj");
    });

    it("GOOGLE_CLOUD_PROJECT stays first-class (no warning)", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("STITCH_ACCESS_TOKEN", "tok");
      vi.stubEnv("GOOGLE_CLOUD_PROJECT", "gcp-proj");
      const client = new StitchToolClient();
      expect(client["config"].projectId).toBe("gcp-proj");
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("reads baseUrl from STITCH_BASE_URL", () => {
      vi.stubEnv("STITCH_API_KEY", "k");
      vi.stubEnv("STITCH_BASE_URL", "https://staging.example.com/mcp");
      const client = new StitchToolClient();
      expect(client["config"].baseUrl).toBe("https://staging.example.com/mcp");
    });

    it("explicit baseUrl wins over STITCH_BASE_URL", () => {
      vi.stubEnv("STITCH_BASE_URL", "https://env.example.com/mcp");
      const client = new StitchToolClient({
        apiKey: "k",
        baseUrl: "https://explicit.example.com/mcp",
      });
      expect(client["config"].baseUrl).toBe("https://explicit.example.com/mcp");
    });

    it("STITCH_HOST is honored as a deprecated alias and warns once per process", () => {
      __resetStitchHostWarning();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("STITCH_API_KEY", "k");
      vi.stubEnv("STITCH_HOST", "https://legacy.example.com/mcp");

      const client1 = new StitchToolClient();
      expect(client1["config"].baseUrl).toBe("https://legacy.example.com/mcp");
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain("STITCH_HOST");
      expect(warnSpy.mock.calls[0][0]).toContain("deprecated");

      // Warn fires only once per process
      new StitchToolClient();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it("STITCH_BASE_URL beats STITCH_HOST and suppresses the warning", () => {
      __resetStitchHostWarning();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("STITCH_API_KEY", "k");
      vi.stubEnv("STITCH_BASE_URL", "https://new.example.com/mcp");
      vi.stubEnv("STITCH_HOST", "https://legacy.example.com/mcp");
      const client = new StitchToolClient();
      expect(client["config"].baseUrl).toBe("https://new.example.com/mcp");
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("config validation error says 'Invalid configuration'", () => {
      expect(() => new StitchToolClient({})).toThrow(/Invalid configuration/);
    });
  });

  // ─── Cycle 4: connect() race condition ──────────────────────────
  describe("connect race condition", () => {
    it("should only connect once when multiple callTool run concurrently", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      let connectCount = 0;

      // Mock connect to track how many times it's actually called
      const originalConnect = client["client"].connect.bind(client["client"]);
      client["client"].connect = vi.fn(async (transport) => {
        connectCount++;
        // Simulate async delay to widen the race window
        await new Promise((resolve) => setTimeout(resolve, 10));
        return originalConnect(transport);
      });

      // Mock callTool to avoid real network
      client["client"].callTool = vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: "text", text: '{"ok":true}' }],
      });

      // Fire two concurrent callTool — both see isConnected=false
      await Promise.allSettled([
        client.callTool("tool_a", {}),
        client.callTool("tool_b", {}),
      ]);

      expect(connectCount).toBe(1);
    });
  });

  // ─── Slice 3: httpPost transport ────────────────────────────────
  describe("httpPost", () => {
    // Test 10: sends X-Goog-Api-Key header
    it("sends X-Goog-Api-Key header in the request", async () => {
      const client = new StitchToolClient({ apiKey: "test-key" });
      let capturedHeaders: Record<string, string> = {};

      (globalThis as any).fetch = vi
        .fn()
        .mockImplementation((_url: string, init: RequestInit) => {
          capturedHeaders = Object.fromEntries(
            Object.entries(init.headers as Record<string, string>),
          );
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ screens: [] }),
          } as any);
        });

      await client.httpPost("projects/p/screens:batchCreate", {
        parent: "projects/p",
        requests: [],
      });
      expect(capturedHeaders["X-Goog-Api-Key"]).toBe("test-key");
    });

    // Test 11: throws StitchError with AUTH_FAILED on 401
    it("throws StitchError with AUTH_FAILED on a 401 response", async () => {
      const client = new StitchToolClient({ apiKey: "bad-key" });

      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("Unauthorized"),
      } as any);

      const { StitchError } = await import("../../src/spec/errors.js");
      await expect(
        client.httpPost("projects/p/screens:batchCreate", {}),
      ).rejects.toThrow(StitchError);

      await client
        .httpPost("projects/p/screens:batchCreate", {})
        .catch((err) => {
          expect(err.code).toBe("AUTH_FAILED");
        });
    });
  });
});
