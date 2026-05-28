import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  PERMISSION_REQUEST_EXPIRED_AFTER_MS,
  PERMISSION_REQUEST_HEALTH_STATUSES,
  PERMISSION_REQUEST_STALE_AFTER_MS,
  derivePermissionRequestHealth,
  formatPermissionRequestWait,
  isPermissionRequestHealthStatus,
} from '../permission-request-health.js';

describe('permission request health', () => {
  it('uses a closed visible health enum', () => {
    assert.deepEqual([...PERMISSION_REQUEST_HEALTH_STATUSES], ['fresh', 'stale', 'expired']);
    assert.equal(isPermissionRequestHealthStatus('fresh'), true);
    assert.equal(isPermissionRequestHealthStatus('waiting'), false);
  });

  it('classifies fresh / stale / expired by age', () => {
    assert.deepEqual(
      derivePermissionRequestHealth({
        requestedAt: 1_000,
        now: 1_000 + PERMISSION_REQUEST_STALE_AFTER_MS - 1,
      }),
      { status: 'fresh', ageMs: PERMISSION_REQUEST_STALE_AFTER_MS - 1 },
    );
    assert.deepEqual(
      derivePermissionRequestHealth({
        requestedAt: 1_000,
        now: 1_000 + PERMISSION_REQUEST_STALE_AFTER_MS,
      }),
      { status: 'stale', ageMs: PERMISSION_REQUEST_STALE_AFTER_MS },
    );
    assert.deepEqual(
      derivePermissionRequestHealth({
        requestedAt: 1_000,
        now: 1_000 + PERMISSION_REQUEST_EXPIRED_AFTER_MS,
      }),
      { status: 'expired', ageMs: PERMISSION_REQUEST_EXPIRED_AFTER_MS },
    );
  });

  it('clamps future timestamps to zero age', () => {
    assert.deepEqual(derivePermissionRequestHealth({ requestedAt: 10_000, now: 1_000 }), {
      status: 'fresh',
      ageMs: 0,
    });
  });

  it('formats wait duration without exposing raw milliseconds', () => {
    assert.equal(formatPermissionRequestWait(0), '< 1 分钟');
    assert.equal(formatPermissionRequestWait(59_999), '< 1 分钟');
    assert.equal(formatPermissionRequestWait(60_000), '1 分钟');
    assert.equal(formatPermissionRequestWait(5 * 60_000), '5 分钟');
    assert.equal(formatPermissionRequestWait(60 * 60_000), '1 小时');
    assert.equal(formatPermissionRequestWait(95 * 60_000), '1 小时 35 分钟');
  });
});
