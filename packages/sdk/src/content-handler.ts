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

import {
  FetchArtifactInputSchema,
  type FetchArtifactInput,
  type FetchArtifactResult,
  type ScreenContentHandlerSpec,
} from "./spec/content.js";

export class ScreenContentHandler implements ScreenContentHandlerSpec {
  async fetchArtifact(
    input: FetchArtifactInput,
  ): Promise<FetchArtifactResult<Response>> {
    const parsed = FetchArtifactInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid fetch input: ${parsed.error.message}`,
          recoverable: false,
        },
      };
    }
    const { url, label } = parsed.data;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: `Failed to fetch ${label}: ${err instanceof Error ? err.message : String(err)}`,
          recoverable: true,
        },
      };
    }

    if (!res.ok) {
      return {
        success: false,
        error: {
          code: res.status === 404 ? "NOT_FOUND" : "NETWORK_ERROR",
          message: `Failed to fetch ${label}: HTTP ${res.status} (signed URLs expire; re-fetch the screen for a fresh URL)`,
          recoverable: res.status !== 404,
        },
      };
    }

    return {
      success: true,
      response: res,
    };
  }
}
