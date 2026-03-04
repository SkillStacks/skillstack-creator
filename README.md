# SkillStack Creator Plugin

Creator-facing Claude Code plugin for publishing and managing plugins on SkillStack.

## Skills

| Skill | Purpose |
|-------|---------|
| `/publish` | Guided setup: connects existing plugins to SkillStack, configures pricing and payment provider, installs GitHub App, creates storefront repo, verifies registration. Run again to add more plugins. |
| `/verify` | Diagnostic: checks plugin registration and version sync against SkillStack, with troubleshooting guidance. |

## PostToolUse Hook

Auto-warns on `git commit` if plugin source files changed without a version bump in `marketplace.json`. Friendly confirmation on `git push` that the SkillStack webhook will sync changes. Non-blocking.

## Usage

Load the plugin when working in your plugin source repo:

```bash
claude --plugin-dir <path-to-skillstack-creator>
```

Or set up a shell alias:

```bash
alias clcr='claude --plugin-dir ~/projects/skillstack-creator'
```

## Documentation

- [Creator Guide](https://github.com/kenneth-liao/skillstack/blob/main/docs/CREATOR-GUIDE.md)
