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

import { describe, it, expect, vi } from "vitest";
import {
  EntityManager,
  parseAllSegments,
  mergeEntityData,
} from "../../src/entity-manager.js";

class DummyEntity {
  static readonly entityKey = "DummyEntity";
  id!: string;
  projectId!: string;
  data: any;
  constructor(client: any, data: any) {
    this.data = typeof data === "object" ? data : undefined;
  }
}

class HookedEntity {
  static readonly entityKey = "HookedEntity";
  id!: string;
  data: any;
  created = 0;
  disposed = 0;
  constructor(client: any, data: any) {
    this.data = data;
  }
  onCreate() {
    this.created++;
  }
  onDispose() {
    this.disposed++;
  }
}

describe("EntityManager", () => {
  it("returns the same instance for the same fully-qualified identity", () => {
    const manager = new EntityManager({});
    const refKeys = ["projectId", "id"];

    const instance1 = manager.resolve(DummyEntity, refKeys, {
      id: "123",
      projectId: "p1",
    });
    const instance2 = manager.resolve(DummyEntity, refKeys, {
      id: "123",
      projectId: "p1",
    });

    expect(instance1).toBe(instance2);
  });

  it("REGRESSION: same ID under different parents yields DISTINCT instances", () => {
    const manager = new EntityManager({});
    const refKeys = ["projectId", "id"];

    const inP1 = manager.resolve(DummyEntity, refKeys, {
      id: "abc",
      projectId: "p1",
    });
    const inP2 = manager.resolve(DummyEntity, refKeys, {
      id: "abc",
      projectId: "p2",
    });

    expect(inP1).not.toBe(inP2);
    expect(inP1.projectId).toBe("p1");
    expect(inP2.projectId).toBe("p2");
  });

  it("a bare ID string with missing parent scope is NOT cached (no cross-scope aliasing)", () => {
    const manager = new EntityManager({});
    const refKeys = ["projectId", "id"];

    const scoped = manager.resolve(DummyEntity, refKeys, {
      id: "123",
      projectId: "p1",
    });
    // "123" alone cannot identify which project it belongs to
    const bare = manager.resolve(DummyEntity, refKeys, "123");

    expect(bare).not.toBe(scoped);
    expect(bare.id).toBe("123");
    expect(bare.projectId).toBeUndefined();
  });

  it("populates all reference keys from a full resource name", () => {
    const manager = new EntityManager({});
    const refKeys = ["projectId", "id"];

    const instance = manager.resolve(
      DummyEntity,
      refKeys,
      "projects/p1/dummies/123",
    );
    expect(instance.id).toBe("123");
    expect(instance.projectId).toBe("p1");

    // And a second resolve with the same full name hits the cache
    const again = manager.resolve(DummyEntity, refKeys, {
      name: "projects/p1/dummies/123",
    });
    expect(again).toBe(instance);
  });

  it("single-key entities resolve from a bare ID and are cached", () => {
    const manager = new EntityManager({});
    const a = manager.resolve(DummyEntity, ["id"], "123");
    const b = manager.resolve(DummyEntity, ["id"], { id: "123" });
    expect(a).toBe(b);
  });

  it("unidentifiable data (empty object) returns uncached, never-aliased instances", () => {
    const manager = new EntityManager({});
    const a = manager.resolve(DummyEntity, ["projectId", "id"], {});
    const b = manager.resolve(DummyEntity, ["projectId", "id"], {});
    expect(a).not.toBe(b);
  });

  it("merges new data into the cached instance on cache hit", () => {
    const manager = new EntityManager({});
    const refKeys = ["projectId", "id"];

    const first = manager.resolve(DummyEntity, refKeys, {
      id: "1",
      projectId: "p1",
      title: "old",
    });
    const second = manager.resolve(DummyEntity, refKeys, {
      id: "1",
      projectId: "p1",
      title: "new",
      extra: true,
    });

    expect(second).toBe(first);
    expect(first.data.title).toBe("new");
    expect(first.data.extra).toBe(true);
  });

  it("deep-merges nested plain object data into cached instance without losing sibling fields (Ticket 3)", () => {
    const manager = new EntityManager({});
    const refKeys = ["projectId", "id"];

    const first = manager.resolve(DummyEntity, refKeys, {
      id: "1",
      projectId: "p1",
      htmlCode: {
        downloadUrl: "https://files.example/1.html",
        expiresAt: 12345,
      },
      title: "Login",
    });

    const second = manager.resolve(DummyEntity, refKeys, {
      id: "1",
      projectId: "p1",
      htmlCode: { downloadUrl: "https://files.example/2.html" },
    });

    expect(second).toBe(first);
    expect(first.data.htmlCode.downloadUrl).toBe(
      "https://files.example/2.html",
    );
    expect(first.data.htmlCode.expiresAt).toBe(12345);
  });

  it("mergeEntityData deeply merges plain objects and replaces arrays/primitives", () => {
    const target = { a: 1, nested: { x: 10, y: 20 }, arr: [1, 2] };
    const source = { nested: { x: 99 }, arr: [3] };
    const result = mergeEntityData(target, source) as typeof target;
    expect(result.a).toBe(1);
    expect(result.nested).toEqual({ x: 99, y: 20 });
    expect(result.arr).toEqual([3]);
  });

  it("uses static entityKey (not class.name) so identity survives minification", () => {
    const manager = new EntityManager({});
    // Simulate a minified class: mangled .name, stable entityKey
    const Mangled = class a {
      static readonly entityKey = "DummyEntity";
      id!: string;
      projectId!: string;
      data: any;
      constructor(client: any, data: any) {
        this.data = data;
      }
    };

    const viaOriginal = manager.resolve(DummyEntity, ["projectId", "id"], {
      id: "1",
      projectId: "p1",
    });
    const viaMangled = manager.resolve(Mangled as any, ["projectId", "id"], {
      id: "1",
      projectId: "p1",
    });
    expect(viaMangled).toBe(viaOriginal);
  });

  it("calls onCreate exactly once per instantiation, including uncached", () => {
    const manager = new EntityManager({});
    const cached = manager.resolve(HookedEntity, ["id"], { id: "1" });
    manager.resolve(HookedEntity, ["id"], { id: "1" }); // cache hit
    expect(cached.created).toBe(1);

    const uncached = manager.resolve(HookedEntity, ["id"], {});
    expect(uncached.created).toBe(1);
  });

  it("dispose() calls onDispose and evicts only that entity", () => {
    const manager = new EntityManager({});
    const a = manager.resolve(HookedEntity, ["id"], { id: "a" });
    const b = manager.resolve(HookedEntity, ["id"], { id: "b" });

    manager.dispose(a);
    expect(a.disposed).toBe(1);

    const a2 = manager.resolve(HookedEntity, ["id"], { id: "a" });
    expect(a2).not.toBe(a);
    expect(manager.resolve(HookedEntity, ["id"], { id: "b" })).toBe(b);
  });

  it("clear() disposes all entities and empties the cache", () => {
    const manager = new EntityManager({});
    const a = manager.resolve(HookedEntity, ["id"], { id: "a" });
    manager.clear();
    expect(a.disposed).toBe(1);

    const a2 = manager.resolve(HookedEntity, ["id"], { id: "a" });
    expect(a2).not.toBe(a);
  });

  it("warns (uncached) only when STITCH_DEBUG is set", () => {
    const manager = new EntityManager({});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    manager.resolve(DummyEntity, ["projectId", "id"], {});
    expect(warn).not.toHaveBeenCalled();

    vi.stubEnv("STITCH_DEBUG", "1");
    manager.resolve(DummyEntity, ["projectId", "id"], {});
    expect(warn).toHaveBeenCalledOnce();

    vi.unstubAllEnvs();
    warn.mockRestore();
  });
});

describe("parseAllSegments", () => {
  it("extracts singularized keyed segments", () => {
    expect(parseAllSegments("projects/p1/screens/s1")).toEqual({
      projectId: "p1",
      screenId: "s1",
    });
  });

  it("returns empty for bare IDs", () => {
    expect(parseAllSegments("abc123")).toEqual({});
  });
});

describe("EntityManager value-object mode (entityCache: false)", () => {
  it("never caches: same identity yields distinct instances", () => {
    const manager = new EntityManager({}, { enabled: false });
    const a = manager.resolve(DummyEntity, ["projectId", "id"], {
      id: "1",
      projectId: "p1",
    });
    const b = manager.resolve(DummyEntity, ["projectId", "id"], {
      id: "1",
      projectId: "p1",
    });
    expect(a).not.toBe(b);
    // Identity is still hydrated
    expect(a.id).toBe("1");
    expect(b.projectId).toBe("p1");
  });
});
