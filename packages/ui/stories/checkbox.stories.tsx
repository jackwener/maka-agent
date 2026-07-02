import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from '../src/ui.js';

const meta = {
  title: 'Primitives/Checkbox',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
      {children}
      <span style={{ fontSize: 13 }}>{label}</span>
    </label>
  );
}

export const States: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 14, width: 200 }}>
      <Row label="unchecked">
        <Checkbox checked={false} onCheckedChange={() => undefined} aria-label="未勾选" />
      </Row>
      <Row label="checked">
        <Checkbox checked onCheckedChange={() => undefined} aria-label="已勾选" />
      </Row>
      <Row label="indeterminate">
        <Checkbox indeterminate onCheckedChange={() => undefined} aria-label="半选" />
      </Row>
      <Row label="disabled unchecked">
        <Checkbox checked={false} disabled onCheckedChange={() => undefined} aria-label="禁用未勾选" />
      </Row>
      <Row label="disabled checked">
        <Checkbox checked disabled onCheckedChange={() => undefined} aria-label="禁用已勾选" />
      </Row>
    </div>
  ),
};

export const Controlled: Story = {
  render: () => {
    const [checked, setChecked] = useState(false);
    return (
      <Row label="点击切换">
        <Checkbox checked={checked} onCheckedChange={setChecked} aria-label="受控勾选" />
      </Row>
    );
  },
};