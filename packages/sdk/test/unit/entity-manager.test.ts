import { describe, it, expect } from "vitest";
import { EntityManager } from "../../src/entity-manager.js";

class DummyEntity {
  id: string;
  projectId: string;
  data: any;
  constructor(client: any, data: any) {
    this.data = data;
  }
}

describe("EntityManager", () => {
  it("should return the same instance for a given ID (referential equality)", () => {
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
    const instance3 = manager.resolve(DummyEntity, refKeys, "123");

    expect(instance1).toBe(instance2);
    expect(instance1).toBe(instance3);
  });

  it("should populate reference keys from complex string correctly", () => {
    const manager = new EntityManager({});
    const refKeys = ["projectId", "id"];

    const instance = manager.resolve(
      DummyEntity,
      refKeys,
      "projects/p1/dummies/123",
    );
    expect(instance.id).toBe("123");
    expect(instance.projectId).toBe("p1");
  });

  it("should clear the cache", () => {
    const manager = new EntityManager({});
    const instance1 = manager.resolve(DummyEntity, ["id"], "123");
    manager.clear();
    const instance2 = manager.resolve(DummyEntity, ["id"], "123");

    expect(instance1).not.toBe(instance2);
  });
});
