import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');

describe('model catalog picker contract', () => {
  it('does not use connection.name for Daily Review model labels', async () => {
    const settings = await readFile(
      resolve(REPO_ROOT, 'apps/desktop/src/renderer/settings/SettingsModal.tsx'),
      'utf8',
    );
    const helper = await readFile(
      resolve(REPO_ROOT, 'apps/desktop/src/renderer/model-catalog-choices.ts'),
      'utf8',
    );

    assert.match(settings, /function DailyReviewSettingsPage\(props:\s*\{\s*connections:\s*readonly LlmConnection\[\]/);
    assert.match(settings, /buildDailyReviewModelOptions\(props\.connections, effectiveConfig\?\.modelKey \?\? ''\)/);
    assert.doesNotMatch(settings, /window\.maka\.connections\.list\(\)[\s\S]*setModelConnections/, 'Daily Review settings must use SettingsModal connections instead of a second async connection source');
    assert.doesNotMatch(settings, /connectionName/);
    assert.doesNotMatch(helper, /connection\.name|connectionName/);
  });

  it('keeps unavailable Settings model catalog entries visible but unselectable', async () => {
    const providers = await readFile(
      resolve(REPO_ROOT, 'apps/desktop/src/renderer/settings/ProvidersPanel.tsx'),
      'utf8',
    );
    const tableBlock = providers.match(/function ModelTable[\s\S]*?function modelTableDisplayLabel/)?.[0] ?? '';
    const detailBlock = providers.match(/function ConnectionDetail[\s\S]*?function connectionDetailSnapshot/)?.[0] ?? '';

    assert.match(tableBlock, /selectableDefaultModelIds\(filtered\)/);
    assert.match(tableBlock, /canPickDefaultModel\(model\)/);
    assert.match(tableBlock, /disabled=\{props\.disabled \|\| !canPickDefault\}/);
    assert.match(tableBlock, /aria-disabled=\{!canPickDefault \|\| props\.disabled \? true : undefined\}/);
    assert.match(detailBlock, /canSaveDefaultModelChange\(connection\.defaultModel, defaultModel, modelChoices\)/);
  });
});
