/**
 * Contract Tests for IR Schema
 *
 * Tests the Zod schemas that define domain-map.json structure.
 * Validates acceptance of valid inputs and rejection of invalid ones.
 */

import { describe, test, expect } from "bun:test";
import {
  ProjectionStep,
  FieldMappingSpec,
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
    const result = ProjectionStep.safeParse({ prop: "outputComponents", index: 0 });
    expect(result.success).toBe(true);
  });

  test("accepts step with prop + each", () => {
    const result = ProjectionStep.safeParse({ prop: "screens", each: true });
    expect(result.success).toBe(true);
  });

  test("accepts step with prop + fallback", () => {
    const result = ProjectionStep.safeParse({ prop: "uri", fallback: "url" });
    expect(result.success).toBe(true);
  });

  test("rejects step without prop", () => {
    const result = ProjectionStep.safeParse({ index: 0 });
    expect(result.success).toBe(false);
  });

  test("rejects step with both index and each", () => {
    const result = ProjectionStep.safeParse({ prop: "items", index: 0, each: true });
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
    const result = ArgSpec.safeParse({ from: "param", rename: "newName", optional: true });
    expect(result.success).toBe(true);
  });

  test("accepts computed arg with template", () => {
    const result = ArgSpec.safeParse({ from: "computed", template: "projects/{projectId}" });
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

// ── FieldMappingSpec ─────────────────────────────────────────

describe("FieldMappingSpec", () => {
  test("accepts simple from mapping", () => {
    const result = FieldMappingSpec.safeParse({ from: "name" });
    expect(result.success).toBe(true);
  });

  test("accepts mapping with stripPrefix", () => {
    const result = FieldMappingSpec.safeParse({ from: "name", stripPrefix: "projects/" });
    expect(result.success).toBe(true);
  });

  test("accepts mapping with fallback", () => {
    const result = FieldMappingSpec.safeParse({
      from: "id",
      fallback: { field: "name", splitOn: "/screens/" },
    });
    expect(result.success).toBe(true);
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
