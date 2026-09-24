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

export {
  StitchConfig,
  StitchConfigInput,
  StitchConfigSchema,
} from "./spec/client.js";

// The REAL response shapes come from the generated types. Handwritten
// DesignTheme/ScreenInstance duplicates used to live here with shapes
// INCOMPATIBLE with what the SDK actually returns — deleted in 1.0.
import type {
  DesignTheme,
  ScreenInstance,
} from "../generated/src/types.generated.js";

export type {
  ThumbnailScreenshot,
  ProjectData,
  ScreenData,
  DesignSystemData,
} from "../generated/src/types.generated.js";
