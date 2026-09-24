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
 * Handwritten extension of the generated Screen class.
 *
 * Backward-compatible bridge (0.4.0):
 * getHtml()/getImage() retain their original URL-returning semantics
 * (marked with @deprecated). New methods readHtml()/readImage() fetch
 * the content (string and Uint8Array respectively).
 * URL accessors are getHtmlUrl()/getImageUrl().
 *
 * Registered as the canonical "Screen" implementation so every
 * EntityManager.resolve produces this class.
 */

import { Screen as GeneratedScreen } from "../generated/src/screen.js";
import { StitchError } from "./spec/errors.js";
import { EntityManager } from "./entity-manager.js";
import type { ScreenContentSpec } from "./spec/content.js";
import { ScreenContentHandler } from "./content-handler.js";

export class Screen extends GeneratedScreen implements ScreenContentSpec {
  static [Symbol.hasInstance](instance: unknown): boolean {
    if (!instance || typeof instance !== "object") return false;
    if (Function.prototype[Symbol.hasInstance].call(this, instance))
      return true;
    const first = (instance as any).first;
    if (
      Array.isArray((instance as any).screens) &&
      first &&
      Function.prototype[Symbol.hasInstance].call(this, first)
    ) {
      return true;
    }
    return false;
  }

  /**
   * Get the signed download URL for the screen's HTML.
   * @deprecated Use getHtmlUrl() to get the URL, or readHtml() to fetch HTML content.
   */
  async getHtml(): Promise<string> {
    return this.getHtmlUrl();
  }

  /**
   * Get the signed download URL for the screen's screenshot.
   * @deprecated Use getImageUrl() to get the URL, or readImage() to fetch image bytes.
   */
  async getImage(): Promise<string> {
    return this.getImageUrl();
  }

  /**
   * Fetch the screen's HTML content as a string.
   * For just the signed download URL, use getHtmlUrl() or getHtml().
   */
  async readHtml(): Promise<string> {
    const url = await this.getHtmlUrl();
    const handler = new ScreenContentHandler();
    const result = await handler.fetchArtifact({
      url,
      label: `HTML content for screen ${this.screenId}`,
    });
    if (!result.success) {
      throw new StitchError({
        code: result.error.code,
        message: result.error.message,
        recoverable: result.error.recoverable,
      });
    }
    return result.response.text();
  }

  /**
   * Fetch the screen's screenshot bytes (typically PNG).
   * For just the signed download URL, use getImageUrl() or getImage().
   */
  async readImage(): Promise<Uint8Array> {
    const url = await this.getImageUrl();
    const handler = new ScreenContentHandler();
    const result = await handler.fetchArtifact({
      url,
      label: `screenshot bytes for screen ${this.screenId}`,
    });
    if (!result.success) {
      throw new StitchError({
        code: result.error.code,
        message: result.error.message,
        recoverable: result.error.recoverable,
      });
    }
    return new Uint8Array(await result.response.arrayBuffer());
  }
}

EntityManager.registerImplementation("Screen", Screen);
