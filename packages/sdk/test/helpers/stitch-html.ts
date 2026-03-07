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

import fs from "node:fs";
import path from "node:path";

/**
 * Assets extracted from Stitch-generated HTML.
 */
export interface StitchAssets {
  /** The raw tailwind.config JS block, or null if not found. */
  tailwindConfig: string | null;
  /** Google Fonts `<link>` tags from the HTML `<head>`. */
  fontLinks: string[];
}

/**
 * Extracts Stitch design assets from generated HTML.
 * Stitch embeds a `<script id="tailwind-config">tailwind.config = {...}</script>`
 * block and Google Fonts links in the `<head>`.
 */
export function extractStitchAssets(html: string): StitchAssets {
  const configMatch = html.match(/<script id="tailwind-config">([\s\S]*?)<\/script>/);
  const fontLinks = html.match(/<link[^>]*fonts\.googleapis\.com[^>]*>/g) ?? [];
  return {
    tailwindConfig: configMatch?.[1] ?? null,
    fontLinks,
  };
}

/**
 * Parses Gemini's multi-file output into a filename → content map.
 * Expects `--- FILE: <filename> ---` markers between files.
 */
export function parseGeneratedFiles(output: string): Record<string, string> {
  const fileRegex = /--- FILE: (.+?) ---\n([\s\S]*?)(?=--- FILE:|$)/g;
  const files: Record<string, string> = {};
  let match;
  while ((match = fileRegex.exec(output)) !== null) {
    files[match[1].trim()] = match[2].trim();
  }
  return files;
}

const ROOT_FILES = new Set(["index.html", "package.json", "vite.config.ts", "tsconfig.json"]);

/**
 * Writes generated files to a Vite preview app directory.
 * Root-level files (index.html, package.json, etc.) go in `outputDir`,
 * everything else goes in `outputDir/src/`.
 */
export function writePreviewApp(files: Record<string, string>, outputDir: string): void {
  // Clear previous output
  fs.rmSync(outputDir, { recursive: true, force: true });
  const srcDir = path.join(outputDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  for (const [filename, content] of Object.entries(files)) {
    const dest = path.join(ROOT_FILES.has(filename) ? outputDir : srcDir, filename);
    fs.writeFileSync(dest, content);
  }

  // Gemini doesn't know about the root/src split — fix the entry point path
  const indexPath = path.join(outputDir, "index.html");
  if (fs.existsSync(indexPath)) {
    const html = fs.readFileSync(indexPath, "utf-8");
    fs.writeFileSync(indexPath, html.replace(/src="\/main\.tsx"/, 'src="/src/main.tsx"'));
  }
}
