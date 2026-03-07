---
name: stats
description: View analytics for your SkillStack plugins — installs, activations, unique buyers, and free/paid split.
---

## View Creator Analytics

Shows aggregate analytics for your published SkillStack plugins using the `skillstack_creator_stats` MCP tool.

### Step 1: Determine github_owner

Read `.skillstack-creator.json` from the current repo to get the `org` field — this is your `github_owner` used for analytics queries.

If `.skillstack-creator.json` doesn't exist, derive it from `git remote get-url origin` (extract the org/user from the URL). Confirm with the creator before proceeding.

### Step 2: Ask about filters

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

### Step 3: Fetch analytics

Call `skillstack_creator_stats` with:
- `github_owner`: the org from Step 1
- `period`: the selected period (default `"30d"`)
- `plugin_slug`: the specific plugin slug (omit for all plugins)

### Step 4: Display results

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
Analytics for <github_owner> (<period>)
=======================================

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

### Step 5: Offer next steps

After showing results:

> "Want to see a different time period, filter to a specific plugin, or anything else?"

If the creator has no plugins registered (empty results):
> "No analytics data found for **<github_owner>**. Make sure you've published at least one plugin with `/publish` and that buyers have started installing."
