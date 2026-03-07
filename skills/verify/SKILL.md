---
name: verify
description: Use when a creator wants to check if their plugins are correctly registered and synced on SkillStack. Quick diagnostic with troubleshooting guidance.
---

## Verify Plugin Registration

Quick diagnostic to check if plugins are registered and synced on SkillStack.

### Step 1: Read expected state

Read `.claude-plugin/marketplace.json` from the current repo. Build a list of expected plugins with their names, versions, license models, and license options.

For each plugin, note:
- `license_model` (if present) — single license type
- `license_options` (if present) — multi-license config with per-type identifiers
- `free_skills` (if present) — freemium skill list

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
| License options synced? | Options match (keys and identifiers) | Missing or mismatched |

**License options check:** If the source has `license_options`, compare against the `license_options` returned by `skillstack_list`:
- Check that the same license type keys exist (e.g., `onetime`, `lifetime`)
- Note: the worker auto-normalizes old `license_model` into `license_options` — a plugin with `"license_model": "subscription"` will show as `"license_options": { "subscription": {} }` in SkillStack. This is expected and counts as a match.
- If the source has `license_options` but SkillStack shows `null`, the webhook likely didn't sync — suggest re-pushing.

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

### Step 3c: Check storefront sync

If `.skillstack-creator.json` exists, read it to find the storefront repo location (`storefront_local_path`).

If the storefront path exists locally:

1. Read the storefront's `.claude-plugin/marketplace.json`
2. For each plugin distributed on SkillStack, check if it has a corresponding entry in the storefront
3. Report the results:

**All plugins in storefront:**
```
  Storefront: all [N] distributed plugins listed
```

**Missing plugins:**
```
  Storefront: WARNING — missing entries for: [plugin-name-1], [plugin-name-2]
    These plugins are registered in SkillStack but buyers can't discover them.
    Add npm pointer entries to your storefront's marketplace.json and push.
```

If `.skillstack-creator.json` doesn't exist or the storefront path is missing, skip this check silently.

### Step 4: Report status

```
Plugin Status
=============

my-plugin (theailaunchpad-my-plugin)
  Registration: OK
  Version: 1.2.3 (synced)
  License: subscription (correct)
  License options: { subscription: {} } (synced)
  Free tier: 3 skills (write-note, hook, title) — all valid

multi-license-plugin (theailaunchpad-multi-license-plugin)
  Registration: OK
  Version: 2.0.0 (synced)
  License: lifetime (correct — derived from license_options)
  License options: { onetime: { benefit_id: "ben_..." }, lifetime: { benefit_id: "ben_..." } } (synced)
  Free tier: not configured (pure paid)

another-plugin (theailaunchpad-another-plugin)
  Registration: NOT FOUND
  Expected version: 1.0.0
  Free tier: not configured (pure paid)

Storefront: all 2 distributed plugins listed

Overall: 2/3 plugins synced
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

**License options mismatch:**
- "The license options in SkillStack don't match your marketplace.json."
- "Check that `license_options` keys are valid: `subscription`, `onetime`, or `lifetime`."
- "Push a commit to re-trigger the webhook sync."

**Storefront missing plugins:**
- "Your storefront doesn't list all distributed plugins."
- "Add the missing npm pointer entries to your storefront's `.claude-plugin/marketplace.json`."
- "Example entry: `{ \"name\": \"<plugin>\", \"description\": \"...\", \"source\": { \"source\": \"npm\", \"package\": \"@skillstack/<org>-<plugin>\" } }`"

**Everything synced:**
- "All plugins are registered and up to date!"
- Storefront sync is checked automatically when `.skillstack-creator.json` exists (see Step 3c).
