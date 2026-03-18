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
  it("should create client with API key only", () => {
    const client = new StitchToolClient({ apiKey: "test-key" });
    expect(client).toBeDefined();
  });

  it("should throw ZodError if no credentials provided", () => {
    // Ensure no env vars are set that could satisfy the validation
    delete process.env.STITCH_API_KEY;
    delete process.env.STITCH_ACCESS_TOKEN;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    expect(() => new StitchToolClient({})).toThrow(ZodError);
    expect(() => new StitchToolClient()).toThrow(ZodError);
  });

  it("should throw if accessToken is provided without projectId", () => {
    delete process.env.STITCH_API_KEY;
    delete process.env.STITCH_ACCESS_TOKEN;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    expect(() => new StitchToolClient({ accessToken: "test-token" })).toThrow(
      ZodError,
    );
  });

  it("should use STITCH_API_KEY env var as a fallback", () => {
    process.env.STITCH_API_KEY = "env-key";
    const client = new StitchToolClient();
    expect(client).toBeDefined();
  });

  it("should use STITCH_ACCESS_TOKEN and GOOGLE_CLOUD_PROJECT env vars", () => {
    process.env.STITCH_ACCESS_TOKEN = "env-token";
    process.env.GOOGLE_CLOUD_PROJECT = "env-project";
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
    delete process.env.STITCH_API_KEY;

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
      delete process.env.STITCH_API_KEY;
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

  // ─── Cycle 5: network retry on transient failure ────────────
  describe("network retry", () => {
    it("should retry once after a network error and reconnect", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      client["isConnected"] = true;

      let callCount = 0;
      const mockCallTool = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Simulate transport-level network failure (socket closed)
          throw new TypeError("fetch failed");
        }
        return {
          isError: false,
          content: [{ type: "text", text: '{"ok":true}' }],
        };
      });
      client["client"].callTool = mockCallTool;

      // Mock reconnect
      client["doConnect"] = vi.fn(async () => {
        client["isConnected"] = true;
      });

      const result = await client.callTool("some_tool", {});
      expect(result).toEqual({ ok: true });
      expect(callCount).toBe(2);
    });

    it("should not retry on StitchError (application-level error)", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      client["isConnected"] = true;

      client["client"].callTool = vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: "text", text: "project not found" }],
      });

      await expect(client.callTool("bad_tool", {})).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      // Should only call once — no retry for application errors
      expect(client["client"].callTool).toHaveBeenCalledTimes(1);
    });

    it("should not retry non-idempotent tools like generate_screen_from_text", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      client["isConnected"] = true;

      client["client"].callTool = vi.fn().mockImplementation(async () => {
        throw new TypeError("fetch failed");
      });

      await expect(
        client.callTool("generate_screen_from_text", { prompt: "test" }),
      ).rejects.toThrow("fetch failed");
      // Should only call once — generate is non-idempotent
      expect(client["client"].callTool).toHaveBeenCalledTimes(1);
    });

    it("should not retry create_project on network error", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      client["isConnected"] = true;

      client["client"].callTool = vi.fn().mockImplementation(async () => {
        throw new TypeError("fetch failed");
      });

      await expect(
        client.callTool("create_project", { title: "test" }),
      ).rejects.toThrow("fetch failed");
      expect(client["client"].callTool).toHaveBeenCalledTimes(1);
    });

    it("should close old transport before reconnecting", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      client["isConnected"] = true;

      // Set up a mock old transport with a close spy
      const oldTransportClose = vi.fn().mockResolvedValue(undefined);
      client["transport"] = { close: oldTransportClose } as any;

      let callCount = 0;
      client["client"].callTool = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new TypeError("fetch failed");
        }
        return {
          isError: false,
          content: [{ type: "text", text: '{"ok":true}' }],
        };
      });

      await client.callTool("list_projects", {});
      expect(oldTransportClose).toHaveBeenCalledTimes(1);
    });

    it("should throw after retry also fails", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      client["isConnected"] = true;

      client["client"].callTool = vi.fn().mockImplementation(async () => {
        throw new TypeError("fetch failed");
      });

      client["doConnect"] = vi.fn(async () => {
        client["isConnected"] = true;
      });

      await expect(client.callTool("some_tool", {})).rejects.toThrow(
        "fetch failed",
      );
      expect(client["client"].callTool).toHaveBeenCalledTimes(2);
    });
  });
});
