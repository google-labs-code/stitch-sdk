import { describe, it, expect, vi } from "vitest";
import { Stitch } from "../../generated/src/stitch.js";
import { Screen } from "../../generated/src/screen.js";
import { StitchToolClient } from "../../src/client.js";

describe("Project.screen() factory", () => {
  const SCREEN_ID = "abc123def456";
  const PROJECT_ID = "999";

  function makeStitch() {
    const mockClient = new StitchToolClient({ apiKey: "fake" });
    return { stitch: new Stitch(mockClient), mockClient };
  }

  it("should create a Screen handle from an ID without an API call", () => {
    const { stitch, mockClient } = makeStitch();
    const connectSpy = vi.spyOn(mockClient, "connect");

    const project = stitch.project(PROJECT_ID);
    const screen = project.screen(SCREEN_ID);

    // No API call should have been made
    expect(connectSpy).not.toHaveBeenCalled();

    // Should return a Screen instance
    expect(screen).toBeInstanceOf(Screen);
  });

  it("should populate screenId and projectId correctly", () => {
    const { stitch } = makeStitch();
    const project = stitch.project(PROJECT_ID);
    const screen = project.screen(SCREEN_ID);

    expect(screen.id).toBe(SCREEN_ID);
    expect(screen.screenId).toBe(SCREEN_ID);
    expect(screen.projectId).toBe(PROJECT_ID);
  });

  it("should produce a screen that can call edit()", async () => {
    const { stitch, mockClient } = makeStitch();
    vi.spyOn(mockClient, "callTool").mockResolvedValue({
      outputComponents: [
        {
          design: { screens: [{ id: "new-screen-id", projectId: PROJECT_ID }] },
        },
      ],
    });

    const project = stitch.project(PROJECT_ID);
    const screen = project.screen(SCREEN_ID);
    const edited = await screen.edit("make it blue");

    expect(edited).toBeInstanceOf(Screen);
    expect(edited.id).toBe("new-screen-id");
  });

  it("should produce a screen that can call getHtml() via API", async () => {
    const { stitch, mockClient } = makeStitch();
    vi.spyOn(mockClient, "callTool").mockResolvedValue({
      htmlCode: { downloadUrl: "https://example.com/html" },
    });

    const project = stitch.project(PROJECT_ID);
    const screen = project.screen(SCREEN_ID);
    const html = await screen.getHtml();

    expect(html).toBe("https://example.com/html");
  });
});
