# Releasing @google/stitch-sdk

The published artifact is `packages/sdk`; the private root mirrors its version (`bun run version:sync`).

## Pipeline order (full regeneration)

```bash
npm run capture              # Stage 1 — needs STITCH_API_KEY (writes RAW schemas)
# Stage 2 (agent): edit packages/sdk/generated/domain-map.json per the
#                  stitch-sdk-domain-design skill
npm run generate             # Stage 3 — validates IR + projections, emits TS
npm run build                # Stage 4
cd packages/sdk && bun run test:coverage && cd ../..   # Stage 5 (+ thresholds)
npm run test:scripts         # Stage 6 — emitter snapshots + IR contract
npm run test:e2e             # Stage 7 — live API (STITCH_API_KEY)
npm run validate:generated   # Stage 8 — lock integrity (always after generate)
bun run check:skills         # skill ↔ IR consistency
bun run check:bundle         # root-entry size budget + catalog-leak probe
```

## Release checklist

1. Bump `packages/sdk/package.json` version; `bun run version:sync`.
2. `bun run publish:readiness` — build, publint, lock validation, version sync, pack hygiene, size budget, consumer-import check, unit tests. Must be fully green.
3. Update `CHANGELOG`/release notes; for breaking releases update `MIGRATION-1.0.md`-style guidance.
4. Publish through wombat-dressing-room (`packages/sdk` `publishConfig` is already pointed at it). For pre-releases use a dist-tag: `npm publish --tag next`.
5. Tag `v<version>` on the release commit.
6. Post-publish smoke: `npm install @google/stitch-sdk@<tag>` in a scratch project; import root, `/tools`, and (with peers installed) `/ai` + `/adk`.

## Dist-tag policy (semver safety)

- **Pre-1.0 / rc:** version is `1.0.0-rc.N` and `publishConfig.tag` is `next`. An rc does NOT satisfy a consumer's `^0.3`/`~0.3` range and `next` is not installed by default, so a breaking pre-release can never auto-upgrade existing `0.x` consumers. This is the current state.
- **GA:** flip the version to `1.0.0` and `publishConfig.tag` to `latest` ONLY after the open post-review majors land (see `V1_REVIEW_FIXES.md` Tranches 2–4) — several are wrong public types/behavior that are themselves breaking to fix after GA.

## Invariants the gates enforce

- Generated output is byte-reproducible; `stitch-sdk.lock` hashes are machine-portable and CI-validated.
- `tools-manifest.json` stores schemas RAW; repair happens at load/serve time and is recorded in `lock.generated.repairedTools`.
- The root bundle must not contain the tool catalog (only `/tools`, `/ai`, `/adk` carry it).
- Optional peers (`ai`, `@google/adk`, `@google/genai`) must never be required to install or import the root.
