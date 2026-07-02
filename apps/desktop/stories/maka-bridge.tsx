import { useLayoutEffect } from 'react';
import type { Decorator } from '@storybook/react-vite';

type MakaGlobal = Record<string, unknown>;
type MakaWindow = Window & { maka?: MakaGlobal };

export function withScopedMakaBridge(bridge: MakaGlobal): Decorator {
  return (Story) => {
    const target = window as MakaWindow;
    useLayoutEffect(() => {
      const previous = target.maka;
      target.maka = bridge;
      return () => {
        if (target.maka === bridge) {
          if (previous === undefined) {
            delete target.maka;
          } else {
            target.maka = previous;
          }
        }
      };
    }, []);
    return <Story />;
  };
}