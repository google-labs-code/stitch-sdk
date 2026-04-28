---
name: github-codebase-briefing
description: >-
  Generates a deeply contextual, progressive-disclosure briefing for any GitHub repository. 
  It builds a mental model of the code before analyzing issues and PRs to provide 
  actionable insights. Use when asked for a "GitHub report," "repo status," 
  "daily briefing," or to "catch up on a codebase."
license: MIT
compatibility: Requires GitHub CLI (gh) authenticated and installed.
---

# GitHub Codebase Briefing

This skill performs a "deep read" of a repository. It avoids superficial listings by first understanding the project's architecture and then evaluating open items against that context.

## Prerequisites
* **Tooling:** The agent must have access to the `gh` CLI.
* **Auth:** The user must be authenticated (`gh auth status`).

## Instructions

### Step 1: Initialize the Mental Model
Before looking at tasks, understand the environment. Run these commands in sequence:
1. **Metadata:** `gh repo view <owner/repo> --json name,description,stargazerCount,forkCount`
2. **Structure:** `gh api repos/<owner/repo>/contents/`
3. **Identity:** Read the project manifest (e.g., `package.json`, `go.mod`, `pyproject.toml`) and `README.md`.
4. **Entry Point:** Read the primary entry file (e.g., `index.ts`, `main.go`) to identify the Public API surface.

### Step 2: Retrieve State & Delta
Fetch current items and recent changes:
1. **Issues:** `gh issue list --repo <owner/repo> --state open --json number,title,body,author,createdAt,updatedAt,labels,comments`
2. **PRs:** `gh pr list --repo <owner/repo> --state open --json number,title,body,author,createdAt,updatedAt,labels,additions,deletions,changedFiles,headRefName`
3. **24h Delta:** `gh issue list --state closed --since 24h` and `gh pr list --state merged --since 24h`.

### Step 3: Deep Analysis Logic
For every issue and PR, do not just summarize the text. Perform a logic check:
* **Issues:** Use `gh api repos/<owner/repo>/contents/<path>` to inspect the code mentioned in the report.
* **PRs:** Use `gh pr diff <number>` to review actual implementation. Evaluate if the code follows the patterns found in Step 1.
* **Flags:**
    * 🚨 **SECURITY:** Scan for credentials, auth bypass, or injection keywords.
    * 🤝 **EXTERNAL:** Prioritize PRs from non-maintainers.
    * ✅ **READY:** Verify mergeability with `gh pr view <number> --json mergeable,statusCheckRollup`.

### Step 4: Pattern Synthesis
Group items into high-level insights:
* **Bug Clusters:** Identify if 3+ issues share a root cause in a specific module.
* **Hot Modules:** Flag files that appear in multiple open items.
* **Client Patterns:** Group issues by consumer (e.g., "VS Code users are reporting X").

## Output Template

### # {REPO_NAME} Daily Briefing — {DATE}

**Snapshot:** {N} Issues ({+X} since yesterday) | {M} PRs ({+Y} since yesterday)

### ⚡ Suggested Actions Today
1. **[Priority] #{Num}:** {One-line reason}
2. **[Priority] #{Num}:** {One-line reason}

---

### 📂 Open Issues Deep Dive
#### [Flag] #{Num} — {Title}
* **Context:** Plain-English explanation of the "why" and "where" in the codebase.
* **Key Evidence:** > {Blockquote of critical user text}
* **Resolution Path:** {Quick fix/Design decision/Blocked}

### 🔀 Pull Request Analysis
#### [Flag] #{Num} — {Title}
* **Impact:** Summary of files changed and architectural fit.
* **Quality Note:** Honest assessment of implementation and CI status.

### 🔍 Patterns & Health
* **Hot Modules:** `{list/of/files}`
* **Release Cadence:** Last release was `{days}` ago.
