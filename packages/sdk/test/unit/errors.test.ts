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
import { StitchError } from "../../src/spec/errors.js";

describe("StitchError", () => {
  it("should set code, message, suggestion, and recoverable", () => {
    const err = new StitchError({
      code: "AUTH_FAILED",
      message: "bad key",
      suggestion: "check your key",
      recoverable: false,
    });
    expect(err.code).toBe("AUTH_FAILED");
    expect(err.message).toBe("bad key");
    expect(err.suggestion).toBe("check your key");
    expect(err.recoverable).toBe(false);
    expect(err.name).toBe("StitchError");
    expect(err).toBeInstanceOf(Error);
  });

  describe("fromUnknown", () => {
    it("should return the same StitchError if already one", () => {
      const original = new StitchError({
        code: "NOT_FOUND",
        message: "gone",
        recoverable: false,
      });
      const result = StitchError.fromUnknown(original);
      expect(result).toBe(original); // same reference
    });

    it("should wrap a plain Error with UNKNOWN_ERROR code", () => {
      const result = StitchError.fromUnknown(new Error("boom"));
      expect(result).toBeInstanceOf(StitchError);
      expect(result.code).toBe("UNKNOWN_ERROR");
      expect(result.message).toBe("boom");
      expect(result.recoverable).toBe(false);
    });

    it("should wrap a non-Error value (string)", () => {
      const result = StitchError.fromUnknown("something broke");
      expect(result).toBeInstanceOf(StitchError);
      expect(result.code).toBe("UNKNOWN_ERROR");
      expect(result.message).toBe("something broke");
      expect(result.recoverable).toBe(false);
    });
  });
});
