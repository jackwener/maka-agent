import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readRendererContractCss } from './contract-css-helpers.js';

describe('sidebar topbar rail geometry contract', () => {
  it('anchors expanded and collapsed shell controls to the same top-left geometry', async () => {
    const css = await readRendererContractCss();

    const tokenRule = extractRuleBody(css, '.maka-shell-2col');
    assert.ok(tokenRule, '.maka-shell-2col must define the shared topbar geometry tokens');
    for (const token of [
      '--maka-sidebar-topbar-button-size',
      '--maka-sidebar-topbar-gap',
      '--maka-sidebar-topbar-offset-y',
      '--maka-sidebar-topbar-offset-x',
    ]) {
      assert.match(tokenRule, new RegExp(`${escapeRegExp(token)}\\s*:`), `${token} must be defined once on the shell`);
    }

    const shellRail = extractRuleBody(css, '.maka-shell-topbar-rail');
    assert.ok(shellRail, '.maka-shell-topbar-rail rule must exist');
    assert.match(shellRail, /top:\s*var\(--maka-sidebar-topbar-offset-y\)/);
    assert.match(shellRail, /left:\s*var\(--maka-sidebar-topbar-offset-x\)/);
    assert.match(shellRail, /gap:\s*var\(--maka-sidebar-topbar-gap\)/);
    assert.doesNotMatch(
      shellRail,
      /var\(--maka-session-list-width/,
      'shell controls must not move horizontally when the sidebar width changes',
    );

    const shellButtons = extractRuleBody(css, '.maka-shell-topbar-button');
    assert.ok(shellButtons, 'shell rail buttons must share one rule');
    assert.match(shellButtons, /width:\s*var\(--maka-sidebar-topbar-button-size\)/);
    assert.match(shellButtons, /height:\s*var\(--maka-sidebar-topbar-button-size\)/);
  });
});

function extractRuleBody(css: string, selector: string | string[]): string | undefined {
  const expected = Array.isArray(selector) ? selector : [selector];
  for (const rule of iterateRules(css)) {
    const selectors = rule.selector.split(',').map((part) => part.trim());
    if (selectors.length === expected.length && expected.every((part) => selectors.includes(part))) {
      return rule.body;
    }
  }
  return undefined;
}

function* iterateRules(css: string): Generator<{ selector: string; body: string }> {
  let i = 0;
  while (i < css.length) {
    const braceIdx = css.indexOf('{', i);
    if (braceIdx === -1) return;
    const selector = css.slice(i, braceIdx).trim();
    let depth = 1;
    let j = braceIdx + 1;
    while (j < css.length && depth > 0) {
      const ch = css[j];
      if (ch === '{') depth += 1;
      if (ch === '}') depth -= 1;
      j += 1;
    }
    if (selector && !selector.startsWith('@')) {
      yield { selector, body: css.slice(braceIdx + 1, j - 1) };
    }
    i = j;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
