import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatView } from '@maka/ui';
import {
  drainAssistantStreamSlot,
  markAssistantStreamSlotDraining,
  settleAssistantStreamSlot,
  type AssistantStreamSlots,
} from '@maka/ui/assistant-stream';

describe('assistant streaming handoff', () => {
  it('keeps a draining assistant answer as the single visible owner before committed handoff', () => {
    const finalText = '12345678';
    const markup = renderToStaticMarkup(createElement(ChatView, {
      activeSession: {
        id: 'session-1',
        name: 'handoff',
        lastMessageAt: 1,
        status: 'active',
        backend: 'ai-sdk',
        labels: [],
        isFlagged: false,
        isArchived: false,
        hasUnread: false,
        llmConnectionSlug: 'conn',
        model: 'model',
        permissionMode: 'ask',
      },
      messages: [
        { type: 'user', id: 'user-1', turnId: 'turn-1', ts: 1, text: 'go' },
        { type: 'assistant', id: 'assistant-1', turnId: 'turn-1', ts: 2, text: finalText, modelId: 'model' },
      ],
      streamingText: finalText,
      streamingComplete: true,
      streamingMessageId: 'assistant-1',
      tools: [],
      mode: 'sessions',
      onNew() {},
    } satisfies Parameters<typeof ChatView>[0]));

    assert.match(markup, /maka-bubble-streaming/, 'draining output should remain in the streaming bubble');
    assert.equal(
      countOccurrences(markup, finalText),
      1,
      'draining output must not render both the committed message and the streaming bubble',
    );
  });

  it('does not clear the live assistant buffer directly on text_complete', async () => {
    const rendererPath = sourcePath('src/renderer/main.tsx');
    const source = await readFile(rendererPath, 'utf8');
    const branch = source.match(/case 'text_complete':[\s\S]*?case 'thinking_delta':/)?.[0] ?? '';

    assert.ok(branch, 'text_complete branch should be present');
    assert.doesNotMatch(
      branch,
      /clearStreaming\(sessionId\)/,
      'text_complete should drain the smoother before clearing the streaming bubble',
    );
  });

  it('complete uses the live streaming slot ref instead of the subscription-time closure', async () => {
    const rendererPath = sourcePath('src/renderer/main.tsx');
    const source = await readFile(rendererPath, 'utf8');
    const branch = source.match(/case 'complete':[\s\S]*?default:/)?.[0] ?? '';

    assert.ok(branch, 'complete branch should be present');
    assert.match(
      branch,
      /streamingBySessionRef\.current\[sessionId\]/,
      'complete events arrive through an activeId-only subscription, so the handler must read the latest streaming slot from a ref',
    );
    assert.doesNotMatch(
      branch,
      /const slot = streamingBySession\[sessionId\]/,
      'complete must not read streamingBySession from the stale subscription closure',
    );
  });

  it('text_complete replaces the live slot with the final draining text', () => {
    const current: AssistantStreamSlots = {
      'session-1': { text: 'part', truncated: true, phase: 'streaming', messageId: 'assistant-1' },
    };

    const next = drainAssistantStreamSlot(current, 'session-1', 'final answer', 'assistant-1');

    assert.equal(next['session-1']?.text, 'final answer');
    assert.equal(next['session-1']?.truncated, false);
    assert.equal(next['session-1']?.phase, 'draining');
    assert.equal(next['session-1']?.messageId, 'assistant-1');
  });

  it('complete marks the current streamed text as draining without replacing it', () => {
    const current: AssistantStreamSlots = {
      'session-1': { text: 'delta accumulated text', truncated: false, phase: 'streaming', messageId: 'assistant-1' },
    };

    const next = markAssistantStreamSlotDraining(current, 'session-1');

    assert.equal(next['session-1']?.text, 'delta accumulated text');
    assert.equal(next['session-1']?.phase, 'draining');
    assert.equal(next['session-1']?.messageId, 'assistant-1');
  });

  it('clears the settled stream slot even when the committed-message refresh fails once', async () => {
    let slots: AssistantStreamSlots = {
      'session-1': { text: 'final answer', truncated: false, phase: 'draining', messageId: 'assistant-1' },
    };

    await settleAssistantStreamSlot({
      sessionId: 'session-1',
      messageId: 'assistant-1',
      getCurrent: () => slots,
      refreshMessages: async () => false,
      setCurrent: (updater) => {
        slots = updater(slots);
      },
    });

    assert.deepEqual(slots['session-1'], { text: '', truncated: false, phase: 'streaming' });
  });

  it('refreshes committed messages before clearing the settled stream slot when refresh succeeds', async () => {
    const order: string[] = [];
    let slots: AssistantStreamSlots = {
      'session-1': { text: 'final answer', truncated: false, phase: 'draining', messageId: 'assistant-1' },
    };

    await settleAssistantStreamSlot({
      sessionId: 'session-1',
      messageId: 'assistant-1',
      getCurrent: () => slots,
      refreshMessages: async () => {
        order.push('refresh');
        return true;
      },
      setCurrent: (updater) => {
        order.push('clear');
        slots = updater(slots);
      },
    });

    assert.deepEqual(order, ['refresh', 'clear']);
    assert.deepEqual(slots['session-1'], { text: '', truncated: false, phase: 'streaming' });
  });

  it('does not clear a newer stream slot that replaces the settled one during refresh', async () => {
    const settledSlot = { text: 'old final', truncated: false, phase: 'draining' as const, messageId: 'assistant-old' };
    let slots: AssistantStreamSlots = { 'session-1': settledSlot };

    await settleAssistantStreamSlot({
      sessionId: 'session-1',
      messageId: 'assistant-old',
      getCurrent: () => slots,
      refreshMessages: async () => {
        slots = {
          'session-1': { text: 'new answer', truncated: false, phase: 'streaming', messageId: 'assistant-new' },
        };
        return true;
      },
      setCurrent: (updater) => {
        slots = updater(slots);
      },
    });

    assert.deepEqual(slots['session-1'], {
      text: 'new answer',
      truncated: false,
      phase: 'streaming',
      messageId: 'assistant-new',
    });
  });

  it('does not clear a replaced draining slot only because the message id still matches', async () => {
    const settledSlot = { text: 'old final', truncated: false, phase: 'draining' as const, messageId: 'assistant-1' };
    let slots: AssistantStreamSlots = { 'session-1': settledSlot };

    await settleAssistantStreamSlot({
      sessionId: 'session-1',
      messageId: 'assistant-1',
      getCurrent: () => slots,
      refreshMessages: async () => {
        slots = {
          'session-1': { text: 'replacement final', truncated: false, phase: 'draining', messageId: 'assistant-1' },
        };
        return true;
      },
      setCurrent: (updater) => {
        slots = updater(slots);
      },
    });

    assert.deepEqual(slots['session-1'], {
      text: 'replacement final',
      truncated: false,
      phase: 'draining',
      messageId: 'assistant-1',
    });
  });
});

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function sourcePath(relativeFromDesktop: string): string {
  const fromDesktop = join(process.cwd(), relativeFromDesktop);
  if (existsSync(fromDesktop)) return fromDesktop;
  return join(process.cwd(), 'apps/desktop', relativeFromDesktop);
}
