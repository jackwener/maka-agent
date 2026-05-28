import { EventEmitter } from 'node:events';
import type { BotChannelSettings } from '@maka/core';
import { generalizedErrorMessage } from '@maka/core/redaction';
import type { BotBridge, BotPlatform, BotStatus, SendCapable } from './types.js';
import { proxiedFetch } from './proxied-fetch.js';

const TELEGRAM_POLL_TIMEOUT_S = 15;
const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000;
const FEISHU_REQUEST_TIMEOUT_MS = 10_000;

export class SimpleBotBridge extends EventEmitter implements BotBridge, SendCapable {
  readonly platform: BotPlatform;
  private running = false;
  private startedAt?: number;
  private lastEventAt?: number;
  private reason?: string;
  private readiness: BotStatus['readiness'];
  private identity: BotStatus['identity'];
  private abortController: AbortController | null = null;
  private offset = 0;

  constructor(
    platform: BotPlatform,
    private settings: BotChannelSettings,
  ) {
    super();
    this.platform = platform;
    this.readiness = readinessFromSettings(settings);
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus(): BotStatus {
    return {
      platform: this.platform,
      running: this.running,
      readiness: this.readiness,
      reason: this.reason,
      startedAt: this.startedAt,
      lastEventAt: this.lastEventAt,
      connection: this.connectionKind(),
      identity: this.identity,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.settings.enabled) {
      this.reason = 'disabled';
      this.readiness = 'scaffolded';
      return;
    }
    if (!this.settings.token.trim()) {
      this.reason = 'no-token';
      this.readiness = 'scaffolded';
      return;
    }

    if (this.platform === 'telegram') {
      await this.startTelegram();
      return;
    }

    if (this.platform === 'feishu') {
      await this.startFeishu();
      return;
    }

    if (this.platform === 'discord') {
      this.running = false;
      this.reason = 'scaffold-only';
      this.readiness = 'configured';
      this.emit('statusChange', this.getStatus());
      return;
    }

    this.reason = 'unimplemented';
    this.readiness = 'scaffolded';
    this.emit('statusChange', this.getStatus());
  }

  async stop(): Promise<void> {
    this.running = false;
    this.abortController?.abort();
    this.abortController = null;
    this.reason = 'stopped';
    this.readiness = readinessFromSettings(this.settings);
    this.emit('statusChange', this.getStatus());
  }

  async sendMessage(chatId: string, text: string): Promise<string | null> {
    if (this.platform !== 'telegram' || !this.running) return null;
    const response = await telegramApi(this.settings.token, 'sendMessage', { chat_id: chatId, text });
    if (!response.ok) {
      this.readiness = this.readiness === 'operational' ? 'degraded' : 'credentials_valid';
      this.reason = response.description ?? 'send-failed';
      this.emit('statusChange', this.getStatus());
      return null;
    }
    this.readiness = 'operational';
    this.reason = undefined;
    this.lastEventAt = Date.now();
    this.emit('statusChange', this.getStatus());
    return String(response.result?.message_id ?? '') || null;
  }

  updateSettings(settings: BotChannelSettings): { needsRestart: boolean } {
    const needsRestart =
      settings.enabled !== this.settings.enabled ||
      settings.token !== this.settings.token ||
      settings.appId !== this.settings.appId ||
      settings.appSecret !== this.settings.appSecret ||
      settings.domain !== this.settings.domain;
    this.settings = settings;
    if (needsRestart) this.readiness = readinessFromSettings(settings);
    return { needsRestart };
  }

  private async startTelegram(): Promise<void> {
    try {
      const me = await telegramApi(this.settings.token, 'getMe');
      if (!me.ok) {
        this.reason = me.description ?? 'get-me-failed';
        this.readiness = 'configured';
        this.emit('statusChange', this.getStatus());
        return;
      }
      this.identity = {
        id: String(me.result?.id ?? ''),
        username: me.result?.username,
        displayName: me.result?.first_name,
      };
      this.running = true;
      this.startedAt = Date.now();
      this.reason = undefined;
      // getMe proves credentials and API reachability. It is not a
      // send/receive smoke, so it must not be surfaced as operational.
      this.readiness = 'credentials_valid';
      this.emit('statusChange', this.getStatus());
      void this.pollTelegram();
    } catch (error) {
      this.reason = generalizedErrorMessage(error);
      this.readiness = this.readiness === 'operational' ? 'degraded' : readinessFromSettings(this.settings);
      this.emit('statusChange', this.getStatus());
    }
  }

  private async startFeishu(): Promise<void> {
    try {
      const appId = this.settings.appId?.trim() ?? '';
      const appSecret = this.settings.appSecret?.trim() || this.settings.token.trim();
      if (!appId || !appSecret) {
        this.running = false;
        this.reason = 'missing-feishu-credentials';
        this.readiness = 'scaffolded';
        this.emit('statusChange', this.getStatus());
        return;
      }
      const token = await feishuTenantAccessToken(appId, appSecret);
      if (!token.ok) {
        this.running = false;
        this.reason = token.error;
        this.readiness = 'configured';
        this.emit('statusChange', this.getStatus());
        return;
      }
      this.identity = {
        id: appId,
        username: appId,
        displayName: appId,
      };
      this.running = false;
      this.startedAt = Date.now();
      this.reason = this.settings.domain?.trim()
        ? 'feishu-events-not-connected'
        : 'feishu-domain-required';
      // tenant_access_token proves app credentials. Feishu event delivery still
      // needs a callback/long-connection runtime before it can be operational.
      this.readiness = 'credentials_valid';
      this.emit('statusChange', this.getStatus());
    } catch (error) {
      this.running = false;
      this.reason = generalizedErrorMessage(error);
      this.readiness = this.readiness === 'operational' ? 'degraded' : readinessFromSettings(this.settings);
      this.emit('statusChange', this.getStatus());
    }
  }

  private async pollTelegram(): Promise<void> {
    while (this.running) {
      this.abortController = new AbortController();
      try {
        const updates = await telegramApi(
          this.settings.token,
          'getUpdates',
          {
            offset: this.offset,
            timeout: TELEGRAM_POLL_TIMEOUT_S,
            allowed_updates: ['message'],
          },
          this.abortController.signal,
        );
        if (!updates.ok || !Array.isArray(updates.result)) {
          await sleep(5_000);
          continue;
        }
        for (const update of updates.result) {
          this.offset = Number(update.update_id ?? this.offset) + 1;
          this.handleTelegramMessage(update.message);
        }
      } catch (error) {
        if (!this.running) return;
        if (error instanceof Error && error.name === 'AbortError') return;
        await sleep(5_000);
      }
    }
  }

  private handleTelegramMessage(message: any): void {
    if (!message?.from) return;
    this.lastEventAt = Date.now();
    this.readiness = 'operational';
    this.reason = undefined;
    this.emit('message', {
      platform: 'telegram',
      userId: String(message.from.id),
      userName: message.from.username ?? message.from.first_name ?? String(message.from.id),
      chatId: String(message.chat?.id ?? ''),
      isGroup: message.chat?.type === 'group' || message.chat?.type === 'supergroup',
      text: message.text ?? message.caption ?? '',
      sourceMessageId: String(message.message_id ?? ''),
      receivedAt: this.lastEventAt,
    });
    this.emit('statusChange', this.getStatus());
  }

  private connectionKind(): BotStatus['connection'] {
    if (this.platform === 'telegram') return 'polling';
    if (this.platform === 'discord' || this.platform === 'feishu') return 'gateway';
    return 'none';
  }
}

function readinessFromSettings(settings: BotChannelSettings): BotStatus['readiness'] {
  if (!settings.enabled) return 'scaffolded';
  if (!settings.token.trim() && !settings.appId?.trim() && !settings.appSecret?.trim()) return 'scaffolded';
  return 'configured';
}

async function telegramApi(token: string, method: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
  const timeoutMs = typeof body?.timeout === 'number'
    ? (body.timeout + 5) * 1_000
    : TELEGRAM_REQUEST_TIMEOUT_MS;
  const response = await proxiedFetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal,
    timeoutMs,
  });
  return response.json();
}

async function feishuTenantAccessToken(appId: string, appSecret: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const response = await proxiedFetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    timeoutMs: FEISHU_REQUEST_TIMEOUT_MS,
  });
  const json = await response.json();
  if (json.code !== 0 || !json.tenant_access_token) {
    return { ok: false, error: json.msg ?? 'Failed to issue tenant_access_token' };
  }
  return { ok: true, token: json.tenant_access_token };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
