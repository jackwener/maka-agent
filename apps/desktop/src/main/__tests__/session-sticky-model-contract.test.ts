import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');

describe('PR-SESSION-STICKY-MODEL-0 contract', () => {
  it('captures the ready model when creating a desktop session', async () => {
    const main = await readFile(resolve(REPO_ROOT, 'apps/desktop/src/main/main.ts'), 'utf8');

    assert.match(main, /const requestedSlug = input\?\.llmConnectionSlug \?\? \(await connectionStore\.getDefault\(\)\)/);
    assert.match(main, /const \{ connection, model \} = await getReadyConnection\(requestedSlug, input\?\.model\)/);
    assert.match(main, /runtime\.createSession\(\{[\s\S]*llmConnectionSlug: connection\.slug,[\s\S]*model,/);
  });

  it('validates sends against the session model, not the latest provider default', async () => {
    const readiness = await readFile(resolve(REPO_ROOT, 'apps/desktop/src/main/chat-readiness.ts'), 'utf8');

    assert.match(readiness, /assertSessionCanSend\([\s\S]*header: Pick<SessionHeader, 'backend' \| 'llmConnectionSlug' \| 'model'>/);
    assert.match(readiness, /requireReadyConnection\(header\.llmConnectionSlug, deps, header\.model\)/);
    assert.match(readiness, /Once a session has user messages, its connection\/model is sticky/);
    assert.match(readiness, /if \(header\.connectionLocked\) \{\s*throw error;\s*\}/);
  });

  it('preserves sticky model through branch sessions and session summaries', async () => {
    const runtime = await readFile(resolve(REPO_ROOT, 'packages/runtime/src/session-manager.ts'), 'utf8');
    const storage = await readFile(resolve(REPO_ROOT, 'packages/storage/src/session-store.ts'), 'utf8');
    const core = await readFile(resolve(REPO_ROOT, 'packages/core/src/session.ts'), 'utf8');

    assert.match(runtime, /branchFromTurn[\s\S]*model: header\.model/);
    assert.match(runtime, /model: h\.model/);
    assert.match(storage, /model: header\.model/);
    assert.match(core, /Sticky session default model id, captured when the session is created/);
  });

  it('surfaces the session model in the chat header and explains default-model scope', async () => {
    const renderer = await readFile(resolve(REPO_ROOT, 'apps/desktop/src/renderer/main.tsx'), 'utf8');
    const ui = await readFile(resolve(REPO_ROOT, 'packages/ui/src/components.tsx'), 'utf8');
    const providers = await readFile(resolve(REPO_ROOT, 'apps/desktop/src/renderer/settings/ProvidersPanel.tsx'), 'utf8');

    assert.match(renderer, /activeSession\?\.model \?\? activeConnection\?\.defaultModel/);
    assert.match(ui, /本会话固定模型：\$\{props\.activeConnectionLabel\} · \$\{props\.activeModelLabel\}/);
    assert.match(ui, /设置里的默认模型只影响新建会话/);
    assert.match(providers, /默认模型只用于新建会话；已有会话会保留创建时的模型选择/);
  });

  it('flags per-turn model departures against the session sticky model', async () => {
    const ui = await readFile(resolve(REPO_ROOT, 'packages/ui/src/components.tsx'), 'utf8');

    assert.match(ui, /props\.activeSession\?\.model && props\.activeSession\.model\.length > 0/);
    assert.match(ui, /previousModelId=\{expectedModelId\}/);
    assert.match(ui, /本轮使用 \$\{turn\.modelId\}，session 期望 \$\{props\.previousModelId\}/);
    assert.match(ui, /本轮切换了模型/);
  });
});
