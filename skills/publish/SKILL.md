---
name: publish
description: Use when a creator wants to distribute their Claude Code plugin on SkillStack, add another plugin, or reconfigure licensing for an existing plugin.
---

## Publish Plugin on SkillStack

Connects an existing Claude Code plugin to SkillStack for distribution. Creates a `.claude-plugin/skillstack.json` sidecar file with licensing config. Run again to add more plugins or reconfigure.

**Prerequisites:** Creator has a private GitHub repo with `.claude-plugin/marketplace.json` and plugins defined with `name`, `source`, `description`, and `version` fields.

### Step 1: Read existing state

Run the state reader script:

```bash
node <this-skill-dir>/../../scripts/read-plugin-state.mjs --repo-dir <repo-root>
```

Output: JSON with `marketplace`, `skillstack`, `connectedPlugins`, `unconnectedPlugins`, `storefrontUrl`, `git`.

If marketplace.json doesn't exist, stop — the creator needs a plugin set up first.

Show which plugins are connected vs not:
```
Plugins in this repo:
  1. linear-pm — v1.0.0 (already on SkillStack, subscription)
  2. code-reviewer — v2.1.0 (not on SkillStack)
```

If any plugins are already connected, offer:
1. **Add new plugins** — proceed to Step 2 with unconnected list (skip if none unconnected)
2. **Reconfigure licensing** — select which connected plugin to update, proceed to Step 2
3. **Run /verify** — check sync status
4. **Nothing** — done

### Step 2: Select plugins to distribute

Ask which unconnected plugins to add, or which connected plugin to reconfigure (based on choice from Step 1). For each selected plugin, proceed through Steps 3-5.

### Step 3: Determine pricing model

Ask: **Free or paid?**
- **Free** — skip to Step 6 (no skillstack.json entry needed)
- **Paid** — continue

### Step 4: Configure paid plugin

#### 4a: Payment provider
Ask: **Polar** or **Lemon Squeezy?**

#### 4b: License type
Ask: **Single license type, or multiple?**

**Single:** Choose `subscription`, `onetime`, or `lifetime`.
**Multi-license:** Select at least 2 types. Each needs a separate product/benefit in the payment provider.

#### 4c: Collect provider IDs

> **Canonical home:** the *binding id* is what a buyer's key resolves on —
> **`benefit_id` for Polar, `product_id` for Lemon Squeezy**. For a SINGLE-license
> plugin it goes in `license_config` alongside the account id (the worker relocates
> it into the license tier automatically). For MULTI-license it goes per tier in
> `license_options`. `license_config` otherwise holds only the account id
> (`org_id` / `store_id`).

**Polar (all configs):**
- **Organization ID** (UUID) — Settings → General
- Validate UUID format (8-4-4-4-12 hex)

**Polar single license:**
- **Benefit ID** (UUID, optionally `ben_` prefix) — Products → click product →
  Benefits → the **License Key** benefit. Polar binds keys on the **benefit**, not
  the product, so this is required for a buyer's key to resolve. (Do NOT use the
  product id — a Polar plugin bound only on a product_id is unresolvable and the
  worker will reject it.)

**Polar multi-license:**
- **Benefit ID** (UUID, optionally `ben_` prefix) per license type — one distinct
  License Key benefit per product/tier — Products → Benefits

**Lemon Squeezy (all configs):**
- **Store ID** (numeric, stored as string in JSON — e.g. `"306756"`) — Settings → General
- Confirm license key generation enabled

**Lemon Squeezy single:**
- **Product ID** (**required** for paid, numeric, stored as string) — Products →
  URL. A buyer's key resolves on the product, so a paid LS plugin without it is
  unresolvable and the worker will reject it.

**Lemon Squeezy multi-license:**
- **Product ID** (required, numeric, stored as string) per license type

#### License key binding (v0.12.0+)
> **Each license key can only be activated for one plugin.** If a creator distributes multiple plugins, buyers need separate license keys for each. For Polar creators with multiple products in one org, each product's license keys bind to their respective plugin on first activation.

#### 4d: Free tier (optional)
Ask if they want some skills free (freemium). If yes:
1. List all skill directories from `skills/`
2. Let them select which to offer free
3. Warn if all skills selected as free
4. Confirm the free/premium split

#### 4e: Creator contact (optional)
Ask for a support email or URL for buyer-facing error messages. Validate format (contains `@` or starts with `http`).

### Step 5: Write config

Build the config object from Steps 3-4 and pass to the write script:

```bash
echo '<config-json>' | node <this-skill-dir>/../../scripts/write-skillstack-json.mjs --repo-dir <repo-root>
```

Config format — **single license** (binding id goes in `license_config`):
```json
{
  "storefront": "<storefrontUrl from Step 1>",
  "plugins": {
    "<plugin-name>": {
      "license_provider": "<polar|lemonsqueezy>",
      "license_config": {
        "org_id": "<polar org uuid>",        // Polar: org_id + benefit_id
        "benefit_id": "<polar benefit uuid>",
        "store_id": "<ls store id>",          // OR Lemon Squeezy: store_id + product_id
        "product_id": "<ls product id>"
      },
      "license_model": "<subscription|onetime|lifetime>",
      "free_skills": ["..."],
      "creator_contact": "..."
    }
  }
}
```
(Include only the fields for your provider — Polar: `org_id` + `benefit_id`; Lemon Squeezy: `store_id` + `product_id`.)

For **multi-license**, use `license_options` instead of `license_model` (binding id per tier; `license_config` holds only the account id). Keep `license_provider` set, same as the single-license example.

**Polar** (`license_config: { org_id }` + per-tier `benefit_id`):
```json
{
  "license_provider": "polar",
  "license_config": { "org_id": "<polar org uuid>" },
  "license_options": {
    "onetime": { "benefit_id": "..." },
    "lifetime": { "benefit_id": "..." }
  }
}
```

**Lemon Squeezy** (`license_config: { store_id }` + per-tier `product_id`):
```json
{
  "license_provider": "lemonsqueezy",
  "license_config": { "store_id": "<ls store id>" },
  "license_options": {
    "onetime": { "product_id": "..." },
    "lifetime": { "product_id": "..." }
  }
}
```

The script handles:
- Merging with existing skillstack.json (preserves other plugins)
- Input validation (UUID format, license types, creator_contact format)
- Cleaning stale SkillStack fields from marketplace.json
- Returns `{ success, skillstackJson, cleanedFields, validationErrors, changes }`

If validation fails, show errors and ask the creator to correct. If fields were cleaned, show what was removed.

### Step 5.5: Pre-publish binding validation

Before pushing, validate the binding configuration against the worker — the same
canonicalization that runs at ingestion. This catches an unresolvable or colliding
license config now, on the creator's machine, instead of letting a plugin sync that
a buyer could never activate.

```bash
node <this-skill-dir>/../../scripts/validate-config.mjs --repo-dir <repo-root>
```

Output: `{ valid, plugins: [{ name, valid, errors: [{ field, message }] }], summary }`.

- **`valid: true`** (exit 0) — proceed to Step 6.
- **`valid: false`** (exit 2) — for each invalid plugin, show its errors. Each error
  names the offending field and the exact fix. Apply the fix by returning to Step 4
  (re-collect the affected IDs) and re-running Step 5, then re-validate. Do not push
  until validation passes.
- **`endpointError: true`** (exit 1) — the endpoint was reachable but returned an
  error (e.g. a 4xx/5xx), or a local read failed. Validation did **not** complete,
  so this is **not** the backstop case — surface the `error` message and do not push
  until it's resolved.
- **`unavailable: true`** (exit 3) — the endpoint was genuinely unreachable (network
  failure); validation could not run. Note this to the creator and proceed — the
  webhook re-runs the identical check at ingestion, so it remains the backstop.

### Step 6: Install GitHub App

> Install the **SkillStack Distribution** GitHub App on this repo. This gives SkillStack **read-only** access to fetch your plugin code and delivers it to buyers.
>
> Install link: **https://github.com/apps/skillstack-distribution**

Walk through installation if needed:
1. Open the link → Click "Install" (or "Configure" if already installed)
2. Grant access to this repository
3. Confirm

### Step 7: Commit and push

Ask for permission, then:

```bash
git add .claude-plugin/skillstack.json .claude-plugin/marketplace.json
git commit -m "feat: connect <plugin-name> to SkillStack distribution"
git push
```

Explain: pushing triggers a webhook that registers the plugin with SkillStack.

### Step 8: Verify registration (and confirm no silent downgrade)

Wait ~5 seconds, then call `skillstack_list`. Check each plugin appears with correct slug, version, and license model.

- If the `skillstack_list` call itself errors (parse its `status`/error — it's structured): it's a SkillStack-side or auth issue, not a config problem. Retry once; if it persists, note it and tell the creator to re-run `/verify` shortly — the push may still have registered.
- If a plugin is **missing**: check GitHub App install, that the push went through, and that the `version` field exists.

Then confirm the push actually synced before judging it. **Poll** `skillstack_creator_stats` (retry every few seconds, up to a ~30s cap) until the published plugin's row shows `latest_version` **equal to the version you just pushed** (read that version from `plugin.json` / `marketplace.json`). Only a row at the just-pushed version is "fresh" — a slow or never-fired webhook otherwise leaves the PRIOR row (stale version, null warning, old model), which would read as a false success, and a brand-new plugin's row is absent entirely.

- **Row still shows the OLD version (or the plugin is absent) after the ~30s cap** → the push has **not synced yet**. Do NOT report success. Tell the creator to check: the SkillStack Distribution GitHub App is installed on this repo, the push reached a tracked ref (default branch), and the webhook delivered. Re-run `/verify` once the webhook lands.

Once the row is fresh, inspect that plugin's `license_model` and `last_sync_warning`:
- **`last_sync_warning` is non-null** → the last push **skipped** this plugin (its binding didn't take effect). Show the warning verbatim — it names the offending field + fix. Return to Step 4/5 to correct, re-run Step 5.5 validation, and re-push. Do NOT report success.
- **`license_model` is `free` but the creator configured it as paid** → a silent downgrade. Treat the same as a skip: surface it, fix, re-validate, re-push.
- Only when the fresh row shows the intended `license_model` and a null `last_sync_warning` is the publish actually confirmed.

### Step 9: Print summary

```
SkillStack setup complete!

Distributed plugins:
  - <name> → <slug> (v<version>, <license-type>[, N free / M total skills])

Storefront: <storefrontUrl>

Quick start for buyers:
  /plugin marketplace add https://github.com/SkillStacks/skillstack.git
  /plugin install skillstack@skillstack-marketplace
  # Restart Claude Code, then:
  /activate-license

Your storefront URL is saved in .claude-plugin/skillstack.json.

How updates work:
- Develop normally, bump version in marketplace.json and push — SkillStack auto-delivers to buyers
- Run /publish again to connect more plugins
- Run /verify for diagnostics

Creator dashboard: https://skillstack.sh/dashboard
```
