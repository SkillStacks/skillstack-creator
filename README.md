# SkillStack Creator Plugin

Creator-facing Claude Code plugin for publishing and managing plugins on SkillStack.

## Skills

| Skill | Purpose |
|-------|---------|
| `/publish` | Guided setup: connects existing plugins to SkillStack, configures pricing and payment provider, installs GitHub App, creates storefront repo with buyer-facing README, writes `storefront_repo` to marketplace.json for dashboard linking, verifies registration. Run again to add more plugins or reconfigure licensing. Collects optional `creator_contact` for buyer-facing error messages. |
| `/verify` | Diagnostic: checks plugin registration, version sync, license config, free_skills, creator contact, storefront sync, `storefront_repo` field presence, and storefront README against SkillStack, with troubleshooting guidance. |
| `/stats` | Analytics: view active buyers, installs, and free/paid split for your published plugins. Filterable by time period and plugin. |

## PostToolUse Hook

Runs after `git commit` and `git push` in SkillStack repos (detected via `.skillstack-creator.json`). Non-blocking.

- **On commit**: Warns if plugin source files changed without a version bump in `marketplace.json`
- **On commit**: Warns if `marketplace.json` and `plugin.json` versions are out of sync (marketplace.json is the source of truth for SkillStack distribution)
- **On push**: Confirms the SkillStack webhook will sync version changes

## Installation

Add the marketplace and install the plugin from within Claude Code:

```
/plugin marketplace add https://github.com/SkillStacks/skillstack-creator.git
/plugin install skillstack-creator@skillstack-creator
```

When prompted, select **"Install for you (user scope)"** — the first and recommended option.

Restart Claude Code, then navigate to your plugin source repo and run `/publish` to get started.

## Documentation

- [Creator Guide](https://github.com/kenneth-liao/skillstack/blob/main/docs/CREATOR-GUIDE.md)
