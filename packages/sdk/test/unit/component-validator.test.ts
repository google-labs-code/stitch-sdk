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
import { validateComponent } from "../helpers/component-validator.js";

const VALID_COMPONENT = `
import React from 'react';

interface HeroSectionProps {
  readonly title: string;
  readonly subtitle?: string;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ title, subtitle }) => {
  return (
    <div className="flex flex-col items-center p-8">
      <h1 className="text-4xl font-bold">{title}</h1>
      {subtitle && <p className="text-lg text-gray-600">{subtitle}</p>}
    </div>
  );
};

export default HeroSection;
`;

const MISSING_PROPS = `
import React from 'react';

export const HeroSection: React.FC<{ title: string }> = ({ title }) => {
  return <h1>{title}</h1>;
};

export default HeroSection;
`;

const HARDCODED_HEX = `
import React from 'react';

interface CardProps {
  readonly label: string;
}

export const Card: React.FC<CardProps> = ({ label }) => {
  return <div className="p-4 bg-[#ff6b2c] text-[#1a1a1a]">{label}</div>;
};

export default Card;
`;

const UNPARSEABLE = `
this is not valid tsx {{{
`;

describe("Component Validator", () => {
  it("validates a correct component", async () => {
    const result = await validateComponent(VALID_COMPONENT);
    expect(result.valid).toBe(true);
    expect(result.hasPropsInterface).toBe(true);
    expect(result.hardcodedHexValues).toHaveLength(0);
    expect(result.hasDefaultExport).toBe(true);
    expect(result.parseError).toBeUndefined();
  });

  it("rejects missing Props interface", async () => {
    const result = await validateComponent(MISSING_PROPS);
    expect(result.valid).toBe(false);
    expect(result.hasPropsInterface).toBe(false);
  });

  it("detects hardcoded hex colors", async () => {
    const result = await validateComponent(HARDCODED_HEX);
    expect(result.valid).toBe(false);
    expect(result.hardcodedHexValues.length).toBeGreaterThan(0);
    expect(result.hardcodedHexValues).toContain("#ff6b2c");
  });

  it("handles unparseable code gracefully", async () => {
    const result = await validateComponent(UNPARSEABLE);
    expect(result.valid).toBe(false);
    expect(result.parseError).toBeDefined();
  });
});
