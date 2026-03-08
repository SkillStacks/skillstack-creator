---
name: stats
description: View analytics for your SkillStack plugins — installs, activations, unique buyers, and free/paid split.
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

Format the response as a readable summary:

**If single plugin:**
```
Analytics for <plugin-name> (<period>)
======================================

  Installs:       <total_installs> (<paid_installs> paid, <free_installs> free)
  Unique buyers:  <unique_buyers>
  Activations:    <activations>
  Update checks:  <update_checks>
```

**If multiple plugins:**
```
Analytics for your plugins (<period>)
=====================================

Summary:
  Total installs:  <total_installs> (<paid_installs> paid, <free_installs> free)
  Unique buyers:   <unique_buyers>
  Activations:     <activations>
  Update checks:   <update_checks>

By plugin:
  <plugin-1-name>
    Installs: <total> (<paid> paid, <free> free) | Buyers: <unique> | Activations: <act>

  <plugin-2-name>
    Installs: <total> (<paid> paid, <free> free) | Buyers: <unique> | Activations: <act>
```

### Step 4: Offer next steps

After showing results:

> "Want to see a different time period, filter to a specific plugin, or anything else?"

If the creator has no plugins registered (empty results):
> "No analytics data found. Make sure you've published at least one plugin with `/publish` and that buyers have started installing."
