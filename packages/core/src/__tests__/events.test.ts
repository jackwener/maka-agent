import { describe, test } from 'node:test';
import { expect } from '../test-helpers.js';
import {
  TOOL_OUTPUT_DELTA_MAX_CHARS,
  TOOL_OUTPUT_STREAMS,
  type SessionEvent,
} from '../events.js';

describe('ToolOutputDelta event contract', () => {
  test('locks finite stream union and chunk bound constant', () => {
    expect(TOOL_OUTPUT_STREAMS).toEqual(['stdout', 'stderr']);
    expect(TOOL_OUTPUT_DELTA_MAX_CHARS).toBe(8192);
  });

  test('tool_output_delta is a SessionEvent with per-tool seq metadata', () => {
    const event: SessionEvent = {
      type: 'tool_output_delta',
      id: 'event-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      ts: 10,
      toolCallId: 'tool-1',
      toolUseId: 'tool-1',
      seq: 1,
      stream: 'stdout',
      chunk: 'hello\n',
      redacted: false,
      createdAt: 10,
    };

    expect(event.type).toBe('tool_output_delta');
    if (event.type !== 'tool_output_delta') throw new Error('unreachable');
    expect(event.seq).toBe(1);
    expect(event.stream).toBe('stdout');
  });
});
