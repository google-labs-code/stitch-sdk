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

import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { Screen } from "../../generated/src/screen.js";
import { Project } from "../../generated/src/project.js";
import { Stitch } from "../../generated/src/stitch.js";
import { StitchToolClient } from "../../src/client.js";
import { StitchError } from "../../src/spec/errors.js";

// Mock the StitchToolClient class
vi.mock("../../src/client");

describe("SDK Unit Tests", () => {
  let mockClient: StitchToolClient;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create a mock instance of the client
    mockClient = new StitchToolClient();
    mockClient.callTool = vi.fn();
  });

  describe("Screen Class", () => {
    const screenData = { id: "screen-123", name: "Login", htmlCode: { downloadUrl: "https://cached.example.com/html" }, screenshot: { downloadUrl: "https://cached.example.com/img.png" }, projectId: "proj-123" };
    const projectId = "proj-123";

    it("getHtml should return cached HTML from data if available", async () => {
      const screen = new Screen(mockClient, screenData);
      const result = await screen.getHtml();

      // Should not call API — uses cached data.htmlCode.downloadUrl
      expect(mockClient.callTool).not.toHaveBeenCalled();
      expect(result).toBe("https://cached.example.com/html");
    });

    it("getHtml should call get_screen if no cached htmlCode", async () => {
      const screen = new Screen(mockClient, { id: "screen-123", name: "Login", projectId });

      (mockClient.callTool as Mock).mockResolvedValue({
        htmlCode: { downloadUrl: "https://api.example.com/html" }
      });

      const result = await screen.getHtml();

      expect(mockClient.callTool).toHaveBeenCalledWith("get_screen", {
        projectId: projectId,
        screenId: "screen-123",
        name: "projects/proj-123/screens/screen-123",
      });
      expect(result).toBe("https://api.example.com/html");
    });

    it("getImage should return cached screenshot URL from data if available", async () => {
      const screen = new Screen(mockClient, screenData);
      const result = await screen.getImage();

      // Should not call API — uses cached data.screenshot.downloadUrl
      expect(mockClient.callTool).not.toHaveBeenCalled();
      expect(result).toBe("https://cached.example.com/img.png");
    });

    it("getImage should call get_screen if no cached screenshot", async () => {
      const screen = new Screen(mockClient, { id: "screen-123", name: "Login", projectId });

      (mockClient.callTool as Mock).mockResolvedValue({
        screenshot: { downloadUrl: "https://api.example.com/image.png" }
      });

      const result = await screen.getImage();

      expect(mockClient.callTool).toHaveBeenCalledWith("get_screen", {
        projectId: projectId,
        screenId: "screen-123",
        name: "projects/proj-123/screens/screen-123",
      });
      expect(result).toBe("https://api.example.com/image.png");
    });


    it("getHtml should fallback to empty string when raw.htmlCode.downloadUrl is missing", async () => {
      const screen = new Screen(mockClient, { id: "screen-123", name: "Login", projectId });

      // Mock missing htmlCode / downloadUrl
      (mockClient.callTool as Mock).mockResolvedValue({
        htmlCode: {}
      });

      const result = await screen.getHtml();

      expect(mockClient.callTool).toHaveBeenCalledWith("get_screen", {
        projectId: projectId,
        screenId: "screen-123",
        name: "projects/proj-123/screens/screen-123",
      });
      expect(result).toBe("");
    });

    it("getHtml should throw StitchError on failure", async () => {
      const screen = new Screen(mockClient, { id: "screen-123", name: "Login", projectId });
      (mockClient.callTool as Mock).mockRejectedValue(new Error("Network failure"));

      await expect(screen.getHtml()).rejects.toThrow("Network failure");
    });

    it("edit should call edit_screens and return new Screen", async () => {
      const screen = new Screen(mockClient, screenData);

      (mockClient.callTool as Mock).mockResolvedValue({
        outputComponents: [{
          design: { screens: [{ id: "edited-screen", htmlCode: "<div>Edited</div>", projectId }] },
        }],
        projectId,
        sessionId: "session-1",
      });

      const edited = await screen.edit("Make it dark");

      expect(mockClient.callTool).toHaveBeenCalledWith("edit_screens", {
        projectId,
        selectedScreenIds: ["screen-123"],
        prompt: "Make it dark",
      });
      expect(edited).toBeInstanceOf(Screen);
      expect(edited.id).toBe("edited-screen");
    });

    it("edit should throw StitchError (not TypeError) when response has no screens", async () => {
      const screen = new Screen(mockClient, screenData);

      (mockClient.callTool as Mock).mockResolvedValue({
        outputComponents: [{ design: {} }],
        projectId,
      });

      const err = await screen.edit("Make it dark").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StitchError);
      expect((err as StitchError).code).toBe("UNKNOWN_ERROR");
      expect((err as StitchError).message).toContain("edit_screens");
    });

    it("edit should throw StitchError when outputComponents is empty", async () => {
      const screen = new Screen(mockClient, screenData);

      (mockClient.callTool as Mock).mockResolvedValue({ outputComponents: [] });

      const err = await screen.edit("Make it dark").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StitchError);
      expect((err as StitchError).message).toContain("edit_screens");
    });

    it("variants should call generate_variants and return Screen[]", async () => {
      const screen = new Screen(mockClient, screenData);

      (mockClient.callTool as Mock).mockResolvedValue({
        outputComponents: [{
          design: {
            screens: [
              { id: "var-1", htmlCode: "<div>V1</div>", projectId },
              { id: "var-2", htmlCode: "<div>V2</div>", projectId },
            ],
          },
        }],
        projectId,
        sessionId: "session-1",
      });

      const results = await screen.variants("Try colors", { variantCount: 2 });

      expect(mockClient.callTool).toHaveBeenCalledWith("generate_variants", {
        projectId,
        selectedScreenIds: ["screen-123"],
        prompt: "Try colors",
        variantOptions: { variantCount: 2 },
      });
      expect(results).toHaveLength(2);
      expect(results[0]).toBeInstanceOf(Screen);
      expect(results[0].id).toBe("var-1");
      expect(results[1].id).toBe("var-2");
    });
  });

  describe("Stitch Class (Identity Map)", () => {
    it("should not have a getProject method — use project(id) instead", () => {
      const sdk = new Stitch(mockClient);
      expect(typeof (sdk as any).getProject).toBe("undefined");
    });

    it("createProject should call create_project and return a Project", async () => {
      const sdk = new Stitch(mockClient);
      (mockClient.callTool as Mock).mockResolvedValue({
        name: "projects/new-proj-123",
        title: "My Dashboard",
      });

      const project = await sdk.createProject("My Dashboard");

      expect(mockClient.callTool).toHaveBeenCalledWith("create_project", {
        title: "My Dashboard",
      });
      expect(project).toBeInstanceOf(Project);
      expect(project.id).toBe("new-proj-123");
    });

    it("project(id) should return a Project handle with correct ID", () => {
      const sdk = new Stitch(mockClient);
      const handle = sdk.project("proj-123");
      expect(handle).toBeInstanceOf(Project);
      expect(handle.id).toBe("proj-123");
    });
  });

  describe("Project Class", () => {
    const projectId = "proj-abc";

    it("generate should call correct tool and return a Screen instance", async () => {
      const project = new Project(mockClient, projectId);
      const prompt = "Login page";

      (mockClient.callTool as Mock).mockResolvedValue({
        outputComponents: [
          {
            design: {
              screens: [{ id: "new-screen-1", name: "Generated", htmlCode: "<div>test</div>", projectId }],
            },
          },
        ],
        projectId: projectId,
        sessionId: "session-1",
      });

      const result = await project.generate(prompt);

      expect(mockClient.callTool).toHaveBeenCalledWith("generate_screen_from_text", {
        projectId: projectId,
        prompt: prompt,
        deviceType: undefined,
        modelId: undefined
      });

      expect(result).toBeInstanceOf(Screen);
      expect(result.id).toBe("new-screen-1");
      expect(result.projectId).toBe(projectId);
    });


    it("generate should throw StitchError (not TypeError) when response has no screens", async () => {
      const project = new Project(mockClient, projectId);

      (mockClient.callTool as Mock).mockResolvedValue({
        outputComponents: [{ design: { /* screens missing */ } }],
        projectId: projectId,
      });

      const err = await project.generate("test").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StitchError);
      expect((err as StitchError).code).toBe("UNKNOWN_ERROR");
      expect((err as StitchError).message).toContain("generate_screen_from_text");
    });

    it("generate should throw StitchError when outputComponents is empty", async () => {
      const project = new Project(mockClient, projectId);

      (mockClient.callTool as Mock).mockResolvedValue({
        outputComponents: [],
        projectId: projectId,
      });

      const err = await project.generate("test").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StitchError);
      expect((err as StitchError).message).toContain("generate_screen_from_text");
    });

    it("generate should throw StitchError when outputComponents is missing", async () => {
      const project = new Project(mockClient, projectId);

      (mockClient.callTool as Mock).mockResolvedValue({ projectId: projectId });

      const err = await project.generate("test").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StitchError);
      expect((err as StitchError).message).toContain("generate_screen_from_text");
    });

    it("screens should list screens and return Screen instances", async () => {
      const project = new Project(mockClient, projectId);
      const mockResponse = {
        screens: [
          { id: "s1", sourceScreen: "S1", projectId },
          { id: "s2", sourceScreen: "S2", projectId }
        ]
      };

      (mockClient.callTool as Mock).mockResolvedValue(mockResponse);

      const result = await project.screens();

      expect(mockClient.callTool).toHaveBeenCalledWith("list_screens", {
        projectId: projectId
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Screen);
      expect(result[1]).toBeInstanceOf(Screen);
      expect(result[0].id).toBe("s1");
    });


    it("screens should return [] when returned data has no screens array", async () => {
      const project = new Project(mockClient, projectId);

      // Mock with missing screens array
      (mockClient.callTool as Mock).mockResolvedValue({});

      const result = await project.screens();

      expect(mockClient.callTool).toHaveBeenCalledWith("list_screens", {
        projectId: projectId
      });

      expect(result).toEqual([]);
    });

    it("generate should throw StitchError on failure", async () => {
      const project = new Project(mockClient, projectId);

      (mockClient.callTool as Mock).mockRejectedValue(new Error("Generation failed"));

      await expect(project.generate("test")).rejects.toThrow("Generation failed");
    });
  });
});
