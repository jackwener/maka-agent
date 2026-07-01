import type { DailyReviewSummary } from '@maka/core';
import { dailyReviewActionErrorMessage, dailyReviewExportDefaultName } from './daily-review-actions';

type ToastApi = {
  success(title: string, description?: string): void;
  error(title: string, description?: string): void;
};

type RefBox<T> = { current: T };

type ComposerAppendHandle = {
  appendText(text: string): void;
};

type DailyReviewMarkdownInput = {
  markdown: string;
  label: string;
  summary: DailyReviewSummary;
};

type DailyReviewFeedbackOptions = {
  shouldShowFeedback?: () => boolean;
};

export interface AppShellDailyReviewActions {
  copyDailyReviewMarkdown(
    input: DailyReviewMarkdownInput,
    options?: DailyReviewFeedbackOptions,
  ): Promise<void>;
  appendDailyReviewMarkdown(input: DailyReviewMarkdownInput): void;
  saveDailyReviewMarkdown(
    input: DailyReviewMarkdownInput,
    options?: DailyReviewFeedbackOptions,
  ): Promise<void>;
}

export function createAppShellDailyReviewActions(deps: {
  composerRef: RefBox<ComposerAppendHandle | null>;
  toastApi: ToastApi;
}): AppShellDailyReviewActions {
  const { composerRef, toastApi } = deps;

  async function copyDailyReviewMarkdown(
    input: DailyReviewMarkdownInput,
    options: DailyReviewFeedbackOptions = {},
  ) {
    const shouldShowFeedback = options.shouldShowFeedback ?? (() => true);
    try {
      await navigator.clipboard.writeText(input.markdown);
      if (shouldShowFeedback()) {
        toastApi.success(
          `已复制${input.label}回顾`,
          `${input.summary.totals.sessionCount} 个对话 · ${input.summary.totals.requestCount} 个请求`,
        );
      }
    } catch (error) {
      if (shouldShowFeedback()) {
        toastApi.error('复制失败', dailyReviewActionErrorMessage(error, '剪贴板不可用或被系统拒绝'));
      }
    }
  }

  function appendDailyReviewMarkdown(input: DailyReviewMarkdownInput): void {
    composerRef.current?.appendText(input.markdown);
    toastApi.success(
      `已追加${input.label}回顾到输入框`,
      `${input.summary.totals.sessionCount} 个对话 · ${input.summary.totals.requestCount} 个请求`,
    );
  }

  async function saveDailyReviewMarkdown(
    input: DailyReviewMarkdownInput,
    options: DailyReviewFeedbackOptions = {},
  ) {
    const shouldShowFeedback = options.shouldShowFeedback ?? (() => true);
    try {
      const result = await window.maka.dailyReview.saveMarkdownToFile({
        markdown: input.markdown,
        defaultName: dailyReviewExportDefaultName(input.label),
      });
      if (result.ok) {
        if (shouldShowFeedback()) {
          toastApi.success(
            `已保存${input.label}回顾`,
            `${input.summary.totals.sessionCount} 个对话 · ${input.summary.totals.requestCount} 个请求`,
          );
        }
      } else if (result.reason === 'canceled') {
        // User dismissed the dialog, no toast.
      } else if (result.reason === 'invalid_input') {
        if (shouldShowFeedback()) toastApi.error('保存失败', '导出内容无效');
      } else {
        if (shouldShowFeedback()) toastApi.error('保存失败', '无法写入选择的位置');
      }
    } catch (err) {
      if (shouldShowFeedback()) {
        toastApi.error('保存失败', dailyReviewActionErrorMessage(err, '保存每日回顾失败，请稍后重试。'));
      }
    }
  }

  return {
    copyDailyReviewMarkdown,
    appendDailyReviewMarkdown,
    saveDailyReviewMarkdown,
  };
}
