#!/usr/bin/env node

/**
 * validate-config.mjs — Pre-publish binding validation against the worker (#6)
 *
 * Posts the local manifest's plugins to the worker's `POST /validate` endpoint,
 * which runs the SAME canonicalization the webhook sync uses at ingestion. This
 * catches an invalid license/binding configuration on the creator's machine,
 * before it is ever pushed — and because both seams call one shared module,
 * authoring-time and ingest-time validation cannot disagree.
 *
 * Usage:
 *   node validate-config.mjs --repo-dir <path> [--worker-url <url>]
 *
 * Input:
 *   - localState: output from readPluginState() (read from --repo-dir)
 *   - worker URL: --worker-url, or $SKILLSTACK_WORKER_URL, or the production default
 *
 * Output (JSON to stdout):
 *   {
 *     valid: boolean,
 *     plugins: [{ name, valid, errors: [{ field, message }] }],
 *     summary: { total, valid, invalid }
 *   }
 *   On a network/endpoint failure (validation could not run), instead:
 *   { error: string, unavailable: true }   — the webhook remains the backstop.
 *
 * Exit codes: 0 = all valid · 2 = at least one invalid · 1 = script error ·
 *             3 = validation unavailable (network/endpoint error)
 */

import path from 'node:path';
import { readPluginState } from './read-plugin-state.mjs';

const DEFAULT_WORKER_URL = 'https://mcp.skillstack.sh';

/**
 * Resolve a plugin's source location within the repo, combining the
 * marketplace-level `pluginRoot` (if any) with the plugin's relative `source`.
 * Mirrors the worker's resolvePluginPath so the location collision anchor is
 * computed identically on both sides.
 */
export function resolvePluginPath(pluginRoot, source) {
  const root = pluginRoot ? pluginRoot.replace(/^\.\//, '').replace(/\/+$/, '') : '';
  const src = source ? source.replace(/^\.\//, '').replace(/\/+$/, '') : '';
  if (root && src) return `${root}/${src}`;
  if (root) return root;
  if (src) return src;
  return '.';
}

/**
 * Build the `{ plugins: [...] }` request body from local plugin state.
 * @param {object} localState - Output from readPluginState()
 * @returns {{ plugins: {name, pluginPath, ssConfig}[] }}
 */
export function buildValidateRequest(localState) {
  const pluginRoot = localState.marketplace?.raw?.metadata?.pluginRoot;
  const plugins = Object.entries(localState.marketplace?.plugins ?? {}).map(
    ([name, info]) => ({
      name,
      pluginPath: resolvePluginPath(pluginRoot, info.source),
      ssConfig: localState.skillstack?.plugins?.[name],
    })
  );
  return { plugins };
}

/**
 * Validate the local manifest against the worker endpoint.
 * @param {object} localState - Output from readPluginState()
 * @param {string} workerUrl - Worker base URL (no trailing slash)
 * @returns {Promise<{ valid, plugins, summary }>}
 */
export async function validateConfig(localState, workerUrl) {
  const body = buildValidateRequest(localState);
  const res = await fetch(`${workerUrl.replace(/\/+$/, '')}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Validation endpoint returned ${res.status}: ${text.slice(0, 200)}`);
  }
  const result = await res.json();
  const plugins = result.plugins ?? [];
  return {
    valid: result.valid === true,
    plugins,
    summary: {
      total: plugins.length,
      valid: plugins.filter((p) => p.valid).length,
      invalid: plugins.filter((p) => !p.valid).length,
    },
  };
}

// --- CLI Entry Point ---

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectExecution) {
  const args = process.argv.slice(2);

  let repoDir = process.cwd();
  const dirIdx = args.indexOf('--repo-dir');
  if (dirIdx !== -1 && args[dirIdx + 1]) repoDir = args[dirIdx + 1];

  let workerUrl = process.env.SKILLSTACK_WORKER_URL || DEFAULT_WORKER_URL;
  const urlIdx = args.indexOf('--worker-url');
  if (urlIdx !== -1 && args[urlIdx + 1]) workerUrl = args[urlIdx + 1];

  let localState;
  try {
    localState = readPluginState(repoDir);
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }

  try {
    const result = await validateConfig(localState, workerUrl);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 2);
  } catch (err) {
    // The endpoint was unreachable — validation could not run. The webhook
    // remains the backstop, so surface this without blocking hard.
    console.log(JSON.stringify({ error: err.message, unavailable: true }, null, 2));
    process.exit(3);
  }
}
