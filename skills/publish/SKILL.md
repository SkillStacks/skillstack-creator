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

**Polar (all configs):**
- **Organization ID** (UUID) — Settings → General
- Validate UUID format (8-4-4-4-12 hex)

**Polar single license:**
- **Product ID** (UUID) — Products → click product → URL
- Confirm License Key benefit exists

**Polar multi-license:**
- **Benefit ID** (UUID, `ben_*` prefix) per license type — Products → Benefits

**Lemon Squeezy (all configs):**
- **Store ID** (integer) — Settings → General
- Confirm license key generation enabled

**Lemon Squeezy single:**
- **Product ID** (optional integer) — Products → URL

**Lemon Squeezy multi-license:**
- **Product ID** (required integer) per license type

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

Config format:
```json
{
  "storefront": "<storefrontUrl from Step 1>",
  "plugins": {
    "<plugin-name>": {
      "license_provider": "<polar|lemonsqueezy>",
      "license_config": { ... },
      "license_model": "<type>",
      "free_skills": ["..."],
      "creator_contact": "..."
    }
  }
}
```

For multi-license, use `license_options` instead of `license_model`:
```json
{
  "license_options": {
    "onetime": { "benefit_id": "..." },
    "lifetime": { "benefit_id": "..." }
  }
}
```

The script handles:
- Merging with existing skillstack.json (preserves other plugins)
- Input validation (UUID format, license types, creator_contact format)
- Cleaning stale SkillStack fields from marketplace.json
- Returns `{ success, skillstackJson, cleanedFields, validationErrors, changes }`

If validation fails, show errors and ask the creator to correct. If fields were cleaned, show what was removed.

### Step 6: Install GitHub App

> Install the **SkillStack Distribution** GitHub App on this repo. This gives SkillStack read access to fetch your plugin code and delivers it to buyers.
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

### Step 8: Verify registration

Wait ~5 seconds, then call `skillstack_list` MCP tool. Check each plugin appears with correct slug, version, and license model.

If missing: check GitHub App install, push went through, and `version` field exists.

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
