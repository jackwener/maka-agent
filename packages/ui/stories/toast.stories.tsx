import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToastProvider, useToast, type ToastVariant } from '../src/toast.js';
import { Button } from '../src/ui.js';

const meta = {
  title: 'Primitives/Toast',
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const VARIANTS: ToastVariant[] = ['info', 'success', 'warning', 'error'];

function ToastGrid() {
  const toast = useToast();
  return (
    <div style={{ display: 'grid', gap: 12, padding: 24, width: 360 }}>
      <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>点击触发 toast（4 秒自动消失）</span>
      <div style={{ display: 'grid', gap: 8 }}>
        {VARIANTS.map((variant) => (
          <Button
            key={variant}
            variant="outline"
            onClick={() => toast.toast({ title: `${variant} 标题`, description: `${variant} 说明文字`, variant })}
          >
            {variant}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ShortcutButtons({ methods }: { methods: { label: string; fn: () => void }[] }) {
  return (
    <div style={{ display: 'grid', gap: 8, padding: 24, width: 360 }}>
      {methods.map((m) => (
        <Button key={m.label} variant="outline" onClick={m.fn}>
          {m.label}
        </Button>
      ))}
    </div>
  );
}

export const Variants: Story = {
  render: () => <ToastGrid />,
};

export const Shortcuts: Story = {
  render: () => {
    const toast = useToast();
    return (
      <ShortcutButtons
        methods={[
          { label: 'success()', fn: () => toast.success('保存成功', 'MEMORY.md 已写入。') },
          { label: 'error()', fn: () => toast.error('连接失败', '请检查 API key 后重试。') },
          { label: 'info()', fn: () => toast.info('提示', '新版本已可用。') },
          { label: 'warning()', fn: () => toast.warning('存储空间不足', '剩余空间低于 1 GB。') },
        ]}
      />
    );
  },
};

export const WithAction: Story = {
  render: () => {
    const toast = useToast();
    return (
      <div style={{ display: 'grid', gap: 8, padding: 24, width: 360 }}>
        <Button
          variant="outline"
          onClick={() =>
            toast.toast({
              title: '已删除会话',
              description: '“本周周报”已移到回收站。',
              variant: 'info',
              action: { label: '撤销', onClick: () => window.setTimeout(() => undefined, 0) },
            })
          }
        >
          删除会话（带撤销）
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.toast({
              title: '已保存',
              variant: 'success',
              duration: 0,
              action: { label: '查看', onClick: () => undefined },
            })
          }
        >
          保存（不自动消失）
        </Button>
      </div>
    );
  },
};

export const Confirm: Story = {
  render: () => {
    const toast = useToast();
    const [result, setResult] = useState<string>('（未触发）');
    return (
      <div style={{ display: 'grid', gap: 12, padding: 24, width: 360 }}>
        <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>结果：{result}</span>
        <Button
          variant="outline"
          onClick={async () => {
            const ok = await toast.confirm({ title: '删除项目？', description: '此操作不可撤销。', confirmLabel: '删除', destructive: true });
            setResult(ok ? '已确认' : '已取消');
          }}
        >
          destructive confirm
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const ok = await toast.confirm({ title: '保存修改？', confirmLabel: '保存' });
            setResult(ok ? '已确认' : '已取消');
          }}
        >
          普通 confirm
        </Button>
      </div>
    );
  },
};