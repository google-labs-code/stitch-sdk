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

import { describe, it, expect, beforeAll } from "vitest";
import { Stitch } from "../../generated/src/stitch.js";
import { StitchToolClient } from "../../src/client.js";

const runIfConfigured = process.env.STITCH_ACCESS_TOKEN ? describe : describe.skip;

runIfConfigured("Stitch Live Integration", () => {
  let sdk: Stitch;

  beforeAll(async () => {
    const client = new StitchToolClient();
    await client.connect();
    sdk = new Stitch(client);
  });

  it("should list projects", async () => {
    const projects = await sdk.projects();
    expect(Array.isArray(projects)).toBe(true);
    if (projects.length > 0) {
      expect(projects[0]).toHaveProperty("id");
    }
  });

  it("should create and retrieve a project", async () => {
    const project = await sdk.createProject(`Test Project ${Date.now()}`);
    expect(project.id).toContain("projects/");
    console.log("Created Project:", project.id);
  }, 30000);
});
