import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = resolve(__dirname, "../..");

describe("Generator: constructor visibility", () => {
  it("should emit protected (not private) client on generated classes with extensions", () => {
    const projectSrc = readFileSync(
      resolve(SDK_ROOT, "generated/src/project.ts"),
      "utf-8",
    );
    // The constructor must use `protected` so subclasses can access this.client
    expect(projectSrc).toContain("protected client");
    expect(projectSrc).not.toContain("private client");
  });

  it("should still emit private client on classes WITHOUT extensions", () => {
    const screenSrc = readFileSync(
      resolve(SDK_ROOT, "generated/src/screen.ts"),
      "utf-8",
    );
    // Screen has no extensionPath — client should remain private
    expect(screenSrc).toContain("private client");
    expect(screenSrc).not.toContain("protected client");
  });
});

describe("Extension files: no as-any on inherited members", () => {
  it("project-ext.ts should not cast this.client or this.projectId via as any", () => {
    const extSrc = readFileSync(
      resolve(SDK_ROOT, "src/project-ext.ts"),
      "utf-8",
    );
    // Verify no (this as any).client or (this as any).projectId patterns
    expect(extSrc).not.toMatch(/\(this as any\)\.client/);
    expect(extSrc).not.toMatch(/\(this as any\)\.projectId/);
  });
});
