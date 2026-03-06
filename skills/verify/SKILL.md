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

### Step 3b: Validate free_skills

If the source marketplace.json has a `free_skills` field for any plugin:

1. Read the plugin's `skills/` directory to get actual skill directory names
2. Compare each entry in `free_skills` against actual directories
3. Report the results

**If all entries are valid:**
```
  Free tier: [N] skills ([list names]) — all valid
```

**If there are mismatches:**
```
  Free tier: WARNING — "[typo-name]" doesn't match any skill directory.
    Did you mean "[closest-match]"?
    Valid free skills: [list valid names] ([N] of [M] entries valid)
```

**If free_skills is empty or not present:** Skip this check.

### Step 4: Report status

```
Plugin Status
=============

my-plugin (theailaunchpad-my-plugin)
  Registration: OK
  Version: 1.2.3 (synced)
  License: subscription (correct)
  Free tier: 3 skills (write-note, hook, title) — all valid

another-plugin (theailaunchpad-another-plugin)
  Registration: NOT FOUND
  Expected version: 1.0.0
  Free tier: not configured (pure paid)

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
