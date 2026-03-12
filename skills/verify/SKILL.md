---
name: verify
description: Use when a creator wants to check if their SkillStack plugins are correctly registered, version-synced, and license-configured.
---

## Verify Plugin Registration

Quick diagnostic that checks registration, version sync, license config, free skills, and storefront availability for all SkillStack-connected plugins.

### Step 1: Read local state

Run the state reader script:

```bash
node <this-skill-dir>/../../scripts/read-plugin-state.mjs --repo-dir <repo-root>
```

Output: JSON with `marketplace`, `skillstack`, `pluginJsonVersions`, `git`, `storefrontUrl`, `connectedPlugins`, `unconnectedPlugins`, `staleFields`.

If `skillstack` is null, tell the creator to run `/publish` first.

### Step 2: Query SkillStack

Call the `skillstack_list` MCP tool to get all registered plugins.

### Step 3: Run verification checks

Pass the local state and registered plugins to the verify script:

```bash
node <this-skill-dir>/../../scripts/verify-config.mjs \
  --repo-dir <repo-root> \
  --registered '<JSON from skillstack_list>'
```

Output: JSON with `checks` (per-plugin pass/fail/warn), `staleFields`, and `summary`.

The script runs all local checks:
- Plugin registration (slug found in list)
- Version match (source vs SkillStack)
- plugin.json sync (matches marketplace.json)
- License model correctness
- License options sync (multi-license keys)
- Creator contact status
- Free skills validation (checks against actual directories)
- Stale field detection (SkillStack fields in marketplace.json)
- Missing version check (critical — plugin invisible to buyers)

### Step 4: Verify storefront

Fetch the storefront URL from the state output:

```bash
curl -s <storefrontUrl>
```

Check:
1. Response is 200 (not 404)
2. All distributed plugins appear in the `plugins` array
3. Versions match marketplace.json

Report result:
- **Valid**: "Storefront: `<url>` — all N distributed plugins listed"
- **404**: "Storefront: NOT FOUND — push a change to trigger the webhook"
- **Mismatches**: List missing or outdated entries

### Step 5: Present report

Format the script's check results as a readable status table:

```
Plugin Status
=============

analytics-pro (skillstacks-analytics-pro)
  Registration: OK
  Version: 2.0.0 (synced)
  License: subscription (correct)
  Creator contact: support@example.com (synced)

Storefront: https://store.skillstack.sh/s/.../marketplace.json
  All 1 distributed plugins listed with correct versions

Field separation: marketplace.json is clean

Overall: 1/1 plugins synced
```

### Step 6: Troubleshooting guidance

If any checks failed, provide specific guidance:

- **Not registered**: Check GitHub App install, push a commit, verify marketplace.json has `version` field
- **Version mismatch**: Push a commit or `git commit --allow-empty -m 'trigger webhook' && git push`
- **License mismatch**: Push to re-trigger webhook sync
- **Stale fields**: Run `/publish` to migrate automatically
- **Everything synced**: "All plugins are registered and up to date!"
