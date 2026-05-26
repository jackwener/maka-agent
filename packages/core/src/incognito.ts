/**
 * Workspace privacy context — shared cross-lane contract.
 *
 * Anchors:
 *   - Lane assignment: xuan msg `0f1a3a2b`.
 *   - My acceptance + scope: msg `6b2c176e`.
 *   - Predecessor lanes that consume this contract:
 *       - PR-SEARCH-1 (`notes/pr-search-1-report.md` G3 gate, deferred).
 *       - PR-MEMORY-1 (`MemoryWriteRequestContext.incognitoActive`, forward-looking).
 *       - PR-VOICE-0 (capture refuses when incognitoActive — currently
 *         a TODO consumed via this contract).
 *
 * Scope: this module is **contract-only**. It declares the typed shape
 * any future Maka surface MUST consume when checking incognito state.
 * It does NOT add settings UI, storage, IPC, renderer toggles, or
 * runtime enforcement. Downstream lanes (PR-SEARCH-2.5, future MEMORY
 * read gate, VOICE-1) consume this type without re-inventing the flag.
 *
 * Authority rules (per xuan `0f1a3a2b` + `ece30c92`):
 *   - `incognitoActive` source-of-truth is **main process / session /
 *     workspace owner** only. The renderer can REQUEST or DISPLAY the
 *     current context but CANNOT submit a context as proof of state in
 *     either direction. A renderer payload claiming `false` is just as
 *     unauthoritative as a renderer payload claiming `true` — incognito
 *     is a privacy contract, never a renderer self-attestation.
 *   - Default state is `incognitoActive: false`, produced ONLY by
 *     `defaultWorkspacePrivacyContext()`. The validator never invents
 *     a default for malformed input — a missing or non-boolean
 *     `incognitoActive` is a typed reject, not a silent false.
 *   - Future extensions to the shape (e.g. per-session incognito,
 *     time-bounded incognito) are explicit contract changes.
 *
 * Source hygiene: plain ASCII source; no literal control bytes; no
 * regex character classes with non-printables.
 *
 * @see docs/workspace-privacy-context.md for the consumer playbook and
 *      the per-lane consume patterns.
 */

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/**
 * Workspace-wide privacy context.
 *
 * v1 has exactly one field. Adding fields (per-session incognito,
 * retention windows, screen-recording opt-out) requires extending this
 * interface AND updating every consumer lane.
 */
export interface WorkspacePrivacyContext {
  /**
   * True when the workspace is in incognito mode. Source-of-truth is
   * the main process; renderers may read but cannot durably claim
   * incognito on their own. Defaults to `false` on a fresh workspace.
   *
   * Consumer obligations when this is `true`:
   *   - SEARCH (thread / future memory / future activity): exclude
   *     results from the search index; return empty result set if a
   *     query is issued.
   *   - MEMORY: reject writes (`incognito_active` reason); reject reads
   *     in any future read path (read gate is a future contract).
   *   - VOICE: refuse mic capture; reject existing capture-in-progress
   *     if mode toggles mid-stream (future runtime concern).
   *   - TELEMETRY: emit no per-action records.
   *   - LOGS: redact session ids and user content from any diagnostic
   *     emission.
   */
  incognitoActive: boolean;
}

// ---------------------------------------------------------------------------
// Default / factory
// ---------------------------------------------------------------------------

/**
 * Canonical default. A fresh workspace, or any path that has not yet
 * resolved an authoritative privacy snapshot, MUST use this — never
 * leave `incognitoActive` undefined and never assume true unless main
 * has confirmed.
 */
export function defaultWorkspacePrivacyContext(): WorkspacePrivacyContext {
  return { incognitoActive: false };
}

// ---------------------------------------------------------------------------
// Result envelope (mirrors PR-MEMORY-1 / PR-SEARCH-0 normalizer pattern)
// ---------------------------------------------------------------------------

export type WorkspacePrivacyContextResult =
  | { ok: true; value: WorkspacePrivacyContext }
  | { ok: false; reason: WorkspacePrivacyContextInvalidReason; message: string };

/**
 * Closed enum of reject reasons. Kept narrow so consumers can pattern
 * match without leaking implementation detail. Adding a reason is a
 * contract change.
 */
export const WORKSPACE_PRIVACY_CONTEXT_INVALID_REASONS = [
  'not_object',
  'incognito_active_invalid',
] as const;
export type WorkspacePrivacyContextInvalidReason =
  typeof WORKSPACE_PRIVACY_CONTEXT_INVALID_REASONS[number];

// ---------------------------------------------------------------------------
// Type guard + validator
// ---------------------------------------------------------------------------

/**
 * Type guard. Use when the caller has already accepted that a non-
 * matching value should fall back to a default — for cases where the
 * caller wants a typed reason on failure, use
 * `validateWorkspacePrivacyContext`.
 */
export function isWorkspacePrivacyContext(value: unknown): value is WorkspacePrivacyContext {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.incognitoActive === 'boolean';
}

/**
 * Validate + canonicalize a `WorkspacePrivacyContext` payload.
 *
 * Pipeline:
 *   1. typeof object guard (rejects null / array / primitive / function).
 *   2. `incognitoActive` typeof boolean guard.
 *
 * Returns the canonical record (only `incognitoActive`; extra fields
 * stripped) on success, or a typed rejection. Missing or non-boolean
 * `incognitoActive` is REJECTED — the validator never invents a
 * default. The only path to a default is the explicit
 * `defaultWorkspacePrivacyContext()` factory.
 *
 * Authority gate (per xuan `ece30c92`): renderer payloads passing
 * through this validator are still subject to the rule that the
 * renderer is NOT the write source. An IPC handler accepting an
 * incognito snapshot from renderer MUST treat the renderer's value
 * as untrusted; main / session / workspace owner is the only valid
 * write authority for the actual workspace state.
 *
 * @see docs/workspace-privacy-context.md "Consumer obligations" for
 *      the per-lane gate examples.
 */
export function validateWorkspacePrivacyContext(input: unknown): WorkspacePrivacyContextResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      ok: false,
      reason: 'not_object',
      message: 'WorkspacePrivacyContext must be an object',
    };
  }
  const record = input as Record<string, unknown>;
  if (typeof record.incognitoActive !== 'boolean') {
    return {
      ok: false,
      reason: 'incognito_active_invalid',
      message: 'WorkspacePrivacyContext.incognitoActive must be a boolean',
    };
  }
  // Extra fields stripped — canonical return contains ONLY documented
  // fields. Matches the IPC-1 / IPC-2 / IPC-3 normalize-and-strip
  // pattern.
  return { ok: true, value: { incognitoActive: record.incognitoActive } };
}
