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

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { StitchToolClientSpec } from "./spec/client.js";
import { slugify } from "./slugify.js";
import { classifyError } from "./spec/error-mapping.js";
import { DownloadAssetsInputSchema } from "./spec/download.js";
import type {
  DownloadAssetsSpec,
  DownloadAssetsInput,
  DownloadAssetsResult,
  DownloadAssetsErrorCode,
  DownloadedScreenTrace,
} from "./spec/download.js";

/**
 * Containment guard — the SECURITY BOUNDARY for downloads.
 *
 * `screenId`, screen `title`, and design-system names are all
 * server-controlled. slugify() makes nice filenames but is NOT a
 * security control (its fallback returns the raw screenId), so the
 * handler must verify every target directory resolves to outputDir or
 * a descendant before writing. Returns true iff `child` is contained.
 */
function isWithinOutput(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  // Contained iff the relative path is "" (same dir) or stays below it.
  // Reject only a true escape ("..", "../…", or an absolute path) — a dir
  // merely *named* "..foo" is fine.
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
  );
}

/** Atomically rename src → dest, falling back to copy+delete on EXDEV. */
async function atomicRename(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch (err: any) {
    if (err?.code === "EXDEV") {
      // Cross-device: tempDir and outputDir are on different filesystems.
      await fs.copyFile(src, dest);
      await fs.unlink(src);
    } else {
      throw err;
    }
  }
}

const CONCURRENCY_LIMIT = 5;

/**
 * Run async task factories through a bounded worker pool.
 *
 * Every rejection is COLLECTED, never lost and never allowed to abort
 * sibling tasks: the previous Promise.race-based pool either swallowed
 * rejections (settled during another race) or aborted the whole batch,
 * nondeterministically depending on timing.
 */
export async function runWithConcurrency(
  tasks: (() => Promise<void>)[],
  limit: number,
): Promise<{ failed: { index: number; error: unknown }[] }> {
  const failed: { index: number; error: unknown }[] = [];
  let next = 0;

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, tasks.length)) },
    async () => {
      while (next < tasks.length) {
        const index = next++;
        try {
          await tasks[index]();
        } catch (error) {
          failed.push({ index, error });
        }
      }
    },
  );

  await Promise.all(workers);
  return { failed };
}

/**
 * Write to a temp path and atomically rename into place.
 * The temp file is unlinked on ANY failure — no `.tmp-*` strays left
 * in the user's output directory.
 */
async function writeAtomic(
  tempPath: string,
  targetPath: string,
  data: string | Buffer,
  opts: { flag: string; mode: number },
): Promise<void> {
  try {
    await fs.writeFile(tempPath, data, opts);
    await atomicRename(tempPath, targetPath);
  } catch (err) {
    await fs.unlink(tempPath).catch(() => {});
    throw err;
  }
}

export class DownloadAssetsHandler implements DownloadAssetsSpec {
  constructor(private client: StitchToolClientSpec) {}

  async execute(rawInput: DownloadAssetsInput): Promise<DownloadAssetsResult> {
    try {
      const input = DownloadAssetsInputSchema.parse(rawInput);
      const { projectId, outputDir, fileMode, tempDir, assetsSubdir } = input;
      const resolvedTempDir = tempDir ?? outputDir;
      // Guard assetsSubdir: strip any path separators — only use the basename.
      const safeSubdir = path.basename(assetsSubdir) || "assets";

      // 1. List screens
      const response = await this.client.callTool("list_screens", {
        projectId,
      });
      const screens = (response as any).screens || [];

      const downloadedScreens: DownloadedScreenTrace[] = [];
      const warnings: string[] = [];
      const seenSlugs = new Set<string>();

      for (const screen of screens) {
        // A malformed row (neither id nor name) must skip+warn, not throw —
        // one bad screen shouldn't abort the whole batch (the spec promises
        // partial-failure resilience).
        const screenId =
          screen.id ||
          (typeof screen.name === "string"
            ? screen.name.split("/").pop()
            : undefined);
        if (!screenId) {
          warnings.push("Skipped a screen with no id or name");
          continue;
        }
        const screenSlug = slugify(screen.title, screenId, seenSlugs);

        const screenDir = path.join(outputDir, screenSlug);
        const screenAssetsDir = path.join(screenDir, safeSubdir);

        // SECURITY: a server-controlled screenId/title (e.g. "../../etc")
        // must never escape outputDir. Fatal, not a per-screen skip — a
        // traversal attempt signals a compromised or buggy upstream, and
        // the proxy exposes download_assets to any downstream caller.
        if (!isWithinOutput(outputDir, screenDir)) {
          return {
            success: false,
            error: {
              code: "PATH_TRAVERSAL_ATTEMPT",
              message: `Refusing to write screen "${screenId}" outside the output directory (resolved to "${screenDir}")`,
              recoverable: false,
            },
          };
        }

        let htmlUrl = screen.htmlCode?.downloadUrl;
        if (!htmlUrl) {
          try {
            const raw = await this.client.callTool("get_screen", {
              projectId,
              screenId: screenId,
              name: `projects/${projectId}/screens/${screenId}`,
            });
            htmlUrl = (raw as any)?.htmlCode?.downloadUrl;
          } catch (error) {
            warnings.push(
              `Skipped ${screenId}: get_screen failed (${error instanceof Error ? error.message : String(error)})`,
            );
            continue;
          }
        }
        if (!htmlUrl) {
          // Warn rather than silently dropping — otherwise an all-unreachable
          // project is indistinguishable from an empty one.
          warnings.push(`Skipped ${screenId}: no HTML download URL available`);
          continue;
        }

        await fs.mkdir(screenAssetsDir, { recursive: true });

        // A non-OK response (e.g. expired signed URL → 403 body) must not
        // be saved as code.html and counted as a downloaded screen.
        const htmlRes = await fetch(htmlUrl);
        if (!htmlRes.ok) {
          warnings.push(
            `HTML fetch failed for ${screenId}: HTTP ${htmlRes.status}`,
          );
          continue;
        }
        const html = await htmlRes.text();
        const $ = cheerio.load(html);

        const assetTasks: (() => Promise<void>)[] = [];

        $("img").each((_, el) => {
          const src = $(el).attr("src");
          if (src && src.startsWith("https://")) {
            assetTasks.push(() =>
              this._downloadAndRewrite(
                $,
                el,
                "src",
                src,
                screenAssetsDir,
                safeSubdir,
                resolvedTempDir,
                fileMode,
              ),
            );
          }
        });

        $('link[rel="stylesheet"]').each((_, el) => {
          const href = $(el).attr("href");
          if (href && href.startsWith("https://")) {
            assetTasks.push(() =>
              this._downloadAndRewrite(
                $,
                el,
                "href",
                href,
                screenAssetsDir,
                safeSubdir,
                resolvedTempDir,
                fileMode,
              ),
            );
          }
        });

        // Asset failures are reported per-asset, not silently swallowed:
        // the un-rewritten URL still points at the remote original, so the
        // HTML stays functional and the user is told what's missing.
        const { failed } = await runWithConcurrency(
          assetTasks,
          CONCURRENCY_LIMIT,
        );
        for (const f of failed) {
          warnings.push(
            `Asset download failed for ${screenId}: ${
              f.error instanceof Error ? f.error.message : String(f.error)
            }`,
          );
        }

        const screenshotUrl = screen.screenshot?.downloadUrl;
        if (screenshotUrl) {
          try {
            const screenshotRes = await fetch(screenshotUrl);
            if (!screenshotRes.ok)
              throw new Error(
                `Screenshot fetch failed: ${screenshotRes.status}`,
              );
            const screenshotBuffer = await screenshotRes.arrayBuffer();
            const screenshotPath = path.join(screenDir, "screen.png");
            const tempScreenshotFilename = `.tmp-screen-${crypto.randomBytes(8).toString("hex")}`;
            const tempScreenshotPath = path.join(
              resolvedTempDir,
              tempScreenshotFilename,
            );

            await writeAtomic(
              tempScreenshotPath,
              screenshotPath,
              Buffer.from(screenshotBuffer),
              { flag: "wx", mode: fileMode },
            );
          } catch (error) {
            warnings.push(
              `Screenshot download failed for ${screenId}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        const rewrittenHtml = $.html();
        const filename = `code.html`;
        const tempFilename = `.tmp-${crypto.randomBytes(8).toString("hex")}`;
        const tempPath = path.join(resolvedTempDir, tempFilename);
        const targetPath = path.join(screenDir, filename);

        await writeAtomic(tempPath, targetPath, rewrittenHtml, {
          flag: "wx",
          mode: fileMode,
        });

        downloadedScreens.push({
          screenId,
          screenSlug,
          filePath: path.join(screenSlug, filename),
        });
      }

      // 2. Export Design System
      try {
        const dsResponse = await this.client.callTool("list_design_systems", {
          projectId,
        });
        const designSystems = (dsResponse as any).designSystems || [];

        const ds = designSystems[0];
        if (ds && ds.designSystem?.theme?.designMd) {
          const dsName = ds.designSystem.displayName
            ? ds.designSystem.displayName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "")
            : ds.name.split("/").pop();

          const dsDir = path.join(outputDir, dsName);
          // Same boundary as screens: displayName/ds.name are server data.
          if (!isWithinOutput(outputDir, dsDir)) {
            return {
              success: false,
              error: {
                code: "PATH_TRAVERSAL_ATTEMPT",
                message: `Refusing to write design system "${dsName}" outside the output directory`,
                recoverable: false,
              },
            };
          }
          await fs.mkdir(dsDir, { recursive: true });

          const dsPath = path.join(dsDir, "DESIGN.md");
          const tempDsFilename = `.tmp-ds-${crypto.randomBytes(8).toString("hex")}`;
          const tempDsPath = path.join(resolvedTempDir, tempDsFilename);

          await writeAtomic(
            tempDsPath,
            dsPath,
            ds.designSystem.theme.designMd,
            {
              flag: "wx",
              mode: fileMode,
            },
          );
        }
      } catch (error) {
        warnings.push(
          `Design system export failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      return {
        success: true,
        downloadedScreens,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const lowerMsg = msg.toLowerCase();
      const fsCode = (error as any)?.code;

      let code: DownloadAssetsErrorCode = "UNKNOWN_ERROR";
      if (
        fsCode === "EACCES" ||
        fsCode === "ENOSPC" ||
        fsCode === "EROFS" ||
        fsCode === "EPERM" ||
        fsCode === "EEXIST"
      ) {
        code = "WRITE_FAILED";
      } else if (lowerMsg.includes("fetch") || lowerMsg.includes("network")) {
        // Local transport check stays ahead of the general mapper: a failed
        // asset/HTML fetch is FETCH_FAILED even when its message embeds a
        // status ("Asset fetch failed: 404 for ...").
        code = "FETCH_FAILED";
      } else if (classifyError({ text: msg }) === "NOT_FOUND") {
        code = "PROJECT_NOT_FOUND";
      }

      return {
        success: false,
        error: {
          code,
          message: msg,
          recoverable: code === "FETCH_FAILED",
        },
      };
    }
  }

  private async _downloadAndRewrite(
    $: cheerio.CheerioAPI,
    el: AnyNode,
    attr: string,
    url: string,
    assetsDir: string,
    relativePrefix: string,
    resolvedTempDir: string,
    fileMode: number,
  ): Promise<void> {
    const res = await fetch(url);
    if (!res.ok)
      throw new Error(`Asset fetch failed: ${res.status} for ${url}`);
    const buffer = await res.arrayBuffer();

    const urlObj = new URL(url);
    const decodedPath = decodeURIComponent(urlObj.pathname);
    const rawFilename = path.basename(decodedPath);
    // The extension goes through the same character allowlist as the base:
    // URL-decoded extensions previously landed in filenames verbatim.
    const rawExt = path.extname(rawFilename);
    const ext = rawExt
      ? `.${sanitizeFilename(rawExt.slice(1), "").slice(0, 10)}`
      : "";
    const hash = crypto.createHash("md5").update(url).digest("hex");

    // SANITIZATION: Only allow alphanumeric, hyphen, underscore
    const sanitizedBase = sanitizeFilename(rawFilename, rawExt);

    const filename = sanitizedBase
      ? `${sanitizedBase}-${hash}${ext}`
      : `${hash}${ext}`;
    const fullPath = path.join(assetsDir, filename);
    const tempFilename = `.tmp-${crypto.randomBytes(8).toString("hex")}`;
    const tempFullPath = path.join(resolvedTempDir, tempFilename);

    await writeAtomic(tempFullPath, fullPath, Buffer.from(buffer), {
      flag: "wx",
      mode: fileMode,
    });

    $(el).attr(attr, `${relativePrefix}/${filename}`);
  }
}

export function sanitizeFilename(rawFilename: string, ext: string): string {
  const base = path.basename(rawFilename, ext).slice(0, 100);
  const allowedChars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
  return base
    .split("")
    .filter((c) => allowedChars.includes(c))
    .join("");
}
