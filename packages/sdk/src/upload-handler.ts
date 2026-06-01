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
 * WHY THIS HANDLER EXISTS:
 *   BatchCreateScreens is a private REST endpoint — it has no MCP tool entry
 *   in tools-manifest.json. It cannot go through StitchToolClient.callTool().
 *
 *   This handler uses StitchToolClient.httpPost() to POST directly to the REST
 *   API. The SDK runs as Node.js server-side code, so it can read files from
 *   disk and send arbitrarily large base64-encoded payloads — unlike agent-
 *   driven MCP calls, which are constrained by output token limits (~16K).
 *
 * AUTHENTICATION:
 *   API keys (X-Goog-Api-Key) ARE accepted by BatchCreateScreens. Both API key
 *   and OAuth Bearer token authentication work.
 *
 * DEBUGGING TRAPS (do not repeat):
 *   1. A 401 CREDENTIALS_MISSING means the key was EMPTY, not that the mechanism
 *      is unsupported. Always verify: echo $STITCH_API_KEY (source .env first).
 *   2. A 403 PERMISSION_DENIED means the key is valid but doesn't own the project.
 *      The user tests across two accounts — check key/project ownership pairing.
 *   3. Neither error means "API keys are unsupported." Do NOT add OAuth-only
 *      documentation based on these errors.
 */

import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { StitchToolClientSpec } from "./spec/client.js";
import {
  SUPPORTED_MIME_TYPES,
  type SupportedExtension,
  type UploadInput,
  type UploadResult,
  type UploadErrorCode,
  type UploadSpec,
} from "./spec/upload.js";
import { Screen } from "../generated/src/screen.js";

/** Build the BatchCreateScreens JSON body. */
function buildBatchCreateScreensBody(
  projectId: string,
  fileContentBase64: string,
  mimeType: string,
  input: UploadInput,
) {
  const fileObj = {
    fileContentBase64,
    mimeType,
  };

  const isHtml = mimeType === "text/html";
  const screen: Record<string, unknown> = {
    screenType: isHtml ? "DOCUMENT" : "IMAGE",
    isCreatedByClient: true,
  };

  if (isHtml) {
    screen["htmlCode"] = fileObj;
  } else {
    screen["screenshot"] = fileObj;
  }

  if (input.title) {
    screen["title"] = input.title;
  }

  return {
    parent: `projects/${projectId}`,
    requests: [{ screen }],
    createScreenInstances: input.createScreenInstances ?? true,
  };
}

/**
 * Handler for the upload capability — implements UploadSpec.
 * Never throws. All failures return an UploadResult value with a classified error code.
 */
export class UploadHandler implements UploadSpec {
  constructor(private readonly client: StitchToolClientSpec) {}

  async execute(projectId: string, input: UploadInput): Promise<UploadResult> {
    // ── Step 1: Validate extension ───────────────────────────────────────────
    const ext = path.extname(input.filePath).toLowerCase();
    const mimeType = SUPPORTED_MIME_TYPES[ext as SupportedExtension];
    if (!mimeType) {
      const supported = Object.keys(SUPPORTED_MIME_TYPES).join(", ");
      return {
        success: false,
        error: {
          code: "UNSUPPORTED_FORMAT",
          message: `Unsupported file extension "${ext}". Supported: ${supported}`,
          recoverable: false,
        },
      };
    }

    // ── Step 2: Read, encode, POST ───────────────────────────────────────────
    try {
      const fileContentBase64 = await fs.readFile(input.filePath, {
        encoding: "base64",
      });
      const body = buildBatchCreateScreensBody(
        projectId,
        fileContentBase64,
        mimeType,
        input,
      );

      const raw = await this.client.httpPost<any>(
        `projects/${projectId}/screens:batchCreate`,
        body,
      );

      // ── Step 3: Project the response into Screen[] ─────────────────────────
      const results: Array<{ screen: any }> = raw?.results ?? [];
      const screens: Screen[] = results.map((r) => {
        const screenData = { ...r.screen, projectId };
        if (!screenData.id && screenData.screenshot?.name) {
          const parts = screenData.screenshot.name.split("/files/");
          if (parts.length === 2) {
            screenData.id = parts[1];
          }
        }
        return new Screen(this.client as any, screenData);
      });

      return { success: true, screens };
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code === "ENOENT"
      ) {
        return {
          success: false,
          error: {
            code: "FILE_NOT_FOUND",
            message: `File not found: ${input.filePath}`,
            recoverable: false,
          },
        };
      }
      const msg = err instanceof Error ? err.message : String(err);
      const code: UploadErrorCode =
        msg.includes("401") ||
        msg.includes("403") ||
        msg.toLowerCase().includes("auth")
          ? "AUTH_FAILED"
          : "UPLOAD_FAILED";

      return {
        success: false,
        error: { code, message: msg, recoverable: false },
      };
    }
  }
}
