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

export const FetchArtifactInputSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1),
});

export type FetchArtifactInput = z.input<typeof FetchArtifactInputSchema>;

export const FetchArtifactErrorCode = z.enum([
  "NOT_FOUND",
  "NETWORK_ERROR",
  "VALIDATION_ERROR",
]);

export type FetchArtifactErrorCode = z.infer<typeof FetchArtifactErrorCode>;

export type FetchArtifactResult<T = Response> =
  | {
      success: true;
      response: T;
    }
  | {
      success: false;
      error: {
        code: FetchArtifactErrorCode;
        message: string;
        recoverable: boolean;
      };
    };

export interface ScreenContentHandlerSpec {
  fetchArtifact(
    input: FetchArtifactInput,
  ): Promise<FetchArtifactResult<Response>>;
}

/**
 * The COMPLETE set of members the handwritten Screen extension adds beyond
 * the generated class. It is both (a) implemented by the screen-ext class
 * and (b) declaration-merged onto the generated Screen type (via the
 * domain-map `publicInterface`), so the generated `Screen` type and the
 * exported `Screen` type are structurally identical — a consumer can assign
 * `screen.edit().first` / `variants().screens[0]` to a `Screen` without the
 * type splitting. Anything screen-ext adds publicly MUST be declared here.
 */
export interface ScreenContentSpec {
  /**
   * Get the signed download URL for the screen's HTML.
   * @deprecated Use getHtmlUrl() or readHtml().
   */
  getHtml(): Promise<string>;

  /**
   * Get the signed download URL for the screen's screenshot.
   * @deprecated Use getImageUrl() or readImage().
   */
  getImage(): Promise<string>;

  /**
   * Fetch the screen's HTML content as a string.
   */
  readHtml(): Promise<string>;

  /**
   * Fetch the screen's screenshot image bytes (typically PNG).
   */
  readImage(): Promise<Uint8Array>;

  /** Typed accessor for the screen's display title (from cached data). */
  readonly title: string | undefined;
}
