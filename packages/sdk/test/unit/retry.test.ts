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
import { StitchToolClient, computeBackoffMs } from "../../src/client.js";

const RATE_LIMIT_ENVELOPE = {
  isError: true,
  content: [{ type: "text", text: "rate limit exceeded" }],
};

const NOT_FOUND_ENVELOPE = {
  isError: true,
  content: [{ type: "text", text: "project not found" }],
};

const SUCCESS_ENVELOPE = {
  isError: false,
  content: [],
  structuredContent: { projects: [{ name: "p1" }] },
};

function createConnectedClient(
  config?: ConstructorParameters<typeof StitchToolClient>[0],
) {
  const client = new StitchToolClient({ apiKey: "k", ...config });
  client["isConnected"] = true;
  return client;
}

describe("callTool retry (D6 revised: idempotent reads only)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries a list_* tool rate-limited twice, then returns the result (3 calls)", async () => {
    const client = createConnectedClient();
    const mock = vi
      .fn()
      .mockResolvedValueOnce(RATE_LIMIT_ENVELOPE)
      .mockResolvedValueOnce(RATE_LIMIT_ENVELOPE)
      .mockResolvedValueOnce(SUCCESS_ENVELOPE);
    client["client"].callTool = mock;

    const promise = client.callTool("list_projects", {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ projects: [{ name: "p1" }] });
  });

  it("retries a get_* tool rate-limited once, then succeeds (2 calls)", async () => {
    const client = createConnectedClient();
    const mock = vi
      .fn()
      .mockResolvedValueOnce(RATE_LIMIT_ENVELOPE)
      .mockResolvedValueOnce(SUCCESS_ENVELOPE);
    client["client"].callTool = mock;

    const promise = client.callTool("get_project", { projectId: "p1" });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ projects: [{ name: "p1" }] });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("throws RATE_LIMITED after exhausting attempts on a list_* tool", async () => {
    const client = createConnectedClient();
    const mock = vi.fn().mockResolvedValue(RATE_LIMIT_ENVELOPE);
    client["client"].callTool = mock;

    const promise = client.callTool("list_projects", {});
    // Attach the rejection expectation BEFORE advancing timers so the
    // rejection is never unhandled.
    const assertion = expect(promise).rejects.toMatchObject({
      code: "RATE_LIMITED",
      recoverable: true,
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(mock).toHaveBeenCalledTimes(3); // default attempts: 3
  });

  it("NEVER retries a generative tool (generate_screen_from_text) — throws immediately", async () => {
    const client = createConnectedClient();
    const mock = vi.fn().mockResolvedValue(RATE_LIMIT_ENVELOPE);
    client["client"].callTool = mock;

    await expect(
      client.callTool("generate_screen_from_text", { prompt: "x" }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0); // no backoff timer was ever scheduled
  });

  it("retry: false disables retries even for list_* tools", async () => {
    const client = createConnectedClient({ retry: false });
    const mock = vi.fn().mockResolvedValue(RATE_LIMIT_ENVELOPE);
    client["client"].callTool = mock;

    await expect(client.callTool("list_projects", {})).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("never retries non-RATE_LIMITED errors, even on idempotent reads", async () => {
    const client = createConnectedClient();
    const mock = vi.fn().mockResolvedValue(NOT_FOUND_ENVELOPE);
    client["client"].callTool = mock;

    await expect(client.callTool("get_project", {})).rejects.toMatchObject({
      code: "NOT_FOUND",
      recoverable: false,
    });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("honors a custom attempts count", async () => {
    const client = createConnectedClient({
      retry: { attempts: 5, baseMs: 10, maxMs: 100 },
    });
    const mock = vi.fn().mockResolvedValue(RATE_LIMIT_ENVELOPE);
    client["client"].callTool = mock;

    const promise = client.callTool("list_screens", { projectId: "p" });
    const assertion = expect(promise).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(mock).toHaveBeenCalledTimes(5);
  });
});

describe("computeBackoffMs", () => {
  it("grows exponentially with attempt (rand pinned to 1)", () => {
    const one = () => 1;
    expect(computeBackoffMs(0, 250, 4000, one)).toBe(250);
    expect(computeBackoffMs(1, 250, 4000, one)).toBe(500);
    expect(computeBackoffMs(2, 250, 4000, one)).toBe(1000);
    expect(computeBackoffMs(3, 250, 4000, one)).toBe(2000);
  });

  it("respects the maxMs cap", () => {
    const one = () => 1;
    expect(computeBackoffMs(4, 250, 4000, one)).toBe(4000);
    expect(computeBackoffMs(10, 250, 4000, one)).toBe(4000);
    expect(computeBackoffMs(100, 250, 4000, one)).toBe(4000);
  });

  it("applies full jitter: delay = capped * rand(0..1)", () => {
    expect(computeBackoffMs(2, 250, 4000, () => 0.5)).toBe(500);
    expect(computeBackoffMs(10, 250, 4000, () => 0.25)).toBe(1000);
    expect(computeBackoffMs(0, 250, 4000, () => 0)).toBe(0);
  });

  it("stays within [0, cap] using real Math.random", () => {
    for (let i = 0; i < 50; i++) {
      const d = computeBackoffMs(10, 250, 4000);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(4000);
    }
  });
});

describe("transport HTTP errors normalized + retried (M3)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("a real 429 (StreamableHTTPError) on a list_* tool is retried then succeeds", async () => {
    const { StreamableHTTPError } =
      await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const client = createConnectedClient();
    const mock = vi
      .fn()
      .mockRejectedValueOnce(new StreamableHTTPError(429, "Too Many Requests"))
      .mockResolvedValueOnce(SUCCESS_ENVELOPE);
    client["client"].callTool = mock;

    const promise = client.callTool("list_projects", {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mock).toHaveBeenCalledTimes(2); // retried, not bypassed
    expect(result).toEqual({ projects: [{ name: "p1" }] });
  });

  it("a 401 transport error surfaces as a StitchError(AUTH_FAILED) with .status, not a raw StreamableHTTPError", async () => {
    const { StreamableHTTPError } =
      await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const { StitchError } = await import("../../src/spec/errors.js");
    const client = createConnectedClient();
    client["client"].callTool = vi
      .fn()
      .mockRejectedValue(new StreamableHTTPError(401, "Unauthorized"));

    const err = await client.callTool("get_screen", {}).catch((e) => e);
    expect(err).toBeInstanceOf(StitchError);
    expect((err as InstanceType<typeof StitchError>).code).toBe("AUTH_FAILED");
    expect((err as InstanceType<typeof StitchError>).status).toBe(401);
    expect((err as InstanceType<typeof StitchError>).toolName).toBe(
      "get_screen",
    );
  });

  it("a 429 on a GENERATIVE tool is NOT retried (still normalized to StitchError)", async () => {
    const { StreamableHTTPError } =
      await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const { StitchError } = await import("../../src/spec/errors.js");
    const client = createConnectedClient();
    const mock = vi
      .fn()
      .mockRejectedValue(new StreamableHTTPError(429, "Too Many Requests"));
    client["client"].callTool = mock;

    const err = await client
      .callTool("generate_screen_from_text", {})
      .catch((e) => e);
    expect(mock).toHaveBeenCalledTimes(1); // generative tools never auto-retry
    expect(err).toBeInstanceOf(StitchError);
    expect((err as InstanceType<typeof StitchError>).code).toBe("RATE_LIMITED");
  });
});

describe("HTTP 503 retry and Retry-After support (Ticket 2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("parseRetryAfter parses integer seconds and converts to milliseconds", async () => {
    const { parseRetryAfter } = await import("../../src/client.js");
    expect(parseRetryAfter("5")).toBe(5000);
    expect(parseRetryAfter(4)).toBe(4000);
    expect(parseRetryAfter("invalid")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it("retries get_* tool when receiving 503 Service Unavailable", async () => {
    const { StreamableHTTPError } =
      await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const client = createConnectedClient();
    const mock = vi
      .fn()
      .mockRejectedValueOnce(
        new StreamableHTTPError(503, "Service Unavailable"),
      )
      .mockResolvedValueOnce(SUCCESS_ENVELOPE);
    client["client"].callTool = mock;

    const promise = client.callTool("get_screen", {
      projectId: "p1",
      screenId: "s1",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ projects: [{ name: "p1" }] });
  });
});
