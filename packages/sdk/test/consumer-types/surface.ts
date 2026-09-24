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
 * Consumer type-surface gate [V1_REVIEW_FIXES M9].
 *
 * Compiled (not run) against the BUILT package types via
 * `tsconfig.consumer.json` to lock the public API a strict-TS consumer
 * sees. This is the permanent guard for M1 (content methods on
 * generative returns), M4 (multi-aspect array), and the options-object
 * signatures — it must compile clean, so a regression in the emitted
 * types fails CI instead of silently shipping (the docs-cluster blind
 * spot from the review). Imports go through the package entry points,
 * resolving the same dist .d.ts a real consumer downloads.
 */

import {
  stitch,
  type Screen,
  type Generation,
  type VariantOptions,
  type ScreenInput,
} from "@google/stitch-sdk";
import { toolMap, toolDefinitions } from "@google/stitch-sdk/tools";

export async function surface(): Promise<void> {
  const project = stitch.project("p1");

  // M1: a generation result's screens expose CONTENT methods (getHtml/getImage),
  // not just the URL accessors — including the edit()/variants() self-returns.
  const gen: Generation<Screen, unknown> = await project.generate("a page", {
    deviceType: "MOBILE",
  });
  const html: string = await gen.first.readHtml();
  const htmlUrl: string = await gen.first.getHtml();
  const png: Uint8Array = await gen.first.readImage();
  const pngUrl: string = await gen.first.getImage();
  const url: string = await gen.first.getHtmlUrl();

  const edited = await gen.first.edit("darker");
  const editedHtml: string = await edited.first.getHtml();

  // M4: multi-aspect array must type-check (the precedence-bug fix).
  const opts: VariantOptions = {
    variantCount: 2,
    aspects: ["LAYOUT", "COLOR_SCHEME"],
  };
  const variants = await gen.first.variants("colors", opts);
  const firstVariant: Screen = variants.screens[0];

  // Content methods reach every Screen-returning path, not just generate().
  const got = await project.getScreen("s1");
  const listed = (await project.screens())[0];
  const viaFactory = project.screen("s2");
  const all: Promise<string>[] = [
    got.getHtml(),
    listed.getHtmlUrl(),
    viaFactory.getHtml(),
    firstVariant.getHtmlUrl(),
  ];

  // /tools subpath public types.
  const t: ScreenInput | undefined = undefined;
  void [html, png, url, editedHtml, all, t, toolMap, toolDefinitions];
}
