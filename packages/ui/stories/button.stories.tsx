import type { Meta, StoryObj } from '@storybook/react-vite';
import { Plus, Search, Trash2 } from '@maka/ui/icons';
import { Button } from '../src/ui.js';
import { Spinner } from '../src/primitives/spinner.js';

const meta = {
  title: 'Primitives/Button',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const VARIANTS = ['default', 'secondary', 'ghost', 'outline', 'destructive', 'quiet'] as const;
const SIZES = ['sm', 'md', 'lg', 'icon', 'icon-sm', 'nav'] as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ alignItems: 'center', display: 'flex', gap: 12 }}>
      <span style={{ color: 'var(--muted-foreground)', fontSize: 12, width: 72 }}>{label}</span>
      <div style={{ alignItems: 'center', display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

export const VariantMatrix: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12, width: 560 }}>
      {VARIANTS.map((variant) => (
        <Row key={variant} label={variant}>
          <Button variant={variant}>按钮</Button>
          <Button variant={variant} disabled>disabled</Button>
        </Row>
      ))}
    </div>
  ),
};

export const SizeMatrix: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12, width: 560 }}>
      {SIZES.map((size) => (
        <Row key={size} label={size}>
          <Button size={size}>Aa</Button>
        </Row>
      ))}
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button>
        <Plus aria-hidden="true" />
        新建
      </Button>
      <Button variant="secondary">
        <Search aria-hidden="true" />
        搜索
      </Button>
      <Button variant="destructive">
        <Trash2 aria-hidden="true" />
        删除
      </Button>
      <Button variant="outline" size="icon" aria-label="搜索">
        <Search aria-hidden="true" />
      </Button>
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button disabled>
        <Spinner style={{ height: 14, width: 14 }} />
        提交中
      </Button>
      <Button variant="secondary" disabled>
        <Spinner style={{ height: 14, width: 14 }} />
        加载
      </Button>
      <Button variant="outline" size="icon-sm" disabled aria-label="加载中">
        <Spinner style={{ height: 14, width: 14 }} />
      </Button>
    </div>
  ),
};

export const NavSize: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button size="nav" className="h-[30px] min-h-[30px] px-1.5 text-xs">
        nav 行内
      </Button>
      <Button size="nav" variant="ghost" className="h-[30px] min-h-[30px] px-1.5 text-xs">
        ghost nav
      </Button>
    </div>
  ),
};