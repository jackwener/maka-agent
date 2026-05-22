import { describe, test } from 'node:test';
import { expect } from '../test-helpers.js';
import {
  createDefaultBotChannel,
  createDefaultSettings,
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
