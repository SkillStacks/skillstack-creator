---
name: stats
description: Use when a creator wants to view install analytics, active buyers, or free/paid split for their SkillStack plugins.
---

## View Creator Analytics

Shows aggregate analytics for published SkillStack plugins using the `skillstack_creator_stats` MCP tool. Authentication is handled automatically by the MCP connection.

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

If they want a specific plugin, ask for the slug (or show the list from `skillstack_list`).

### Step 2: Fetch analytics

Call `skillstack_creator_stats` with:
- `period`: the selected period (default `"30d"`)
- `plugin_slug`: the specific plugin slug (omit for all plugins)

If the response contains `"error": "authentication_required"`, inform the creator:
> "You need to sign in to SkillStack. The authentication prompt should appear in your browser automatically. If it doesn't, visit skillstack.sh to create an account."

### Step 3: Display results

**Metric definitions (use these EXACTLY):**
- **Active Buyers** = `active_buyers` — unique people who activated a license (all paid by definition)
- **Total Installs** = `total_installs` — number of downloads (counts events, not people)
- **Paid** = `paid_installs` — downloads by licensed users
- **Free** = `free_installs` — downloads by free-tier users

**Important:** Use `active_buyers` for the "Active Buyers" metric. Do NOT use `unique_buyers` or `activations`.

**Single plugin format:**
```
Analytics for <plugin-name> (<period>)
======================================
  Active buyers:  <active_buyers>
  Installs:       <total_installs> (<paid_installs> paid, <free_installs> free)
  Update checks:  <update_checks>
```

**Multiple plugins format:**
```
Analytics for your plugins (<period>)
=====================================
Summary:
  Active buyers:   <active_buyers>
  Total installs:  <total_installs> (<paid_installs> paid, <free_installs> free)
  Update checks:   <update_checks>

By plugin:
  <plugin-1-name>
    Active buyers: <n> | Installs: <n> (<n> paid, <n> free)
```

### Step 4: Offer next steps

After showing results:
> "Want to see a different time period, filter to a specific plugin, or anything else?"

If no data: "No analytics data found. Make sure you've published at least one plugin with `/publish` and that buyers have started installing."
