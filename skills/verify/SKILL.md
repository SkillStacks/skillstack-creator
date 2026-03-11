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
| plugin.json in sync? | Matches marketplace.json | Version mismatch |
| License model correct? | Models match | Mismatch |
| License options synced? | Options match (keys and identifiers) | Missing or mismatched |

**License options check:** If the source has `license_options`, compare against the `license_options` returned by `skillstack_list`:
- Check that the same license type keys exist (e.g., `onetime`, `lifetime`)
- Note: the worker auto-normalizes old `license_model` into `license_options` — a plugin with `"license_model": "subscription"` will show as `"license_options": { "subscription": {} }` in SkillStack. This is expected and counts as a match.
- If the source has `license_options` but SkillStack shows `null`, the webhook likely didn't sync — suggest re-pushing.

**Creator contact check:** For each plugin, check if `creator_contact` is set in the source `marketplace.json`:

- If set: Verify it appears in the `skillstack_list` response for that plugin. Report: `Creator contact: <value> (synced)`
- If not set: Report a warning:
  ```
  Creator contact: NOT SET
    Buyers who hit license errors won't know how to reach you.
    Add "creator_contact": "your-email@example.com" to your plugin entry in marketplace.json.
  ```
  This is a warning, not an error — the plugin works without it.

**plugin.json version sync check:** For each plugin with a local `source` path, check if `<source>/.claude-plugin/plugin.json` exists. If it does, compare its `version` field against the `marketplace.json` version for that plugin:

- If they match: `plugin.json version: v1.10.0 (in sync)`
- If they differ:
  ```
  plugin.json version: MISMATCH — marketplace.json has v1.10.0, plugin.json has v1.9.0
    marketplace.json is the source of truth for SkillStack distribution.
    Update plugin.json to match.
  ```
- If plugin.json doesn't exist: skip silently (not all plugins have one)

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

### Step 3c: Verify storefront

Derive the GitHub org from `git remote get-url origin`. Fetch the buyer-facing storefront:

```bash
curl -s https://store.skillstack.sh/s/<github_org>/marketplace.json
```

Check:
1. Response is 200 (not 404)
2. All distributed plugins appear in the `plugins` array
3. Versions match what's in the source marketplace.json
4. Registry is `https://mcp.skillstack.sh`

**If storefront is valid:**
```
  Storefront: https://store.skillstack.sh/s/<github_org>/marketplace.json
    All [N] distributed plugins listed with correct versions
```

**If storefront returns 404:**
```
  Storefront: NOT FOUND at store.skillstack.sh/s/<github_org>/marketplace.json
    Plugins may not be registered yet. Push a change to trigger the webhook.
```

**If plugins are missing or versions don't match:**
```
  Storefront: WARNING — missing or outdated entries
    Missing: [plugin-name-1]
    Version mismatch: [plugin-name-2] (source: 1.2.0, storefront: 1.1.0)
    Push a commit to re-trigger the webhook sync.
```

### Step 3e: Format health check

Scan the source `marketplace.json` for legacy or outdated patterns that still work (due to worker backward compatibility) but should be migrated to the current format.

**Patterns to detect:**

| Pattern | Severity | Message |
|---------|----------|---------|
| `polar_org_id` / `polar_product_id` on a plugin | LEGACY | "Uses old Polar field format. Migrate to `license_provider` + `license_config`." |
| `license_model: "onetime_snapshot"` | LEGACY | "Old license model name. Should be `onetime`." |
| Plugin missing `version` | CRITICAL | "Plugin is invisible to buyers (404). Add a `version` field." |
| Missing `creator_contact` on paid plugins | RECOMMENDED | "Buyers who hit license errors won't know how to reach you." |
| Both `license_model` AND `license_options` present | LEGACY | "Conflicting fields. Worker ignores `license_model` when `license_options` exists. Remove `license_model`." |

**Report format:**

If issues found:
```
Format Health
=============

  1. LEGACY: "<plugin-name>" uses polar_org_id/polar_product_id (old format)
     → Migrate to license_provider + license_config

  2. CRITICAL: "<plugin-name>" missing version field
     → Buyers will get 404. Add a version.

  [N] issue(s) found. Run /publish to auto-fix.
```

If no issues:
```
Format Health: all fields use current format
```

Offer to auto-fix legacy issues if the creator wants. For CRITICAL issues (missing version), the creator must fix manually since only they know the correct version number.

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
  Creator contact: support@example.com (synced)

multi-license-plugin (theailaunchpad-multi-license-plugin)
  Registration: OK
  Version: 2.0.0 (synced)
  License: lifetime (correct — derived from license_options)
  License options: { onetime: { benefit_id: "ben_..." }, lifetime: { benefit_id: "ben_..." } } (synced)
  Free tier: not configured (pure paid)
  Creator contact: https://discord.gg/example (synced)

another-plugin (theailaunchpad-another-plugin)
  Registration: NOT FOUND
  Expected version: 1.0.0
  Free tier: not configured (pure paid)
  Creator contact: NOT SET (recommended for paid plugins)

Storefront: https://store.skillstack.sh/s/theailaunchpad/marketplace.json
  All 2 distributed plugins listed with correct versions

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
- "Your storefront at store.skillstack.sh doesn't list all distributed plugins."
- "Push a commit to re-trigger the webhook sync — the storefront is generated dynamically from registered plugins."

**Everything synced:**
- "All plugins are registered and up to date!"
- Storefront is verified automatically via store.skillstack.sh (see Step 3c).
