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

import { z } from 'zod';
import type { StitchToolClientSpec } from './client.js';

// ── Input ──────────────────────────────────────────────────────────────────────

export const DownloadAssetsInputSchema = z.object({
  /** The ID of the project to download assets for. */
  projectId: z.string().min(1),
  /** Absolute path to the directory where screens and assets should be saved. */
  outputDir: z.string().min(1),
  /**
   * Unix file-permission bits for all written files (HTML and assets).
   * Defaults to 0o600 (owner read/write only).
   * A CLI serving files via a web server (e.g. nginx) may need 0o644.
   */
  fileMode: z.number().int().optional().default(0o600),
  /**
   * Directory used for atomic temp files before rename.
   * Defaults to outputDir. Override to use a RAM disk or OS temp dir.
   *
   * IMPORTANT: tempDir MUST be on the same filesystem as outputDir for
   * fs.rename() to be atomic. Cross-device renames (EXDEV) will fall back
   * to a copy-then-delete strategy automatically.
   */
  tempDir: z.string().optional(),
  /**
   * Name of the subdirectory inside outputDir where downloaded assets are saved.
   * Defaults to 'assets'. Override to e.g. 'static' or 'public'.
   * Path separators are stripped — only the basename is used.
   */
  assetsSubdir: z.string().default('assets'),
});

/** Type passed by callers — fields with defaults (fileMode, assetsSubdir) are optional. */
export type DownloadAssetsInput = z.input<typeof DownloadAssetsInputSchema>;

/** Fully-resolved input after schema.parse() — all fields present. */
export type DownloadAssetsInputParsed = z.infer<typeof DownloadAssetsInputSchema>;


// ── Error Codes ────────────────────────────────────────────────────────────────

export const DownloadAssetsErrorCode = z.enum([
  'PROJECT_NOT_FOUND',
  'FETCH_FAILED',
  'WRITE_FAILED',
  'PATH_TRAVERSAL_ATTEMPT',
  'UNKNOWN_ERROR',
]);

export type DownloadAssetsErrorCode = z.infer<typeof DownloadAssetsErrorCode>;

// ── Result ─────────────────────────────────────────────────────────────────────

export interface DownloadedScreenTrace {
  screenId: string;
  screenSlug: string;
  filePath: string;
}

export type DownloadAssetsResult =
  | { success: true; downloadedScreens: DownloadedScreenTrace[]; warnings?: string[] }
  | {
      success: false;
      error: {
        code: DownloadAssetsErrorCode;
        message: string;
        recoverable: boolean;
      };
    };

// ── Interface ──────────────────────────────────────────────────────────────────

/**
 * Contract for the downloadAssets operation.
 * Implementations must never throw — all failures return DownloadAssetsResult.
 */
export interface DownloadAssetsSpec {
  execute(input: DownloadAssetsInput): Promise<DownloadAssetsResult>;
}

// ── Public Output ─────────────────────────────────────────────────────────────

/** Return type for Project.downloadAssets(). */
export interface DownloadAssetsOutput {
  screens: DownloadedScreenTrace[];
  warnings: string[];
}
