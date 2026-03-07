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

import { Stitch } from "../generated/src/stitch.js";
import { StitchToolClient } from "./client.js";

/** Lazily-initialized default Stitch instance */
let _stitch: Stitch | null = null;

function getStitchInstance(): Stitch {
  if (!_stitch) {
    const client = new StitchToolClient({
      apiKey: process.env.STITCH_API_KEY,
      baseUrl: process.env.STITCH_HOST || "https://stitch.googleapis.com/mcp",
    });
    _stitch = new Stitch(client);
  }
  return _stitch;
}

/**
 * Default Stitch instance using environment variables.
 * Lazily initialized on first access.
 * 
 * @example
 * import { stitch } from '@google/stitch-sdk';
 * const projects = await stitch.projects();
 */
export const stitch = new Proxy<Stitch>({} as Stitch, {
  get(_target, prop: string | symbol) {
    const instance = getStitchInstance();
    const value = instance[prop as keyof Stitch];
    // Bind methods to preserve `this` context
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});
