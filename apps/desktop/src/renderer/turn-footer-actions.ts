/**
 * Pure derivation of turn footer action enabled-set (PR109d-b,
 * design-system §9.8 / §9.9).
 *
 * Lives outside the React component layer so the action × TurnStatus
 * × lineage matrix can be unit-tested with node:test. Mirrors the
 * `session-status-grouping.ts` + `chat-header-alert.ts` pattern.
 *
 * Footer actions (icon + Chinese text — see PR109d-b component for the
 * actual buttons):
 *
 *   - retry          ↻ 重试       → for failed / aborted turns
 *   - regenerate     🔁 重新生成   → for completed turns
 *   - branch         🌿 分支       → for any non-running turn (incl. aborted)
 *   - copy           📋 复制       → always available when there's content
 *
 * Running turns get only `copy` (the long-running operation finishes
 * naturally; cancel lives in the Composer Stop button, not the footer).
 *
 * @kenji PR109d review gate #1: footer enabled set is computed
 * **exclusively** from `TurnStatus` + lineage map, NOT from text
 * content or any optimistic UI state. This file is the canonical
 * source of that decision.
 */

import type { TurnStatus } from '@maka/core';

export type TurnFooterActionId = 'retry' | 'regenerate' | 'branch' | 'copy';

export interface TurnFooterAction {
  id: TurnFooterActionId;
  /** Chinese button label. */
  label: string;
  /**
   * Whether the button is enabled for this turn. A disabled button is
   * still rendered (so the user can see what actions exist on the
   * turn) but the click handler is a no-op. UI may also hide
   * disabled actions in compact mode.
   */
  enabled: boolean;
  /**
   * Tooltip explaining why the action is enabled/disabled. Always
   * Chinese; never exposes the raw TurnStatus enum identifier.
   */
  tooltip?: string;
}

export interface TurnFooterContext {
  status: TurnStatus;
  /**
   * True when the turn has at least one materialized assistant message
   * with non-empty text. Disables `copy` for empty turns (running
   * turns before the first delta, or aborted with no partial output).
   */
  hasContent: boolean;
  /**
   * True when there's already a retry / regenerate sibling for this
   * turn. Used to hint at "已重试" in the disabled-action tooltip so
   * the user understands why the button is greyed out — they already
   * retried.
   */
  alreadyRetried?: boolean;
  alreadyRegenerated?: boolean;
  /**
   * Per @kenji PR109d review: prevent double-click duplicate sibling
   * turns. The renderer marks an action `pending` from click time
   * until `sessions:changed` (or timeout) clears it; the footer
   * renders that action as disabled + busy with a "正在处理…"
   * tooltip. Other turns / other action types stay clickable.
   */
  pendingActions?: ReadonlySet<TurnFooterActionId>;
}

const ACTION_LABEL: Record<TurnFooterActionId, string> = {
  retry: '重试',
  regenerate: '重新生成',
  branch: '分支',
  copy: '复制',
};

/**
 * Derive the ordered list of footer actions to render for a turn.
 * The order is fixed at the matrix level (retry → regenerate → branch
 * → copy) so adjacent buttons line up across rows even when some are
 * disabled.
 *
 * @kenji PR109d gate: returned `enabled` flags depend only on
 * `TurnStatus` and lineage state; we never sniff the turn text or
 * fall back to optimistic guesses.
 */
export function deriveTurnFooterActions(input: TurnFooterContext): TurnFooterAction[] {
  const { status, hasContent, alreadyRetried, alreadyRegenerated, pendingActions } = input;
  const isPending = (id: TurnFooterActionId) => pendingActions?.has(id) ?? false;
  const PENDING_TOOLTIP = '正在处理…';

  // Build entries in fixed order; later filtering / disabling per matrix.
  const retry: TurnFooterAction = isPending('retry')
    ? { id: 'retry', label: ACTION_LABEL.retry, enabled: false, tooltip: PENDING_TOOLTIP }
    : {
        id: 'retry',
        label: ACTION_LABEL.retry,
        enabled: status === 'failed' || status === 'aborted',
        tooltip:
          status === 'failed' || status === 'aborted'
            ? alreadyRetried
              ? '已重试过，再次重试将创建新一轮回答'
              : '使用相同问题重新尝试'
            : '只有失败或被取消的回答可以重试',
      };
  const regenerate: TurnFooterAction = isPending('regenerate')
    ? { id: 'regenerate', label: ACTION_LABEL.regenerate, enabled: false, tooltip: PENDING_TOOLTIP }
    : {
        id: 'regenerate',
        label: ACTION_LABEL.regenerate,
        enabled: status === 'completed',
        tooltip:
          status === 'completed'
            ? alreadyRegenerated
              ? '已重新生成过，再次点击将创建新的并行回答'
              : '保留当前回答，让模型再回答一次'
            : '只有已完成的回答可以重新生成',
      };
  const branch: TurnFooterAction = isPending('branch')
    ? { id: 'branch', label: ACTION_LABEL.branch, enabled: false, tooltip: PENDING_TOOLTIP }
    : {
        id: 'branch',
        label: ACTION_LABEL.branch,
        enabled: status !== 'running',
        tooltip:
          status === 'running'
            ? '当前回答仍在进行中，结束后再分支'
            : status === 'aborted'
            ? '从中断前的上下文分支出新对话'
            : '基于此回答的上下文分支出新对话',
      };
  const copy: TurnFooterAction = {
    id: 'copy',
    label: ACTION_LABEL.copy,
    enabled: hasContent,
    tooltip: hasContent ? '复制回答到剪贴板' : '此回答尚无可复制的内容',
  };

  return [retry, regenerate, branch, copy];
}

/**
 * Convenience filter: keep only actions that are enabled. Used by the
 * compact-mode renderer where disabled buttons are hidden.
 */
export function enabledTurnFooterActions(input: TurnFooterContext): TurnFooterAction[] {
  return deriveTurnFooterActions(input).filter((action) => action.enabled);
}
