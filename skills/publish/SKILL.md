---
name: publish
description: Use when a creator wants to publish their Claude Code plugin on SkillStack for distribution or add another plugin to an existing SkillStack setup.
---

## Publish Plugin on SkillStack

Publishes an existing Claude Code plugin to SkillStack for distribution. The creator already has a working plugin in a private GitHub repo with a `.claude-plugin/marketplace.json` — this skill connects it to SkillStack so buyers can install it. Run again to add more plugins.

**Prerequisites:**
- Creator has a private GitHub repo with `.claude-plugin/marketplace.json` and plugins defined
- Plugins have `name`, `source`, `description`, and `version` fields

### Step 1: Read existing marketplace

Read `.claude-plugin/marketplace.json` from the current repo.

If it doesn't exist, stop and tell the creator:
> "This repo doesn't have a `.claude-plugin/marketplace.json`. SkillStack distributes existing Claude Code plugins — you need a plugin marketplace set up first. See the Claude Code docs on creating plugins."

Also check if `.skillstack-creator.json` exists (indicates a prior publish). If it does, show which plugins are already connected to SkillStack and which are not:

```
Plugins in this repo:
  1. linear-pm — v1.0.0 (already on SkillStack, subscription)
  2. code-reviewer — v2.1.0 (not on SkillStack)
  3. test-runner — v1.0.0 (not on SkillStack)
```

If all plugins are already connected, tell the creator everything is set up and suggest running **verify** if they're having issues.

### Step 2: Select plugins to distribute

Ask the creator: **Which plugins do you want to distribute on SkillStack?**

Only show plugins that aren't already connected. They can select one, multiple, or all. For each selected plugin, proceed through Steps 3-4.

### Step 3: Determine pricing model

For each selected plugin, ask: **Is this a free or paid plugin?**

- **Free** — no additional config needed. Skip to Step 5.
- **Paid** — proceed to Step 3b, then Step 4.

### Step 3b: Choose payment provider

Ask: **Which payment provider are you using?**

- **Polar** — polar.sh
- **Lemon Squeezy** — lemonsqueezy.com
- **Free** — no payment provider (go back to free path)

### Step 4: Configure paid plugin

Ask: **What license model?**

- `subscription` — buyer pays recurring, loses access if cancelled
- `onetime` — buyer pays once, gets version at time of purchase (no future updates)
- `lifetime` — buyer pays once, gets all future updates included

Then gather provider-specific IDs from the creator.

#### Polar path

The Polar API requires authentication, so all IDs must be copied manually from the dashboard.

Ask the creator for these two values:

1. **Polar Organization ID** (UUID format):
   > Go to **polar.sh → Settings → General**. The Organization ID is displayed on that page.
   > Example: `0c504f49-dbdd-496a-8a36-72ce2a94d97f`

2. **Polar Product ID** (UUID format):
   > Go to **polar.sh → Products → click the product for this plugin**. The Product ID is in the URL: `polar.sh/products/<product-id>`.

Validate both are UUID format (8-4-4-4-12 hex pattern). If not, ask the creator to double-check.

3. **Confirm License Key benefit exists.** Ask the creator:
   > "Does this product have a **License Key** benefit configured? SkillStack uses license keys for access control. You can check at polar.sh → Products → your product → Benefits."

   If no license key benefit exists:
   > "Add a License Key benefit to this product in Polar before continuing. See the SkillStack Creator Guide for setup details."

Store for marketplace.json: `license_provider: "polar"` and `license_config: { "org_id": "<uuid>", "product_id": "<uuid>" }`.

#### Lemon Squeezy path

Ask the creator for:

1. **Store ID** (integer):
   > Go to **app.lemonsqueezy.com → Settings → General**. The Store ID is displayed on that page.

2. **Product ID** (optional, integer):
   > Go to **app.lemonsqueezy.com → Products → click the product**. The Product ID is in the URL.
   > This is optional but recommended for cross-product verification.

3. **Confirm License Key is enabled.** Ask the creator:
   > "Is your Lemon Squeezy product configured to generate license keys? Check at Products → your product → License keys."

Store for marketplace.json: `license_provider: "lemonsqueezy"` and `license_config: { "store_id": "<id>" }` (add `"product_id": "<id>"` if provided).

### Step 4b: Configure free tier (optional)

After configuring the license model for a paid plugin, ask:

> "Would you like to offer some skills for free? This lets buyers try your plugin before purchasing — a proven way to increase conversions.
>
> Recommended: pick 2-4 skills that showcase your plugin's value without giving away the core."

If the creator says **no**: Skip this step. No `free_skills` field will be added. The plugin will be pure paid.

If the creator says **yes**:

1. List all skill directories in the plugin's `skills/` folder:
   ```
   Your plugin has [N] skills:
     1. write-note
     2. hook
     3. title
     4. plan-video
     ...

   Which skills should be free? (enter numbers, e.g., "1, 2, 3")
   ```

2. Confirm their selection:
   ```
   Free tier will include: write-note, hook, title
   Premium (requires license): plan-video, thumbnail, +[N] more

   Look good?
   ```

3. If confirmed, store the selection for Step 5.

4. If all skills are selected as free, warn:
   > "You've selected all skills as free — this means the free and paid versions would be identical. Consider keeping at least a few skills premium, or removing the license requirement entirely."

### Step 5: Update source marketplace.json

Add SkillStack-specific fields to the selected plugins in the existing `.claude-plugin/marketplace.json`. **Do NOT modify any existing fields** — only add new ones.

**For free plugins:** No changes needed. The existing entry works as-is.

**For paid plugins, add these fields to the plugin entry:**
```json
{
  "license_provider": "<polar|lemonsqueezy>",
  "license_config": { "org_id": "...", "product_id": "..." },
  "license_model": "<subscription|onetime|lifetime>"
}
```

The `license_config` keys depend on the provider:
- **Polar:** `{ "org_id": "<uuid>", "product_id": "<uuid>" }`
- **Lemon Squeezy:** `{ "store_id": "<id>" }` (optionally include `"product_id": "<id>"`)

**For freemium plugins (paid with a free tier), also add:**
```json
{
  "free_skills": ["write-note", "hook", "title"]
}
```

The `free_skills` array contains the exact skill directory names from `skills/`. SkillStack validates these against actual directories during webhook sync — typos are silently dropped, but the `/verify` skill will flag them.

Preserve all existing fields, formatting, and order. The result should look like the creator's original entry plus the provider fields appended.

**Backward compatibility:** Old format with `polar_org_id`/`polar_product_id` at the top level still works — the webhook handles both formats.

### Step 6: Install GitHub App

Tell the creator:

> "Install the SkillStack Distribution GitHub App on this repo. This enables automatic registration when you push updates."
>
> Install link: **https://github.com/apps/skillstack-distribution**

Ask the creator to confirm. Offer these options:

1. **Yes, just installed it** — proceed to Step 7.
2. **Already installed** (for this or another repo) — confirm it covers THIS repo, then proceed.
3. **I need help installing it** — walk them through the process:
   > 1. Open **https://github.com/apps/skillstack-distribution** in your browser
   > 2. Click **"Install"** (or "Configure" if already installed on your account)
   > 3. Choose whether to grant access to **all repositories** or **only select repositories**
   > 4. If selecting specific repos, find and check **this repository** (`<repo-name>`)
   > 5. Click **"Install"** to confirm
   >
   > Once done, let me know and I'll continue with the setup.

After the creator confirms installation, proceed to Step 7.

### Step 7: Create storefront repo

The storefront is a separate PUBLIC repo that buyers use to discover plugins. It contains only npm pointers — no source code, no pricing config.

1. Derive the GitHub org from `git remote get-url origin` (extract the org/user from the URL).

2. Ask the creator what they want to name their storefront repo (suggest `<org>-skillstack-storefront`).

3. Create it:
```bash
gh repo create <org>/<storefront-name> --public --description "SkillStack plugins by <owner>" --clone
```

4. Generate the storefront `marketplace.json` in `.claude-plugin/marketplace.json`:
```json
{
  "name": "<storefront-name>",
  "description": "SkillStack plugins by <owner>",
  "owner": {
    "name": "<owner-name>"
  },
  "plugins": [
    {
      "name": "skillstack",
      "description": "Install, update, and manage paid Claude Code plugins via SkillStack.",
      "source": { "source": "url", "url": "https://github.com/SkillStacks/skillstack.git" }
    },
    {
      "name": "<plugin-name>",
      "description": "<description>",
      "source": {
        "source": "npm",
        "package": "@skillstack/<org>-<plugin-name>",
        "registry": "https://skillstack-mcp.kennyliao22.workers.dev"
      }
    }
  ]
}
```

**IMPORTANT:** The SkillStack plugin entry (GitHub source) MUST always be included as the first plugin. This enables buyers to install the SkillStack plugin for free (from GitHub) before setting up npm auth for paid plugins.

Only include plugins the creator selected for SkillStack distribution in Step 2.

**Critical format rules:**
- `plugins` MUST be an **array** (not an object)
- `source` MUST be a **nested object** with `"source": "npm"` and `"package"` fields
- The package name uses the namespaced slug: `@skillstack/<org>-<plugin-name>`
- Do NOT include `version`, `polar_*`, `license_model`, `author`, `category`, or `tags` in the storefront — those belong only in the source repo

5. Write the file, commit, and push:
```bash
cd <storefront-path>
mkdir -p .claude-plugin
# write marketplace.json
git add .claude-plugin/marketplace.json
git commit -m "init: add SkillStack storefront"
git push -u origin main
```

### Step 8: Write creator config

Create `.skillstack-creator.json` in the source repo root:

```json
{
  "storefront_repo": "<org>/<storefront-name>",
  "storefront_local_path": "<relative-or-absolute-path-to-cloned-storefront>",
  "org": "<org>"
}
```

This persists across sessions so other skills (publish, sync-storefront) know where to find things.

### Step 9: Commit and push source repo

Stage and commit the source repo changes:

```bash
git add .claude-plugin/marketplace.json .skillstack-creator.json
git commit -m "feat: connect to SkillStack distribution"
git push
```

### Step 10: Verify registration

Wait ~5 seconds for the webhook to fire, then call the `skillstack_list` MCP tool.

Check that each distributed plugin appears with:
- Correct slug (`<org>-<plugin-name>`)
- Correct version
- Correct license model

If a plugin doesn't appear:
- Check that the GitHub App is installed on this repo
- Check that the push went through
- Verify the plugin has a `version` field — without it, the plugin won't register
- Try pushing an empty commit to re-trigger the webhook

### Step 11: Print summary

Show the creator:

```
SkillStack setup complete!

Distributed plugins:
  - <plugin-name> → <org>-<plugin-name> (v<version>, <free|subscription|onetime|lifetime>[, N free / M total skills])

Source repo: <source-repo-url>
Storefront: <storefront-repo-url>

Buyers can add your marketplace with:
  /plugin marketplace add https://github.com/<org>/<storefront-name>

How it works from here:
- Just develop normally — commit and push as usual
- When you bump the version in marketplace.json, SkillStack automatically picks it up
- The plugin will remind you if you forget to bump the version after changing plugin code
- To connect another plugin later: run "publish" again
- If something's not working: run the "verify" skill
```
