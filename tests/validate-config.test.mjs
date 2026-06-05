import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildValidateRequest,
  validateConfig,
} from '../scripts/validate-config.mjs';

// --- Fixtures ---

function createState(overrides = {}) {
  return {
    marketplace: {
      name: 'The AI Launchpad',
      slug: 'the-ai-launchpad',
      plugins: overrides.plugins ?? {
        'analytics-pro': { version: '2.0.0', source: './plugins/analytics-pro' },
      },
      raw: overrides.rawMarketplace ?? {},
    },
    skillstack: overrides.skillstack ?? {
      storefront: 'https://store.skillstack.sh/s/SkillStacks/the-ai-launchpad/marketplace.json',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
          license_model: 'subscription',
        },
      },
    },
  };
}

// --- buildValidateRequest: must match the worker's /validate contract exactly ---
//
// The worker (validate.ts) requires each plugin to be { name, source, ssConfig? }
// with the RAW authored `source` and `pluginRoot` at the TOP LEVEL — it resolves
// the path itself on the shared seam. Sending a client-resolved `pluginPath`
// (the old contract) makes the worker 400, so these assertions lock the wire
// shape the endpoint actually accepts.

describe('buildValidateRequest', () => {
  it('maps each marketplace plugin to {name, source, ssConfig} with the RAW source', () => {
    const { plugins } = buildValidateRequest(createState());
    assert.equal(plugins.length, 1);
    assert.deepEqual(plugins[0], {
      name: 'analytics-pro',
      source: './plugins/analytics-pro', // raw, NOT resolved — the worker normalizes
      ssConfig: {
        license_provider: 'polar',
        license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
        license_model: 'subscription',
      },
    });
  });

  it('never sends a pre-resolved pluginPath (the worker owns resolution)', () => {
    const { plugins } = buildValidateRequest(createState());
    assert.ok(!('pluginPath' in plugins[0]), 'request must not carry pluginPath');
  });

  it('puts marketplace.metadata.pluginRoot at the top level, raw', () => {
    const body = buildValidateRequest(
      createState({ rawMarketplace: { metadata: { pluginRoot: './packages' } } })
    );
    assert.equal(body.pluginRoot, './packages'); // raw, not normalized
    assert.equal(body.plugins[0].source, './plugins/analytics-pro');
  });

  it('omits pluginRoot entirely when the marketplace has none', () => {
    const body = buildValidateRequest(createState());
    assert.ok(!('pluginRoot' in body), 'pluginRoot key must be absent when unset');
  });

  it('leaves ssConfig undefined for a free plugin not in skillstack.json', () => {
    const { plugins } = buildValidateRequest(
      createState({
        plugins: { 'free-plug': { version: '1.0.0', source: './plugins/free-plug' } },
        skillstack: { plugins: {} },
      })
    );
    assert.equal(plugins[0].ssConfig, undefined);
  });
});

// --- validateConfig: POSTs to the endpoint and summarizes the result ---

describe('validateConfig', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('posts the worker-contract body to <workerUrl>/validate', async () => {
    let captured;
    globalThis.fetch = async (url, opts) => {
      captured = { url, opts };
      return {
        ok: true,
        json: async () => ({ valid: true, plugins: [{ name: 'analytics-pro', valid: true, errors: [] }] }),
      };
    };
    const result = await validateConfig(createState(), 'https://mcp.skillstack.sh/');
    assert.equal(captured.url, 'https://mcp.skillstack.sh/validate');
    assert.equal(captured.opts.method, 'POST');
    const sent = JSON.parse(captured.opts.body);
    // The wire shape the worker actually accepts: raw per-plugin source, no pluginPath.
    assert.equal(sent.plugins[0].name, 'analytics-pro');
    assert.equal(sent.plugins[0].source, './plugins/analytics-pro');
    assert.ok(!('pluginPath' in sent.plugins[0]));
    assert.equal(result.valid, true);
    assert.deepEqual(result.summary, { total: 1, valid: 1, invalid: 0 });
  });

  it('sends no Authorization header — /validate is intentionally public', async () => {
    let captured;
    globalThis.fetch = async (url, opts) => {
      captured = { url, opts };
      return { ok: true, json: async () => ({ valid: true, plugins: [] }) };
    };
    await validateConfig(createState(), 'https://mcp.skillstack.sh');
    const headers = captured.opts.headers ?? {};
    assert.equal(headers.Authorization, undefined);
    assert.equal(headers.authorization, undefined);
  });

  it('summarizes an invalid result', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        valid: false,
        plugins: [
          { name: 'good', valid: true, errors: [] },
          { name: 'bad', valid: false, errors: [{ field: 'license_config.product_id', message: 'Add a product_id, then re-publish.' }] },
        ],
      }),
    });
    const result = await validateConfig(createState(), 'https://mcp.skillstack.sh');
    assert.equal(result.valid, false);
    assert.deepEqual(result.summary, { total: 2, valid: 1, invalid: 1 });
  });

  // A reachable endpoint that returns an error status is a REAL, blocking failure
  // — not the "endpoint unreachable, webhook is the backstop" case. validateConfig
  // throws WITHOUT the networkFailure flag so the CLI blocks rather than degrades.
  it('throws (without networkFailure) when the endpoint returns a non-OK status', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
    await assert.rejects(
      () => validateConfig(createState(), 'https://mcp.skillstack.sh'),
      (err) => {
        assert.match(err.message, /500/);
        assert.notEqual(err.networkFailure, true);
        return true;
      }
    );
  });

  // Only a genuine network failure (fetch itself rejects: DNS, refused, offline)
  // is the backstop-skip case. It is tagged networkFailure so the CLI maps it to
  // exit 3 / unavailable, distinct from an HTTP error status above.
  it('throws with networkFailure=true when fetch itself rejects', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };
    await assert.rejects(
      () => validateConfig(createState(), 'https://mcp.skillstack.sh'),
      (err) => {
        assert.equal(err.networkFailure, true);
        return true;
      }
    );
  });
});
