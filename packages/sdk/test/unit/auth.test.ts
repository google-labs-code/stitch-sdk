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

import { describe, it, expect } from "vitest";
import { buildAuthHeaders } from "../../src/auth.js";

describe("buildAuthHeaders", () => {
  it("emits X-Goog-Api-Key for an API key", () => {
    expect(buildAuthHeaders({ apiKey: "k" })).toEqual({
      "X-Goog-Api-Key": "k",
    });
  });

  it("emits Bearer + quota project for an access token", () => {
    expect(buildAuthHeaders({ accessToken: "t", quotaProjectId: "p" })).toEqual(
      { Authorization: "Bearer t", "X-Goog-User-Project": "p" },
    );
  });

  it("omits the quota header when no project is given", () => {
    expect(buildAuthHeaders({ accessToken: "t" })).toEqual({
      Authorization: "Bearer t",
    });
  });

  it("THROWS when neither credential is provided (the previously-untested branch)", () => {
    expect(() => buildAuthHeaders({})).toThrow(
      /No authentication credentials provided/,
    );
  });
});
