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

/**
 * Type-surface regression guards [V1_REVIEW_FIXES Tranche 2].
 *
 * M1 (getHtml type-hole) is fundamentally a STATIC-type fix, which vitest
 * can't assert at runtime — the persistent compile guard is the consumer
 * type-check added in Tranche 3 (M9). Here we pin (a) the codegen feature
 * that produces it (the declaration-merge in generated source) and (b) the
 * M2 entityCache:false integration path that was silently dropped.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { StitchToolClient } from "../../src/client.js";

const GEN = resolve(import.meta.dirname, "../../generated/src");

describe("M1: generated Screen declaration-merges its public interface", () => {
  it("emits `export interface Screen extends ScreenContentSpec` + a type-only import", () => {
    const src = readFileSync(resolve(GEN, "screen.ts"), "utf-8");
    expect(src).toMatch(/export interface Screen extends ScreenContentSpec/);
    expect(src).toMatch(
      /ScreenContentSpec.*from "\.\.\/\.\.\/src\/spec\/content/,
    );
  });
});

describe("M2: entityCache:false reaches the EntityManager via StitchToolClient", () => {
  class Dummy {
    static readonly entityKey = "Dummy";
    id!: string;
    projectId!: string;
    data: unknown;
    constructor(_c: unknown, data: unknown) {
      this.data = data;
    }
  }

  it("default (cache on): same identity → same instance", () => {
    const c = new StitchToolClient({ apiKey: "x", projectId: "p" });
    const a = c.entities.resolve(Dummy, ["projectId", "id"], {
      id: "1",
      projectId: "p1",
    });
    const b = c.entities.resolve(Dummy, ["projectId", "id"], {
      id: "1",
      projectId: "p1",
    });
    expect(a).toBe(b);
  });

  it("entityCache:false (value-object mode): same identity → distinct instances", () => {
    const c = new StitchToolClient({
      apiKey: "x",
      projectId: "p",
      entityCache: false,
    });
    const a = c.entities.resolve(Dummy, ["projectId", "id"], {
      id: "1",
      projectId: "p1",
    });
    const b = c.entities.resolve(Dummy, ["projectId", "id"], {
      id: "1",
      projectId: "p1",
    });
    expect(a).not.toBe(b);
    // identity still hydrated
    expect(a.projectId).toBe("p1");
  });
});

describe("Entity .data interfaces and .title getter deduplication (Ticket 4)", () => {
  it("emits ProjectData, ScreenData, and DesignSystemData in types.generated.ts", () => {
    const src = readFileSync(resolve(GEN, "types.generated.ts"), "utf-8");
    expect(src).toMatch(/export interface ProjectData/);
    expect(src).toMatch(/export interface ScreenData/);
    expect(src).toMatch(/export interface DesignSystemData/);
  });

  it("types public data property on generated classes and emits get title() getter", () => {
    const screenSrc = readFileSync(resolve(GEN, "screen.ts"), "utf-8");
    const projectSrc = readFileSync(resolve(GEN, "project.ts"), "utf-8");
    expect(screenSrc).toMatch(/public data\?: ScreenData;/);
    expect(screenSrc).toMatch(/get title\(\): string \| undefined/);
    expect(projectSrc).toMatch(/public data\?: ProjectData;/);
    expect(projectSrc).toMatch(/get title\(\): string \| undefined/);
  });
});
