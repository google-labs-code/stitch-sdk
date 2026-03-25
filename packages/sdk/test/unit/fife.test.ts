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
import { buildFifeSuffix, type FifeImageOptions } from "../../src/fife.js";

describe("buildFifeSuffix", () => {
  it("returns empty string when no options", () => {
    expect(buildFifeSuffix()).toBe("");
  });

  it("returns empty string for empty options object", () => {
    expect(buildFifeSuffix({})).toBe("");
  });

  it("returns =w{n} for width only", () => {
    expect(buildFifeSuffix({ width: 780 })).toBe("=w780");
  });

  it("returns =h{n} for height only", () => {
    expect(buildFifeSuffix({ height: 1200 })).toBe("=h1200");
  });

  it("returns =w{n}-h{n} for both width and height", () => {
    expect(buildFifeSuffix({ width: 780, height: 1688 })).toBe("=w780-h1688");
  });

  it("appends to a base URL correctly", () => {
    const base = "https://lh3.googleusercontent.com/abc123";
    const suffix = buildFifeSuffix({ width: 780 });
    expect(base + suffix).toBe("https://lh3.googleusercontent.com/abc123=w780");
  });
});
