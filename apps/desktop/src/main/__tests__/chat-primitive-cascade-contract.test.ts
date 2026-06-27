import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { REPO_ROOT, readAllRendererCss, stripCssComments } from './css-test-helpers.js';

/**
 * Zero-visual governance contract for issue #332 PR1 — the chat
 * conversation-flow row/bubble *shell* moved onto the `@maka/ui` `Message` /
 * `Bubble` primitives. These assertions lock the two halves of "zero visual
 * change": the bespoke shell CSS is retired, while the Markdown prose and the
 * still-hand-written turn machinery (PR2) keep their exact layout.
 */
describe('chat primitive shell migration contract (#332 PR1)', () => {
  it('retires the bespoke bubble/row shell selectors', async () => {
    const css = stripCssComments(await readAllRendererCss());
    for (const selector of [
      '.maka-bubble-user',
      '.maka-bubble-truncated',
      '.maka-bubble-assistant-stack',
      '.message.user',
      '.message.assistant',
      '.message.system',
      '.message >',
      '.message pre',
    ]) {
      assert.ok(
        !css.includes(selector),
        `retired shell selector "${selector}" still present in renderer CSS`,
      );
    }
  });

  it('preserves the assistant Markdown prose (OUT of scope)', async () => {
    const css = await readAllRendererCss();
    for (const selector of [
      '.maka-bubble-assistant {',
      '.maka-bubble-assistant p',
      '.maka-bubble-assistant pre',
      '.maka-bubble-assistant table',
      '.maka-bubble-assistant li.task-list-item',
    ]) {
      assert.ok(css.includes(selector), `prose rule "${selector}" must be preserved`);
    }
  });

  it('keeps the row + re-anchors turn layout onto the Message primitive', async () => {
    const css = await readAllRendererCss();
    // The centered reading column / entrance animation stay authored.
    assert.ok(css.includes('.maka-message-row'), '.maka-message-row row base must stay');
    // Lineage row + footer (PR2, still hand-written) ride the primitive's
    // data hook so their measure column survives until they migrate.
    assert.ok(
      css.includes('[data-slot="message"][data-role="assistant"] .maka-turn-footer'),
      'turn footer layout must be re-anchored to the Message primitive',
    );
    assert.ok(
      css.includes('[data-slot="message"][data-role="system"] pre'),
      'system note pre styling must be re-anchored to the Message primitive',
    );
  });

  it('keeps the user bubble on the neutral token path, never primary/accent', async () => {
    const chatSrc = await readFile(
      resolve(REPO_ROOT, 'packages', 'ui', 'src', 'primitives', 'chat.tsx'),
      'utf8',
    );
    assert.ok(
      chatSrc.includes('bg-[var(--chat-user-bg)]'),
      'user bubble must keep the --chat-user-bg token path',
    );
    assert.ok(
      chatSrc.includes('max-w-[min(100%,640px)]'),
      'user bubble width cap must match the retired .maka-bubble-user (min(100%,640px))',
    );
    assert.ok(
      !/bg-primary|bg-accent/.test(chatSrc),
      'user bubble must never switch to primary/accent backgrounds',
    );
  });
});
