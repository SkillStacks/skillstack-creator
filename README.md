# SkillStack Creator Plugin

Creator-facing Claude Code plugin for publishing and managing plugins on SkillStack.

## Skills

| Skill | Purpose |
|-------|---------|
| `/publish` | Guided setup: connects existing plugins to SkillStack by writing distribution config to `.claude-plugin/skillstack.json`, configures pricing and payment provider, installs GitHub App, displays auto-generated storefront URL, verifies registration. Run again to add more plugins or reconfigure licensing. |
| `/verify` | Diagnostic: checks plugin registration, version sync, license config (from `skillstack.json`), free_skills, creator contact, and storefront availability at `store.skillstack.sh` against SkillStack, with troubleshooting guidance. |
| `/stats` | Analytics: view active buyers, installs, and free/paid split for your published plugins. Filterable by time period and plugin. |

## PostToolUse Hook

Runs after `git commit` and `git push` in SkillStack repos (detected via `.claude-plugin/skillstack.json`). Non-blocking.

- **On commit**: Warns if plugin source files changed without a version bump in `marketplace.json`
- **On commit**: Warns if `marketplace.json` and `plugin.json` versions are out of sync (marketplace.json is the source of truth for SkillStack distribution)
- **On push**: Confirms the SkillStack webhook will sync version changes

## Prerequisites

- [Claude Code](https://claude.ai) installed
- [Node.js](https://nodejs.org) (v18+) — includes `npm`, which SkillStack uses to deliver plugin packages

## Installation

Add the marketplace and install the plugin from within Claude Code:

```
/plugin marketplace add https://github.com/SkillStacks/skillstack-creator.git
/plugin install skillstack-creator@skillstack-creator
```

When prompted, select **"Install for you (user scope)"** — the first and recommended option.

Restart Claude Code, then navigate to your plugin source repo and run `/publish` to get started.

## Helper Scripts

Scripts in `scripts/` handle deterministic logic (file I/O, validation, JSON schema), keeping skills focused on user interaction and judgment calls.

| Script | Purpose | Used by |
|--------|---------|---------|
| `read-plugin-state.mjs` | Reads marketplace.json, skillstack.json, plugin.json, and git remote into a unified state object | `/publish`, `/verify` |
| `verify-config.mjs` | Runs 9 local verification checks (registration, version sync, license config, free_skills, stale fields) | `/verify` |
| `write-skillstack-json.mjs` | Writes/merges skillstack.json with input validation (UUID format, license types, mutual exclusivity), cleans stale fields from marketplace.json | `/publish` |

All scripts export testable functions and work as CLI tools (`node scripts/<name>.mjs`).

## Testing

```bash
node --test tests/*.test.mjs
```

66 unit tests across 3 test files covering all script functions. Tests use temp directories with filesystem fixtures — no external dependencies.

## Documentation

- [Creator Guide](https://github.com/kenneth-liao/skillstack/blob/main/docs/CREATOR-GUIDE.md)
