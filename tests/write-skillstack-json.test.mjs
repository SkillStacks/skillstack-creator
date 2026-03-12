import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { writeSkillstackJson } from '../scripts/write-skillstack-json.mjs';

// --- Test Constants ---

const TEST_UUID_1 = '0c504f49-dbdd-496a-8a36-72ce2a94d97f';
const TEST_UUID_2 = '11297490-6b02-4468-8968-1813b187343d';
const TEST_UUID_3 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TEST_BEN_1 = 'ben_0c504f49-dbdd-496a-8a36-72ce2a94d97f';
const TEST_BEN_2 = 'ben_11297490-6b02-4468-8968-1813b187343d';

// --- Test Fixtures ---

function createRepoFixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillstack-write-'));
  const claudePlugin = path.join(root, '.claude-plugin');
  fs.mkdirSync(claudePlugin, { recursive: true });

  // Default marketplace.json
  const marketplace = overrides.marketplace ?? {
    name: 'The AI Launchpad',
    plugins: [
      {
        name: 'analytics-pro',
        version: '2.0.0',
        source: './plugins/analytics-pro',
        description: 'Analytics plugin',
      },
    ],
  };
  fs.writeFileSync(
    path.join(claudePlugin, 'marketplace.json'),
    JSON.stringify(marketplace, null, 2)
  );

  // Optional existing skillstack.json
  if (overrides.existingSkillstack) {
    fs.writeFileSync(
      path.join(claudePlugin, 'skillstack.json'),
      JSON.stringify(overrides.existingSkillstack, null, 2)
    );
  }

  // Optional skill directories for free_skills validation
  if (overrides.skillDirs) {
    for (const skill of overrides.skillDirs) {
      const skillDir = path.join(root, 'plugins', 'analytics-pro', 'skills', skill);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: ${skill}\n---\nTest`);
    }
  }

  return root;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function readSkillstackJson(repoDir) {
  return JSON.parse(
    fs.readFileSync(path.join(repoDir, '.claude-plugin', 'skillstack.json'), 'utf-8')
  );
}

function readMarketplaceJson(repoDir) {
  return JSON.parse(
    fs.readFileSync(path.join(repoDir, '.claude-plugin', 'marketplace.json'), 'utf-8')
  );
}

// --- Tests ---

describe('writeSkillstackJson — basic write', () => {
  let repoDir;
  afterEach(() => { if (repoDir) cleanup(repoDir); });

  it('creates skillstack.json with storefront and plugin config', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/s/SkillStacks/the-ai-launchpad/marketplace.json',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f', product_id: '11297490-6b02-4468-8968-1813b187343d' },
          license_model: 'subscription',
        },
      },
    });

    assert.equal(result.success, true);

    const written = readSkillstackJson(repoDir);
    assert.equal(written.storefront, 'https://store.skillstack.sh/s/SkillStacks/the-ai-launchpad/marketplace.json');
    assert.equal(written.plugins['analytics-pro'].license_provider, 'polar');
    assert.equal(written.plugins['analytics-pro'].license_model, 'subscription');
    assert.equal(written.plugins['analytics-pro'].license_config.org_id, '0c504f49-dbdd-496a-8a36-72ce2a94d97f');
  });

  it('returns the written content in the result', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: TEST_UUID_1 },
          license_model: 'subscription',
        },
      },
    });

    assert.ok(result.skillstackJson);
    assert.equal(result.skillstackJson.plugins['analytics-pro'].license_provider, 'polar');
  });
});

describe('writeSkillstackJson — merging with existing', () => {
  let repoDir;
  afterEach(() => { if (repoDir) cleanup(repoDir); });

  it('merges new plugin into existing skillstack.json', () => {
    repoDir = createRepoFixture({
      marketplace: {
        name: 'Test',
        plugins: [
          { name: 'existing-plugin', version: '1.0.0', source: '.', description: 'test' },
          { name: 'new-plugin', version: '1.0.0', source: '.', description: 'test' },
        ],
      },
      existingSkillstack: {
        storefront: 'https://store.skillstack.sh/s/test/test/marketplace.json',
        plugins: {
          'existing-plugin': {
            license_provider: 'polar',
            license_config: { org_id: TEST_UUID_1 },
            license_model: 'lifetime',
          },
        },
      },
    });

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/s/test/test/marketplace.json',
      plugins: {
        'new-plugin': {
          license_provider: 'lemonsqueezy',
          license_config: { store_id: '306756' },
          license_model: 'onetime',
        },
      },
    });

    assert.equal(result.success, true);

    const written = readSkillstackJson(repoDir);
    assert.ok(written.plugins['existing-plugin'], 'existing plugin should be preserved');
    assert.equal(written.plugins['existing-plugin'].license_model, 'lifetime');
    assert.ok(written.plugins['new-plugin'], 'new plugin should be added');
    assert.equal(written.plugins['new-plugin'].license_provider, 'lemonsqueezy');
  });

  it('overwrites existing plugin config when reconfiguring', () => {
    repoDir = createRepoFixture({
      existingSkillstack: {
        storefront: 'https://store.skillstack.sh/test',
        plugins: {
          'analytics-pro': {
            license_provider: 'polar',
            license_config: { org_id: TEST_UUID_1 },
            license_model: 'subscription',
          },
        },
      },
    });

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: TEST_UUID_3 },
          license_options: {
            subscription: { benefit_id: TEST_BEN_1 },
            lifetime: { benefit_id: TEST_BEN_2 },
          },
        },
      },
    });

    const written = readSkillstackJson(repoDir);
    assert.equal(written.plugins['analytics-pro'].license_config.org_id, TEST_UUID_3);
    assert.ok(written.plugins['analytics-pro'].license_options);
    assert.ok(!written.plugins['analytics-pro'].license_model, 'license_model should be removed when using license_options');
  });

  it('preserves existing storefront when not provided', () => {
    repoDir = createRepoFixture({
      existingSkillstack: {
        storefront: 'https://store.skillstack.sh/existing',
        plugins: {},
      },
    });

    const result = writeSkillstackJson(repoDir, {
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: TEST_UUID_1 },
          license_model: 'subscription',
        },
      },
    });

    const written = readSkillstackJson(repoDir);
    assert.equal(written.storefront, 'https://store.skillstack.sh/existing');
  });
});

describe('writeSkillstackJson — multi-license', () => {
  let repoDir;
  afterEach(() => { if (repoDir) cleanup(repoDir); });

  it('writes license_options for multi-license plugins', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: TEST_UUID_1 },
          license_options: {
            onetime: { benefit_id: TEST_BEN_1 },
            lifetime: { benefit_id: TEST_BEN_2 },
          },
        },
      },
    });

    const written = readSkillstackJson(repoDir);
    assert.ok(written.plugins['analytics-pro'].license_options);
    assert.ok(written.plugins['analytics-pro'].license_options.onetime);
    assert.ok(written.plugins['analytics-pro'].license_options.lifetime);
    assert.ok(!written.plugins['analytics-pro'].license_model, 'should NOT have license_model with license_options');
  });
});

describe('writeSkillstackJson — freemium', () => {
  let repoDir;
  afterEach(() => { if (repoDir) cleanup(repoDir); });

  it('writes free_skills array', () => {
    repoDir = createRepoFixture({
      skillDirs: ['write-note', 'hook', 'title', 'plan-video'],
    });

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: TEST_UUID_1 },
          license_model: 'subscription',
          free_skills: ['write-note', 'hook'],
        },
      },
    });

    const written = readSkillstackJson(repoDir);
    assert.deepEqual(written.plugins['analytics-pro'].free_skills, ['write-note', 'hook']);
  });

  it('writes creator_contact', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: TEST_UUID_1 },
          license_model: 'subscription',
          creator_contact: 'support@example.com',
        },
      },
    });

    const written = readSkillstackJson(repoDir);
    assert.equal(written.plugins['analytics-pro'].creator_contact, 'support@example.com');
  });
});

describe('writeSkillstackJson — stale field cleanup', () => {
  let repoDir;
  afterEach(() => { if (repoDir) cleanup(repoDir); });

  it('removes stale SkillStack fields from marketplace.json plugin entries', () => {
    repoDir = createRepoFixture({
      marketplace: {
        name: 'Test',
        plugins: [
          {
            name: 'analytics-pro',
            version: '2.0.0',
            source: '.',
            description: 'test',
            license_provider: 'polar',
            license_config: { org_id: TEST_UUID_1 },
            license_model: 'subscription',
            creator_contact: 'old@email.com',
          },
        ],
      },
    });

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: TEST_UUID_3 },
          license_model: 'subscription',
        },
      },
    });

    const mp = readMarketplaceJson(repoDir);
    const plugin = mp.plugins[0];
    assert.ok(!plugin.license_provider, 'license_provider should be removed');
    assert.ok(!plugin.license_config, 'license_config should be removed');
    assert.ok(!plugin.license_model, 'license_model should be removed');
    assert.ok(!plugin.creator_contact, 'creator_contact should be removed');
    // Non-SkillStack fields preserved
    assert.equal(plugin.name, 'analytics-pro');
    assert.equal(plugin.version, '2.0.0');
    assert.equal(plugin.source, '.');
    assert.equal(plugin.description, 'test');
  });

  it('removes stale top-level fields from marketplace.json', () => {
    repoDir = createRepoFixture({
      marketplace: {
        name: 'Test',
        storefront_repo: 'old-repo',
        plugins: [
          { name: 'analytics-pro', version: '2.0.0', source: '.', description: 'test' },
        ],
      },
    });

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: TEST_UUID_1 },
          license_model: 'subscription',
        },
      },
    });

    const mp = readMarketplaceJson(repoDir);
    assert.ok(!mp.storefront_repo, 'storefront_repo should be removed');
    assert.equal(mp.name, 'Test', 'non-stale fields preserved');
  });

  it('reports which fields were cleaned', () => {
    repoDir = createRepoFixture({
      marketplace: {
        name: 'Test',
        storefront_repo: 'old',
        plugins: [
          {
            name: 'analytics-pro',
            version: '2.0.0',
            source: '.',
            description: 'test',
            license_provider: 'polar',
          },
        ],
      },
    });

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: TEST_UUID_1 },
          license_model: 'subscription',
        },
      },
    });

    assert.ok(result.cleanedFields.topLevel.includes('storefront_repo'));
    assert.ok(result.cleanedFields.perPlugin['analytics-pro'].includes('license_provider'));
  });

  it('does not modify marketplace.json when no stale fields exist', () => {
    repoDir = createRepoFixture();

    const before = fs.readFileSync(
      path.join(repoDir, '.claude-plugin', 'marketplace.json'), 'utf-8'
    );

    writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: TEST_UUID_1 },
          license_model: 'subscription',
        },
      },
    });

    const after = fs.readFileSync(
      path.join(repoDir, '.claude-plugin', 'marketplace.json'), 'utf-8'
    );
    assert.equal(before, after, 'marketplace.json should not be modified');
  });
});

describe('writeSkillstackJson — validation', () => {
  let repoDir;
  afterEach(() => { if (repoDir) cleanup(repoDir); });

  it('validates UUID format for Polar org_id', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: 'not-a-uuid' },
          license_model: 'subscription',
        },
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.validationErrors.some(e => e.includes('org_id')));
  });

  it('validates UUID format for Polar product_id', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f', product_id: 'bad' },
          license_model: 'subscription',
        },
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.validationErrors.some(e => e.includes('product_id')));
  });

  it('validates integer for Lemon Squeezy store_id', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'lemonsqueezy',
          license_config: { store_id: 'not-a-number' },
          license_model: 'subscription',
        },
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.validationErrors.some(e => e.includes('store_id')));
  });

  it('validates license type values', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
          license_model: 'invalid_type',
        },
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.validationErrors.some(e => e.includes('license_model')));
  });

  it('validates license_options has at least 2 types', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
          license_options: {
            onetime: { benefit_id: TEST_BEN_1 },
          },
        },
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.validationErrors.some(e => e.includes('license_options')));
  });

  it('rejects both license_model and license_options', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
          license_model: 'subscription',
          license_options: {
            onetime: { benefit_id: TEST_BEN_1 },
            lifetime: { benefit_id: TEST_BEN_2 },
          },
        },
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.validationErrors.some(e => e.includes('license_model') && e.includes('license_options')));
  });

  it('validates Polar benefit_id UUID format for multi-license', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
          license_options: {
            onetime: { benefit_id: 'not-a-uuid' },
            lifetime: { benefit_id: 'ben_0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
          },
        },
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.validationErrors.some(e => e.includes('benefit_id')));
  });

  it('accepts valid Polar UUID and ben_ prefixed benefit_ids', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
          license_options: {
            onetime: { benefit_id: 'ben_0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
            lifetime: { benefit_id: 'ben_11297490-6b02-4468-8968-1813b187343d' },
          },
        },
      },
    });

    assert.equal(result.success, true);
  });

  it('validates creator_contact is email or URL', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
          license_model: 'subscription',
          creator_contact: 'just some text',
        },
      },
    });

    assert.equal(result.success, false);
    assert.ok(result.validationErrors.some(e => e.includes('creator_contact')));
  });

  it('accepts valid email as creator_contact', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
          license_model: 'subscription',
          creator_contact: 'support@example.com',
        },
      },
    });

    assert.equal(result.success, true);
  });

  it('accepts valid URL as creator_contact', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
          license_model: 'subscription',
          creator_contact: 'https://discord.gg/example',
        },
      },
    });

    assert.equal(result.success, true);
  });
});

describe('writeSkillstackJson — changes summary', () => {
  let repoDir;
  afterEach(() => { if (repoDir) cleanup(repoDir); });

  it('returns human-readable changes list', () => {
    repoDir = createRepoFixture();

    const result = writeSkillstackJson(repoDir, {
      storefront: 'https://store.skillstack.sh/test',
      plugins: {
        'analytics-pro': {
          license_provider: 'polar',
          license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
          license_model: 'subscription',
        },
      },
    });

    assert.ok(Array.isArray(result.changes));
    assert.ok(result.changes.length > 0);
  });
});
