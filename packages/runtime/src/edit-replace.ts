// packages/runtime/src/edit-replace.ts
//
// Shared string-edit logic used by BOTH Edit tool implementations:
//   - the in-process builtin Edit tool (packages/runtime/src/builtin-tools.ts),
//     which imports and calls computeEditedSource directly, and
//   - the isolated headless Edit tool (packages/headless/src/tools.ts), which
//     embeds COMPUTE_EDITED_SOURCE_FN_SOURCE into a `node -e` script that runs
//     inside the isolated executor process.
//
// CONSTRAINT: computeEditedSource must stay fully self-contained — no imports,
// no references to module-scope bindings, every helper nested inside — so that
// `.toString()` yields a standalone definition that runs unchanged inside the
// isolated process. This keeps a single source of truth for both call sites.
//
// Commit 1 is exact-match only and preserves the prior behavior byte-for-byte
// (including String.prototype.replace's `$`-pattern handling in new_string and
// the exact error-message text). Later commits extend the matching strategy
// here so both call sites gain it from one place.

/**
 * Apply an exact, unique string replacement to `source`.
 *
 * @param where label embedded in error messages (the caller's relative path).
 * @throws if `oldString` is absent or matches more than once.
 */
export function computeEditedSource(
  source: string,
  oldString: string,
  newString: string,
  where: string,
): string {
  const count = source.split(oldString).length - 1;
  if (count === 0) throw new Error(`old_string not found in ${where}`);
  if (count > 1) throw new Error(`old_string is not unique in ${where} (${count} matches)`);
  return source.replace(oldString, newString);
}

/**
 * Serialized source of computeEditedSource, captured once at module load for
 * embedding into the isolated headless EDIT_SCRIPT. Using the live function's
 * own source avoids drift between the in-process and serialized forms.
 */
export const COMPUTE_EDITED_SOURCE_FN_SOURCE: string = computeEditedSource.toString();
