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

import { describe, it, expect } from "vitest";

/**
 * TDD Cycle 1: The @google/stitch-sdk/ai subpath exports stitchTools.
 */
describe("@google/stitch-sdk/ai subpath", () => {
  it("exports stitchTools from the ai entry point", async () => {
    const mod = await import("../../src/ai.js");
    expect(typeof mod.stitchTools).toBe("function");
  });

  it("main entry point does NOT export stitchTools", async () => {
    const mod = await import("../../src/index.js");
    expect(mod).not.toHaveProperty("stitchTools");
  });
});
