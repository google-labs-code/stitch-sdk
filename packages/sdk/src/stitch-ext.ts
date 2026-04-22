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

import { Stitch as GeneratedStitch } from "../generated/src/stitch.js";
import { Project } from "./project-ext.js";
import { StitchError } from "./spec/errors.js";

export class Stitch extends GeneratedStitch {
  /**
   * Creates a new Stitch project using the direct REST API.
   * Spike: Exploratory REST support.
   */
  async createProjectREST(title: string): Promise<Project> {
    try {
      const raw = await (this as any).client.httpPost("projects", { title });
      return new Project((this as any).client, raw);
    } catch (error) {
      throw StitchError.fromUnknown(error);
    }
  }
}
