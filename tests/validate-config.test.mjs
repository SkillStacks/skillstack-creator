import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolvePluginPath,
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

// --- resolvePluginPath: must mirror the worker's resolvePluginPath ---

describe('resolvePluginPath', () => {
  it('strips ./ prefix and trailing slashes from source', () => {
    assert.equal(resolvePluginPath(undefined, './plugins/foo/'), 'plugins/foo');
  });

  it('joins pluginRoot and source', () => {
    assert.equal(resolvePluginPath('./packages', './plugins/foo'), 'packages/plugins/foo');
  });

  it('returns "." when neither is set', () => {
    assert.equal(resolvePluginPath(undefined, undefined), '.');
  });

  it('returns root alone when source is missing', () => {
    assert.equal(resolvePluginPath('./packages/', undefined), 'packages');
  });
});

// --- buildValidateRequest: assembles the worker request body ---

describe('buildValidateRequest', () => {
  it('maps each marketplace plugin to {name, pluginPath, ssConfig}', () => {
    const { plugins } = buildValidateRequest(createState());
    assert.equal(plugins.length, 1);
    assert.deepEqual(plugins[0], {
      name: 'analytics-pro',
      pluginPath: 'plugins/analytics-pro',
      ssConfig: {
        license_provider: 'polar',
        license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
        license_model: 'subscription',
      },
    });
  });

  it('honours marketplace.metadata.pluginRoot from raw', () => {
    const { plugins } = buildValidateRequest(
      createState({ rawMarketplace: { metadata: { pluginRoot: './packages' } } })
    );
    assert.equal(plugins[0].pluginPath, 'packages/plugins/analytics-pro');
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

  it('posts the assembled body to <workerUrl>/validate', async () => {
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
    assert.equal(sent.plugins[0].name, 'analytics-pro');
    assert.equal(result.valid, true);
    assert.deepEqual(result.summary, { total: 1, valid: 1, invalid: 0 });
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

  it('throws when the endpoint returns a non-OK status', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
    await assert.rejects(
      () => validateConfig(createState(), 'https://mcp.skillstack.sh'),
      /500/
    );
  });
});
