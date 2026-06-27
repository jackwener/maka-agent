import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildConnectionModelCatalogEntries,
  buildModelCatalogEntries,
  validateChatDefaultModel,
} from '../model-catalog.js';
import type { LlmConnection, ModelInfo, ProviderType } from '../llm-connections.js';

describe('ModelCatalogEntry', () => {
  it('normalizes Z.ai fetched models as provider_api facts without guessing unknown capabilities', () => {
    const models: ModelInfo[] = [
      { id: 'glm-4.5' },
      { id: 'glm-4.5-air' },
      { id: 'glm-4.6' },
      { id: 'glm-4.7', capabilities: { reasoning: true, functionCalling: true }, contextWindow: 128_000 },
      { id: 'glm-5' },
      { id: 'glm-5-turbo' },
      { id: 'glm-5.1' },
    ];
    const entries = buildModelCatalogEntries({
      providerType: 'zai-coding-plan',
      connectionSlug: 'zai-live',
      defaultModel: 'glm-4.7',
      models,
      modelSource: 'fetched',
      modelsFetchedAt: 1_800_000_000_000,
      now: 1_800_000_001_000,
    });

    assert.equal(entries.length, 7);
    assert.deepEqual(entries.map((entry) => entry.id), [
      'glm-4.5',
      'glm-4.5-air',
      'glm-4.6',
      'glm-4.7',
      'glm-5',
      'glm-5-turbo',
      'glm-5.1',
    ]);
    assert.equal(entries[0]?.source, 'provider_api');
    assert.equal(entries[0]?.capabilitySource, 'unknown');
    assert.deepEqual(entries[0]?.capabilities, {});
    const defaultEntry = entries.find((entry) => entry.id === 'glm-4.7');
    assert.equal(defaultEntry?.isDefault, true);
    assert.equal(defaultEntry?.capabilitySource, 'provider_api');
    assert.deepEqual(defaultEntry?.capabilities, { reasoning: true, functionCalling: true });
    assert.equal(defaultEntry?.contextWindow, 128_000);
  });

  it('keeps fallback source explicit and does not pretend static models were fetched', () => {
    const entries = buildModelCatalogEntries({
      providerType: 'openai-compatible',
      defaultModel: 'relay-static-model',
      fallbackModels: ['relay-static-model'],
      modelSource: 'fallback',
    });

    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.source, 'static_catalog');
    assert.equal(entries[0]?.capabilitySource, 'unknown');
    assert.equal(entries[0]?.provenance.modelSource, 'fallback');
    assert.equal(entries[0]?.unavailableReason, 'none');
    assert.equal(entries[0]?.canUseAsChatDefault, true);
  });

  it('adds a blocked default entry when a live provider list no longer contains the selected model', () => {
    const entries = buildModelCatalogEntries({
      providerType: 'zai-coding-plan',
      defaultModel: 'glm-removed',
      models: [{ id: 'glm-4.7' }],
      modelSource: 'fetched',
      modelsFetchedAt: 1_800_000_000_000,
      now: 1_800_000_001_000,
    });

    const missingDefault = entries[0];
    assert.equal(missingDefault?.id, 'glm-removed');
    assert.equal(missingDefault?.source, 'unknown');
    assert.equal(missingDefault?.capabilitySource, 'unknown');
    assert.equal(missingDefault?.unavailableReason, 'not_in_live_list');
    assert.equal(missingDefault?.availability, 'blocked');
    assert.equal(missingDefault?.canUseAsChatDefault, false);

    const validation = validateChatDefaultModel({
      providerType: 'zai-coding-plan',
      defaultModel: 'glm-removed',
      models: [{ id: 'glm-4.7' }],
      modelSource: 'fetched',
      modelsFetchedAt: 1_800_000_000_000,
      now: 1_800_000_001_000,
    });
    assert.deepEqual(
      validation.ok ? validation : { ok: validation.ok, reason: validation.reason },
      { ok: false, reason: 'not_in_live_list' },
    );
  });

  it('blocks explicitly image-only models from becoming a chat default', () => {
    const input = {
      providerType: 'openai' as const,
      defaultModel: 'gpt-image-1',
      models: [{ id: 'gpt-image-1', capabilities: { imageGeneration: true, chat: false } }],
      modelSource: 'fetched' as const,
      modelsFetchedAt: 1_800_000_000_000,
      now: 1_800_000_001_000,
    };
    const [entry] = buildModelCatalogEntries(input);
    assert.equal(entry?.unavailableReason, 'unsupported_for_chat');
    assert.equal(entry?.availability, 'blocked');
    assert.equal(entry?.canUseAsChatDefault, false);
    assert.deepEqual(entry?.capabilities, { imageGeneration: true });

    const validation = validateChatDefaultModel(input);
    assert.deepEqual(
      validation.ok ? validation : { ok: validation.ok, reason: validation.reason },
      { ok: false, reason: 'unsupported_for_chat' },
    );
  });

  it('treats stale fetchedAt as a warning, not a send-blocking failure', () => {
    const input = {
      providerType: 'anthropic' as const,
      defaultModel: 'claude-sonnet-4-5-20250929',
      models: [{ id: 'claude-sonnet-4-5-20250929', capabilities: { reasoning: true } }],
      modelSource: 'fetched' as const,
      modelsFetchedAt: 1_700_000_000_000,
      now: 1_800_000_000_000,
      staleAfterMs: 7 * 24 * 60 * 60 * 1000,
    };
    const [entry] = buildModelCatalogEntries(input);
    assert.equal(entry?.unavailableReason, 'stale');
    assert.equal(entry?.availability, 'warning');
    assert.equal(entry?.canUseAsChatDefault, true);
    assert.deepEqual(validateChatDefaultModel(input).ok, true);
  });

  it('keeps unknown capability as unknown instead of warning like known false', () => {
    const input = {
      providerType: 'openai' as const,
      defaultModel: 'future-model',
      models: [{ id: 'future-model', capabilities: { vision: false, reasoning: undefined } }],
      modelSource: 'fetched' as const,
      modelsFetchedAt: 1_800_000_000_000,
      now: 1_800_000_001_000,
    };
    const [entry] = buildModelCatalogEntries(input);
    assert.equal(entry?.unavailableReason, 'none');
    assert.equal(entry?.canUseAsChatDefault, true);
    assert.deepEqual(entry?.capabilities, {});
  });

  it('builds a connection-scoped catalog from fetched connection models', () => {
    const connection: LlmConnection = {
      slug: 'zai-live',
      name: 'Z.AI account',
      providerType: 'zai-coding-plan',
      defaultModel: 'glm-saved',
      enabled: true,
      models: [{ id: 'glm-4.7' }],
      modelSource: 'fetched',
      modelsFetchedAt: 1_800_000_000_000,
      createdAt: 1,
      updatedAt: 1,
    };

    const entries = buildConnectionModelCatalogEntries({
      connection,
      savedModelIds: ['glm-session', 'glm-daily-review', 'glm-4.7', ' '],
      now: 1_800_000_001_000,
    });

    assert.deepEqual(entries.map((entry) => entry.id), [
      'glm-saved',
      'glm-4.7',
      'glm-session',
      'glm-daily-review',
    ]);
    assert.equal(entries[0]?.connectionSlug, 'zai-live');
    assert.equal(entries[0]?.unavailableReason, 'not_in_live_list');
    assert.equal(entries[0]?.isDefault, true);
    assert.equal(entries[1]?.source, 'provider_api');
    assert.equal(entries[2]?.source, 'unknown');
    assert.equal(entries[2]?.provenance.userChoice, true);
  });

  it('falls back to provider defaults for a connection without fetched models', () => {
    const connection: LlmConnection = {
      slug: 'openai-api',
      name: 'OpenAI',
      providerType: 'openai',
      defaultModel: '',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    };

    const entries = buildConnectionModelCatalogEntries({ connection });

    assert.deepEqual(
      entries.slice(0, 2).map((entry) => [entry.id, entry.source, entry.provenance.modelSource]),
      [
        ['gpt-5.5', 'static_catalog', 'fallback'],
        ['gpt-5.5-pro', 'static_catalog', 'fallback'],
      ],
    );
  });

  it('carries display names separately from stable model ids', () => {
    const [fetchedEntry] = buildModelCatalogEntries({
      providerType: 'codex-subscription',
      defaultModel: 'gpt-5.5',
      models: [{ id: 'gpt-5.5', displayName: 'GPT 5.5' }],
      modelSource: 'fetched',
      modelsFetchedAt: 1_800_000_000_000,
    });

    assert.equal(fetchedEntry?.id, 'gpt-5.5');
    assert.equal(fetchedEntry?.displayName, 'GPT 5.5');

    const [fallbackEntry] = buildConnectionModelCatalogEntries({
      connection: {
        slug: 'codex-subscription',
        providerType: 'codex-subscription',
        defaultModel: '',
      },
    });

    assert.equal(fallbackEntry?.id, 'gpt-5.5');
    assert.equal(fallbackEntry?.displayName, 'GPT-5.5');
  });

  it('enriches provider model ids with models.dev display names', () => {
    assert.deepEqual(
      ([
        ['anthropic', 'claude-sonnet-4-6'],
        ['claude-subscription', 'claude-opus-4-8'],
        ['openai', 'gpt-5.5-pro'],
        ['openai', 'gpt-4o-mini'],
        ['google', 'gemini-3.5-flash'],
        ['gemini-cli', 'gemini-2.5-pro'],
        ['deepseek', 'deepseek-v4-flash'],
        ['zai-coding-plan', 'glm-5.2'],
        ['codex-subscription', 'gpt-5.3-codex-spark'],
      ] as Array<[ProviderType, string]>).map(([providerType, model]) => {
        const [entry] = buildModelCatalogEntries({
          providerType,
          defaultModel: model,
          models: [{ id: model }],
          modelSource: 'fetched',
          modelsFetchedAt: 1_800_000_000_000,
        });
        return [entry?.id, entry?.displayName];
      }),
      [
        ['claude-sonnet-4-6', 'Claude Sonnet 4.6'],
        ['claude-opus-4-8', 'Claude Opus 4.8'],
        ['gpt-5.5-pro', 'GPT-5.5 Pro'],
        ['gpt-4o-mini', 'GPT-4o mini'],
        ['gemini-3.5-flash', 'Gemini 3.5 Flash'],
        ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
        ['deepseek-v4-flash', 'DeepSeek V4 Flash'],
        ['glm-5.2', 'GLM-5.2'],
        ['gpt-5.3-codex-spark', 'GPT-5.3 Codex Spark'],
      ],
    );

    const [fallbackEntry] = buildModelCatalogEntries({
      providerType: 'deepseek',
      defaultModel: 'deepseek-reasoner',
      fallbackModels: ['deepseek-reasoner'],
      modelSource: 'fallback',
    });

    assert.equal(fallbackEntry?.id, 'deepseek-reasoner');
    assert.equal(fallbackEntry?.displayName, 'DeepSeek Reasoner');
  });

  it('does not invent provider metadata when models.dev has no matching model id', () => {
    assert.deepEqual(
      ([
        ['google', 'gemini-1.5-pro'],
        ['moonshot', 'moonshot-v1-8k'],
        ['kimi-coding-plan', 'kimi-for-coding'],
      ] as const).map(([providerType, model]) => {
        const [entry] = buildModelCatalogEntries({
          providerType,
          defaultModel: model,
          models: [{ id: model }],
          modelSource: 'fetched',
          modelsFetchedAt: 1_800_000_000_000,
        });
        return [entry?.id, entry?.displayName];
      }),
      [
        ['gemini-1.5-pro', undefined],
        ['moonshot-v1-8k', undefined],
        ['kimi-for-coding', undefined],
      ],
    );
  });

  it('keeps fallback catalog choices aligned with current models.dev provider ids', () => {
    const googleEntries = buildConnectionModelCatalogEntries({
      connection: {
        slug: 'google-api',
        providerType: 'google',
        defaultModel: '',
      },
    });
    const zaiEntries = buildConnectionModelCatalogEntries({
      connection: {
        slug: 'zai-api',
        providerType: 'zai-coding-plan',
        defaultModel: '',
      },
    });

    assert.deepEqual(
      googleEntries.map((entry) => [entry.id, entry.displayName]),
      [
        ['gemini-3.5-flash', 'Gemini 3.5 Flash'],
        ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview'],
        ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
        ['gemini-2.5-flash', 'Gemini 2.5 Flash'],
      ],
    );
    assert.deepEqual(
      zaiEntries.map((entry) => [entry.id, entry.displayName]),
      [
        ['glm-5.2', 'GLM-5.2'],
        ['glm-5.1', 'GLM-5.1'],
        ['glm-5-turbo', 'GLM-5-Turbo'],
        ['glm-4.7', 'GLM-4.7'],
        ['glm-4.5-air', 'GLM-4.5-Air'],
      ],
    );
  });

  it('does not apply provider metadata to custom or local model ids', () => {
    assert.deepEqual(
      ([
        ['openai-compatible', 'gpt-4o-mini'],
        ['ollama', 'gemini-2.5-pro'],
      ] as const).map(([providerType, model]) => {
        const [entry] = buildModelCatalogEntries({
          providerType,
          defaultModel: model,
          models: [{ id: model }],
          modelSource: 'fetched',
          modelsFetchedAt: 1_800_000_000_000,
        });
        return [entry?.id, entry?.displayName];
      }),
      [
        ['gpt-4o-mini', undefined],
        ['gemini-2.5-pro', undefined],
      ],
    );
  });
});
