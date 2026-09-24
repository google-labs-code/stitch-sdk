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
import { inspect } from "node:util";
import {
  getOrCreateClient,
  resetStitchSingleton,
  stitch,
} from "../../src/singleton.js";

/** Stub out every credential-bearing env var ("" reads as unset). */
function clearCredentialEnv() {
  vi.stubEnv("STITCH_API_KEY", "");
  vi.stubEnv("STITCH_ACCESS_TOKEN", "");
  vi.stubEnv("STITCH_PROJECT_ID", "");
  vi.stubEnv("GOOGLE_CLOUD_PROJECT", "");
  vi.stubEnv("STITCH_BASE_URL", "");
  vi.stubEnv("STITCH_HOST", "");
}

beforeEach(() => {
  resetStitchSingleton();
  clearCredentialEnv();
});

afterEach(() => {
  resetStitchSingleton();
  vi.unstubAllEnvs();
});

describe("getOrCreateClient", () => {
  it("should use new apiKey when called with a different config", () => {
    const client1 = getOrCreateClient({ apiKey: "key-A" });
    expect(client1["config"].apiKey).toBe("key-A");

    const client2 = getOrCreateClient({ apiKey: "key-B" });
    expect(client2["config"].apiKey).toBe("key-B");
    expect(client2).not.toBe(client1);
  });

  it("should reuse cached client when called with same config", () => {
    const client1 = getOrCreateClient({ apiKey: "key-A" });
    const client2 = getOrCreateClient({ apiKey: "key-A" });
    expect(client1).toBe(client2);
  });

  it("should reuse cached client when called without config", () => {
    vi.stubEnv("STITCH_API_KEY", "env-key");
    const client1 = getOrCreateClient();
    const client2 = getOrCreateClient();
    expect(client1).toBe(client2);
  });

  it("should reuse when explicit config resolves identically to env", () => {
    vi.stubEnv("STITCH_API_KEY", "env-key");
    const client1 = getOrCreateClient();
    const client2 = getOrCreateClient({ apiKey: "env-key" });
    expect(client1).toBe(client2);
  });

  it("should create a fresh client when env changes between bare calls", () => {
    vi.stubEnv("STITCH_API_KEY", "key-1");
    const client1 = getOrCreateClient();
    expect(client1["config"].apiKey).toBe("key-1");

    vi.stubEnv("STITCH_API_KEY", "key-2");
    const client2 = getOrCreateClient();
    expect(client2["config"].apiKey).toBe("key-2");
    expect(client2).not.toBe(client1);
  });

  it("accepts the full config surface (accessToken + projectId + baseUrl + retry)", () => {
    const client = getOrCreateClient({
      accessToken: "tok",
      projectId: "proj",
      baseUrl: "https://example.com/mcp",
      retry: false,
    });
    expect(client["config"].accessToken).toBe("tok");
    expect(client["config"].projectId).toBe("proj");
    expect(client["config"].baseUrl).toBe("https://example.com/mcp");
    expect(client["config"].retry).toBe(false);
  });

  it("invalidates the cache when a non-auth field (retry) changes", () => {
    const client1 = getOrCreateClient({ apiKey: "k", retry: false });
    const client2 = getOrCreateClient({ apiKey: "k" });
    expect(client2).not.toBe(client1);
  });

  it("picks up STITCH_PROJECT_ID before GOOGLE_CLOUD_PROJECT", () => {
    vi.stubEnv("STITCH_ACCESS_TOKEN", "tok");
    vi.stubEnv("STITCH_PROJECT_ID", "stitch-proj");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "gcp-proj");
    const client = getOrCreateClient();
    expect(client["config"].projectId).toBe("stitch-proj");
  });

  it("throws the config error when no credentials resolve", () => {
    expect(() => getOrCreateClient()).toThrow(/Invalid configuration/);
  });
});

describe("resetStitchSingleton", () => {
  it("clears the cached client so the next call builds a new one", () => {
    const client1 = getOrCreateClient({ apiKey: "key-A" });
    resetStitchSingleton();
    const client2 = getOrCreateClient({ apiKey: "key-A" });
    expect(client2).not.toBe(client1);
  });

  it("is safe to call when nothing was created", () => {
    expect(() => resetStitchSingleton()).not.toThrow();
  });
});

describe("stitch singleton (lazy-on-invoke proxy)", () => {
  it("stitch.listTools is a function", () => {
    expect(typeof stitch.listTools).toBe("function");
  });

  it("stitch.callTool is a function", () => {
    expect(typeof stitch.callTool).toBe("function");
  });

  it("stitch.close is a function", () => {
    expect(typeof stitch.close).toBe("function");
  });

  it("stitch.project still works (domain delegation intact)", () => {
    expect(typeof stitch.project).toBe("function");
  });

  it("property access without credentials does not throw", () => {
    // No credential env vars are set (cleared in beforeEach).
    expect(() => stitch.projects).not.toThrow();
    expect(() => stitch.callTool).not.toThrow();
    expect(typeof stitch.projects).toBe("function");
    // toolMap moved to "@google/stitch-sdk/tools" in v1/18 (bundle hygiene)
    expect((stitch as any).toolMap).toBeUndefined();
  });

  it("introspection (inspect / Object.keys) without credentials does not throw", () => {
    expect(() => inspect(stitch)).not.toThrow();
    expect(() => Object.keys(stitch)).not.toThrow();
    expect(Object.keys(stitch)).toContain("projects");
  });

  it("'in' operator reflects the public surface without constructing a client", () => {
    expect("projects" in stitch).toBe(true);
    expect("project" in stitch).toBe(true);
    expect("callTool" in stitch).toBe(true);
    expect("listTools" in stitch).toBe(true);
    expect("close" in stitch).toBe(true);
    expect("toolMap" in stitch).toBe(false); // moved to ./tools subpath
    expect("definitelyNotAMethod" in stitch).toBe(false);
  });

  it("method invocation without credentials throws the config error", () => {
    expect(() => stitch.project("p1")).toThrow(/Invalid configuration/);
    expect(() => stitch.callTool("list_projects", {})).toThrow(
      /Invalid configuration/,
    );
  });

  it("method invocation with credentials constructs the client lazily", () => {
    vi.stubEnv("STITCH_API_KEY", "test-dummy-key");
    const project = stitch.project("p123");
    expect(project).toBeDefined();
    expect(project.id).toBe("p123");
  });

  it("unknown properties are undefined", () => {
    expect((stitch as any).notARealThing).toBeUndefined();
  });
});
