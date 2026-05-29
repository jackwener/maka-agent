import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createDefaultBotChannel } from '@maka/core';
import { botReadinessFromSettings, botSettingsRequireRestart } from '../base-adapter.js';
import { normalizeWechatBridgeUrl } from '../wechat-bridge.js';

describe('WechatBridge', () => {
  test('normalizes only local http bridge URLs', () => {
    assert.equal(normalizeWechatBridgeUrl(undefined), 'http://127.0.0.1:18400');
    assert.equal(normalizeWechatBridgeUrl(' http://localhost:18400/ '), 'http://localhost:18400');
    assert.equal(normalizeWechatBridgeUrl('http://127.0.0.1:18400/'), 'http://127.0.0.1:18400');
    assert.equal(normalizeWechatBridgeUrl('https://127.0.0.1:18400'), null);
    assert.equal(normalizeWechatBridgeUrl('http://192.168.0.2:18400'), null);
    assert.equal(normalizeWechatBridgeUrl('https://example.com/wechat-bridge'), null);
  });

  test('bridge URL is a credential fact and a restart boundary', () => {
    const channel = createDefaultBotChannel('wechat');
    assert.equal(channel.webhookUrl, 'http://127.0.0.1:18400');
    assert.equal(botReadinessFromSettings({ ...channel, enabled: true }), 'configured');
    assert.equal(
      botSettingsRequireRestart(channel, { ...channel, webhookUrl: 'http://localhost:18400' }),
      true,
    );
  });
});
