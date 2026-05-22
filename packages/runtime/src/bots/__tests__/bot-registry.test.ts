import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createDefaultBotChannel } from '@maka/core/settings';
import type { BotChatSettings, BotProvider } from '@maka/core';
import { BotRegistry } from '../bot-registry.js';
import type { BotStatus } from '../types.js';

describe('BotRegistry', () => {
  test('reports disabled and unimplemented statuses without starting bridges', async () => {
    const statuses: BotStatus[] = [];
    const registry = new BotRegistry({
      onIncomingMessage: () => {},
      onStatusChange: (status) => statuses.push(status),
    });

    await registry.applySettings(settingsWith({
      wechat: { enabled: true, token: 'unused' },
    }));

    assert.equal(registry.getStatus('telegram').reason, 'disabled');
    assert.equal(registry.getStatus('telegram').readiness, 'scaffolded');
    assert.equal(registry.getStatus('wechat').reason, 'scaffold-only');
    assert.equal(registry.getStatus('wechat').running, false);
    assert.equal(registry.getStatus('wechat').readiness, 'configured');
    assert.equal(statuses.some((status) => status.platform === 'wechat' && status.readiness === 'configured'), true);
  });

  test('does not mark scaffold-only Discord as operational', async () => {
    const statuses: BotStatus[] = [];
    const registry = new BotRegistry({
      onIncomingMessage: () => {},
      onStatusChange: (status) => statuses.push(status),
    });

    await registry.applySettings(settingsWith({
      discord: { enabled: true, token: 'discord-token' },
    }));

    assert.equal(registry.getStatus('discord').running, false);
    assert.equal(registry.getStatus('discord').reason, 'scaffold-only');
    assert.equal(registry.getStatus('discord').readiness, 'configured');
    assert.equal(statuses.some((status) => status.platform === 'discord' && status.readiness === 'operational'), false);

    await registry.applySettings(settingsWith({
      discord: { enabled: false, token: 'discord-token' },
    }));

    assert.equal(registry.getStatus('discord').running, false);
    assert.equal(registry.getStatus('discord').reason, 'disabled');
    assert.equal(statuses.some((status) => status.platform === 'discord' && status.reason === 'disabled'), true);
  });

  test('queues overlapping applySettings calls so the newest settings win deterministically', async () => {
    const registry = new BotRegistry({
      onIncomingMessage: () => {},
      onStatusChange: () => {},
    });

    await Promise.all([
      registry.applySettings(settingsWith({ discord: { enabled: true, token: 'old-token' } })),
      registry.applySettings(settingsWith({ discord: { enabled: false, token: 'old-token' } })),
      registry.applySettings(settingsWith({ discord: { enabled: true, token: 'new-token' } })),
    ]);

    assert.equal(registry.getStatus('discord').running, false);
    assert.equal(registry.getStatus('discord').reason, 'scaffold-only');
    assert.equal(registry.getStatus('discord').readiness, 'configured');
  });

  test('stopAll waits behind any pending applySettings call and clears bridges', async () => {
    const registry = new BotRegistry({
      onIncomingMessage: () => {},
      onStatusChange: () => {},
    });

    await Promise.all([
      registry.applySettings(settingsWith({ discord: { enabled: true, token: 'discord-token' } })),
      registry.stopAll(),
    ]);

    assert.equal(registry.getStatus('discord').running, false);
    assert.equal(registry.getStatus('discord').reason, 'disabled');
  });

  test('credentials_valid remains non-operational without a runtime bridge probe', async () => {
    const registry = new BotRegistry({
      onIncomingMessage: () => {},
      onStatusChange: () => {},
    });

    await registry.applySettings(settingsWith({
      feishu: {
        enabled: true,
        token: 'tenant-token',
        appId: 'cli_123',
        appSecret: 'secret',
        connected: true,
        readiness: 'credentials_valid',
      },
    }));

    assert.equal(registry.getStatus('feishu').running, false);
    assert.equal(registry.getStatus('feishu').readiness, 'credentials_valid');
    assert.notEqual(registry.getStatus('feishu').readiness, 'operational');
  });
});

function settingsWith(overrides: Partial<Record<BotProvider, Partial<ReturnType<typeof createDefaultBotChannel>>>>): BotChatSettings {
  const providers: BotProvider[] = ['telegram', 'feishu', 'wecom', 'wechat', 'discord', 'dingtalk', 'qq'];
  return {
    channels: Object.fromEntries(
      providers.map((provider) => [
        provider,
        {
          ...createDefaultBotChannel(provider),
          ...(overrides[provider] ?? {}),
        },
      ]),
    ) as BotChatSettings['channels'],
  };
}
