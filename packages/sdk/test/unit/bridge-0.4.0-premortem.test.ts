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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  stitch,
  resetStitchSingleton,
  StitchToolClient,
  Stitch,
  DesignSystem,
  StitchError,
} from "../../src/index.js";
import { getOrCreateClient } from "../../src/singleton.js";
import { toolMap } from "../../src/tools.js";

describe("0.4.0 Premortem Tigers & Reconciled PRs (#363, #368)", () => {
  beforeEach(() => {
    resetStitchSingleton();
  });

  afterEach(() => {
    resetStitchSingleton();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("Tiger 1: publishConfig.tag is 'latest'", () => {
    it("declares publishConfig.tag === 'latest' in packages/sdk/package.json (or non-latest for prerelease)", () => {
      const pkgPath = resolve(import.meta.dirname, "../../package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const isPrerelease = String(pkg.version).includes("-");
      if (isPrerelease) {
        expect(pkg.publishConfig?.tag).not.toBe("latest");
      } else {
        expect(pkg.publishConfig?.tag).toBe("latest");
      }
    });
  });

  describe("Tiger 2: stitch.close() lifecycle safety", () => {
    it("await stitch.close() before first use is a safe no-op without credentials", async () => {
      vi.stubEnv("STITCH_API_KEY", "");
      vi.stubEnv("STITCH_ACCESS_TOKEN", "");

      await expect(stitch.close()).resolves.toBeUndefined();
    });

    it("await stitch.close() resets the singleton so subsequent calls create a fresh client", async () => {
      vi.stubEnv("STITCH_API_KEY", "test-key-1");

      const firstClient = getOrCreateClient();
      expect(firstClient.closed).toBe(false);

      await stitch.close();
      expect(firstClient.closed).toBe(true);

      const secondClient = getOrCreateClient();
      expect(secondClient).not.toBe(firstClient);
      expect(secondClient.closed).toBe(false);
    });

    it("getOrCreateClient() replaces a cached client that was closed directly", async () => {
      vi.stubEnv("STITCH_API_KEY", "test-key-1");

      const firstClient = getOrCreateClient();
      await firstClient.close();
      expect(firstClient.closed).toBe(true);

      const secondClient = getOrCreateClient();
      expect(secondClient).not.toBe(firstClient);
      expect(secondClient.closed).toBe(false);
    });
  });

  describe("Tiger 3: Legacy 0.3.5 modelId union compatibility", () => {
    it("preserves GEMINI_3_PRO, GEMINI_3_FLASH, and GEMINI_3_1_PRO in toolMap", () => {
      const genEnum = (
        toolMap.get("generate_screen_from_text")?.inputSchema.properties
          .modelId as any
      ).enum;
      const editEnum = (
        toolMap.get("edit_screens")?.inputSchema.properties.modelId as any
      ).enum;

      for (const legacyId of [
        "GEMINI_3_PRO",
        "GEMINI_3_FLASH",
        "GEMINI_3_1_PRO",
      ]) {
        expect(genEnum).toContain(legacyId);
        expect(editEnum).toContain(legacyId);
      }
    });

    it("accepts legacy 0.3.5 modelId values on project.generate and screen.edit", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      const callToolSpy = vi
        .spyOn(client, "callTool")
        .mockResolvedValue({
          outputComponents: [
            {
              design: {
                screens: [{ name: "projects/p1/screens/s1", title: "Home" }],
              },
            },
          ],
        } as any);

      const sdk = new Stitch(client);
      const project = sdk.project("p1");

      const gen = await project.generate(
        "Dashboard",
        "DESKTOP",
        "GEMINI_3_PRO",
      );
      expect(gen.id).toBe("s1");
      expect(callToolSpy).toHaveBeenCalledWith(
        "generate_screen_from_text",
        expect.objectContaining({
          modelId: "GEMINI_3_PRO",
        }),
      );

      const edited = await gen.screens[0].edit("Make dark", {
        modelId: "GEMINI_3_FLASH",
      });
      expect(edited.id).toBe("s1");
      expect(callToolSpy).toHaveBeenCalledWith(
        "edit_screens",
        expect.objectContaining({
          modelId: "GEMINI_3_FLASH",
        }),
      );
    });
  });

  describe("Tiger 4: JSON.stringify() and object spread on entities and Generation", () => {
    it("serializes Project, Screen, DesignSystem, and Generation without cyclic TypeError", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      vi.spyOn(client, "callTool").mockResolvedValue({
        outputComponents: [
          {
            design: {
              screens: [{ name: "projects/p1/screens/s1", title: "Home" }],
            },
          },
        ],
      } as any);

      const sdk = new Stitch(client);
      const project = sdk.project("p1");
      const screen = project.screen("s1");
      const ds = new DesignSystem(client, "assets/ds1");
      const generation = await project.generate("Home");

      expect(() => JSON.stringify(project)).not.toThrow();
      expect(() => JSON.stringify(screen)).not.toThrow();
      expect(() => JSON.stringify(ds)).not.toThrow();
      expect(() => JSON.stringify(generation)).not.toThrow();

      expect(Object.keys(screen)).not.toContain("client");
      expect(Object.keys({ ...screen })).not.toContain("client");

      client.entities.dispose(generation);
    });
  });

  describe("PR #363: Reconnect on transient network error during callTool", () => {
    it("reconnects and retries idempotent reads (list_*) after a transient fetch failure", async () => {
      vi.useFakeTimers();
      try {
        const client = new StitchToolClient({ apiKey: "k" });
        client["isConnected"] = true;

        const connectSpy = vi
          .spyOn(client, "connect")
          .mockImplementation(async () => {
            client["isConnected"] = true;
          });

        client["client"].callTool = vi
          .fn()
          .mockRejectedValueOnce(new TypeError("fetch failed"))
          .mockResolvedValueOnce({
            isError: false,
            content: [],
            structuredContent: { projects: [{ name: "projects/p1" }] },
          });

        const promise = client.callTool("list_projects", {});
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ projects: [{ name: "projects/p1" }] });
      } finally {
        vi.useRealTimers();
      }
    });

    it("normalizes transient socket errors to StitchError(NETWORK_ERROR) and resets isConnected without retrying generative tools", async () => {
      const client = new StitchToolClient({ apiKey: "k" });
      client["isConnected"] = true;
      client["client"].callTool = vi
        .fn()
        .mockRejectedValueOnce(new Error("socket hang up (ECONNRESET)"));

      const err = await client
        .callTool("generate_screen_from_text", { prompt: "hi" })
        .catch((e) => e);

      expect(err).toBeInstanceOf(StitchError);
      expect(err.code).toBe("NETWORK_ERROR");
      expect(client["isConnected"]).toBe(false);
    });
  });
});
