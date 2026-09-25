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

describe("Issue #149: project.screens() fallback when list_screens returns empty", () => {
  it("recovers screens from get_project screenInstances when list_screens returns empty", async () => {
    const client = new StitchToolClient({ apiKey: "test-key" });
    client["isConnected"] = true;

    client["client"].callTool = vi
      .fn()
      .mockImplementation(async ({ name, arguments: args }: any) => {
        if (name === "list_screens") {
          // Simulate backend bug #149: list_screens returns empty before web UI visit
          return {
            isError: false,
            content: [],
            structuredContent: { screens: [] },
          };
        }
        if (name === "get_project") {
          return {
            isError: false,
            content: [],
            structuredContent: {
              name: `projects/${args.name?.replace("projects/", "") || "p1"}`,
              title: "My App",
              screenInstances: [
                {
                  id: "inst-1",
                  sourceScreen: "projects/p1/screens/s1",
                  label: "Dashboard",
                  width: 1440,
                  height: 900,
                },
                {
                  id: "inst-2",
                  sourceScreen: "projects/p1/screens/s2",
                  label: "Settings",
                  width: 1440,
                  height: 900,
                },
              ],
            },
          };
        }
        if (name === "get_screen") {
          return {
            isError: false,
            content: [],
            structuredContent: {
              name: args.name,
              title: args.screenId === "s1" ? "Dashboard" : "Settings",
              htmlCode: {
                downloadUrl: `https://example.com/${args.screenId}.html`,
              },
            },
          };
        }
        throw new Error(`Unexpected tool call: ${name}`);
      });

    const sdk = new Stitch(client);
    const project = sdk.project("p1");

    const screens = await project.screens();
    expect(screens.map((s) => s.screenId)).toEqual(["s1", "s2"]);
    expect(screens[0].title).toBe("Dashboard");
    expect(await screens[0].getHtmlUrl()).toBe("https://example.com/s1.html");
  });

  it("recovers in-session generated screens from EntityManager even if both list_screens and get_project omit them", async () => {
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
                        name: "projects/p1/screens/gen-1",
                        title: "Generated Home",
                        htmlCode: {
                          downloadUrl: "https://example.com/gen-1.html",
                        },
                      },
                    ],
                  },
                },
              ],
            },
          };
        }
        if (name === "list_screens") {
          return {
            isError: false,
            content: [],
            structuredContent: { screens: [] },
          };
        }
        if (name === "get_project") {
          return {
            isError: false,
            content: [],
            structuredContent: {
              name: "projects/p1",
              screenInstances: [],
            },
          };
        }
        throw new Error(`Unexpected tool call: ${name}`);
      });

    const sdk = new Stitch(client);
    const project = sdk.project("p1");

    await project.generate("Home screen", "MOBILE");
    const screens = await project.screens();

    expect(screens).toHaveLength(1);
    expect(screens[0].screenId).toBe("gen-1");
    expect(screens[0].title).toBe("Generated Home");
  });

  it("merges newly generated in-session screens when list_screens only returns older screens", async () => {
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
                        name: "projects/p1/screens/new-screen",
                        title: "New Screen",
                      },
                    ],
                  },
                },
              ],
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
                  name: "projects/p1/screens/old-screen",
                  title: "Old Screen",
                },
              ],
            },
          };
        }
        throw new Error(`Unexpected tool call: ${name}`);
      });

    const sdk = new Stitch(client);
    const project = sdk.project("p1");

    await project.generate("Add new screen", "DESKTOP");
    const screens = await project.screens();

    expect(screens.map((s) => s.screenId)).toEqual([
      "old-screen",
      "new-screen",
    ]);
  });
});
