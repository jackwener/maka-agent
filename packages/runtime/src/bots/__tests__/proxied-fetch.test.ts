import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PROXY_DEFAULTS } from '@maka/core/settings/network-settings';
import { setActiveProxy } from '../../network/active-proxy-state.js';
import { proxiedFetch } from '../proxied-fetch.js';

describe('proxiedFetch', () => {
  test('times out and destroys stuck active proxy dispatchers', async () => {
    setActiveProxy({
      ...PROXY_DEFAULTS,
      enabled: true,
      type: 'http',
      host: 'abc.invalid',
      port: 1,
    });
    const started = Date.now();

    try {
      await assert.rejects(
        () => proxiedFetch('http://example.com', { timeoutMs: 100 }),
        /timeout/i,
      );
      assert.ok(Date.now() - started < 2_000);
    } finally {
      setActiveProxy(null);
    }
  });
});
