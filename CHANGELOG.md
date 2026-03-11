# Changelog

All notable changes to the SkillStack Creator Plugin are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning follows [Semantic Versioning](https://semver.org/).

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
