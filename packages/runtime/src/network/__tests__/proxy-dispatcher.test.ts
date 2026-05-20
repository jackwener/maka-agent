import { describe, test } from 'node:test';
import { expect } from '../../test-helpers.js';
import { PROXY_DEFAULTS } from '@maka/core/settings/network-settings';
import { buildProxyDispatcher } from '../proxy-dispatcher.js';

describe('buildProxyDispatcher', () => {
  test('uses undici ProxyAgent for HTTP proxies', async () => {
    const dispatcher = buildProxyDispatcher({
      ...PROXY_DEFAULTS,
      enabled: true,
      type: 'http',
      host: '127.0.0.1',
      port: 7890,
    });

    try {
      expect(dispatcher.constructor.name).toBe('ProxyAgent');
    } finally {
      await dispatcher.close().catch(() => {});
    }
  });
});
