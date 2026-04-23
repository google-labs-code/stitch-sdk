# CI Visual Testing with Stitch

This directory contains an example of how to integrate the Stitch SDK into a CI pipeline for visual testing and regression analysis. The process is broken into two parts:

1. **Deterministic Runner** (`scripts/ci-runner.ts`): Re-runs the Stitch generation with the baseline prompt, captures the new screenshot URL, and outputs a JSON diff report.
2. **Agent Skill** (`SKILL.md`): Teaches an agent how to evaluate the visual diff report, download the before/after screenshots, and make a pass/fail judgment.

## Running the Example

```bash
bun run scripts/ci-runner.ts
```
