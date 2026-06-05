# Changelog

All notable changes to the SkillStack Creator Plugin are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning follows [Semantic Versioning](https://semver.org/).

## [0.8.0] - 2026-06-05

### Fixed — canonical-home binding (the single-license source bug)

- **`/publish` Step 4c** now collects the correct **binding id** for single-license
  plugins: **`benefit_id`** for Polar (it binds on the benefit, not the product —
  collecting `product_id` produced an unresolvable config the worker rejects) and a
  **required `product_id`** for paid Lemon Squeezy. Step 5 documents that the
  single-license binding id goes in `license_config` (the worker relocates it into
  the license tier) and the multi-license id goes per tier in `license_options`.

### Added — Claude-driven migration + downgrade safety (issue #2)

- **`/verify` Step 3.6 — migrate to canonical config.** Uses the worker's
  `/validate` response (`errors` + the new `canonical` field): writes the corrected
  config verbatim for valid/drifted plugins, and for an invalid one asks the creator
  only for the value it genuinely needs (e.g. a Polar `benefit_id`) with where to
  find it, then re-validates, re-publishes, and confirms. Idempotent + buyer-safe
  (a paid plugin can never be migrated to free); buyers do nothing.
- **Silent-downgrade gate.** `/publish` Step 8 and `/verify` Step 3.6 now read
  `skillstack_creator_stats` after a push and check each plugin's
  `last_sync_warning` (must be null) and live `license_model` — so a push that
  skipped/downgraded a plugin is surfaced instead of reported as success.
- **Broader MCP-failure handling** in `/stats` (empty data, non-auth errors, call
  failure) and `/publish` Step 8 (`skillstack_list` failure).

### Fixed — version drift

- `marketplace.json` plugin version (`0.6.0`) was out of sync with `plugin.json`
  (`0.7.0`); both are now a single value (`0.8.0`). A wrong/stale marketplace
  version 404s the plugin to buyers — exactly the class of bug `/verify` guards.

## [0.7.0] - 2026-06-04

### Added
- **Pre-publish binding validation** (`scripts/validate-config.mjs`) — `/publish` and `/verify` now validate the license/binding configuration against the worker's `POST /validate` endpoint, which runs the **same** canonicalization the webhook applies at ingestion. An unresolvable or colliding config (e.g. a paid plugin missing its `product_id`, two plugins at one source location, two paid plugins sharing a product) is caught on the creator's machine before a push, instead of silently syncing a plugin a buyer could never activate. Because authoring-time and ingest-time checks call one shared module, they cannot disagree. Errors are AI-actionable — each names the offending field, the exact fix, and a retry instruction — so an agent can correct and re-publish in one pass. If the endpoint is unreachable, validation is skipped with a note and the webhook remains the backstop. (#6)
  - `/publish` Step 5.5 blocks the push until validation passes.
  - `/verify` Step 3.5 reports binding errors alongside its existing health checks.
  - The request sends each plugin's **raw** `source` plus a top-level `pluginRoot` — the wire shape the worker's `POST /validate` accepts — and lets the worker own path resolution (it runs the shared `resolvePluginPath`). No `Authorization` header is sent: the endpoint is unauthenticated (the check is pure/stateless and bounded by a server-side plugin cap).
  - A reachable endpoint that returns an HTTP error status is now surfaced as a real, blocking error (`endpointError: true`, exit 1) instead of being silently downgraded to the "endpoint unreachable, proceed" backstop. Only a genuine network failure maps to `unavailable: true` (exit 3).

## [0.6.1] - 2026-05-01

### Fixed
- `write-skillstack-json.mjs` now coerces all `license_config` and `license_options[*]` values to strings before writing. Numeric provider IDs (e.g. Lemon Squeezy `store_id`, `product_id`) round-tripped through JSON as integers if not quoted, breaking strict-equality comparisons against License-API responses on the worker. Pairs with worker fixes in v0.12.1 / v0.12.2.
- `/publish` skill wording for Lemon Squeezy IDs clarifies they are stored as strings in JSON (previously labeled "(integer)").

## [0.6.0] - 2026-03-12

### Added
- **Helper scripts** for robust, token-efficient skill execution:
  - `read-plugin-state.mjs` — reads marketplace.json, skillstack.json, plugin.json, and git remote into a unified state object (used by `/publish` and `/verify`)
  - `verify-config.mjs` — runs all 9 local verification checks programmatically (registration, version, plugin.json sync, license model, license options, creator contact, free skills, stale fields, missing version)
  - `write-skillstack-json.mjs` — writes/merges skillstack.json with input validation (UUID format, license types, mutual exclusivity) and cleans stale fields from marketplace.json
- **68 unit tests** across 3 test files covering all script functions
- `.gitignore` and `package.json` with test runner config

### Fixed
- `read-plugin-state.mjs` now populates `skillDirs` — fixes `/verify` free_skills typo detection which needs actual skill directory names to validate against

### Changed
- `/publish` refactored to delegate file I/O to scripts — **58% token reduction** (437 → 185 lines)
- `/verify` refactored to delegate all local checks to scripts — **55% token reduction** (216 → 97 lines)
- `/stats` description updated to follow CSO best practices
- All skill descriptions now start with "Use when..." per writing-skills standards
- Inline JSON examples removed from `/publish` — script handles structure and validation
- `/publish` now documents license key plugin binding (v0.12.0) — each key binds to one plugin on first activation
- `/publish` GitHub App step clarifies **read-only** access (write permission removed in worker v0.10.0)
- `/verify` storefront URL now shows full `{owner}/{marketplace_slug}` pattern instead of placeholder
- `README.md` now documents the two-file model (`marketplace.json` for Claude Code metadata, `skillstack.json` for SkillStack config)
- Hook description updated to mention `skillstack.json` config detection

## [0.5.2] - 2026-03-11

### Added
- `/publish` now saves the storefront URL in `skillstack.json` so creators can always find it in their repo
- Summary mentions the creator dashboard at `skillstack.sh/dashboard` for install analytics and buyer stats

## [0.5.1] - 2026-03-11

### Changed
- `/publish` skill now explains what `skillstack.json` is and why it's being created before writing it
- Commit/push step explains what pushing triggers (webhook registration, automatic updates) and asks for explicit permission
- GitHub App install step explains why it needs read access (fetching plugin code for buyers)
- Storefront URL step explains the full flow: push → webhook → registration → buyer access

## [0.5.0] - 2026-03-11

### Changed
- **BREAKING:** `/publish` now writes SkillStack distribution config (licensing, freemium, contact) to `.claude-plugin/skillstack.json` instead of embedding in `marketplace.json`. marketplace.json stays a pure Claude Code marketplace descriptor.
- `/verify` reads licensing config from `skillstack.json` and validates against SkillStack
- `/publish` strips stale SkillStack fields from marketplace.json if present from prior publish
- PostToolUse hook detects SkillStack repos via `skillstack.json` instead of marketplace.json fields

### Removed
- Legacy marketplace health check (no legacy formats to detect with clean cutover)
- Legacy format migration (`polar_org_id`/`polar_product_id`, `onetime_snapshot`)

## [0.4.0] - 2026-03-11

### Changed
- Storefronts no longer include the SkillStack buyer plugin — buyers install it separately as a standalone marketplace
- `/publish` and `/verify` now detect and migrate legacy marketplace.json formats
- `/publish` collects `creator_contact` for buyer-facing error messages
- `/verify` checks creator_contact sync, plugin.json version sync, and storefront availability at `store.skillstack.sh`

### Added
- `/stats` skill — view active buyers, installs, and free/paid split via `skillstack_creator_stats`
- Marketplace health check in `/publish` and format health check in `/verify`
- Redundant SkillStack entry detection in `/verify`

## [0.3.0] - 2026-03-06

### Added
- Multi-license support in `/publish` — configure multiple license types (onetime, lifetime, subscription) with per-type provider identifiers
- `/verify` checks `license_options` sync against SkillStack

## [0.2.0] - 2026-03-06

### Added
- Freemium support in `/publish` — configure `free_skills` for paid plugins
- `/verify` validates `free_skills` entries against actual skill directories

## [0.1.0] - 2026-03-04

Initial release.

### Added
- `/publish` skill — guided onboarding for SkillStack distribution
- `/verify` skill — diagnostic check for plugin registration
- PostToolUse hook — version bump reminder on commit, webhook sync confirmation on push
