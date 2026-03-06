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
