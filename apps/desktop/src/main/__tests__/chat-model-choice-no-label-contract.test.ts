import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');

describe('chat model choice display label contract', () => {
  it('keeps ChatModelChoice label as a safe model display name only', async () => {
    const helpers = await readFile(
      resolve(REPO_ROOT, 'packages/ui/src/chat-model-helpers.ts'),
      'utf8',
    );

    const interfaceMatch = helpers.match(/export interface ChatModelChoice \{([\s\S]*?)\n\}/);
    assert.ok(interfaceMatch, 'ChatModelChoice interface must exist');
    const body = interfaceMatch[1]?.replace(/\/\*[\s\S]*?\*\//g, '') ?? '';
    const fieldNames = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//') && !line.startsWith('*'))
      .map((line) => line.match(/^(\w+)\??:/)?.[1])
      .filter((name): name is string => Boolean(name));

    assert.deepEqual(
      [...fieldNames].sort(),
      ['connectionSlug', 'label', 'model', 'providerType'],
      'ChatModelChoice must carry raw model id plus a safe model display label',
    );
    assert.ok(!fieldNames.includes('connectionLabel'), '`connectionLabel` can leak account identity and must stay removed');
  });

  it('buildCatalogChatModelChoices writes label from catalog display metadata', async () => {
    const renderer = await readFile(
      resolve(REPO_ROOT, 'apps/desktop/src/renderer/model-catalog-choices.ts'),
      'utf8',
    );

    const fnMatch = renderer.match(/export function buildCatalogChatModelChoices\([\s\S]*?\n\}/);
    assert.ok(fnMatch, 'buildCatalogChatModelChoices must exist');
    const fnBody = fnMatch[0]?.replace(/\/\*[\s\S]*?\*\//g, '') ?? '';

    assert.match(fnBody, /\blabel:\s*modelDisplayLabel\(entry\)/);
    assert.doesNotMatch(fnBody, /connection\.name|connectionName|connectionLabel/);
  });

  it('model switcher displays choice.label while keeping raw model ids as values', async () => {
    const ui = await readFile(
      resolve(REPO_ROOT, 'packages/ui/src/chat-model-switcher.tsx'),
      'utf8',
    );

    assert.match(
      ui,
      /value: modelChoiceValue\(choice\.connectionSlug, choice\.model\),\s*label: choice\.label,/,
      'Select items must keep raw model ids as values while displaying catalog labels',
    );
    assert.match(ui, /<span className="maka-model-switcher-item-main">\{choice\.label\}<\/span>/);
  });
});
