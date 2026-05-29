import type { BotChannelSettings } from '@maka/core';
import { generalizedErrorMessage } from '@maka/core/redaction';
import { BaseBotAdapter, botReadinessFromSettings } from './base-adapter.js';
import { proxiedFetch } from './proxied-fetch.js';
import type { BotSendOptions, BotStatus, BotTestResult, SendCapable } from './types.js';

const DEFAULT_WECHAT_BRIDGE_URL = 'http://127.0.0.1:18400';
const WECHAT_BRIDGE_TIMEOUT_MS = 5_000;

const LOCAL_WECHAT_BRIDGE_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  '[::1]',
  '::1',
]);

export function normalizeWechatBridgeUrl(input: string | undefined): string | null {
  const raw = input?.trim() || DEFAULT_WECHAT_BRIDGE_URL;
  if (raw.length > 256) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:') return null;
    if (!LOCAL_WECHAT_BRIDGE_HOSTS.has(url.hostname)) return null;
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export class WechatBridge extends BaseBotAdapter implements SendCapable {
  constructor(settings: BotChannelSettings) {
    super('wechat', settings);
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.settings.enabled) {
      this.reason = 'disabled';
      this.readiness = 'scaffolded';
      return;
    }
    const probe = await testWechatBridge(this.settings);
    if (!probe.ok) {
      this.running = false;
      this.reason = probe.error;
      this.readiness = botReadinessFromSettings(this.settings);
      this.emitStatusChange();
      return;
    }
    this.identity = probe.identity;
    this.running = true;
    this.startedAt = Date.now();
    this.reason = undefined;
    this.readiness = 'credentials_valid';
    this.emitStatusChange();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.reason = 'stopped';
    this.readiness = botReadinessFromSettings(this.settings);
    this.emitStatusChange();
  }

  async sendMessage(chatId: string, text: string, _options?: BotSendOptions): Promise<string | null> {
    if (!this.running) return null;
    try {
      const response = await wechatBridgeJson(this.settings, '/send', {
        method: 'POST',
        body: JSON.stringify({ wxid: chatId, text }),
      });
      const status = typeof response.status === 'string' ? response.status : '';
      if (status === 'failed') {
        this.readiness = 'degraded';
        this.reason = typeof response.diagnostic === 'string' ? response.diagnostic : 'wechat-send-failed';
        this.emitStatusChange();
        return null;
      }
      this.readiness = 'operational';
      this.reason = undefined;
      this.lastEventAt = Date.now();
      this.emitStatusChange();
      const id = response.messageId ?? response.id ?? response.svrId ?? status;
      return typeof id === 'string' || typeof id === 'number' ? String(id) : 'wechat-submitted';
    } catch (error) {
      this.readiness = 'degraded';
      this.reason = generalizedErrorMessage(error);
      this.emitStatusChange();
      return null;
    }
  }

  protected override connectionKind(): BotStatus['connection'] {
    return 'gateway';
  }
}

export async function testWechatBridge(
  channel: BotChannelSettings,
): Promise<BotTestResult> {
  const baseUrl = normalizeWechatBridgeUrl(channel.webhookUrl);
  if (!baseUrl) {
    return {
      ok: false,
      error: 'WeChat bridge URL must be http://127.0.0.1 or http://localhost',
      hint: '微信本地桥接只允许访问本机 wechat-bridge，不能指向远端 URL。',
    };
  }
  try {
    const health = await wechatBridgeJson(channel, '/health', { method: 'GET' });
    const self = typeof health.self === 'object' && health.self !== null
      ? health.self as Record<string, unknown>
      : {};
    const sendStatus = typeof health.send_status === 'string'
      ? health.send_status
      : typeof health.sendStatus === 'string'
        ? health.sendStatus
        : undefined;
    return {
      ok: true,
      identity: {
        id: stringField(health.wxid) ?? stringField(self.wxid) ?? baseUrl,
        username: stringField(health.alias) ?? stringField(self.alias),
        displayName: stringField(health.nickname) ?? stringField(self.nickname) ?? 'wechat-bridge',
      },
      capabilities: {
        health: true,
        send: sendStatus !== 'unavailable' && sendStatus !== 'blocked',
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: generalizedErrorMessage(error),
      hint: '先在本机启动 wechat-bridge，并确认 WeChat 已登录；发送能力需要 wxp_act_ 激活码。',
    };
  }
}

async function wechatBridgeJson(
  channel: BotChannelSettings,
  path: string,
  init: { method: 'GET' | 'POST'; body?: string },
): Promise<Record<string, unknown>> {
  const baseUrl = normalizeWechatBridgeUrl(channel.webhookUrl);
  if (!baseUrl) throw new Error('Invalid WeChat bridge URL');
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (init.body) headers['Content-Type'] = 'application/json';
  const bearer = channel.token.trim();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const response = await proxiedFetch(`${baseUrl}${path}`, {
    method: init.method,
    headers,
    body: init.body,
    timeoutMs: WECHAT_BRIDGE_TIMEOUT_MS,
  });
  const json = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = stringField(json.error) ?? stringField(json.message) ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return json;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
