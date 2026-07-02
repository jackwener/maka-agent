import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Search } from '@maka/ui/icons';
import {
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectList,
  SelectPortal,
  SelectPositioner,
  SelectPopup,
  SelectRoot,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../src/ui.js';

const meta = {
  title: 'Primitives/Select',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

type Option = { value: string; label: string };

const FRUITS: Option[] = [
  { value: 'apple', label: '苹果' },
  { value: 'banana', label: '香蕉' },
  { value: 'cherry', label: '樱桃' },
  { value: 'durian', label: '榴莲' },
];

const GROUPED: { label: string; options: Option[] }[] = [
  {
    label: '柑橘类',
    options: [
      { value: 'orange', label: '橙子' },
      { value: 'lemon', label: '柠檬' },
      { value: 'grapefruit', label: '柚子' },
    ],
  },
  {
    label: '浆果类',
    options: [
      { value: 'strawberry', label: '草莓' },
      { value: 'blueberry', label: '蓝莓' },
      { value: 'raspberry', label: '树莓' },
    ],
  },
];

function BasicSelect() {
  const [value, setValue] = useState('apple');
  return (
    <SelectRoot
      items={FRUITS}
      value={value}
      onValueChange={(v) => { if (v !== null) setValue(v as string); }}
    >
      <SelectTrigger style={{ width: 200 }} aria-label="选择水果">
        <SelectValue />
      </SelectTrigger>
      <SelectPortal>
        <SelectPositioner alignItemWithTrigger={false} sideOffset={8}>
          <SelectPopup>
            <SelectList>
              {FRUITS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectList>
          </SelectPopup>
        </SelectPositioner>
      </SelectPortal>
    </SelectRoot>
  );
}

function GroupedSelect() {
  const [value, setValue] = useState('orange');
  const flat = GROUPED.flatMap((g) => g.options);
  return (
    <SelectRoot
      items={flat}
      value={value}
      onValueChange={(v) => { if (v !== null) setValue(v as string); }}
    >
      <SelectTrigger style={{ width: 200 }} aria-label="选择水果（分组）">
        <SelectValue />
      </SelectTrigger>
      <SelectPortal>
        <SelectPositioner alignItemWithTrigger={false} sideOffset={8}>
          <SelectPopup>
            <SelectList>
              {GROUPED.map((group, index) => (
                <div key={group.label}>
                  {index > 0 && <SelectSeparator />}
                  <SelectGroup>
                    <SelectGroupLabel>{group.label}</SelectGroupLabel>
                    {group.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </div>
              ))}
            </SelectList>
          </SelectPopup>
        </SelectPositioner>
      </SelectPortal>
    </SelectRoot>
  );
}

function DisabledSelect() {
  return (
    <SelectRoot items={FRUITS} value="apple" disabled>
      <SelectTrigger style={{ width: 200 }} aria-label="禁用选择器">
        <SelectValue />
      </SelectTrigger>
      <SelectPortal>
        <SelectPositioner alignItemWithTrigger={false} sideOffset={8}>
          <SelectPopup>
            <SelectList>
              {FRUITS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectList>
          </SelectPopup>
        </SelectPositioner>
      </SelectPortal>
    </SelectRoot>
  );
}

function SelectWithLeadingIcon() {
  const [value, setValue] = useState('apple');
  return (
    <SelectRoot
      items={FRUITS}
      value={value}
      onValueChange={(v) => { if (v !== null) setValue(v as string); }}
    >
      <SelectTrigger style={{ width: 220 }} aria-label="带前缀图标的选择器">
        <Search size={14} strokeWidth={1.75} aria-hidden="true" style={{ marginRight: 4 }} />
        <SelectValue />
      </SelectTrigger>
      <SelectPortal>
        <SelectPositioner alignItemWithTrigger={false} sideOffset={8}>
          <SelectPopup>
            <SelectList>
              {FRUITS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectList>
          </SelectPopup>
        </SelectPositioner>
      </SelectPortal>
    </SelectRoot>
  );
}

export const Basic: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, padding: 24, width: 240 }}>
      <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>单选，点击触发</span>
      <BasicSelect />
    </div>
  ),
};

export const Grouped: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, padding: 24, width: 240 }}>
      <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>分组 + 分隔线</span>
      <GroupedSelect />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, padding: 24, width: 240 }}>
      <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>禁用态</span>
      <DisabledSelect />
    </div>
  ),
};

export const WithLeadingIcon: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, padding: 24, width: 260 }}>
      <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>trigger 带前缀图标</span>
      <SelectWithLeadingIcon />
    </div>
  ),
};