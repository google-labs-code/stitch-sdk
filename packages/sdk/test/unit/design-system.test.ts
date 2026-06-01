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
 * TDD Cycle: DesignSystem Domain Class
 *
 * Tests that the generated DesignSystem class and Project integration
 * correctly map to the Stitch MCP design system tools.
 *
 * Red → runs before codegen and is expected to fail (DesignSystem not generated yet).
 * Green → runs after `npm run generate` and `npm run build`.
 */

import { EntityManager } from "../../src/entity-manager.js";
import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { Project } from "../../generated/src/project.js";
import { DesignSystem } from "../../generated/src/designsystem.js";
import { Screen } from "../../generated/src/screen.js";
import { StitchToolClient } from "../../src/client.js";

// Mock the StitchToolClient class
vi.mock("../../src/client");

describe("DesignSystem Domain Class", () => {
  let mockClient: StitchToolClient;
  const projectId = "proj-ds-test";
  const assetId = "15996705518239280238";
  const assetName = `assets/${assetId}`;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = new StitchToolClient();
    mockClient.callTool = vi.fn();
    mockClient.entities = new EntityManager(mockClient);
  });

  // ── Project.createDesignSystem() ─────────────────────────────

  describe("Project.createDesignSystem()", () => {
    it("should call create_design_system with projectId from self and return a DesignSystem handle", async () => {
      const project = mockClient.entities.resolve(
        Project,
        ["projectId"],
        projectId,
      );

      (mockClient.callTool as Mock).mockResolvedValue({
        name: assetName,
        designSystem: { displayName: "My Brand", theme: {} },
        version: "1",
      });

      const ds = await project.createDesignSystem({
        displayName: "My Brand",
        theme: {
          customColor: "#ff0000",
          colorMode: "LIGHT",
          headlineFont: "INTER",
          bodyFont: "INTER",
          roundness: "ROUND_EIGHT",
        },
      });

      expect(mockClient.callTool).toHaveBeenCalledWith("create_design_system", {
        projectId,
        designSystem: {
          displayName: "My Brand",
          theme: {
            customColor: "#ff0000",
            colorMode: "LIGHT",
            headlineFont: "INTER",
            bodyFont: "INTER",
            roundness: "ROUND_EIGHT",
          },
        },
      });
      expect(ds).toBeInstanceOf(DesignSystem);
      expect(ds.assetId).toBe(assetId);
      expect(ds.projectId).toBe(projectId);
    });
  });

  // ── Project.listDesignSystems() ──────────────────────────────

  describe("Project.listDesignSystems()", () => {
    it("should call list_design_systems with projectId from self and return DesignSystem[]", async () => {
      const project = mockClient.entities.resolve(
        Project,
        ["projectId"],
        projectId,
      );

      (mockClient.callTool as Mock).mockResolvedValue({
        designSystems: [
          {
            name: `assets/asset-1`,
            designSystem: { displayName: "Brand A" },
            version: "1",
          },
          {
            name: `assets/asset-2`,
            designSystem: { displayName: "Brand B" },
            version: "2",
          },
        ],
      });

      const list = await project.listDesignSystems();

      expect(mockClient.callTool).toHaveBeenCalledWith("list_design_systems", {
        projectId,
      });
      expect(list).toHaveLength(2);
      expect(list[0]).toBeInstanceOf(DesignSystem);
      expect(list[0].assetId).toBe("asset-1");
      expect(list[0].projectId).toBe(projectId);
      expect(list[1].assetId).toBe("asset-2");
    });

    it("should return empty array when no design systems exist", async () => {
      const project = mockClient.entities.resolve(
        Project,
        ["projectId"],
        projectId,
      );
      (mockClient.callTool as Mock).mockResolvedValue({ designSystems: [] });

      const list = await project.listDesignSystems();
      expect(list).toHaveLength(0);
    });
  });

  // ── Project.designSystem() factory ───────────────────────────

  describe("Project.designSystem() factory", () => {
    it("should return a DesignSystem handle without an API call", () => {
      const project = mockClient.entities.resolve(
        Project,
        ["projectId"],
        projectId,
      );
      const ds = project.designSystem(assetId);

      expect(ds).toBeInstanceOf(DesignSystem);
      expect(ds.assetId).toBe(assetId);
      expect(ds.projectId).toBe(projectId);
      expect(mockClient.callTool).not.toHaveBeenCalled();
    });
  });

  // ── DesignSystem.update() ─────────────────────────────────────

  describe("DesignSystem.update()", () => {
    it("should call update_design_system with assetId and projectId from self and return DesignSystem", async () => {
      const project = mockClient.entities.resolve(
        Project,
        ["projectId"],
        projectId,
      );
      const ds = project.designSystem(assetId);

      (mockClient.callTool as Mock).mockResolvedValue({
        name: assetName,
        designSystem: { displayName: "Updated Brand", theme: {} },
        version: "2",
      });

      const updated = await ds.update({
        displayName: "Updated Brand",
        theme: {
          customColor: "#00ff00",
          colorMode: "DARK",
          headlineFont: "INTER",
          bodyFont: "INTER",
          roundness: "ROUND_FOUR",
        },
      });

      expect(mockClient.callTool).toHaveBeenCalledWith("update_design_system", {
        name: assetName,
        projectId,
        designSystem: {
          displayName: "Updated Brand",
          theme: {
            customColor: "#00ff00",
            colorMode: "DARK",
            headlineFont: "INTER",
            bodyFont: "INTER",
            roundness: "ROUND_FOUR",
          },
        },
      });
      expect(updated).toBeInstanceOf(DesignSystem);
      expect(updated.assetId).toBe(assetId);
    });
  });

  // ── DesignSystem.apply() ──────────────────────────────────────

  describe("DesignSystem.apply()", () => {
    it("should call apply_design_system with assetId and projectId from self and return Screen[]", async () => {
      const project = mockClient.entities.resolve(
        Project,
        ["projectId"],
        projectId,
      );
      const ds = project.designSystem(assetId);

      const screenInstances = [
        { id: "si-1", sourceScreen: `projects/${projectId}/screens/s-1` },
      ];

      (mockClient.callTool as Mock).mockResolvedValue({
        outputComponents: [
          {
            design: {
              screens: [{ id: "s-1", projectId }],
            },
          },
        ],
        projectId,
        sessionId: "session-1",
      });

      const screens = await ds.apply(screenInstances);

      expect(mockClient.callTool).toHaveBeenCalledWith("apply_design_system", {
        assetId,
        projectId,
        selectedScreenInstances: screenInstances,
      });
      expect(screens).toHaveLength(1);
      expect(screens[0]).toBeInstanceOf(Screen);
      expect(screens[0].id).toBe("s-1");
    });
  });

  // ── Project.uploadDesignMd() ──────────────────────────────────

  describe("Project.uploadDesignMd()", () => {
    it("should call upload_design_md with projectId from self and base64 content", async () => {
      const project = mockClient.entities.resolve(
        Project,
        ["projectId"],
        projectId,
      );

      const mockScreenInstance = {
        id: "si-design-md",
        sourceScreen: `projects/${projectId}/screens/screen-md`,
        type: "DESIGN_SYSTEM_INSTANCE",
      };

      (mockClient.callTool as Mock).mockResolvedValue(mockScreenInstance);

      const designMd = btoa("# My Design System\n\nprimary: #ff0000");
      const result = await project.uploadDesignMd(designMd);

      expect(mockClient.callTool).toHaveBeenCalledWith("upload_design_md", {
        projectId,
        designMdBase64: designMd,
      });
      expect(result).toEqual(mockScreenInstance);
    });
  });

  // ── Project.createDesignSystemFromDesignMd() ──────────────────

  describe("Project.createDesignSystemFromDesignMd()", () => {
    it("should call create_design_system_from_design_md with screen instance and return DesignSystem", async () => {
      const project = mockClient.entities.resolve(
        Project,
        ["projectId"],
        projectId,
      );

      const selectedScreenInstance = {
        id: "si-design-md",
        sourceScreen: `projects/${projectId}/screens/screen-md`,
      };

      (mockClient.callTool as Mock).mockResolvedValue({
        assetId,
      });

      const ds = await project.createDesignSystemFromDesignMd(
        selectedScreenInstance,
        "DESKTOP",
      );

      expect(mockClient.callTool).toHaveBeenCalledWith(
        "create_design_system_from_design_md",
        {
          projectId,
          selectedScreenInstance,
          deviceType: "DESKTOP",
        },
      );
      expect(ds).toBeInstanceOf(DesignSystem);
      expect(ds.assetId).toBe(assetId);
      expect(ds.projectId).toBe(projectId);
    });

    it("should work without optional deviceType", async () => {
      const project = mockClient.entities.resolve(
        Project,
        ["projectId"],
        projectId,
      );

      (mockClient.callTool as Mock).mockResolvedValue({
        assetId,
      });

      const ds = await project.createDesignSystemFromDesignMd({
        id: "si-1",
        sourceScreen: `projects/${projectId}/screens/s-1`,
      });

      expect(mockClient.callTool).toHaveBeenCalledWith(
        "create_design_system_from_design_md",
        {
          projectId,
          selectedScreenInstance: {
            id: "si-1",
            sourceScreen: `projects/${projectId}/screens/s-1`,
          },
          deviceType: undefined,
        },
      );
      expect(ds).toBeInstanceOf(DesignSystem);
    });
  });
});
