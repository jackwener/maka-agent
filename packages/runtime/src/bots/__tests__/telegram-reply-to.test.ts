import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { __TEST__ } from '../simple-bridge.js';

const { buildTelegramSendBody, normalizeTelegramReplyToMessageId } = __TEST__;

describe('buildTelegramSendBody (PR-BOT-REPLY-TO-MESSAGE-0)', () => {
  it('emits only chat_id + text when no reply target is provided', () => {
    const body = buildTelegramSendBody('chat-1', 'hello', undefined, 0);
    assert.deepEqual(body, { chat_id: 'chat-1', text: 'hello' });
  });

  it('threads the first chunk under the originating user message', () => {
    const body = buildTelegramSendBody('chat-1', 'hello', { replyToMessageId: '42' }, 0);
    assert.equal(body.chat_id, 'chat-1');
    assert.equal(body.text, 'hello');
    assert.equal(body.reply_to_message_id, 42);
    // Telegram returns 400 if the parent has been deleted; allow_sending_without_reply
    // lets the bot reply still go through as an ordinary message.
    assert.equal(body.allow_sending_without_reply, true);
  });

  it('does NOT thread continuation chunks (chunkIndex > 0)', () => {
    const body = buildTelegramSendBody('chat-1', '[2/3]\ntail', { replyToMessageId: '42' }, 1);
    assert.equal(body.chat_id, 'chat-1');
    assert.equal(body.text, '[2/3]\ntail');
    assert.equal('reply_to_message_id' in body, false);
    assert.equal('allow_sending_without_reply' in body, false);
  });

  it('treats empty / missing replyToMessageId as no thread', () => {
    const withoutField = buildTelegramSendBody('chat-1', 'hello', {}, 0);
    assert.equal('reply_to_message_id' in withoutField, false);
    assert.equal('allow_sending_without_reply' in withoutField, false);
  });

  it('coerces a decimal message id string to Number — Telegram requires an integer', () => {
    // BotMessageEvent.sourceMessageId is typed as `string` so the call site
    // forwards the platform handler capture; safe decimal coercion happens
    // here so the API call uses the integer the wire protocol expects.
    const body = buildTelegramSendBody('chat-1', 'hello', { replyToMessageId: '1234567890' }, 0);
    assert.equal(body.reply_to_message_id, 1234567890);
    assert.equal(typeof body.reply_to_message_id, 'number');
  });

  it('omits invalid reply ids rather than sending NaN or zero to Telegram', () => {
    for (const replyToMessageId of ['abc', '  ', '0', '-1', '1.5']) {
      const body = buildTelegramSendBody('chat-1', 'hello', { replyToMessageId }, 0);
      assert.equal('reply_to_message_id' in body, false, replyToMessageId);
      assert.equal('allow_sending_without_reply' in body, false, replyToMessageId);
    }
  });

  it('rejects reply ids outside JavaScript safe integer range', () => {
    const body = buildTelegramSendBody(
      'chat-1',
      'hello',
      { replyToMessageId: '9007199254740992' },
      0,
    );

    assert.equal('reply_to_message_id' in body, false);
    assert.equal('allow_sending_without_reply' in body, false);
  });
});

describe('normalizeTelegramReplyToMessageId', () => {
  it('trims and accepts positive safe integer strings', () => {
    assert.equal(normalizeTelegramReplyToMessageId(' 42 '), 42);
  });

  it('rejects missing, non-decimal, zero, and unsafe values', () => {
    assert.equal(normalizeTelegramReplyToMessageId(undefined), undefined);
    assert.equal(normalizeTelegramReplyToMessageId(''), undefined);
    assert.equal(normalizeTelegramReplyToMessageId('abc'), undefined);
    assert.equal(normalizeTelegramReplyToMessageId('0'), undefined);
    assert.equal(normalizeTelegramReplyToMessageId('1.5'), undefined);
    assert.equal(normalizeTelegramReplyToMessageId('9007199254740992'), undefined);
  });
});
