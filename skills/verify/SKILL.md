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

### Step 3.5: Validate binding config against the worker

Run the same canonicalization the server applies at ingestion, so a binding
problem that would block activation is caught here rather than after a push:

```bash
node <this-skill-dir>/../../scripts/validate-config.mjs --repo-dir <repo-root>
```

Output: `{ valid, plugins: [{ name, valid, errors: [{ field, message }] }], summary }`.
Report any `valid: false` plugin's errors alongside the Step 3 checks — each names
the offending field and the exact fix. If the result is `endpointError: true` (exit
1), the endpoint was reachable but errored (or a local read failed) — surface the
`error` and flag that validation did not run. If the result is `unavailable: true`
(exit 3), the endpoint was genuinely unreachable — note that the binding check could
not run and continue (the webhook is the backstop).

### Step 3.6: Migrate to the canonical config (if needed)

The `/validate` result (Step 3.5) carries everything needed to **fix** a config,
not just diagnose it. Each plugin entry has `valid`, `errors[]` (field + exact
fix), and `canonical` — the corrected authoring config to write verbatim
(`null` when the plugin is free or still invalid). Offer to migrate when any
plugin is invalid, or when a valid plugin's `canonical` differs from what's
currently in `skillstack.json`. This is how a creator with a legacy/broken
config gets to "just works" without hand-editing.

For each plugin:

1. **Invalid (`valid: false`)** — `canonical` is `null`; the errors tell you the
   fix. Two kinds:
   - **Mechanical** (the value exists, just in the wrong place/field): apply it.
   - **Needs a value only the creator has** (e.g. *"Polar plugins bind on
     benefit_id, not product_id — replace it"*, or a missing `product_id`): ask
     the creator for exactly that value, with where to find it (Polar: Products →
     Benefits → the License Key benefit id; Lemon Squeezy: Products → the product
     id). Don't guess.
   Then write the corrected config (Step 5 of `/publish`'s write script):
   ```bash
   echo '<corrected-config-json>' | node <this-skill-dir>/../../scripts/write-skillstack-json.mjs --repo-dir <repo-root>
   ```
2. **Valid but drifted** (`canonical` ≠ current `skillstack.json` entry) — write
   `canonical` verbatim via the same script. For an already-clean config this is a
   no-op (canonical round-trips to itself), so only real drift changes anything.
3. **Free / already canonical** — nothing to do.

After writing, **re-run Step 3.5** (`validate-config.mjs`) and confirm every
plugin is now `valid: true`. Then:

4. **Buyer-safety gate before re-publishing.** For any paid plugin, confirm the
   corrected config is still paid with a real binding (the re-validated result is
   `valid` and its `canonical` is non-null) — a migration must never turn a paid
   plugin free. If it would, stop and surface why.
5. Ask permission, then commit + push `.claude-plugin/skillstack.json` (+ the
   cleaned `marketplace.json`) — this re-publishes through the normal webhook.
6. **Confirm the push took effect (no silent skip).** Wait ~5s, call
   `skillstack_creator_stats`, and check each migrated plugin: `last_sync_warning`
   must be **null** and `license_model` must match the intended paid model. A
   non-null warning means the sync skipped the plugin — show it and iterate.

Buyers do nothing: existing licenses keep working (identity is stable across the
edit) and the corrected binding resolves going forward.

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

Storefront: https://store.skillstack.sh/s/{owner}/{marketplace_slug}/marketplace.json
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
