import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  DEEP_RESEARCH_SESSION_LABEL,
  buildDeepResearchSystemPromptFragment,
  isDeepResearchSession,
  normalizeQuickChatMode,
} from '../explore-agent.js';
import { PERMISSION_POLICY } from '../permission.js';

describe('deep research session profile', () => {
  it('normalizes quick-chat mode fail-closed to normal chat', () => {
    assert.equal(normalizeQuickChatMode('deep_research'), 'deep_research');
    assert.equal(normalizeQuickChatMode('chat'), 'chat');
    assert.equal(normalizeQuickChatMode('execute'), 'chat');
    assert.equal(normalizeQuickChatMode(null), 'chat');
  });

  it('detects the stable session label', () => {
    assert.equal(isDeepResearchSession([DEEP_RESEARCH_SESSION_LABEL]), true);
    assert.equal(isDeepResearchSession(['research']), false);
    assert.equal(isDeepResearchSession(undefined), false);
  });

  it('explore policy remains read-only for writes and destructive actions', () => {
    assert.equal(PERMISSION_POLICY.explore.read, 'allow');
    assert.equal(PERMISSION_POLICY.explore.shell_safe, 'allow');
    assert.equal(PERMISSION_POLICY.explore.file_write, 'block');
    assert.equal(PERMISSION_POLICY.explore.fs_destructive, 'block');
    assert.equal(PERMISSION_POLICY.explore.shell_unsafe, 'block');
    assert.equal(PERMISSION_POLICY.explore.network_send, 'block');
    assert.equal(PERMISSION_POLICY.explore.subagent, 'block');
  });

  it('system prompt names source-grounded research and no-write boundaries', () => {
    const prompt = buildDeepResearchSystemPromptFragment();
    assert.match(prompt, /Read, Glob, Grep/);
    assert.match(prompt, /Do not write/);
    assert.match(prompt, /borrow \/ diverge \/ risk \/ gate/);
  });
});
