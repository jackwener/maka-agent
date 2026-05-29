import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd().endsWith('apps/desktop')
  ? join(process.cwd(), '..', '..')
  : process.cwd();

async function readRepo(path: string): Promise<string> {
  return readFile(join(repoRoot, path), 'utf8');
}

describe('Settings usage dashboard contract', () => {
  it('keeps request filters scoped to the request log tab', async () => {
    const src = await readRepo('apps/desktop/src/renderer/settings/SettingsModal.tsx');
    const usagePage = src.match(/function UsageSettingsPage\([\s\S]*?function UsageTable/);

    assert.ok(usagePage, 'Usage settings page block must exist');
    assert.match(usagePage![0], /usage\.activeTab === 'requests'/);
    assert.match(usagePage![0], /settingsUsageFilters/);
    assert.match(usagePage![0], /清除筛选/);
    assert.match(usagePage![0], /status: 'all', modelFilter: ''/);
    assert.match(
      usagePage![0],
      /\{usage\.activeTab === 'requests' && \([\s\S]*?<div className="settingsUsageFilters">/,
      'Usage filters must live under the requests-only conditional block',
    );
    assert.match(
      usagePage![0],
      /\{usage\.showDetails && \([\s\S]*?<input value=\{usage\.modelFilter\}/,
      'model/status request filters must be hidden until detail records are enabled',
    );
  });

  it('shows a distinct empty state when request filters hide all logs', async () => {
    const src = await readRepo('apps/desktop/src/renderer/settings/SettingsModal.tsx');

    assert.match(src, /requestEmpty=\{hasRequestFilters \? '没有符合筛选条件的请求记录' : '暂无请求记录'\}/);
    assert.match(src, /empty=\{props\.requestEmpty\}/);
  });

  it('makes the detail-records toggle control request log rendering', async () => {
    const src = await readRepo('apps/desktop/src/renderer/settings/SettingsModal.tsx');
    const usagePage = src.match(/function UsageSettingsPage\([\s\S]*?function UsageTable/);

    assert.ok(usagePage, 'Usage settings page block must exist');
    assert.match(usagePage![0], /const showRequestDetails = usage\.activeTab === 'requests' && usage\.showDetails/);
    assert.match(usagePage![0], /usage\.activeTab === 'requests' && !usage\.showDetails/);
    assert.match(usagePage![0], /当前仅显示汇总指标/);
    assert.match(usagePage![0], /显示明细/);
    assert.match(usagePage![0], /showDetails: true/);
    assert.match(usagePage![0], /logs=\{showRequestDetails \? filteredLogs : \[\]\}/);
  });
});
