import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { verifyConfig } from '../scripts/verify-config.mjs';

// --- Test Fixtures ---

/** Create a minimal localState (output from readPluginState) */
function createState(overrides = {}) {
  return {
    marketplace: {
      name: 'The AI Launchpad',
      slug: 'the-ai-launchpad',
      plugins: {
        'analytics-pro': {
          version: '2.0.0',
          source: './plugins/analytics-pro',
          description: 'Analytics plugin',
        },
        ...overrides.extraPlugins,
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
    pluginJsonVersions: overrides.pluginJsonVersions ?? {},
    git: { org: 'SkillStacks', remote: 'git@github.com:SkillStacks/ai-launchpad-marketplace.git' },
    storefrontUrl: 'https://store.skillstack.sh/s/SkillStacks/the-ai-launchpad/marketplace.json',
    connectedPlugins: overrides.connectedPlugins ?? ['analytics-pro'],
    unconnectedPlugins: overrides.unconnectedPlugins ?? [],
    staleFields: overrides.staleFields ?? { topLevel: [], perPlugin: {} },
    skillDirs: overrides.skillDirs ?? {},
  };
}

/** Create a minimal registered plugins array (from skillstack_list MCP tool) */
function createRegistered(overrides = {}) {
  return [
    {
      name: 'analytics-pro',
      slug: 'skillstacks-analytics-pro',
      version: overrides.version ?? '2.0.0',
      is_freemium: overrides.is_freemium ?? false,
      license_model: overrides.license_model ?? 'subscription',
      license_options: overrides.license_options ?? { subscription: {} },
      creator_contact: overrides.creator_contact ?? null,
      ...overrides.extraFields,
    },
    ...(overrides.extraPlugins ?? []),
  ];
}

// --- Tests ---

describe('verifyConfig — registration check', () => {
  it('passes when plugin is found in registered list', () => {
    const state = createState();
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    const regCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'registration'
    );
    assert.equal(regCheck.status, 'pass');
  });

  it('fails when plugin is not in registered list', () => {
    const state = createState();
    const registered = []; // empty — nothing registered

    const result = verifyConfig(state, registered);
    const regCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'registration'
    );
    assert.equal(regCheck.status, 'fail');
  });

  it('matches plugins by name regardless of slug prefix', () => {
    const state = createState();
    const registered = createRegistered({ extraFields: { slug: 'different-prefix-analytics-pro' } });

    const result = verifyConfig(state, registered);
    const regCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'registration'
    );
    assert.equal(regCheck.status, 'pass');
  });
});

describe('verifyConfig — version check', () => {
  it('passes when versions match', () => {
    const state = createState();
    const registered = createRegistered({ version: '2.0.0' });

    const result = verifyConfig(state, registered);
    const verCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'version'
    );
    assert.equal(verCheck.status, 'pass');
  });

  it('fails when source version is newer than registered', () => {
    const state = createState();
    const registered = createRegistered({ version: '1.0.0' });

    const result = verifyConfig(state, registered);
    const verCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'version'
    );
    assert.equal(verCheck.status, 'fail');
    assert.ok(verCheck.message.includes('2.0.0'));
    assert.ok(verCheck.message.includes('1.0.0'));
  });

  it('skips version check if plugin is not registered', () => {
    const state = createState();
    const registered = [];

    const result = verifyConfig(state, registered);
    const verCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'version'
    );
    // Should either be absent or marked as skipped
    assert.ok(!verCheck || verCheck.status === 'skip');
  });
});

describe('verifyConfig — plugin.json sync check', () => {
  it('passes when plugin.json version matches marketplace.json', () => {
    const state = createState({
      pluginJsonVersions: { 'analytics-pro': { version: '2.0.0', path: '/tmp/test' } },
    });
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    const pjCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'plugin_json_sync'
    );
    assert.equal(pjCheck.status, 'pass');
  });

  it('fails when plugin.json version differs from marketplace.json', () => {
    const state = createState({
      pluginJsonVersions: { 'analytics-pro': { version: '1.9.0', path: '/tmp/test' } },
    });
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    const pjCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'plugin_json_sync'
    );
    assert.equal(pjCheck.status, 'fail');
    assert.ok(pjCheck.message.includes('2.0.0'));
    assert.ok(pjCheck.message.includes('1.9.0'));
  });

  it('skips check when plugin has no plugin.json', () => {
    const state = createState({ pluginJsonVersions: {} });
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    const pjCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'plugin_json_sync'
    );
    assert.ok(!pjCheck); // silently skipped per skill spec
  });
});

describe('verifyConfig — license model check', () => {
  it('passes when license model matches', () => {
    const state = createState();
    const registered = createRegistered({ license_model: 'subscription' });

    const result = verifyConfig(state, registered);
    const licCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'license_model'
    );
    assert.equal(licCheck.status, 'pass');
  });

  it('fails when license model does not match', () => {
    const state = createState();
    const registered = createRegistered({ license_model: 'lifetime' });

    const result = verifyConfig(state, registered);
    const licCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'license_model'
    );
    assert.equal(licCheck.status, 'fail');
  });

  it('handles auto-normalized license_options from single license_model', () => {
    // Worker auto-normalizes "license_model": "subscription" into
    // "license_options": { "subscription": {} } — this should count as a match
    const state = createState();
    const registered = createRegistered({
      license_model: 'subscription',
      license_options: { subscription: {} },
    });

    const result = verifyConfig(state, registered);
    const licCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'license_model'
    );
    assert.equal(licCheck.status, 'pass');
  });
});

describe('verifyConfig — license options check', () => {
  it('passes when license options keys match', () => {
    const state = createState({
      skillstack: {
        plugins: {
          'analytics-pro': {
            license_provider: 'polar',
            license_config: { org_id: 'test' },
            license_options: {
              onetime: { benefit_id: 'ben_aaa' },
              lifetime: { benefit_id: 'ben_bbb' },
            },
          },
        },
      },
    });
    const registered = createRegistered({
      license_options: {
        onetime: { benefit_id: 'ben_aaa' },
        lifetime: { benefit_id: 'ben_bbb' },
      },
    });

    const result = verifyConfig(state, registered);
    const optCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'license_options'
    );
    assert.equal(optCheck.status, 'pass');
  });

  it('fails when license options keys differ', () => {
    const state = createState({
      skillstack: {
        plugins: {
          'analytics-pro': {
            license_provider: 'polar',
            license_config: { org_id: 'test' },
            license_options: {
              onetime: { benefit_id: 'ben_aaa' },
              lifetime: { benefit_id: 'ben_bbb' },
            },
          },
        },
      },
    });
    const registered = createRegistered({
      license_options: { onetime: { benefit_id: 'ben_aaa' } },
    });

    const result = verifyConfig(state, registered);
    const optCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'license_options'
    );
    assert.equal(optCheck.status, 'fail');
  });

  it('skips when plugin uses single license_model (no license_options in source)', () => {
    const state = createState(); // default uses license_model, not license_options
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    const optCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'license_options'
    );
    // Should be absent or skipped since source uses license_model not license_options
    assert.ok(!optCheck || optCheck.status === 'skip');
  });
});

describe('verifyConfig — creator contact check', () => {
  it('passes when creator_contact is set and synced', () => {
    const state = createState({
      skillstack: {
        plugins: {
          'analytics-pro': {
            license_provider: 'polar',
            license_config: { org_id: 'test' },
            license_model: 'subscription',
            creator_contact: 'support@example.com',
          },
        },
      },
    });
    const registered = createRegistered({ creator_contact: 'support@example.com' });

    const result = verifyConfig(state, registered);
    const ccCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'creator_contact'
    );
    assert.equal(ccCheck.status, 'pass');
  });

  it('warns when creator_contact is not set on a paid plugin', () => {
    const state = createState();
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    const ccCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'creator_contact'
    );
    assert.equal(ccCheck.status, 'warn');
  });
});

describe('verifyConfig — free skills validation', () => {
  it('passes when all free_skills match actual directories', () => {
    const state = createState({
      skillstack: {
        plugins: {
          'analytics-pro': {
            license_provider: 'polar',
            license_config: { org_id: 'test' },
            license_model: 'subscription',
            free_skills: ['write-note', 'hook'],
          },
        },
      },
      skillDirs: { 'analytics-pro': ['write-note', 'hook', 'title', 'plan-video'] },
    });
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    const fsCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'free_skills'
    );
    assert.equal(fsCheck.status, 'pass');
  });

  it('fails when free_skills contains a typo', () => {
    const state = createState({
      skillstack: {
        plugins: {
          'analytics-pro': {
            license_provider: 'polar',
            license_config: { org_id: 'test' },
            license_model: 'subscription',
            free_skills: ['write-note', 'hok'],
          },
        },
      },
      skillDirs: { 'analytics-pro': ['write-note', 'hook', 'title'] },
    });
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    const fsCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'free_skills'
    );
    assert.equal(fsCheck.status, 'fail');
    assert.ok(fsCheck.message.includes('hok'));
  });

  it('skips when no free_skills configured', () => {
    const state = createState();
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    const fsCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'free_skills'
    );
    assert.ok(!fsCheck); // silently skipped
  });
});

describe('verifyConfig — stale fields', () => {
  it('reports stale fields when found', () => {
    const state = createState({
      staleFields: {
        topLevel: ['storefront_repo'],
        perPlugin: { 'analytics-pro': ['license_provider', 'license_config'] },
      },
    });
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    assert.equal(result.staleFields.found, true);
    assert.ok(result.staleFields.fields.topLevel.includes('storefront_repo'));
  });

  it('reports clean when no stale fields', () => {
    const state = createState();
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    assert.equal(result.staleFields.found, false);
  });
});

describe('verifyConfig — critical checks', () => {
  it('flags plugin missing version in marketplace.json as critical', () => {
    const state = createState({
      ...createState(),
    });
    // Manually remove version from one plugin
    state.marketplace.plugins['analytics-pro'].version = undefined;
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    const critCheck = result.checks.find(
      c => c.plugin === 'analytics-pro' && c.check === 'missing_version'
    );
    assert.ok(critCheck);
    assert.equal(critCheck.status, 'fail');
    assert.ok(critCheck.message.toLowerCase().includes('version'));
  });
});

describe('verifyConfig — summary', () => {
  it('returns correct summary counts', () => {
    const state = createState();
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    assert.ok(result.summary);
    assert.equal(typeof result.summary.total, 'number');
    assert.equal(typeof result.summary.passed, 'number');
    assert.equal(typeof result.summary.failed, 'number');
    assert.equal(typeof result.summary.warnings, 'number');
    assert.equal(
      result.summary.total,
      result.summary.passed + result.summary.failed + result.summary.warnings
    );
  });

  it('handles multiple plugins in state', () => {
    const state = createState({
      extraPlugins: {
        'code-helper': { version: '1.0.0', source: '.', description: 'test' },
      },
      connectedPlugins: ['analytics-pro'],
      unconnectedPlugins: ['code-helper'],
    });
    const registered = createRegistered();

    const result = verifyConfig(state, registered);
    // Should have checks for both plugins (connected gets full checks, unconnected gets registration only)
    const analyticsChecks = result.checks.filter(c => c.plugin === 'analytics-pro');
    assert.ok(analyticsChecks.length > 0);
  });
});
