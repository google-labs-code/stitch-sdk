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
import { Project, Screen, DesignSystem, Generation } from "../../src/index.js";
import { EntityManager } from "../../src/entity-manager.js";

function makeMockClient() {
  const client: any = {
    callTool: async () => ({}),
  };
  client.entities = new EntityManager(client);
  return client;
}

describe("0.4.0 Non-Breaking Bridge Pre-Mortem Regressions", () => {
  describe("Tiger 1: Direct Entity Construction Hydration", () => {
    it("hydrates Project from MCP resource name object { name: 'projects/123' }", () => {
      const client = makeMockClient();
      const project = new Project(client, {
        name: "projects/123",
        title: "My App",
      });
      expect(project.projectId).toBe("123");
      expect(project.id).toBe("123");
      expect(project.title).toBe("My App");
    });

    it("hydrates Project from prefixed resource string 'projects/123'", () => {
      const client = makeMockClient();
      const project = new Project(client, "projects/123");
      expect(project.projectId).toBe("123");
      expect(project.id).toBe("123");
    });

    it("hydrates Project from object with { id: '456' }", () => {
      const client = makeMockClient();
      const project = new Project(client, { id: "456", title: "Fallback ID" });
      expect(project.projectId).toBe("456");
      expect(project.id).toBe("456");
    });

    it("hydrates Screen from multi-segment resource string 'projects/p-1/screens/s-2'", () => {
      const client = makeMockClient();
      const screen = new Screen(client, "projects/p-1/screens/s-2");
      expect(screen.projectId).toBe("p-1");
      expect(screen.screenId).toBe("s-2");
      expect(screen.id).toBe("s-2");
    });

    it("hydrates Screen from MCP resource object { name: 'projects/p-1/screens/s-2' }", () => {
      const client = makeMockClient();
      const screen = new Screen(client, {
        name: "projects/p-1/screens/s-2",
        title: "Login Screen",
      });
      expect(screen.projectId).toBe("p-1");
      expect(screen.screenId).toBe("s-2");
      expect(screen.id).toBe("s-2");
      expect(screen.title).toBe("Login Screen");
    });

    it("hydrates DesignSystem from multi-segment resource string 'projects/p-1/assets/a-9'", () => {
      const client = makeMockClient();
      const ds = new DesignSystem(client, "projects/p-1/assets/a-9");
      expect(ds.projectId).toBe("p-1");
      expect(ds.assetId).toBe("a-9");
      expect(ds.id).toBe("a-9");
    });
  });

  describe("Tiger 2: Generation Proxy instanceof, Spread, and EntityManager.dispose", () => {
    it("satisfies both instanceof Screen and instanceof Generation at runtime", () => {
      const client = makeMockClient();
      const s = client.entities.resolve(Screen, ["projectId", "screenId"], {
        projectId: "p1",
        screenId: "s1",
        title: "Home",
      });
      const gen = new Generation([s], { rawField: true });

      expect(gen instanceof Generation).toBe(true);
      expect(gen instanceof Screen).toBe(true);
      expect(s instanceof Screen).toBe(true);
      expect(s instanceof Generation).toBe(false);
    });

    it("includes Screen own properties (projectId, screenId, data) in Object.keys and object spread", () => {
      const client = makeMockClient();
      const s = client.entities.resolve(Screen, ["projectId", "screenId"], {
        projectId: "p1",
        screenId: "s1",
        title: "Home",
      });
      const gen = new Generation([s], { rawField: true });

      const keys = Object.keys(gen);
      expect(keys).toContain("projectId");
      expect(keys).toContain("screenId");
      expect(keys).toContain("data");
      expect(keys).toContain("screens");

      const spread = { ...gen };
      expect(spread.projectId).toBe("p1");
      expect(spread.screenId).toBe("s1");
      expect(spread.data?.title).toBe("Home");
    });

    it("evicts wrapped Screen from EntityManager when client.entities.dispose(gen) is called", () => {
      const client = makeMockClient();
      const s1 = client.entities.resolve(Screen, ["projectId", "screenId"], {
        projectId: "p1",
        screenId: "s1",
        title: "Home",
      });
      const gen = new Generation([s1], {});

      // Dispose using the Generation handle directly (as a 0.x single-screen caller would)
      client.entities.dispose(gen);

      const s2 = client.entities.resolve(Screen, ["projectId", "screenId"], {
        projectId: "p1",
        screenId: "s1",
        title: "Home",
      });
      expect(s2).not.toBe(s1);
    });
  });
});
