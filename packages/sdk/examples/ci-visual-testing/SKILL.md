# Stitch CI Visual Testing Skill

**Description:** Teaches an agent how to evaluate visual diffs from Stitch screenshot URLs during CI.

## Context
When the deterministic CI runner (`scripts/ci-runner.ts`) finishes, it outputs a JSON report containing the baseline screenshot URL and the new candidate screenshot URL.

## Agent Instructions
1. **Read the CI Report**: Parse the JSON output from `scripts/ci-runner.ts`.
2. **Fetch Screenshots**: Download the images from the provided CDN URLs.
3. **Analyze Visual Differences**: Compare the layout, typography, and color schemes.
4. **Evaluate Constraints**: Check if the candidate design still meets the original prompt constraints.
5. **Output Verdict**: Produce a Pass/Fail verdict with specific reasoning based on the visual comparison.
