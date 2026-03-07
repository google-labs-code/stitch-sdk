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

import { z } from 'zod';

/**
 * Exhaustive error codes for Stitch operations.
 * Add new codes here as needed.
 */
export const StitchErrorCode = z.enum([
  'AUTH_FAILED',
  'NOT_FOUND',
  'PERMISSION_DENIED',
  'RATE_LIMITED',
  'NETWORK_ERROR',
  'VALIDATION_ERROR',
  'UNKNOWN_ERROR',
]);

export type StitchErrorCode = z.infer<typeof StitchErrorCode>;

/**
 * Structured error data for internal Result types.
 */
export interface StitchErrorData {
  code: StitchErrorCode;
  message: string;
  suggestion?: string;
  recoverable: boolean;
}

/**
 * Throwable error class for the public API.
 * Extends Error so it works with try/catch and instanceof checks.
 */
export class StitchError extends Error {
  public readonly code: StitchErrorCode;
  public readonly suggestion?: string;
  public readonly recoverable: boolean;

  constructor(data: StitchErrorData) {
    super(data.message);
    this.name = 'StitchError';
    this.code = data.code;
    this.suggestion = data.suggestion;
    this.recoverable = data.recoverable;
  }

/**
 * Create a StitchError from an unknown caught error.
 */
  static fromUnknown(error: unknown): StitchError {
    if (error instanceof StitchError) return error;
    return new StitchError({
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : String(error),
      recoverable: false,
    });
  }
}
