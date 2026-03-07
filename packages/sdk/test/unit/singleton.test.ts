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

/**
 * TDD Cycle 1: Singleton Delegation
 *
 * The `stitch` singleton must expose both domain methods (from Stitch class)
 * and tool methods (from StitchToolClient): listTools, callTool, close.
 *
 * A dummy API key is set so the config Zod schema passes in CI.
 */
describe("stitch singleton", () => {
  beforeEach(() => {
    vi.stubEnv("STITCH_API_KEY", "test-dummy-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stitch.listTools is a function", async () => {
    const { stitch } = await import("../../src/singleton.js");
    expect(typeof stitch.listTools).toBe("function");
  });

  it("stitch.callTool is a function", async () => {
    const { stitch } = await import("../../src/singleton.js");
    expect(typeof stitch.callTool).toBe("function");
  });

  it("stitch.close is a function", async () => {
    const { stitch } = await import("../../src/singleton.js");
    expect(typeof stitch.close).toBe("function");
  });

  it("stitch.project still works (domain delegation intact)", async () => {
    const { stitch } = await import("../../src/singleton.js");
    expect(typeof stitch.project).toBe("function");
  });
});
