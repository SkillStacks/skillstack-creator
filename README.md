# SkillStack Creator Plugin

Creator-facing Claude Code plugin for publishing and managing plugins on SkillStack.

## Skills

| Skill | Purpose |
|-------|---------|
| `/publish` | Guided setup: connects existing plugins to SkillStack, configures pricing and payment provider, installs GitHub App, creates storefront repo, verifies registration. Run again to add more plugins. |
| `/verify` | Diagnostic: checks plugin registration and version sync against SkillStack, with troubleshooting guidance. |

## PostToolUse Hook

Auto-warns on `git commit` if plugin source files changed without a version bump in `marketplace.json`. Friendly confirmation on `git push` that the SkillStack webhook will sync changes. Non-blocking.

## Installation

Add the marketplace and install the plugin from within Claude Code:

```
/plugin marketplace add SkillStacks/skillstack-creator
/plugin install skillstack-creator@skillstack-creator
/reload-plugins
```

Then navigate to your plugin source repo and run `/publish` to get started.

## Documentation

- [Creator Guide](https://github.com/kenneth-liao/skillstack/blob/main/docs/CREATOR-GUIDE.md)
