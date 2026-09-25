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

describe("Issue #361: screen.edit() must not serve stale pre-edit HTML", () => {
  it("invalidates cached pre-edit htmlCode/screenshot when edit_screens updates a screen in-place without inline htmlCode", async () => {
    const client = new StitchToolClient({ apiKey: "test-key" });
    client["isConnected"] = true;

    let editCalled = false;
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
                        title: "Alpha",
                        htmlCode: {
                          downloadUrl: "https://example.com/s1-before.html",
                        },
                        screenshot: {
                          downloadUrl: "https://example.com/s1-before.png",
                        },
                      },
                    ],
                  },
                },
              ],
            },
          };
        }
        if (name === "edit_screens") {
          editCalled = true;
          // Server returns updated screen metadata for s1 without inline htmlCode.downloadUrl
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
                        title: "Bravo",
                      },
                    ],
                  },
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
              name: "projects/p1/screens/s1",
              id: "s1",
              title: editCalled ? "Bravo" : "Alpha",
              htmlCode: {
                downloadUrl: editCalled
                  ? "https://example.com/s1-after.html"
                  : "https://example.com/s1-before.html",
              },
              screenshot: {
                downloadUrl: editCalled
                  ? "https://example.com/s1-after.png"
                  : "https://example.com/s1-before.png",
              },
            },
          };
        }
        throw new Error(`Unexpected tool call: ${name}`);
      });

    const sdk = new Stitch(client);
    const project = sdk.project("p1");

    const gen = await project.generate("Original heading Alpha");
    expect(await gen.getHtmlUrl()).toBe("https://example.com/s1-before.html");

    const edited = await gen.edit("Change heading to Bravo");
    // Must fetch fresh get_screen URL ("s1-after.html"), NOT return cached "s1-before.html"
    expect(await edited.getHtmlUrl()).toBe("https://example.com/s1-after.html");
    expect(await edited.getImageUrl()).toBe("https://example.com/s1-after.png");
  });

  it("prioritizes newly minted revision screen when edit_screens returns both original and new screen in outputComponents", async () => {
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
                        title: "Original",
                        htmlCode: {
                          downloadUrl: "https://example.com/s1-original.html",
                        },
                      },
                    ],
                  },
                },
              ],
            },
          };
        }
        if (name === "edit_screens") {
          // Server returns original screen s1 followed by new revision screen s2
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
                        title: "Original",
                        htmlCode: {
                          downloadUrl: "https://example.com/s1-original.html",
                        },
                      },
                      {
                        name: "projects/p1/screens/s2",
                        id: "s2",
                        title: "Edited Revision",
                        htmlCode: {
                          downloadUrl: "https://example.com/s2-edited.html",
                        },
                      },
                    ],
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

    const screen = await project.generate("Original");
    const edited = await screen.edit("Update heading");

    // edited.id and edited.getHtmlUrl() should reflect the new revision s2, while preserving both in edited.screens
    expect(edited.id).toBe("s2");
    expect(await edited.getHtmlUrl()).toBe("https://example.com/s2-edited.html");
    expect(edited.screens.map((s) => s.screenId)).toEqual(["s2", "s1"]);
  });
});
