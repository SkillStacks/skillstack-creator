#!/usr/bin/env node

/**
 * write-skillstack-json.mjs — Write/merge skillstack.json and clean marketplace.json
 *
 * Usage:
 *   echo '<config-json>' | node write-skillstack-json.mjs --repo-dir <path>
 *
 * Config JSON input:
 *   {
 *     storefront: "https://store.skillstack.sh/s/...",
 *     plugins: {
 *       "my-plugin": {
 *         license_provider: "polar" | "lemonsqueezy",
 *         license_config: { org_id?, product_id?, store_id? },
 *         license_model?: "subscription" | "onetime" | "lifetime",
 *         license_options?: { [type]: { benefit_id? | product_id? } },
 *         free_skills?: string[],
 *         creator_contact?: string
 *       }
 *     }
 *   }
 *
 * Output (JSON):
 *   {
 *     success: boolean,
 *     skillstackJson: object,       // what was written
 *     cleanedFields: { topLevel: string[], perPlugin: { [name]: string[] } },
 *     validationErrors: string[],   // only if success is false
 *     changes: string[]             // human-readable summary
 *   }
 *
 * Validates inputs (UUID formats, license types, etc.) and refuses to write
 * if validation fails. Merges with existing skillstack.json if present.
 * Cleans stale SkillStack fields from marketplace.json.
 */

import fs from 'node:fs';
import path from 'node:path';

// Fields to strip from marketplace.json
const STALE_PLUGIN_FIELDS = [
  'license_provider', 'license_config', 'license_model', 'license_options',
  'free_skills', 'creator_contact', 'polar_org_id', 'polar_product_id',
];
const STALE_TOP_LEVEL_FIELDS = ['storefront_repo'];

const VALID_LICENSE_TYPES = ['subscription', 'onetime', 'lifetime'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BEN_UUID_REGEX = /^ben_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate the config for a single plugin.
 * Returns an array of error strings (empty = valid).
 */
function validatePluginConfig(name, config) {
  const errors = [];

  // License provider required for paid plugins
  if (!config.license_provider) {
    errors.push(`${name}: missing license_provider`);
    return errors; // Can't validate further without provider
  }

  if (!['polar', 'lemonsqueezy'].includes(config.license_provider)) {
    errors.push(`${name}: invalid license_provider "${config.license_provider}" (must be "polar" or "lemonsqueezy")`);
  }

  // Mutual exclusivity
  if (config.license_model && config.license_options) {
    errors.push(`${name}: cannot have both license_model and license_options — use one or the other`);
  }

  // license_model validation
  if (config.license_model) {
    if (!VALID_LICENSE_TYPES.includes(config.license_model)) {
      errors.push(`${name}: invalid license_model "${config.license_model}" (must be ${VALID_LICENSE_TYPES.join(', ')})`);
    }
  }

  // license_options validation
  if (config.license_options) {
    const types = Object.keys(config.license_options);
    if (types.length < 2) {
      errors.push(`${name}: license_options must have at least 2 types (got ${types.length})`);
    }
    for (const type of types) {
      if (!VALID_LICENSE_TYPES.includes(type)) {
        errors.push(`${name}: invalid license type "${type}" in license_options`);
      }
    }
  }

  // Provider-specific validation
  if (config.license_provider === 'polar') {
    validatePolarConfig(name, config, errors);
  } else if (config.license_provider === 'lemonsqueezy') {
    validateLemonSqueezyConfig(name, config, errors);
  }

  // creator_contact validation
  if (config.creator_contact) {
    const cc = config.creator_contact;
    const isEmail = cc.includes('@');
    const isUrl = cc.startsWith('http://') || cc.startsWith('https://');
    if (!isEmail && !isUrl) {
      errors.push(`${name}: creator_contact must be an email (contains @) or URL (starts with http) — got "${cc}"`);
    }
  }

  return errors;
}

function validatePolarConfig(name, config, errors) {
  const lc = config.license_config || {};

  // org_id required
  if (!lc.org_id) {
    errors.push(`${name}: Polar requires org_id in license_config`);
  } else if (!UUID_REGEX.test(lc.org_id)) {
    errors.push(`${name}: Polar org_id must be UUID format (got "${lc.org_id}")`);
  }

  // product_id optional but must be UUID if present
  if (lc.product_id && !UUID_REGEX.test(lc.product_id)) {
    errors.push(`${name}: Polar product_id must be UUID format (got "${lc.product_id}")`);
  }

  // Multi-license: validate benefit_ids
  if (config.license_options) {
    for (const [type, opts] of Object.entries(config.license_options)) {
      if (opts.benefit_id) {
        const isUuid = UUID_REGEX.test(opts.benefit_id);
        const isBenUuid = BEN_UUID_REGEX.test(opts.benefit_id);
        if (!isUuid && !isBenUuid) {
          errors.push(`${name}: Polar benefit_id for "${type}" must be UUID or ben_UUID format (got "${opts.benefit_id}")`);
        }
      }
    }
  }
}

function validateLemonSqueezyConfig(name, config, errors) {
  const lc = config.license_config || {};

  // store_id required
  if (!lc.store_id) {
    errors.push(`${name}: Lemon Squeezy requires store_id in license_config`);
  } else if (isNaN(Number(lc.store_id))) {
    errors.push(`${name}: Lemon Squeezy store_id must be an integer (got "${lc.store_id}")`);
  }

  // Multi-license: validate product_ids
  if (config.license_options) {
    for (const [type, opts] of Object.entries(config.license_options)) {
      if (opts.product_id && isNaN(Number(opts.product_id))) {
        errors.push(`${name}: Lemon Squeezy product_id for "${type}" must be an integer (got "${opts.product_id}")`);
      }
    }
  }
}

/**
 * Clean stale SkillStack fields from marketplace.json.
 * Returns { cleaned: boolean, topLevel: string[], perPlugin: { [name]: string[] } }
 */
function cleanMarketplace(repoDir) {
  const mpPath = path.join(repoDir, '.claude-plugin', 'marketplace.json');
  const raw = JSON.parse(fs.readFileSync(mpPath, 'utf-8'));

  const cleaned = { topLevel: [], perPlugin: {} };
  let modified = false;

  // Clean top-level fields
  for (const field of STALE_TOP_LEVEL_FIELDS) {
    if (raw[field] !== undefined) {
      delete raw[field];
      cleaned.topLevel.push(field);
      modified = true;
    }
  }

  // Clean per-plugin fields
  for (const plugin of raw.plugins || []) {
    const stale = [];
    for (const field of STALE_PLUGIN_FIELDS) {
      if (plugin[field] !== undefined) {
        delete plugin[field];
        stale.push(field);
        modified = true;
      }
    }
    if (stale.length > 0) {
      cleaned.perPlugin[plugin.name] = stale;
    }
  }

  if (modified) {
    fs.writeFileSync(mpPath, JSON.stringify(raw, null, 2) + '\n');
  }

  return cleaned;
}

/**
 * Write/merge skillstack.json and clean marketplace.json.
 * @param {string} repoDir - Path to the repo root
 * @param {object} config - { storefront?, plugins: { [name]: { ... } } }
 * @returns {{ success, skillstackJson?, cleanedFields, validationErrors?, changes }}
 */
export function writeSkillstackJson(repoDir, config) {
  const claudePlugin = path.join(repoDir, '.claude-plugin');
  const changes = [];

  // --- Validate all plugin configs ---
  const validationErrors = [];
  for (const [name, pluginConfig] of Object.entries(config.plugins || {})) {
    validationErrors.push(...validatePluginConfig(name, pluginConfig));
  }

  if (validationErrors.length > 0) {
    return { success: false, validationErrors, cleanedFields: { topLevel: [], perPlugin: {} }, changes: [] };
  }

  // --- Read existing skillstack.json (if any) ---
  const ssPath = path.join(claudePlugin, 'skillstack.json');
  let existing = {};
  if (fs.existsSync(ssPath)) {
    existing = JSON.parse(fs.readFileSync(ssPath, 'utf-8'));
  }

  // --- Merge ---
  const merged = {
    storefront: config.storefront || existing.storefront || null,
    plugins: { ...(existing.plugins || {}) },
  };

  for (const [name, pluginConfig] of Object.entries(config.plugins || {})) {
    // Build clean plugin entry
    const entry = {
      license_provider: pluginConfig.license_provider,
      license_config: pluginConfig.license_config,
    };

    // license_model OR license_options (mutually exclusive, validated above)
    if (pluginConfig.license_options) {
      entry.license_options = pluginConfig.license_options;
      // Explicitly do NOT set license_model
    } else if (pluginConfig.license_model) {
      entry.license_model = pluginConfig.license_model;
    }

    // Optional fields
    if (pluginConfig.free_skills) {
      entry.free_skills = pluginConfig.free_skills;
    }
    if (pluginConfig.creator_contact) {
      entry.creator_contact = pluginConfig.creator_contact;
    }

    const isNew = !existing.plugins?.[name];
    merged.plugins[name] = entry;
    changes.push(isNew ? `Added ${name} to skillstack.json` : `Updated ${name} in skillstack.json`);
  }

  // --- Write skillstack.json ---
  fs.writeFileSync(ssPath, JSON.stringify(merged, null, 2) + '\n');
  if (config.storefront && config.storefront !== existing.storefront) {
    changes.push(`Set storefront URL: ${config.storefront}`);
  }

  // --- Clean marketplace.json ---
  const cleanedFields = cleanMarketplace(repoDir);
  if (cleanedFields.topLevel.length > 0 || Object.keys(cleanedFields.perPlugin).length > 0) {
    changes.push('Cleaned stale SkillStack fields from marketplace.json');
  }

  return {
    success: true,
    skillstackJson: merged,
    cleanedFields,
    changes,
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

  // Read config from stdin
  let input = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const config = JSON.parse(input);
      const result = writeSkillstackJson(repoDir, config);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    } catch (err) {
      console.error(JSON.stringify({ error: err.message }));
      process.exit(1);
    }
  });
}
