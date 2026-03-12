#!/usr/bin/env node

/**
 * read-plugin-state.mjs — Read all SkillStack creator plugin config from a repo
 *
 * Usage:
 *   node read-plugin-state.mjs [--repo-dir <path>]
 *
 * Output (JSON):
 *   {
 *     marketplace: { name, slug, plugins: { [name]: { version, source, ... } }, raw },
 *     skillstack: { storefront, plugins: { [name]: { ... } }, raw } | null,
 *     pluginJsonVersions: { [name]: { version, path } },
 *     git: { org, remote },
 *     storefrontUrl: string,
 *     connectedPlugins: string[],
 *     unconnectedPlugins: string[],
 *     staleFields: { topLevel: string[], perPlugin: { [name]: string[] } },
 *     skillDirs: { [pluginName]: string[] }
 *   }
 *
 * Reads marketplace.json, skillstack.json, plugin.json files, and git remote
 * to build a unified state object used by /publish and /verify skills.
 */

import fs from 'node:fs';
import path from 'node:path';

// Fields that belong in skillstack.json, NOT marketplace.json
const STALE_PLUGIN_FIELDS = [
  'license_provider', 'license_config', 'license_model', 'license_options',
  'free_skills', 'creator_contact', 'polar_org_id', 'polar_product_id',
];
const STALE_TOP_LEVEL_FIELDS = ['storefront_repo'];

/**
 * Slugify a marketplace name for storefront URLs.
 * "The AI Launchpad" → "the-ai-launchpad"
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Extract GitHub org/user from a remote URL.
 * Supports SSH (git@github.com:Org/repo.git) and HTTPS (https://github.com/Org/repo.git)
 */
function extractGitOrg(remoteUrl) {
  // SSH format: git@github.com:Org/repo.git
  const sshMatch = remoteUrl.match(/git@[^:]+:([^/]+)\//);
  if (sshMatch) return sshMatch[1];

  // HTTPS format: https://github.com/Org/repo.git
  const httpsMatch = remoteUrl.match(/https?:\/\/[^/]+\/([^/]+)\//);
  if (httpsMatch) return httpsMatch[1];

  return null;
}

/**
 * Read git remote origin URL from .git/config.
 * Returns { org, remote } or { org: null, remote: null }.
 */
function readGitRemote(repoDir) {
  const gitConfigPath = path.join(repoDir, '.git', 'config');
  if (!fs.existsSync(gitConfigPath)) {
    return { org: null, remote: null };
  }

  const content = fs.readFileSync(gitConfigPath, 'utf-8');
  const urlMatch = content.match(/url\s*=\s*(.+)/);
  if (!urlMatch) return { org: null, remote: null };

  const remote = urlMatch[1].trim();
  const org = extractGitOrg(remote);
  return { org, remote };
}

/**
 * Read the full plugin state from a repo directory.
 * Returns unified state object.
 */
export function readPluginState(repoDir) {
  const claudePlugin = path.join(repoDir, '.claude-plugin');

  // --- Read marketplace.json (required) ---
  const marketplacePath = path.join(claudePlugin, 'marketplace.json');
  if (!fs.existsSync(marketplacePath)) {
    throw new Error(`marketplace.json not found at ${marketplacePath}`);
  }
  const rawMarketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf-8'));

  // Build plugins map from array
  const pluginsMap = {};
  for (const plugin of rawMarketplace.plugins || []) {
    pluginsMap[plugin.name] = { ...plugin };
  }

  // --- Read git remote ---
  const git = readGitRemote(repoDir);

  // --- Derive marketplace slug ---
  let slug;
  if (rawMarketplace.name) {
    slug = slugify(rawMarketplace.name);
  } else {
    // Fallback: <org>-plugins
    slug = git.org ? `${git.org.toLowerCase()}-plugins` : 'unknown-plugins';
  }

  // --- Read skillstack.json (optional) ---
  const skillstackPath = path.join(claudePlugin, 'skillstack.json');
  let skillstack = null;
  if (fs.existsSync(skillstackPath)) {
    const raw = JSON.parse(fs.readFileSync(skillstackPath, 'utf-8'));
    skillstack = {
      storefront: raw.storefront || null,
      plugins: raw.plugins || {},
      raw,
    };
  }

  // --- Identify connected vs unconnected plugins ---
  const pluginNames = Object.keys(pluginsMap);
  const connectedPlugins = [];
  const unconnectedPlugins = [];

  for (const name of pluginNames) {
    if (skillstack && skillstack.plugins[name]) {
      connectedPlugins.push(name);
    } else {
      unconnectedPlugins.push(name);
    }
  }

  // --- Read plugin.json versions from source directories ---
  const pluginJsonVersions = {};
  for (const [name, plugin] of Object.entries(pluginsMap)) {
    if (!plugin.source) continue;
    const pluginJsonPath = path.join(repoDir, plugin.source, '.claude-plugin', 'plugin.json');
    if (fs.existsSync(pluginJsonPath)) {
      try {
        const pj = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
        pluginJsonVersions[name] = { version: pj.version, path: pluginJsonPath };
      } catch {
        // Skip unparseable plugin.json
      }
    }
  }

  // --- Detect stale SkillStack fields in marketplace.json ---
  const staleFields = { topLevel: [], perPlugin: {} };

  // Check top-level fields
  for (const field of STALE_TOP_LEVEL_FIELDS) {
    if (rawMarketplace[field] !== undefined) {
      staleFields.topLevel.push(field);
    }
  }

  // Check per-plugin fields
  for (const plugin of rawMarketplace.plugins || []) {
    const stale = [];
    for (const field of STALE_PLUGIN_FIELDS) {
      if (plugin[field] !== undefined) {
        stale.push(field);
      }
    }
    if (stale.length > 0) {
      staleFields.perPlugin[plugin.name] = stale;
    }
  }

  // --- Read skill directories for each plugin ---
  const skillDirs = {};
  for (const [name, plugin] of Object.entries(pluginsMap)) {
    if (!plugin.source) continue;
    const skillsPath = path.join(repoDir, plugin.source, 'skills');
    if (fs.existsSync(skillsPath)) {
      try {
        const entries = fs.readdirSync(skillsPath, { withFileTypes: true });
        const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
        if (dirs.length > 0) {
          skillDirs[name] = dirs;
        }
      } catch {
        // Skip unreadable skills directory
      }
    }
  }

  // --- Derive storefront URL ---
  const storefrontUrl = git.org
    ? `https://store.skillstack.sh/s/${git.org}/${slug}/marketplace.json`
    : null;

  return {
    marketplace: {
      name: rawMarketplace.name || null,
      slug,
      plugins: pluginsMap,
      raw: rawMarketplace,
    },
    skillstack,
    pluginJsonVersions,
    git,
    storefrontUrl,
    connectedPlugins,
    unconnectedPlugins,
    staleFields,
    skillDirs,
  };
}

// --- CLI Entry Point ---

const isDirectExecution = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectExecution) {
  const args = process.argv.slice(2);

  let repoDir = process.cwd();
  const dirIdx = args.indexOf('--repo-dir');
  if (dirIdx !== -1 && args[dirIdx + 1]) {
    repoDir = args[dirIdx + 1];
  }

  try {
    const state = readPluginState(repoDir);
    console.log(JSON.stringify(state, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}
