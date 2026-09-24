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
 * Screen content methods + cache write-back [V1_PLAN §3.2, D2].
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import { Screen } from "../../src/screen-ext.js";
import { Screen as GeneratedScreen } from "../../generated/src/screen.js";
import { StitchError } from "../../src/spec/errors.js";
import { StitchToolClient } from "../../src/client.js";
import { EntityManager } from "../../src/entity-manager.js";

vi.mock("../../src/client");

let client: StitchToolClient;

beforeEach(() => {
  vi.clearAllMocks();
  client = new StitchToolClient();
  client.callTool = vi.fn();
  client.entities = new EntityManager(client);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function cachedScreen(): Screen {
  return client.entities.resolve(Screen, ["projectId", "screenId"], {
    projectId: "p-1",
    screenId: "s-1",
    htmlCode: { downloadUrl: "https://files.example/s-1.html" },
    screenshot: { downloadUrl: "https://files.example/s-1.png" },
  });
}

describe("Screen content methods (0.4.0 bridge: readHtml/readImage fetch content; getHtml/getImage return URLs)", () => {
  it("getHtml returns the signed URL for 0.x backward compatibility", async () => {
    const url = await cachedScreen().getHtml();
    expect(url).toBe("https://files.example/s-1.html");
  });

  it("getImage returns the signed URL for 0.x backward compatibility", async () => {
    const url = await cachedScreen().getImage();
    expect(url).toBe("https://files.example/s-1.png");
  });

  it("readHtml fetches and returns the HTML CONTENT, not the URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html>real content</html>"),
      }),
    );

    const html = await cachedScreen().readHtml();
    expect(html).toBe("<html>real content</html>");
    expect(client.callTool).not.toHaveBeenCalled(); // URL from cache
    expect(fetch).toHaveBeenCalledWith("https://files.example/s-1.html");
  });

  it("readImage returns the screenshot bytes", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(bytes.buffer),
      }),
    );

    const png = await cachedScreen().readImage();
    expect(png).toBeInstanceOf(Uint8Array);
    expect([...png]).toEqual([137, 80, 78, 71]);
  });

  it("expired signed URL (403) throws NETWORK_ERROR with refetch hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );

    const err = await cachedScreen()
      .readHtml()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StitchError);
    expect((err as StitchError).code).toBe("NETWORK_ERROR");
    expect((err as StitchError).message).toContain("signed URLs expire");
  });

  it("404 artifact throws NOT_FOUND", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    const err = await cachedScreen()
      .readImage()
      .catch((e: unknown) => e);
    expect((err as StitchError).code).toBe("NOT_FOUND");
  });

  it("EntityManager resolves the EXT class even when given the generated base (registry)", () => {
    const viaBase = client.entities.resolve(
      GeneratedScreen,
      ["projectId", "screenId"],
      { projectId: "p-1", screenId: "s-base" },
    );
    expect(viaBase).toBeInstanceOf(Screen); // upgraded
    expect(typeof (viaBase as Screen).getHtml).toBe("function");
  });
});

describe("URL accessor cache write-back [V1_PLAN §3.2 writeBack]", () => {
  it("second getHtmlUrl call hits the written-back cache (one API call total)", async () => {
    const bare: Screen = client.entities.resolve(
      Screen,
      ["projectId", "screenId"],
      { projectId: "p-1", screenId: "s-2" },
    );
    (client.callTool as Mock).mockResolvedValue({
      htmlCode: { downloadUrl: "https://files.example/s-2.html" },
    });

    const url1 = await bare.getHtmlUrl();
    const url2 = await bare.getHtmlUrl();

    expect(url1).toBe("https://files.example/s-2.html");
    expect(url2).toBe(url1);
    expect(client.callTool).toHaveBeenCalledTimes(1);
  });
});
