import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { connectionTestStatusPatch } from '../connection-test-status.js';

describe('connection test status persistence', () => {
  const now = new Date('2026-05-21T09:00:00.000Z');

  test('success writes verified with a generalized message', () => {
    assert.deepEqual(
      connectionTestStatusPatch({ ok: true, modelTested: 'claude-sonnet-4-5' }, now),
      {
        lastTestStatus: 'verified',
        lastTestAt: now.toISOString(),
        lastTestMessage: '连接已验证',
      },
    );
  });

  test('401/403 failures write needs_reauth', () => {
    assert.equal(
      connectionTestStatusPatch({ ok: false, statusCode: 401, errorMessage: '401 raw provider body' }, now).lastTestStatus,
      'needs_reauth',
    );
    assert.deepEqual(
      connectionTestStatusPatch({ ok: false, statusCode: 403, errorClass: 'auth' }, now),
      {
        lastTestStatus: 'needs_reauth',
        lastTestAt: now.toISOString(),
        lastTestMessage: '鉴权失败',
      },
    );
  });

  test('timeout, network, and 5xx failures write generic error statuses', () => {
    assert.equal(
      connectionTestStatusPatch({ ok: false, errorClass: 'timeout', errorMessage: 'Fetch timeout' }, now).lastTestMessage,
      '请求超时',
    );
    assert.equal(
      connectionTestStatusPatch({ ok: false, errorClass: 'network', errorMessage: 'ECONNREFUSED token=abc' }, now).lastTestMessage,
      '网络错误',
    );
    assert.equal(
      connectionTestStatusPatch({ ok: false, statusCode: 503, errorMessage: '503 raw upstream body' }, now).lastTestMessage,
      '模型服务返回错误',
    );
  });

  test('persistent message never stores raw provider error text', () => {
    const result = connectionTestStatusPatch({
      ok: false,
      errorClass: 'network',
      errorMessage: 'Authorization: Bearer sk-live-secret-token-value',
    }, now);

    assert.equal(JSON.stringify(result).includes('sk-live-secret-token-value'), false);
  });

  test('persistent message stays localized for Settings rows', () => {
    const serialized = JSON.stringify([
      connectionTestStatusPatch({ ok: true, modelTested: 'claude-sonnet-4-5' }, now),
      connectionTestStatusPatch({ ok: false, statusCode: 403, errorClass: 'auth' }, now),
      connectionTestStatusPatch({ ok: false, errorClass: 'timeout', errorMessage: 'Fetch timeout' }, now),
      connectionTestStatusPatch({ ok: false, errorClass: 'network', errorMessage: 'ECONNREFUSED token=abc' }, now),
      connectionTestStatusPatch({ ok: false, statusCode: 503, errorMessage: '503 raw upstream body' }, now),
    ]);

    assert.doesNotMatch(
      serialized,
      /Connection verified|Authentication failed|Request timed out|Network error|Provider returned an error|Connection test failed/,
    );
  });
});
