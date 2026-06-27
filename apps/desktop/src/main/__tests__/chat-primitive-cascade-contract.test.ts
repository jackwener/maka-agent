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

  it('pins the user bubble shell to the retired .maka-bubble-user pixels', async () => {
    const rawSrc = await readFile(
      resolve(REPO_ROOT, 'packages', 'ui', 'src', 'primitives', 'chat.tsx'),
      'utf8',
    );
    // Strip comments so the assertions reflect real classNames, not prose that
    // happens to name the scale utilities it is telling us to avoid.
    const chatSrc = rawSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    // The shell values are LITERAL Tailwind arbitrary utilities, so each one
    // compiles 1:1 to its declaration on a leaf element with nothing to
    // resolve or override — asserting the class string here is equivalent to
    // asserting the computed style, without a browser. Values mirror the
    // retired `.maka-bubble-user` exactly (border-radius:10px; padding:10px
    // 14px; line-height:1.6; max-width:min(100%,640px); --chat-user-bg).
    for (const literal of [
      'rounded-[10px]',
      'px-[14px]',
      'py-[10px]',
      'leading-[1.6]',
      'max-w-[min(100%,640px)]',
      'bg-[var(--chat-user-bg)]',
    ]) {
      assert.ok(chatSrc.includes(literal), `user bubble must keep the literal "${literal}"`);
    }
    // Never the semantic radius/spacing scale (would re-tune under a redesign)
    // and never primary/accent (the neutral user-bubble token path is fixed).
    assert.ok(
      !/rounded-lg|bg-primary|bg-accent/.test(chatSrc),
      'user bubble must not use semantic rounded-lg or primary/accent backgrounds',
    );
  });
});
