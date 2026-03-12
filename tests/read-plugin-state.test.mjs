import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { readPluginState } from '../scripts/read-plugin-state.mjs';

// --- Test Fixtures ---

/**
 * Create a realistic repo structure in a temp directory.
 * Options: { marketplace, skillstack, pluginJsons, gitRemote, skillDirs }
 */
function createRepoFixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillstack-creator-'));
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
      {
        name: 'code-helper',
        version: '1.0.0',
        source: './plugins/code-helper',
        description: 'Code helper plugin',
      },
    ],
  };
  fs.writeFileSync(
    path.join(claudePlugin, 'marketplace.json'),
    JSON.stringify(marketplace, null, 2)
  );

  // Optional skillstack.json
  if (overrides.skillstack !== undefined) {
    fs.writeFileSync(
      path.join(claudePlugin, 'skillstack.json'),
      JSON.stringify(overrides.skillstack, null, 2)
    );
  }

  // Optional plugin.json files in plugin source dirs
  if (overrides.pluginJsons) {
    for (const [pluginName, pjConfig] of Object.entries(overrides.pluginJsons)) {
      const pluginDir = path.join(root, 'plugins', pluginName, '.claude-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, 'plugin.json'),
        JSON.stringify(pjConfig, null, 2)
      );
    }
  }

  // Optional skill directories for free_skills validation
  if (overrides.skillDirs) {
    for (const [pluginName, skills] of Object.entries(overrides.skillDirs)) {
      for (const skill of skills) {
        const skillDir = path.join(root, 'plugins', pluginName, 'skills', skill);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(
          path.join(skillDir, 'SKILL.md'),
          `---\nname: ${skill}\n---\nTest skill`
        );
      }
    }
  }

  // Mock git remote — write a .git/config file
  if (overrides.gitRemote !== null) {
    const gitDir = path.join(root, '.git');
    fs.mkdirSync(gitDir, { recursive: true });
    const remote = overrides.gitRemote ?? 'git@github.com:SkillStacks/ai-launchpad-marketplace.git';
    fs.writeFileSync(
      path.join(gitDir, 'config'),
      `[remote "origin"]\n\turl = ${remote}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`
    );
  }

  return root;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- Tests ---

describe('readPluginState', () => {
  let repoDir;
  afterEach(() => { if (repoDir) cleanup(repoDir); });

  it('reads marketplace.json and returns plugin list', () => {
    repoDir = createRepoFixture();

    const state = readPluginState(repoDir);
    assert.ok(state.marketplace);
    assert.equal(state.marketplace.name, 'The AI Launchpad');
    assert.ok(state.marketplace.plugins['analytics-pro']);
    assert.equal(state.marketplace.plugins['analytics-pro'].version, '2.0.0');
    assert.ok(state.marketplace.plugins['code-helper']);
    assert.equal(state.marketplace.plugins['code-helper'].version, '1.0.0');
  });

  it('derives marketplace slug from name', () => {
    repoDir = createRepoFixture();

    const state = readPluginState(repoDir);
    assert.equal(state.marketplace.slug, 'the-ai-launchpad');
  });

  it('handles marketplace name with special characters', () => {
    repoDir = createRepoFixture({
      marketplace: {
        name: "Kenny's Cool Plugins!",
        plugins: [{ name: 'test', version: '1.0.0', source: '.', description: 'test' }],
      },
    });

    const state = readPluginState(repoDir);
    assert.equal(state.marketplace.slug, 'kennys-cool-plugins');
  });

  it('returns null for skillstack when file does not exist', () => {
    repoDir = createRepoFixture();

    const state = readPluginState(repoDir);
    assert.equal(state.skillstack, null);
  });

  it('reads skillstack.json when present', () => {
    repoDir = createRepoFixture({
      skillstack: {
        storefront: 'https://store.skillstack.sh/s/SkillStacks/the-ai-launchpad/marketplace.json',
        plugins: {
          'analytics-pro': {
            license_provider: 'polar',
            license_config: { org_id: '0c504f49-dbdd-496a-8a36-72ce2a94d97f' },
            license_model: 'subscription',
          },
        },
      },
    });

    const state = readPluginState(repoDir);
    assert.ok(state.skillstack);
    assert.equal(state.skillstack.storefront, 'https://store.skillstack.sh/s/SkillStacks/the-ai-launchpad/marketplace.json');
    assert.ok(state.skillstack.plugins['analytics-pro']);
    assert.equal(state.skillstack.plugins['analytics-pro'].license_provider, 'polar');
  });

  it('identifies connected and unconnected plugins', () => {
    repoDir = createRepoFixture({
      skillstack: {
        plugins: {
          'analytics-pro': {
            license_provider: 'polar',
            license_config: { org_id: 'test-uuid' },
            license_model: 'subscription',
          },
        },
      },
    });

    const state = readPluginState(repoDir);
    assert.deepEqual(state.connectedPlugins, ['analytics-pro']);
    assert.deepEqual(state.unconnectedPlugins, ['code-helper']);
  });

  it('returns all plugins as unconnected when no skillstack.json', () => {
    repoDir = createRepoFixture();

    const state = readPluginState(repoDir);
    assert.deepEqual(state.connectedPlugins, []);
    assert.deepEqual(state.unconnectedPlugins, ['analytics-pro', 'code-helper']);
  });

  it('extracts GitHub org from SSH remote', () => {
    repoDir = createRepoFixture({
      gitRemote: 'git@github.com:SkillStacks/ai-launchpad-marketplace.git',
    });

    const state = readPluginState(repoDir);
    assert.equal(state.git.org, 'SkillStacks');
  });

  it('extracts GitHub org from HTTPS remote', () => {
    repoDir = createRepoFixture({
      gitRemote: 'https://github.com/kenny-liao/my-plugins.git',
    });

    const state = readPluginState(repoDir);
    assert.equal(state.git.org, 'kenny-liao');
  });

  it('derives storefront URL from org and marketplace slug', () => {
    repoDir = createRepoFixture({
      gitRemote: 'git@github.com:SkillStacks/ai-launchpad-marketplace.git',
    });

    const state = readPluginState(repoDir);
    assert.equal(
      state.storefrontUrl,
      'https://store.skillstack.sh/s/SkillStacks/the-ai-launchpad/marketplace.json'
    );
  });

  it('detects stale SkillStack fields in marketplace.json', () => {
    repoDir = createRepoFixture({
      marketplace: {
        name: 'Test',
        storefront_repo: 'old-value',
        plugins: [
          {
            name: 'my-plugin',
            version: '1.0.0',
            source: '.',
            description: 'test',
            license_provider: 'polar',
            license_config: { org_id: 'old-uuid' },
            license_model: 'subscription',
          },
        ],
      },
    });

    const state = readPluginState(repoDir);
    assert.ok(state.staleFields.topLevel.includes('storefront_repo'));
    assert.ok(state.staleFields.perPlugin['my-plugin'].includes('license_provider'));
    assert.ok(state.staleFields.perPlugin['my-plugin'].includes('license_config'));
    assert.ok(state.staleFields.perPlugin['my-plugin'].includes('license_model'));
  });

  it('returns empty staleFields when marketplace.json is clean', () => {
    repoDir = createRepoFixture();

    const state = readPluginState(repoDir);
    assert.deepEqual(state.staleFields.topLevel, []);
    assert.deepEqual(state.staleFields.perPlugin, {});
  });

  it('reads plugin.json versions from source directories', () => {
    repoDir = createRepoFixture({
      pluginJsons: {
        'analytics-pro': { name: 'analytics-pro', version: '2.0.0' },
        'code-helper': { name: 'code-helper', version: '1.0.0' },
      },
    });

    const state = readPluginState(repoDir);
    assert.equal(state.pluginJsonVersions['analytics-pro'].version, '2.0.0');
    assert.equal(state.pluginJsonVersions['code-helper'].version, '1.0.0');
  });

  it('skips plugin.json for plugins without source directories', () => {
    repoDir = createRepoFixture();

    const state = readPluginState(repoDir);
    assert.deepEqual(state.pluginJsonVersions, {});
  });

  it('throws if marketplace.json does not exist', () => {
    repoDir = createRepoFixture();
    fs.unlinkSync(path.join(repoDir, '.claude-plugin', 'marketplace.json'));

    assert.throws(
      () => readPluginState(repoDir),
      { message: /marketplace\.json.*not found/ }
    );
  });

  it('uses fallback slug when marketplace has no name', () => {
    repoDir = createRepoFixture({
      marketplace: {
        plugins: [{ name: 'test', version: '1.0.0', source: '.', description: 'test' }],
      },
      gitRemote: 'git@github.com:SkillStacks/my-repo.git',
    });

    const state = readPluginState(repoDir);
    assert.equal(state.marketplace.slug, 'skillstacks-plugins');
  });

  it('preserves raw marketplace.json content', () => {
    repoDir = createRepoFixture();

    const state = readPluginState(repoDir);
    assert.ok(state.marketplace.raw);
    assert.ok(Array.isArray(state.marketplace.raw.plugins));
  });

  it('reads skill directories for each plugin with source', () => {
    repoDir = createRepoFixture({
      skillDirs: {
        'analytics-pro': ['dashboard', 'export', 'hook'],
        'code-helper': ['lint'],
      },
    });

    const state = readPluginState(repoDir);
    assert.ok(state.skillDirs);
    assert.deepEqual(state.skillDirs['analytics-pro'].sort(), ['dashboard', 'export', 'hook']);
    assert.deepEqual(state.skillDirs['code-helper'], ['lint']);
  });

  it('returns empty skillDirs for plugins without skills directory', () => {
    repoDir = createRepoFixture();

    const state = readPluginState(repoDir);
    assert.ok(state.skillDirs);
    assert.deepEqual(state.skillDirs, {});
  });
});
