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
 * Contract Tests for IR Schema
 *
 * Tests the Zod schemas that define domain-map.json structure.
 * Validates acceptance of valid inputs and rejection of invalid ones.
 */

import { describe, test, expect } from "bun:test";
import {
  ProjectionStep,
  ArgSpec,
  ReturnSpec,
  CacheSpec,
  FactorySpec,
  DomainClassConfig,
  Binding,
  DomainMap,
} from "../ir-schema.js";

// ── ProjectionStep ────────────────────────────────────────────

describe("ProjectionStep", () => {
  test("accepts valid step with prop only", () => {
    const result = ProjectionStep.safeParse({ prop: "screens" });
    expect(result.success).toBe(true);
  });

  test("accepts step with prop + index", () => {
    const result = ProjectionStep.safeParse({
      prop: "outputComponents",
      index: 0,
    });
    expect(result.success).toBe(true);
  });

  test("accepts step with prop + each", () => {
    const result = ProjectionStep.safeParse({ prop: "screens", each: true });
    expect(result.success).toBe(true);
  });

  test("rejects removed 'fallback' field (strict IR)", () => {
    const result = ProjectionStep.safeParse({ prop: "uri", fallback: "url" });
    expect(result.success).toBe(false);
  });

  test("accepts acknowledgeSingle escape hatch", () => {
    const result = ProjectionStep.safeParse({
      prop: "screens",
      index: 0,
      acknowledgeSingle: true,
    });
    expect(result.success).toBe(true);
  });

  test("rejects unknown keys (strict IR)", () => {
    const result = ProjectionStep.safeParse({
      prop: "screens",
      fieldMapping: { from: "name" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects step without prop", () => {
    const result = ProjectionStep.safeParse({ index: 0 });
    expect(result.success).toBe(false);
  });

  test("rejects step with both index and each", () => {
    const result = ProjectionStep.safeParse({
      prop: "items",
      index: 0,
      each: true,
    });
    expect(result.success).toBe(false);
  });

  test("rejects negative index", () => {
    const result = ProjectionStep.safeParse({ prop: "items", index: -1 });
    expect(result.success).toBe(false);
  });
});

// ── ArgSpec ───────────────────────────────────────────────────

describe("ArgSpec", () => {
  test("accepts self arg", () => {
    const result = ArgSpec.safeParse({ from: "self" });
    expect(result.success).toBe(true);
  });

  test("accepts param arg with rename", () => {
    const result = ArgSpec.safeParse({
      from: "param",
      rename: "newName",
      optional: true,
    });
    expect(result.success).toBe(true);
  });

  test("accepts computed arg with template", () => {
    const result = ArgSpec.safeParse({
      from: "computed",
      template: "projects/{projectId}",
    });
    expect(result.success).toBe(true);
  });

  test("accepts selfArray arg", () => {
    const result = ArgSpec.safeParse({ from: "selfArray", field: "screenId" });
    expect(result.success).toBe(true);
  });

  test("rejects unknown 'from' variant", () => {
    const result = ArgSpec.safeParse({ from: "magic" });
    expect(result.success).toBe(false);
  });
});

// ── ReturnSpec ────────────────────────────────────────────────

describe("ReturnSpec", () => {
  test("accepts empty projection (direct return)", () => {
    const result = ReturnSpec.safeParse({ projection: [] });
    expect(result.success).toBe(true);
  });

  test("accepts projection with class and array", () => {
    const result = ReturnSpec.safeParse({
      class: "Screen",
      projection: [{ prop: "screens" }],
      array: true,
    });
    expect(result.success).toBe(true);
  });

  test("accepts projection with primitive type", () => {
    const result = ReturnSpec.safeParse({
      type: "string",
      projection: [{ prop: "htmlCode" }],
    });
    expect(result.success).toBe(true);
  });
});

// ── CacheSpec + FactorySpec ──────────────────────────────────

describe("CacheSpec", () => {
  test("accepts valid cache with projection and description", () => {
    const result = CacheSpec.safeParse({
      projection: [{ prop: "htmlCode" }],
      description: "Cached HTML",
    });
    expect(result.success).toBe(true);
  });

  test("rejects cache without description", () => {
    const result = CacheSpec.safeParse({
      projection: [{ prop: "htmlCode" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("FactorySpec", () => {
  test("accepts valid factory", () => {
    const result = FactorySpec.safeParse({
      method: "project",
      returns: "Project",
      description: "Create a Project handle",
    });
    expect(result.success).toBe(true);
  });

  test("rejects factory without method", () => {
    const result = FactorySpec.safeParse({ returns: "Project" });
    expect(result.success).toBe(false);
  });
});

// ── Strict IR guarantees ─────────────────────────────────────
// FieldMappingSpec was deleted: it was defined but never referenced by
// DomainClassConfig, and the skill docs describing it caused Stage 2
// agents to author maps with silently-discarded keys.

describe("strict IR (agent-authored maps fail loudly)", () => {
  test("DomainClassConfig rejects the never-implemented fieldMapping key", () => {
    const result = DomainClassConfig.safeParse({
      description: "x",
      constructorParams: ["projectId"],
      fieldMapping: { projectId: { from: "name", stripPrefix: "projects/" } },
    });
    expect(result.success).toBe(false);
  });

  test("DomainClassConfig rejects the never-implemented idField key", () => {
    const result = DomainClassConfig.safeParse({
      description: "x",
      constructorParams: ["screenId"],
      idField: "screenId",
    });
    expect(result.success).toBe(false);
  });

  test("ArgSpec param rejects 'default' without 'optional: true'", () => {
    const result = ArgSpec.safeParse({ from: "param", default: "DESKTOP" });
    expect(result.success).toBe(false);
  });

  test("ArgSpec param accepts 'default' with 'optional: true'", () => {
    const result = ArgSpec.safeParse({
      from: "param",
      optional: true,
      default: "DESKTOP",
    });
    expect(result.success).toBe(true);
  });

  test("CacheSpec rejects 'each' steps (no cache semantics)", () => {
    const result = CacheSpec.safeParse({
      projection: [{ prop: "screens", each: true }],
      description: "bad",
    });
    expect(result.success).toBe(false);
  });

  test("CacheSpec accepts 'index' steps", () => {
    const result = CacheSpec.safeParse({
      projection: [{ prop: "screens", index: 0 }, { prop: "url" }],
      description: "first screen url",
    });
    expect(result.success).toBe(true);
  });

  test("DomainMap rejects unknown top-level keys", () => {
    const result = DomainMap.safeParse({
      classes: {},
      bindings: [],
      extras: true,
    });
    expect(result.success).toBe(false);
  });
});

// ── Full Binding ─────────────────────────────────────────────

describe("Binding", () => {
  test("accepts complete binding", () => {
    const result = Binding.safeParse({
      tool: "list_projects",
      class: "Stitch",
      method: "projects",
      args: {},
      returns: {
        class: "Project",
        projection: [{ prop: "projects" }],
        array: true,
      },
    });
    expect(result.success).toBe(true);
  });

  test("rejects binding without tool", () => {
    const result = Binding.safeParse({
      class: "Stitch",
      method: "projects",
      args: {},
      returns: { projection: [] },
    });
    expect(result.success).toBe(false);
  });
});

// ── Full DomainMap ───────────────────────────────────────────

describe("DomainMap", () => {
  test("accepts valid domain map with classes and bindings", () => {
    const result = DomainMap.safeParse({
      classes: {
        Stitch: {
          description: "Main entry point.",
          constructorParams: [],
          isRoot: true,
        },
      },
      bindings: [],
    });
    expect(result.success).toBe(true);
  });

  test("rejects domain map without classes", () => {
    const result = DomainMap.safeParse({ bindings: [] });
    expect(result.success).toBe(false);
  });
});

// ── SideEffectSpec ───────────────────────────────────────────

describe("SideEffectSpec", () => {
  test("accepts valid sideEffect with method, reason, and specPath", () => {
    const result = DomainClassConfig.safeParse({
      description: "Manages projects.",
      constructorParams: ["projectId"],
      extensionPath: "../../src/project-ext.js",
      sideEffects: [
        {
          method: "uploadImage",
          reason: "private_rest",
          specPath: "src/spec/upload.ts",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("accepts multiple sideEffects", () => {
    const result = DomainClassConfig.safeParse({
      description: "Manages projects.",
      constructorParams: ["projectId"],
      extensionPath: "../../src/project-ext.js",
      sideEffects: [
        {
          method: "uploadImage",
          reason: "private_rest",
          specPath: "src/spec/upload.ts",
        },
        {
          method: "downloadAssets",
          reason: "filesystem_io",
          specPath: "src/spec/download.ts",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("accepts all valid reason values", () => {
    const reasons = [
      "filesystem_io",
      "binary_data",
      "private_rest",
      "complex_orchestration",
    ];
    for (const reason of reasons) {
      const result = DomainClassConfig.safeParse({
        description: "Test class.",
        constructorParams: [],
        extensionPath: "../../src/test-ext.js",
        sideEffects: [
          { method: "doSomething", reason, specPath: "src/spec/test.ts" },
        ],
      });
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid reason value", () => {
    const result = DomainClassConfig.safeParse({
      description: "Test class.",
      constructorParams: [],
      extensionPath: "../../src/test-ext.js",
      sideEffects: [
        {
          method: "doSomething",
          reason: "just_because",
          specPath: "src/spec/test.ts",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  test("rejects sideEffect without method", () => {
    const result = DomainClassConfig.safeParse({
      description: "Test class.",
      constructorParams: [],
      extensionPath: "../../src/test-ext.js",
      sideEffects: [
        {
          reason: "filesystem_io",
          specPath: "src/spec/test.ts",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  test("rejects sideEffect without specPath", () => {
    const result = DomainClassConfig.safeParse({
      description: "Test class.",
      constructorParams: [],
      extensionPath: "../../src/test-ext.js",
      sideEffects: [
        {
          method: "doSomething",
          reason: "filesystem_io",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  test("class without extensionPath and without sideEffects is valid (pure generated)", () => {
    const result = DomainClassConfig.safeParse({
      description: "A pure generated class.",
      constructorParams: [],
    });
    expect(result.success).toBe(true);
  });

  test("class with extensionPath but empty sideEffects array is valid (passthrough re-export)", () => {
    // An extension with no side effects is a valid passthrough (though discouraged)
    const result = DomainClassConfig.safeParse({
      description: "A passthrough extension.",
      constructorParams: [],
      extensionPath: "../../src/test-ext.js",
      sideEffects: [],
    });
    expect(result.success).toBe(true);
  });
});
