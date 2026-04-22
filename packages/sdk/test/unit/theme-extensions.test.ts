import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Project } from "../../src/project-ext.js";
import { StitchToolClient } from "../../src/client.js";

// Mock the StitchToolClient class
vi.mock("../../src/client");

describe("Theme Extensions", () => {
  let mockClient: StitchToolClient;
  const projectId = "proj-test";

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = new StitchToolClient();
    mockClient.callTool = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Project.inferTheme()", () => {
    it("should infer theme tokens from screen HTML", async () => {
      const project = new Project(mockClient, projectId);
      const screenId = "screen-1";

      // Mock tools
      vi.mocked(mockClient.callTool).mockImplementation(async (tool: string, args: any) => {
        if (tool === "list_screens") {
          return {
            screens: [
              { id: screenId, name: `projects/${projectId}/screens/${screenId}` }
            ]
          };
        }
        if (tool === "get_screen") {
          return {
            name: `projects/${projectId}/screens/${screenId}`,
            htmlCode: { downloadUrl: "https://example.com/screen1.html" }
          };
        }
        return {};
      });

      // Mock fetch for the HTML content
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        text: async () => `
          <html>
            <head>
              <style>
                body { color: #112233; font-family: 'Inter', sans-serif; }
                .btn { border-radius: 8px; }
              </style>
            </head>
            <body>Hello</body>
          </html>
        `
      }));


      const theme = await project.inferTheme(screenId);

      expect(theme).toEqual({
        customColor: "#112233",
        headlineFont: "Inter",
        roundness: "ROUND_EIGHT"
      });
    });
  });

  describe("Project.themePrompt()", () => {
    it("should inject theme tokens into prompt", () => {
      const project = new Project(mockClient, projectId);
      const prompt = "Create a landing page";
      const theme = {
        customColor: "#112233",
        headlineFont: "Inter",
        roundness: "ROUND_EIGHT"
      };


      const enhancedPrompt = project.themePrompt(prompt, theme);

      expect(enhancedPrompt).toContain("Create a landing page");
      expect(enhancedPrompt).toContain("#112233");
      expect(enhancedPrompt).toContain("Inter");
      expect(enhancedPrompt).toContain("ROUND_EIGHT");
    });
  });

  describe("Project.syncTheme()", () => {
    it("should create a new design system if none exists", async () => {
      const project = new Project(mockClient, projectId);
      const theme = { customColor: "#112233" };

      (mockClient.callTool as any).mockImplementation(async (tool: string, args: any) => {
        if (tool === "list_design_systems") {
          return { designSystems: [] };
        }
        if (tool === "create_design_system") {
          return {
            name: `assets/new-ds`,
            designSystem: { theme },
            version: "1"
          };
        }
        return {};
      });


      const ds = await project.syncTheme(theme);

      expect(mockClient.callTool).toHaveBeenCalledWith("list_design_systems", { projectId });
      expect(mockClient.callTool).toHaveBeenCalledWith("create_design_system", {
        projectId,
        designSystem: { theme }
      });
      expect(ds).toBeDefined();
    });

    it("should update existing design system if one exists", async () => {
      const project = new Project(mockClient, projectId);
      const theme = { customColor: "#445566" };

      (mockClient.callTool as any).mockImplementation(async (tool: string, args: any) => {
        if (tool === "list_design_systems") {
          return {
            designSystems: [
              { name: `assets/existing-ds`, designSystem: { theme: { customColor: "#112233" } }, version: "1" }
            ]
          };
        }
        if (tool === "update_design_system") {
          return {
            name: `assets/existing-ds`,
            projectId,
            designSystem: { theme }
          };
        }
        return {};
      });


      const ds = await project.syncTheme(theme);

      expect(mockClient.callTool).toHaveBeenCalledWith("list_design_systems", { projectId });
      expect(mockClient.callTool).toHaveBeenCalledWith("update_design_system", {
        name: `assets/existing-ds`,
        projectId,
        designSystem: { theme }
      });
      expect(ds).toBeDefined();
    });
  });

  describe("Project.downloadAssets()", () => {
    const testOutputDir = "./test/temp_assets";

    beforeEach(async () => {
      const fs = await import('fs/promises');
      await fs.rm(testOutputDir, { recursive: true, force: true });
    });

    it("should download assets and rewrite HTML", async () => {
      const project = new Project(mockClient, projectId);

      (mockClient.callTool as any).mockImplementation(async (tool: string, args: any) => {
        if (tool === "list_screens") {
          return {
            screens: [
              { id: "screen-1", name: `projects/${projectId}/screens/screen-1` }
            ]
          };
        }
        if (tool === "get_screen") {
          return {
            name: `projects/${projectId}/screens/screen-1`,
            htmlCode: { downloadUrl: "https://example.com/screen1.html" }
          };
        }
        return {};
      });

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
        if (url === "https://example.com/screen1.html") {
          return {
            text: async () => `
              <html>
                <head>
                  <link rel="stylesheet" href="https://example.com/style.css">
                </head>
                <body>
                  <img src="https://example.com/image.png">
                </body>
              </html>
            `
          };
        }
        if (url === "https://example.com/style.css") {
          const str = "body { color: red; }";
          const ab = new ArrayBuffer(str.length);
          const view = new Uint8Array(ab);
          for (let i = 0; i < str.length; i++) {
            view[i] = str.charCodeAt(i);
          }
          return { arrayBuffer: async () => ab };
        }
        if (url === "https://example.com/image.png") {
          return { arrayBuffer: async () => new ArrayBuffer(8) };
        }
        return null;
      }));


      await project.downloadAssets(testOutputDir);

      const fs = await import('fs/promises');
      
      // Verify files were created
      expect(await fs.stat(`${testOutputDir}/screen-1/code.html`)).toBeTruthy();
      
      const assets = await fs.readdir(`${testOutputDir}/screen-1/assets`);
      expect(assets.length).toBe(2);
      expect(assets.some(f => f.startsWith('style'))).toBe(true);
      expect(assets.some(f => f.startsWith('image'))).toBe(true);

      // Verify HTML was rewritten
      const rewritten = await fs.readFile(`${testOutputDir}/screen-1/code.html`, 'utf-8');
      expect(rewritten).toContain('href="assets/style-');
      expect(rewritten).toContain('src="assets/image-');
    });
  });
});
