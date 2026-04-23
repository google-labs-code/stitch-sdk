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

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { StitchToolClientSpec } from './spec/client.js';
import { slugify } from './slugify.js';
import { DownloadAssetsInputSchema } from './spec/download.js';
import type { DownloadAssetsSpec, DownloadAssetsInput, DownloadAssetsResult, DownloadedScreenTrace } from './spec/download.js';

/** Atomically rename src → dest, falling back to copy+delete on EXDEV. */
async function atomicRename(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch (err: any) {
    if (err?.code === 'EXDEV') {
      // Cross-device: tempDir and outputDir are on different filesystems.
      await fs.copyFile(src, dest);
      await fs.unlink(src);
    } else {
      throw err;
    }
  }
}

const CONCURRENCY_LIMIT = 5;

/** Run async task factories with a bounded concurrency limit. */
async function runWithConcurrency(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const p = task().finally(() => executing.delete(p));
    executing.add(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

export class DownloadAssetsHandler implements DownloadAssetsSpec {
  constructor(private client: StitchToolClientSpec) {}

  async execute(rawInput: DownloadAssetsInput): Promise<DownloadAssetsResult> {
    try {
      const input = DownloadAssetsInputSchema.parse(rawInput);
      const {
        projectId,
        outputDir,
        fileMode,
        tempDir,
        assetsSubdir,
      } = input;
      const resolvedTempDir = tempDir ?? outputDir;
      // Guard assetsSubdir: strip any path separators — only use the basename.
      const safeSubdir = path.basename(assetsSubdir) || 'assets';

      // 1. List screens
      const response = await this.client.callTool('list_screens', { projectId });
      const screens = (response as any).screens || [];

      const downloadedScreens: DownloadedScreenTrace[] = [];
      const warnings: string[] = [];
      const seenSlugs = new Set<string>();

      for (const screen of screens) {
        const screenId = screen.id || screen.name.split('/').pop();
        const screenSlug = slugify(screen.title, screenId, seenSlugs);
        
        const screenDir = path.join(outputDir, screenSlug);
        const screenAssetsDir = path.join(screenDir, safeSubdir);

        let htmlUrl = screen.htmlCode?.downloadUrl;
        if (!htmlUrl) {
          try {
            const raw = await this.client.callTool('get_screen', {
              projectId,
              screenId: screenId,
              name: `projects/${projectId}/screens/${screenId}`,
            });
            htmlUrl = (raw as any)?.htmlCode?.downloadUrl;
          } catch (error) {
            // Skip if we can't get full screen details
            continue;
          }
        }
        if (!htmlUrl) continue;

        await fs.mkdir(screenAssetsDir, { recursive: true });

        const html = await fetch(htmlUrl).then((r) => r.text());
        const $ = cheerio.load(html);

        const assetTasks: (() => Promise<void>)[] = [];

        $('img').each((_, el) => {
          const src = $(el).attr('src');
          if (src && src.startsWith('http')) {
            assetTasks.push(() => this._downloadAndRewrite($, el, 'src', src, screenAssetsDir, safeSubdir, resolvedTempDir, fileMode));
          }
        });

        $('link[rel="stylesheet"]').each((_, el) => {
          const href = $(el).attr('href');
          if (href && href.startsWith('http')) {
            assetTasks.push(() => this._downloadAndRewrite($, el, 'href', href, screenAssetsDir, safeSubdir, resolvedTempDir, fileMode));
          }
        });

        await runWithConcurrency(assetTasks, CONCURRENCY_LIMIT);

        const screenshotUrl = screen.screenshot?.downloadUrl;
        if (screenshotUrl) {
          try {
            const screenshotRes = await fetch(screenshotUrl);
            const screenshotBuffer = await screenshotRes.arrayBuffer();
            const screenshotPath = path.join(screenDir, 'screen.png');
            const tempScreenshotFilename = `.tmp-screen-${crypto.randomBytes(8).toString('hex')}`;
            const tempScreenshotPath = path.join(resolvedTempDir, tempScreenshotFilename);
            
            await fs.writeFile(tempScreenshotPath, Buffer.from(screenshotBuffer), { flag: 'wx', mode: fileMode });
            await atomicRename(tempScreenshotPath, screenshotPath);
          } catch (error) {
            warnings.push(`Screenshot download failed for ${screenId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        const rewrittenHtml = $.html();
        const filename = `code.html`;
        const tempFilename = `.tmp-${crypto.randomBytes(8).toString('hex')}`;
        const tempPath = path.join(resolvedTempDir, tempFilename);
        const targetPath = path.join(screenDir, filename);

        await fs.writeFile(tempPath, rewrittenHtml, { flag: 'wx', mode: fileMode });
        await atomicRename(tempPath, targetPath);

        downloadedScreens.push({
          screenId,
          screenSlug,
          filePath: path.join(screenSlug, filename),
        });
      }

      // 2. Export Design System
      try {
        const dsResponse = await this.client.callTool('list_design_systems', { projectId });
        const designSystems = (dsResponse as any).designSystems || [];
        
        const ds = designSystems[0];
        if (ds && ds.designSystem?.theme?.designMd) {
          const dsName = ds.designSystem.displayName 
            ? ds.designSystem.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
            : ds.name.split('/').pop();
          
          const dsDir = path.join(outputDir, dsName);
          await fs.mkdir(dsDir, { recursive: true });
          
          const dsPath = path.join(dsDir, 'DESIGN.md');
          const tempDsFilename = `.tmp-ds-${crypto.randomBytes(8).toString('hex')}`;
          const tempDsPath = path.join(resolvedTempDir, tempDsFilename);
          
          await fs.writeFile(tempDsPath, ds.designSystem.theme.designMd, { flag: 'wx', mode: fileMode });
          await atomicRename(tempDsPath, dsPath);
        }
      } catch (error) {
        warnings.push(`Design system export failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      return { success: true, downloadedScreens, warnings: warnings.length > 0 ? warnings : undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
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
    const buffer = await res.arrayBuffer();

    const urlObj = new URL(url);
    const decodedPath = decodeURIComponent(urlObj.pathname);
    const rawFilename = path.basename(decodedPath);
    const ext = path.extname(rawFilename);
    const hash = crypto.createHash('md5').update(url).digest('hex');

    // SANITIZATION: Only allow alphanumeric, hyphen, underscore
    const sanitizedBase = sanitizeFilename(rawFilename, ext);

    const filename = sanitizedBase ? `${sanitizedBase}-${hash}${ext}` : `${hash}${ext}`;
    const fullPath = path.join(assetsDir, filename);
    const tempFilename = `.tmp-${crypto.randomBytes(8).toString('hex')}`;
    const tempFullPath = path.join(resolvedTempDir, tempFilename);

    await fs.writeFile(tempFullPath, Buffer.from(buffer), { flag: 'wx', mode: fileMode });
    await atomicRename(tempFullPath, fullPath);

    $(el).attr(attr, `${relativePrefix}/${filename}`);
  }
}

export function sanitizeFilename(rawFilename: string, ext: string): string {
  const base = path.basename(rawFilename, ext).slice(0, 100);
  const allowedChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  return base
    .split('')
    .filter((c) => allowedChars.includes(c))
    .join('');
}
