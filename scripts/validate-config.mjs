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
 * The endpoint is unauthenticated (the check is pure/stateless and bounded by a
 * server-side plugin cap), so no token is sent.
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
 *   On a genuine network failure (the endpoint was unreachable, so validation
 *   could not run), instead:
 *   { error: string, unavailable: true }   — the webhook remains the backstop.
 *   On a reachable-but-erroring endpoint (HTTP 4xx/5xx) or a local error:
 *   { error: string, endpointError: true } — a real failure, surfaced to block.
 *
 * Exit codes:
 *   0 = all valid
 *   2 = at least one plugin invalid (fix and re-validate before pushing)
 *   1 = error — local read failure OR the endpoint returned an error status;
 *       validation did not complete successfully, so do NOT push
 *   3 = validation unavailable — the endpoint was genuinely unreachable
 *       (network failure); the webhook is the backstop, so proceeding is safe
 */

import path from 'node:path';
import { readPluginState } from './read-plugin-state.mjs';

const DEFAULT_WORKER_URL = 'https://mcp.skillstack.sh';

/**
 * Build the `/validate` request body from local plugin state.
 *
 * The worker (validate.ts) owns path resolution: it expects each plugin's RAW
 * authored `source` plus the marketplace `pluginRoot` at the TOP LEVEL, and runs
 * the shared `resolvePluginPath` itself so the location-collision anchor matches
 * ingestion exactly. We deliberately send the raw values and do NOT resolve here
 * — a client-resolved `pluginPath` is the wrong contract (the worker 400s on a
 * missing `source`).
 *
 * @param {object} localState - Output from readPluginState()
 * @returns {{ pluginRoot?: string, plugins: {name, source, ssConfig}[] }}
 */
export function buildValidateRequest(localState) {
  const pluginRoot = localState.marketplace?.raw?.metadata?.pluginRoot;
  const plugins = Object.entries(localState.marketplace?.plugins ?? {}).map(
    ([name, info]) => ({
      name,
      source: info.source,
      ssConfig: localState.skillstack?.plugins?.[name],
    })
  );
  const body = { plugins };
  if (pluginRoot !== undefined) body.pluginRoot = pluginRoot;
  return body;
}

/**
 * Validate the local manifest against the worker endpoint.
 * @param {object} localState - Output from readPluginState()
 * @param {string} workerUrl - Worker base URL (no trailing slash)
 * @returns {Promise<{ valid, plugins, summary }>}
 */
export async function validateConfig(localState, workerUrl) {
  const body = buildValidateRequest(localState);
  let res;
  try {
    res = await fetch(`${workerUrl.replace(/\/+$/, '')}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    // `fetch` itself rejected — DNS failure, connection refused, offline. The
    // endpoint was genuinely unreachable, so validation could not run and the
    // webhook remains the backstop. Tag it so the CLI maps this (and ONLY this)
    // to the "unavailable / proceed" path.
    const err = new Error(`Could not reach validation endpoint: ${networkErr.message}`);
    err.networkFailure = true;
    throw err;
  }
  if (!res.ok) {
    // A response came back with an error status (400/401/500…). The endpoint is
    // reachable but rejected the request — a real, blocking problem. It is NOT
    // tagged networkFailure, so the CLI surfaces it as an error rather than
    // silently downgrading it to the backstop-skip.
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
    if (err.networkFailure) {
      // The endpoint was genuinely unreachable — validation could not run. The
      // webhook re-runs the identical check at ingestion, so it remains the
      // backstop; surface this without blocking hard.
      console.log(JSON.stringify({ error: err.message, unavailable: true }, null, 2));
      process.exit(3);
    }
    // A reachable endpoint returned an error status (or another error occurred).
    // This is a real failure, NOT a network outage — do not pass it off as the
    // backstop-skip. Block so the creator resolves it before pushing.
    console.error(JSON.stringify({ error: err.message, endpointError: true }, null, 2));
    process.exit(1);
  }
}
