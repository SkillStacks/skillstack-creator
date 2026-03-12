#!/usr/bin/env node

/**
 * verify-config.mjs — Run all local verification checks for SkillStack plugins
 *
 * Usage:
 *   node verify-config.mjs --repo-dir <path> --registered '<json>'
 *
 * Inputs:
 *   - localState: output from readPluginState() (passed via --repo-dir or stdin)
 *   - registeredPlugins: array from skillstack_list MCP tool (passed via --registered)
 *
 * Output (JSON):
 *   {
 *     checks: [{ plugin, check, status, message, details? }],
 *     staleFields: { found, fields, message },
 *     summary: { total, passed, failed, warnings }
 *   }
 *
 * Check types: registration, version, plugin_json_sync, license_model,
 *              license_options, creator_contact, free_skills, missing_version
 */

import fs from 'node:fs';
import path from 'node:path';
import { readPluginState } from './read-plugin-state.mjs';

/**
 * Find a registered plugin by name. Matches if the registered entry's
 * name equals the plugin name OR if the slug ends with the plugin name.
 */
function findRegistered(name, registeredPlugins) {
  return registeredPlugins.find(
    r => r.name === name || (r.slug && r.slug.endsWith(`-${name}`)) || r.slug === name
  );
}

/**
 * Run all verification checks.
 * @param {object} localState - Output from readPluginState()
 * @param {object[]} registeredPlugins - Array from skillstack_list MCP tool
 * @returns {{ checks, staleFields, summary }}
 */
export function verifyConfig(localState, registeredPlugins) {
  const checks = [];

  // For each plugin in marketplace, run checks
  for (const [pluginName, pluginInfo] of Object.entries(localState.marketplace.plugins)) {
    const ssConfig = localState.skillstack?.plugins?.[pluginName];
    const registered = findRegistered(pluginName, registeredPlugins);

    // --- Critical: missing version ---
    if (!pluginInfo.version) {
      checks.push({
        plugin: pluginName,
        check: 'missing_version',
        status: 'fail',
        message: 'Plugin is missing version in marketplace.json — invisible to buyers (404). Add a version field.',
      });
    }

    // --- Registration check ---
    if (registered) {
      checks.push({
        plugin: pluginName,
        check: 'registration',
        status: 'pass',
        message: `Registered as ${registered.slug}`,
      });
    } else {
      checks.push({
        plugin: pluginName,
        check: 'registration',
        status: 'fail',
        message: 'Not found in SkillStack. Check GitHub App install and push.',
      });
      // Skip remaining checks if not registered
      continue;
    }

    // --- Version check ---
    if (pluginInfo.version && registered.version) {
      if (pluginInfo.version === registered.version) {
        checks.push({
          plugin: pluginName,
          check: 'version',
          status: 'pass',
          message: `v${pluginInfo.version} (synced)`,
        });
      } else {
        checks.push({
          plugin: pluginName,
          check: 'version',
          status: 'fail',
          message: `Source has v${pluginInfo.version} but SkillStack has v${registered.version}. Push to re-trigger webhook.`,
        });
      }
    }

    // --- plugin.json sync check ---
    const pjVersion = localState.pluginJsonVersions[pluginName];
    if (pjVersion) {
      if (pjVersion.version === pluginInfo.version) {
        checks.push({
          plugin: pluginName,
          check: 'plugin_json_sync',
          status: 'pass',
          message: `plugin.json v${pjVersion.version} (in sync)`,
        });
      } else {
        checks.push({
          plugin: pluginName,
          check: 'plugin_json_sync',
          status: 'fail',
          message: `MISMATCH — marketplace.json has v${pluginInfo.version}, plugin.json has v${pjVersion.version}. marketplace.json is the source of truth.`,
        });
      }
    }
    // If no plugin.json, silently skip (per skill spec)

    // --- License model check ---
    if (ssConfig && registered) {
      const sourceModel = ssConfig.license_model;
      const registeredModel = registered.license_model;

      if (sourceModel) {
        // Worker auto-normalizes single license_model into license_options
        // So "subscription" in source matching { subscription: {} } in registered is OK
        // But ONLY when registered doesn't have an explicit license_model that differs
        const registeredOptionsKeys = registered.license_options
          ? Object.keys(registered.license_options)
          : [];
        const isAutoNormalized = !registeredModel &&
          registeredOptionsKeys.length === 1 && registeredOptionsKeys[0] === sourceModel;

        if (sourceModel === registeredModel || isAutoNormalized) {
          checks.push({
            plugin: pluginName,
            check: 'license_model',
            status: 'pass',
            message: `${sourceModel} (correct)`,
          });
        } else {
          checks.push({
            plugin: pluginName,
            check: 'license_model',
            status: 'fail',
            message: `Source has ${sourceModel} but SkillStack has ${registeredModel}. Push to re-trigger webhook.`,
          });
        }
      }

      // --- License options check ---
      if (ssConfig.license_options) {
        const sourceKeys = Object.keys(ssConfig.license_options).sort();
        const registeredKeys = registered.license_options
          ? Object.keys(registered.license_options).sort()
          : [];

        if (JSON.stringify(sourceKeys) === JSON.stringify(registeredKeys)) {
          checks.push({
            plugin: pluginName,
            check: 'license_options',
            status: 'pass',
            message: `License options synced: ${sourceKeys.join(', ')}`,
          });
        } else {
          checks.push({
            plugin: pluginName,
            check: 'license_options',
            status: 'fail',
            message: `Source has [${sourceKeys.join(', ')}] but SkillStack has [${registeredKeys.join(', ')}]. Push to re-trigger webhook.`,
          });
        }
      }

      // --- Creator contact check ---
      if (ssConfig.creator_contact) {
        if (registered.creator_contact === ssConfig.creator_contact) {
          checks.push({
            plugin: pluginName,
            check: 'creator_contact',
            status: 'pass',
            message: `${ssConfig.creator_contact} (synced)`,
          });
        } else {
          checks.push({
            plugin: pluginName,
            check: 'creator_contact',
            status: 'warn',
            message: `Source has "${ssConfig.creator_contact}" but SkillStack has "${registered.creator_contact}". Push to sync.`,
          });
        }
      } else if (ssConfig.license_provider) {
        // Paid plugin without creator_contact
        checks.push({
          plugin: pluginName,
          check: 'creator_contact',
          status: 'warn',
          message: 'NOT SET — buyers who hit license errors won\'t know how to reach you. Add creator_contact to skillstack.json.',
        });
      }

      // --- Free skills validation ---
      if (ssConfig.free_skills && ssConfig.free_skills.length > 0) {
        const actualSkills = localState.skillDirs?.[pluginName] || [];
        const invalid = [];
        const valid = [];

        for (const skill of ssConfig.free_skills) {
          if (actualSkills.includes(skill)) {
            valid.push(skill);
          } else {
            // Find closest match for suggestion
            const closest = actualSkills.find(s =>
              s.includes(skill) || skill.includes(s) ||
              levenshteinDistance(s, skill) <= 2
            );
            invalid.push({ name: skill, suggestion: closest || null });
          }
        }

        if (invalid.length === 0) {
          checks.push({
            plugin: pluginName,
            check: 'free_skills',
            status: 'pass',
            message: `${valid.length} skills (${valid.join(', ')}) — all valid`,
          });
        } else {
          const details = invalid.map(i =>
            i.suggestion
              ? `"${i.name}" doesn't match any skill directory. Did you mean "${i.suggestion}"?`
              : `"${i.name}" doesn't match any skill directory.`
          ).join(' ');
          checks.push({
            plugin: pluginName,
            check: 'free_skills',
            status: 'fail',
            message: `${valid.length}/${ssConfig.free_skills.length} entries valid. ${details}`,
          });
        }
      }
    }
  }

  // --- Stale fields report ---
  const hasStaleTopLevel = localState.staleFields.topLevel.length > 0;
  const hasStalePlugins = Object.keys(localState.staleFields.perPlugin).length > 0;
  const staleFields = {
    found: hasStaleTopLevel || hasStalePlugins,
    fields: localState.staleFields,
    message: hasStaleTopLevel || hasStalePlugins
      ? 'marketplace.json still has SkillStack fields that belong in skillstack.json. Run /publish to migrate.'
      : 'marketplace.json is clean (no SkillStack fields)',
  };

  // --- Summary ---
  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const warnings = checks.filter(c => c.status === 'warn').length;

  return {
    checks,
    staleFields,
    summary: {
      total: checks.length,
      passed,
      failed,
      warnings,
    },
  };
}

/**
 * Simple Levenshtein distance for typo suggestions.
 */
function levenshteinDistance(a, b) {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }

  return matrix[b.length][a.length];
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

  let registeredPlugins = [];
  const regIdx = args.indexOf('--registered');
  if (regIdx !== -1 && args[regIdx + 1]) {
    try {
      registeredPlugins = JSON.parse(args[regIdx + 1]);
    } catch {
      console.error(JSON.stringify({ error: 'Invalid JSON for --registered' }));
      process.exit(1);
    }
  }

  try {
    const localState = readPluginState(repoDir);
    const result = verifyConfig(localState, registeredPlugins);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}
