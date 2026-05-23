import { describe, test } from 'node:test';
import { expect } from '../test-helpers.js';
import {
  THEME_PALETTES,
  createDefaultBotChannel,
  createDefaultSettings,
  isThemePalette,
  mergeSettings,
  normalizeSettings,
} from '../settings.js';

describe('bot readiness settings contract', () => {
  test('default bot channels are scaffolded, not operational', () => {
    const channel = createDefaultBotChannel('telegram');

    expect(channel.connected).toBe(false);
    expect(channel.readiness).toBe('scaffolded');
  });

  test('normalizes legacy connected boolean to credentials_valid, not operational', () => {
    const legacy = createDefaultSettings();
    const telegram = legacy.botChat.channels.telegram as Partial<typeof legacy.botChat.channels.telegram>;
    delete telegram.readiness;
    legacy.botChat.channels.telegram.connected = true;
    legacy.botChat.channels.telegram.enabled = true;
    legacy.botChat.channels.telegram.token = 'telegram-token';

    const normalized = normalizeSettings(legacy);

    expect(normalized.botChat.channels.telegram.connected).toBe(true);
    expect(normalized.botChat.channels.telegram.readiness).toBe('credentials_valid');
  });

  test('does not treat non-boolean legacy connected values as credentials_valid', () => {
    const legacy = createDefaultSettings() as unknown as {
      botChat: { channels: { telegram: { connected: unknown; readiness?: unknown; enabled: boolean; token: string } } };
    };
    delete legacy.botChat.channels.telegram.readiness;
    legacy.botChat.channels.telegram.connected = 'true';
    legacy.botChat.channels.telegram.enabled = true;
    legacy.botChat.channels.telegram.token = 'telegram-token';

    const normalized = normalizeSettings(legacy);

    expect(normalized.botChat.channels.telegram.connected).toBe(false);
    expect(normalized.botChat.channels.telegram.readiness).toBe('configured');
  });

  test('normalizes enabled configured channels to configured, not operational', () => {
    const legacy = createDefaultSettings();
    const discord = legacy.botChat.channels.discord as Partial<typeof legacy.botChat.channels.discord>;
    delete discord.readiness;
    legacy.botChat.channels.discord.enabled = true;
    legacy.botChat.channels.discord.token = 'discord-token';

    const normalized = normalizeSettings(legacy);

    expect(normalized.botChat.channels.discord.readiness).toBe('configured');
  });
});

describe('theme palette settings contract (PR-UI-D1, @kenji msg 68bf2b13)', () => {
  test('THEME_PALETTES allowlist has 5 entries including default', () => {
    expect(THEME_PALETTES.length).toBe(5);
    expect(THEME_PALETTES.includes('default')).toBe(true);
    expect(THEME_PALETTES.includes('onedark')).toBe(true);
    expect(THEME_PALETTES.includes('catppuccin-mocha')).toBe(true);
    expect(THEME_PALETTES.includes('tokyo-night')).toBe(true);
    expect(THEME_PALETTES.includes('nord')).toBe(true);
  });

  test('isThemePalette accepts allowlist values, rejects everything else', () => {
    for (const palette of THEME_PALETTES) {
      expect(isThemePalette(palette)).toBe(true);
    }
    expect(isThemePalette('evil-unknown')).toBe(false);
    expect(isThemePalette('')).toBe(false);
    expect(isThemePalette(undefined)).toBe(false);
    expect(isThemePalette(null)).toBe(false);
    expect(isThemePalette(42)).toBe(false);
    expect(isThemePalette({ palette: 'onedark' })).toBe(false);
    expect(isThemePalette([])).toBe(false);
    // Case-sensitive: TypeScript union is exact-case, runtime guard must agree.
    expect(isThemePalette('Default')).toBe(false);
    expect(isThemePalette('ONEDARK')).toBe(false);
  });

  test('createDefaultSettings seeds palette as `default`', () => {
    const defaults = createDefaultSettings();
    expect(defaults.appearance.palette).toBe('default');
  });

  test('migration: settings.json without `palette` field loads with palette=default', () => {
    // Older settings.json that pre-dates PR-UI-D1 will not have
    // `appearance.palette`. normalizeSettings must seed `default`
    // without touching theme/density.
    const legacy = {
      appearance: {
        theme: 'dark' as const,
        density: 'compact' as const,
        // no palette field
      },
    };
    const normalized = normalizeSettings(legacy);
    expect(normalized.appearance.palette).toBe('default');
    expect(normalized.appearance.theme).toBe('dark');
    expect(normalized.appearance.density).toBe('compact');
  });

  test('fail-closed: unknown palette string falls back to default', () => {
    const malformed = {
      appearance: {
        theme: 'auto' as const,
        density: 'comfortable' as const,
        palette: 'evil-unknown',
      },
    };
    const normalized = normalizeSettings(malformed);
    expect(normalized.appearance.palette).toBe('default');
  });

  test('fail-closed: non-string palette falls back to default', () => {
    for (const bad of [42, true, null, {}, []]) {
      const malformed = {
        appearance: {
          theme: 'auto' as const,
          density: 'comfortable' as const,
          palette: bad,
        },
      };
      const normalized = normalizeSettings(malformed);
      expect(normalized.appearance.palette).toBe('default');
    }
  });

  test('valid palette survives normalize untouched', () => {
    for (const palette of THEME_PALETTES) {
      const input = {
        appearance: {
          theme: 'auto' as const,
          density: 'comfortable' as const,
          palette,
        },
      };
      const normalized = normalizeSettings(input);
      expect(normalized.appearance.palette).toBe(palette);
    }
  });

  test('palette validation does NOT silently reset unrelated settings fields', () => {
    // @kenji gate: "no silent reset of unrelated settings". Even with
    // a malformed palette, all other fields (theme, density,
    // personalization, network, bot channels) must keep their values.
    const input = {
      appearance: {
        theme: 'dark' as const,
        density: 'spacious' as const,
        palette: 'evil-unknown',
      },
      personalization: {
        displayName: 'Yuejing',
        assistantTone: 'concise',
      },
      network: {
        proxy: {
          enabled: true,
          protocol: 'http' as const,
          host: '127.0.0.1',
          port: 7890,
          authEnabled: false,
          username: '',
          password: '',
          bypassList: ['localhost'],
          autoBypassDomains: [],
        },
      },
    };
    const normalized = normalizeSettings(input);
    expect(normalized.appearance.palette).toBe('default');
    expect(normalized.appearance.theme).toBe('dark');
    expect(normalized.appearance.density).toBe('spacious');
    expect(normalized.personalization.displayName).toBe('Yuejing');
    expect(normalized.personalization.assistantTone).toBe('concise');
    expect(normalized.network.proxy.enabled).toBe(true);
    expect(normalized.network.proxy.host).toBe('127.0.0.1');
    expect(normalized.network.proxy.port).toBe(7890);
  });

  test('mergeSettings carries palette through patch surface', () => {
    const current = createDefaultSettings();
    const patched = mergeSettings(current, { appearance: { palette: 'onedark' } });
    expect(patched.appearance.palette).toBe('onedark');
    expect(patched.appearance.theme).toBe('auto'); // unchanged
    expect(patched.appearance.density).toBe('comfortable'); // unchanged
  });

  test('mergeSettings + normalizeSettings: patching with unknown palette ends up at default', () => {
    // Real-world: a UI might submit a misconfigured palette via the
    // patch surface. The normalize pass after mergeSettings catches it.
    const current = createDefaultSettings();
    const patched = mergeSettings(current, {
      appearance: { palette: 'evil-unknown' as 'default' /* coerced for test */ },
    });
    const normalized = normalizeSettings(patched);
    expect(normalized.appearance.palette).toBe('default');
  });
});
