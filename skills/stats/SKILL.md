---
name: stats
description: View analytics for your SkillStack plugins — installs, active buyers, and free/paid split.
---

## View Creator Analytics

Shows aggregate analytics for your published SkillStack plugins using the `skillstack_creator_stats` MCP tool.

Authentication is handled automatically by your MCP connection to SkillStack. If you haven't signed in yet, you'll be prompted to authenticate via your browser.

### Step 1: Ask about filters

Ask the creator:

> "What time period do you want to see?"
>
> | Period | Description |
> |--------|-------------|
> | **7d** | Last 7 days |
> | **30d** | Last 30 days (default) |
> | **90d** | Last 90 days |
> | **all** | All time |
>
> "Want to filter to a specific plugin, or see all?"

If they want a specific plugin, ask for the slug (or show the list from `.skillstack-creator.json` / `skillstack_list`).

### Step 2: Fetch analytics

Call `skillstack_creator_stats` with:
- `period`: the selected period (default `"30d"`)
- `plugin_slug`: the specific plugin slug (omit for all plugins)

If the response contains `"error": "authentication_required"`, inform the creator:
> "You need to sign in to SkillStack to view analytics. The authentication prompt should appear in your browser automatically. If it doesn't, visit skillstack.sh to create an account."

### Step 3: Display results

**Metric definitions (use these EXACTLY when rendering):**
- **Active Buyers** = `active_buyers` — unique people who activated a license (from `user_tokens`). All paid by definition.
- **Total Installs** = `total_installs` — number of plugin downloads (counts events, not people)
- **Paid** = `paid_installs` — downloads by licensed users
- **Free** = `free_installs` — downloads by free-tier users

Format the response as a readable dashboard:

**If single plugin:**
```
Analytics for <plugin-name> (<period>)
======================================

  Active buyers:  <active_buyers>
  Installs:       <total_installs> (<paid_installs> paid, <free_installs> free)
  Update checks:  <update_checks>
```

**If multiple plugins:**
```
Analytics for your plugins (<period>)
=====================================

Summary:
  Active buyers:   <active_buyers>
  Total installs:  <total_installs> (<paid_installs> paid, <free_installs> free)
  Update checks:   <update_checks>

By plugin:
  <plugin-1-name>
    Active buyers: <active_buyers> | Installs: <total> (<paid> paid, <free> free)

  <plugin-2-name>
    Active buyers: <active_buyers> | Installs: <total> (<paid> paid, <free> free)
```

**Important:** Use `active_buyers` for the "Active Buyers" metric. Do NOT use `unique_buyers` or `activations` for this — those are different metrics kept for backward compatibility.

### Step 4: Offer next steps

After showing results:

> "Want to see a different time period, filter to a specific plugin, or anything else?"

If the creator has no plugins registered (empty results):
> "No analytics data found. Make sure you've published at least one plugin with `/publish` and that buyers have started installing."
