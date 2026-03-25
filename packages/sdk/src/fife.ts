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
 * FIFE URL sizing utilities.
 *
 * Google FIFE (Fast Image Fetch Engine) serves images at a base URL.
 * Appending sizing options (e.g. =w780, =h1200, =w780-h1688) controls
 * the output resolution.
 */

/** Options for controlling FIFE image resolution. */
export interface FifeImageOptions {
  /** Requested image width in pixels. */
  width?: number;
  /** Requested image height in pixels. */
  height?: number;
}

/**
 * Build a FIFE URL sizing suffix from options.
 *
 * @returns A suffix string like "=w780", "=h1200", "=w780-h1688", or "" if no options.
 */
export function buildFifeSuffix(options?: FifeImageOptions): string {
  if (!options) return "";
  const parts: string[] = [];
  if (options.width) parts.push(`w${options.width}`);
  if (options.height) parts.push(`h${options.height}`);
  return parts.length > 0 ? `=${parts.join("-")}` : "";
}
