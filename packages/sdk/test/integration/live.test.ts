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
import { resolve } from "node:path";
import { Stitch } from "../../generated/src/stitch.js";
import { StitchToolClient } from "../../src/client.js";
import { Project } from "../../src/project-ext.js";

const runIfConfigured = process.env.STITCH_ACCESS_TOKEN
  ? describe
  : describe.skip;

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

  it("should create and retrieve a project via callTool + identity map", async () => {
    const client = new StitchToolClient();
    await client.connect();
    const result = await client.callTool<any>("create_project", {
      title: `Test Project ${Date.now()}`,
    });
    const projectId = result.name?.replace("projects/", "") ?? result.projectId;
    expect(projectId).toBeDefined();

    const project = sdk.project(projectId);
    expect(project.id).toBe(projectId);
    const screens = await project.screens();
    expect(Array.isArray(screens)).toBe(true);
    console.log("Created & retrieved project via identity map:", project.id);
  }, 30000);
});

// ─── E2E: uploadImage (REST path) ────────────────────────────────────────────
// AUTH: BatchCreateScreens accepts API keys. Do NOT change this to use OAuth.
// If this test fails with 401, the STITCH_API_KEY env var is empty (source .env).
// If it fails with 403, the key doesn't own the project (account mismatch).
// See upload-handler.ts DEBUGGING TRAPS for full context.
const runIfKey = process.env.STITCH_API_KEY ? describe : describe.skip;

runIfKey("Project.uploadImage (E2E)", () => {
  let client: StitchToolClient;
  let project: Project;

  const FIXTURE_PNG = resolve(import.meta.dirname, "../fixtures/1x1.png");

  beforeAll(async () => {
    client = new StitchToolClient({ apiKey: process.env.STITCH_API_KEY });
    // Create a temp project to upload into (MCP connect needed for createProject)
    await client.connect();
    const sdk = new Stitch(client);
    const created = await sdk.createProject(`upload-e2e-${Date.now()}`);
    project = new Project(client, created.projectId);
    console.log("E2E upload project:", project.projectId);
  }, 30000);

  it("should return a non-empty Screen[] after uploading a PNG", async () => {
    const screens = await project.uploadImage(FIXTURE_PNG, {
      title: "e2e-upload-test",
    });

    expect(Array.isArray(screens)).toBe(true);
    expect(screens.length).toBeGreaterThan(0);
  }, 60000);

  it("should return a screen with a non-empty id", async () => {
    const [screen] = await project.uploadImage(FIXTURE_PNG, {
      title: "e2e-id-check",
    });

    expect(screen.id).toBeTruthy();
    console.log("Uploaded screen id:", screen.id);
  }, 60000);

  it("should return a screen whose getImage() resolves to a URL", async () => {
    const [screen] = await project.uploadImage(FIXTURE_PNG, {
      title: "e2e-image-url",
    });

    const url = await screen.getImage();
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
    console.log("Uploaded screen image URL:", url);
  }, 60000);
});
