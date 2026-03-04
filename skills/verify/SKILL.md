---
name: verify
description: Use when a creator wants to check if their plugins are correctly registered and synced on SkillStack. Quick diagnostic with troubleshooting guidance.
---

## Verify Plugin Registration

Quick diagnostic to check if plugins are registered and synced on SkillStack.

### Step 1: Read expected state

Read `.claude-plugin/marketplace.json` from the current repo. Build a list of expected plugins with their names, versions, and license models.

If the file doesn't exist, tell the creator to run the **publish** skill first.

### Step 2: Query SkillStack

Call the `skillstack_list` MCP tool to get all registered plugins.

### Step 3: Compare and report

For each plugin in the source manifest, check against the `skillstack_list` results:

| Check | Pass | Fail |
|-------|------|------|
| Plugin registered? | Slug found in list | Not found |
| Version match? | Versions are equal | Source has newer version |
| License model correct? | Models match | Mismatch |

### Step 4: Report status

```
Plugin Status
=============

my-plugin (theailaunchpad-my-plugin)
  Registration: OK
  Version: 1.2.3 (synced)
  License: subscription (correct)

another-plugin (theailaunchpad-another-plugin)
  Registration: NOT FOUND
  Expected version: 1.0.0

Overall: 1/2 plugins synced
```

### Step 5: Troubleshooting guidance

If any plugins have issues, provide specific guidance:

**Not registered:**
- "Check that the SkillStack GitHub App is installed on this repo: https://github.com/apps/skillstack-distribution"
- "Try pushing a commit to trigger the webhook"
- "Verify marketplace.json has a `version` field — without it, the plugin won't register"

**Version mismatch (source ahead):**
- "The source repo has a newer version than SkillStack. This usually means the webhook didn't fire."
- "Try: `git commit --allow-empty -m 'trigger webhook' && git push`"

**License model mismatch:**
- "The license model in SkillStack doesn't match your marketplace.json."
- "Push a commit to re-trigger the webhook sync."

**Everything synced:**
- "All plugins are registered and up to date!"
- Optionally check storefront sync too (if `.skillstack-creator.json` exists)
