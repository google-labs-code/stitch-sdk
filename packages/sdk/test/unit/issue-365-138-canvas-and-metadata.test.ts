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
import { StitchToolClient, Stitch } from "../../src/index.js";

describe("Issues #365 & #138: Project.get() / getCanvasLayout() and Screen metadata preservation", () => {
  it("fetches project metadata via project.get() and returns ScreenInstance[] via project.getCanvasLayout() (#365)", async () => {
    const client = new StitchToolClient({ apiKey: "test-key" });
    client["isConnected"] = true;

    const screenInstances = [
      {
        id: "uuid-1",
        sourceScreen: "projects/p1/screens/s1",
        label: "Login",
        x: 100,
        y: 200,
        width: 390,
        height: 844,
      },
      {
        id: "uuid-2",
        sourceScreen: "projects/p1/screens/s2",
        label: "Home",
        x: 600,
        y: 200,
        width: 390,
        height: 844,
      },
    ];

    client["client"].callTool = vi
      .fn()
      .mockImplementation(async ({ name, arguments: args }: any) => {
        if (name === "get_project") {
          expect(args).toEqual({ name: "projects/p1" });
          return {
            isError: false,
            content: [],
            structuredContent: {
              name: "projects/p1",
              title: "Canvas App",
              screenInstances,
            },
          };
        }
        throw new Error(`Unexpected tool call: ${name}`);
      });

    const sdk = new Stitch(client);
    const project = sdk.project("p1");

    const fetched = await project.get();
    expect(fetched).toBe(project);
    expect(project.title).toBe("Canvas App");

    const layout = await project.getCanvasLayout();
    expect(layout).toEqual(screenInstances);
  });

  it("preserves rich Screen metadata (theme, designSystem, screenMetadata, prompt) when get_screen returns a partial representation (#138)", async () => {
    const client = new StitchToolClient({ apiKey: "test-key" });
    client["isConnected"] = true;

    client["client"].callTool = vi
      .fn()
      .mockImplementation(async ({ name }: any) => {
        if (name === "generate_screen_from_text") {
          return {
            isError: false,
            content: [],
            structuredContent: {
              outputComponents: [
                {
                  design: {
                    screens: [
                      {
                        name: "projects/p1/screens/s1",
                        id: "s1",
                        title: "Dashboard",
                        prompt: "Modern analytics dashboard",
                        theme: { designMd: "# Dark Theme\nPrimary: #00FF88" },
                        designSystem: { name: "assets/ds-1" },
                        screenMetadata: { agentVersion: "v2" },
                      },
                    ],
                  },
                },
              ],
            },
          };
        }
        if (name === "get_screen") {
          // Simulate backend #138: get_screen returns htmlCode/screenshot but omits theme/designSystem/prompt
          return {
            isError: false,
            content: [],
            structuredContent: {
              name: "projects/p1/screens/s1",
              id: "s1",
              title: "Dashboard",
              htmlCode: {
                downloadUrl: "https://example.com/s1.html",
              },
            },
          };
        }
        if (name === "list_screens") {
          return {
            isError: false,
            content: [],
            structuredContent: {
              screens: [
                {
                  name: "projects/p1/screens/s1",
                  id: "s1",
                  title: "Dashboard",
                  htmlCode: {
                    downloadUrl: "https://example.com/s1.html",
                  },
                },
              ],
            },
          };
        }
        throw new Error(`Unexpected tool call: ${name}`);
      });

    const sdk = new Stitch(client);
    const project = sdk.project("p1");

    const gen = await project.generate("Modern analytics dashboard");
    expect(await gen.getHtmlUrl()).toBe("https://example.com/s1.html");

    const [reloaded] = await project.screens();
    expect(reloaded.data?.theme?.designMd).toBe(
      "# Dark Theme\nPrimary: #00FF88",
    );
    expect(reloaded.data?.designSystem).toEqual({ name: "assets/ds-1" });
    expect(reloaded.data?.screenMetadata).toEqual({ agentVersion: "v2" });
    expect(reloaded.data?.prompt).toBe("Modern analytics dashboard");
  });
});
