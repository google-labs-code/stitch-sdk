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
 * Parse a Google API resource name into a bare ID.
 *
 * Google API resource names follow the pattern `{collection}/{id}/{collection}/{id}`.
 * This utility extracts the last segment (the bare ID) from any resource name.
 *
 * @example
 * parseResourceName("projects/123/screens/abc") // → "abc"
 * parseResourceName("projects/123")             // → "123"
 * parseResourceName("abc123")                   // → "abc123" (pass-through)
 */
export function parseResourceName(name: string): string {
  if (!name || !name.includes("/")) return name;
  return name.split("/").pop()!;
}
