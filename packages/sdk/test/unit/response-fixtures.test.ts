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
 * Per-binding projection tests against recorded/synthesized server
 * responses [V1_PLAN §1.7].
 *
 * Schema-valid projections can still be semantically lossy (the
 * generate() truncation bug). These tests run EVERY domain-map binding
 * against a realistic response fixture, so a wrong projection fails a
 * test here instead of shipping. A completeness gate fails when a new
 * binding lands without a fixture entry.
 *
 * Fixtures live in test/fixtures/responses/<tool>.json; refresh
 * read-only ones from the live API with scripts/refresh-response-fixtures.ts.
 */

import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Stitch } from "../../generated/src/stitch.js";
import { Screen } from "../../generated/src/screen.js";
import { DesignSystem } from "../../generated/src/designsystem.js";
import { Project } from "../../src/project-ext.js";
import { StitchToolClient } from "../../src/client.js";
import { EntityManager } from "../../src/entity-manager.js";
import domainMap from "../../generated/domain-map.json";

vi.mock("../../src/client");

const FIXTURES = resolve(import.meta.dirname, "../fixtures/responses");

function fixture(tool: string): any {
  return JSON.parse(readFileSync(resolve(FIXTURES, `${tool}.json`), "utf-8"));
}

let client: StitchToolClient;

beforeEach(() => {
  vi.clearAllMocks();
  client = new StitchToolClient();
  client.callTool = vi.fn();
  client.entities = new EntityManager(client);
});

function arm(tool: string) {
  (client.callTool as Mock).mockResolvedValue(fixture(tool));
}

function project(): Project {
  return client.entities.resolve(Project, ["projectId"], {
    projectId: "p-fix",
  }) as Project;
}

function screen(): Screen {
  return client.entities.resolve(Screen, ["projectId", "screenId"], {
    projectId: "p-fix",
    screenId: "s-1",
  });
}

function designSystem(): DesignSystem {
  return client.entities.resolve(DesignSystem, ["projectId", "assetId"], {
    projectId: "p-fix",
    assetId: "ds-1",
  });
}

/**
 * One entry per domain-map binding ("Class.method"). The completeness
 * test below fails if a binding is added without an entry here.
 */
const BINDING_CASES: Record<string, () => Promise<void>> = {
  "Stitch.projects": async () => {
    arm("list_projects");
    const result = await new Stitch(client).projects();
    expect(result.map((p) => p.id)).toEqual(["p-fix", "p-two"]);
  },
  "Stitch.createProject": async () => {
    arm("create_project");
    const result = await new Stitch(client).createProject({ title: "x" });
    expect(result.id).toBe("p-new");
  },
  "Project.generate": async () => {
    arm("generate_screen_from_text");
    const result = await project().generate("a page");
    // THE truncation-bug fix: ALL THREE screens across BOTH output
    // components are returned, not just the first.
    expect(result.screens.map((s) => s.id)).toEqual([
      "gen-1",
      "gen-2",
      "gen-3",
    ]);
    expect(result.first).toBeInstanceOf(Screen);
    expect(result.first.id).toBe("gen-1");
    expect((result.raw as any).sessionId).toBe("sess-1");
  },
  "Project.screens": async () => {
    arm("list_screens");
    const result = await project().screens();
    expect(result.map((s) => s.id)).toEqual(["s-1", "s-2"]);
    expect(result.every((s) => s.projectId === "p-fix")).toBe(true);
  },
  "Project.getScreen": async () => {
    arm("get_screen");
    const result = await project().getScreen("s-1");
    expect(result.id).toBe("s-1");
    expect(result.projectId).toBe("p-fix");
  },
  "Project.createDesignSystem": async () => {
    arm("create_design_system");
    const result = await project().createDesignSystem({} as any);
    expect(result.id).toBe("ds-1");
  },
  "Project.listDesignSystems": async () => {
    arm("list_design_systems");
    const result = await project().listDesignSystems();
    expect(result.map((d) => d.id)).toEqual(["ds-1"]);
  },
  "Project.uploadDesignMd": async () => {
    arm("upload_design_md");
    const result = await project().uploadDesignMd("aGVsbG8=");
    // Assert the actual projected shape, not just truthiness — the binding
    // is a direct pass-through of UploadDesignMdResponse.
    expect(result).toEqual({ success: true });
  },
  "Project.createDesignSystemFromDesignMd": async () => {
    arm("create_design_system_from_design_md");
    const result = await project().createDesignSystemFromDesignMd({} as any);
    expect(result.id).toBe("ds-md-1");
  },
  "Screen.edit": async () => {
    arm("edit_screens");
    const result = await screen().edit("darker");
    expect(result.screens.map((s) => s.id)).toEqual([
      "edit-1",
      "edit-2",
      "edit-3",
    ]);
    expect(result.first.id).toBe("edit-1");
  },
  "Screen.variants": async () => {
    arm("generate_variants");
    const result = await screen().variants("colors", {} as any);
    expect(result.screens.map((s) => s.id)).toEqual([
      "var-1",
      "var-2",
      "var-3",
    ]);
  },
  "Screen.getHtmlUrl": async () => {
    arm("get_screen");
    const bare = client.entities.resolve(Screen, ["projectId", "screenId"], {
      projectId: "p-fix",
      screenId: "s-9",
    });
    const url = await bare.getHtmlUrl();
    expect(url).toBe("https://files.example/s-1.html");
  },
  "Screen.getImageUrl": async () => {
    arm("get_screen");
    const bare = client.entities.resolve(Screen, ["projectId", "screenId"], {
      projectId: "p-fix",
      screenId: "s-8",
    });
    const url = await bare.getImageUrl();
    expect(url).toBe("https://files.example/s-1.png");
  },
  "DesignSystem.update": async () => {
    arm("update_design_system");
    const result = await designSystem().update({} as any);
    expect(result.id).toBe("ds-1");
  },
  "DesignSystem.apply": async () => {
    arm("apply_design_system");
    const result = await designSystem().apply([] as any);
    expect(result.screens.map((s) => s.id)).toEqual([
      "applied-1",
      "applied-2",
      "applied-3",
    ]);
  },
};

describe("response fixtures: every binding against a realistic payload", () => {
  it("COMPLETENESS: every domain-map binding has a fixture case", () => {
    const bindings = (domainMap as any).bindings
      .map((b: any) => `${b.class}.${b.method}`)
      .sort();
    expect(Object.keys(BINDING_CASES).sort()).toEqual(bindings);
  });

  for (const [name, run] of Object.entries(BINDING_CASES)) {
    it(name, run);
  }
});
