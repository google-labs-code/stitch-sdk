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

import { z } from "zod";
import type { Screen } from "../../generated/src/screen.js";

// ── Supported MIME types ───────────────────────────────────────────────────────

/**
 * File extensions supported by BatchCreateScreens and their MIME types.
 * The check is done in the handler (not as a Zod refinement) so failures
 * produce a typed UploadImageErrorCode instead of a generic ZodError.
 */
export const SUPPORTED_MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".html": "text/html",
  ".htm": "text/html",
} as const;

export type SupportedExtension = keyof typeof SUPPORTED_MIME_TYPES;

// ── Input ──────────────────────────────────────────────────────────────────────

export const UploadInputSchema = z.object({
  /** Absolute or relative path to the asset file on disk. */
  filePath: z.string().min(1),
  /** Optional display title for the created screen. */
  title: z.string().optional(),
  /** If true (default), creates screen instances on the project canvas. */
  createScreenInstances: z.boolean().default(true),
});

export type UploadInput = z.infer<typeof UploadInputSchema>;

// ── Error Codes ────────────────────────────────────────────────────────────────

export const UploadErrorCode = z.enum([
  "FILE_NOT_FOUND",
  "UNSUPPORTED_FORMAT",
  "UPLOAD_FAILED",
  "AUTH_FAILED",
  "UNKNOWN_ERROR",
]);

export type UploadErrorCode = z.infer<typeof UploadErrorCode>;

// ── Result ─────────────────────────────────────────────────────────────────────

export type UploadResult =
  | { success: true; screens: Screen[] }
  | {
      success: false;
      error: {
        code: UploadErrorCode;
        message: string;
        recoverable: boolean;
      };
    };

// ── Interface ──────────────────────────────────────────────────────────────────

/**
 * Contract for the upload operation.
 * Implementations must never throw — all failures return UploadResult.
 */
export interface UploadSpec {
  execute(projectId: string, input: UploadInput): Promise<UploadResult>;
}
