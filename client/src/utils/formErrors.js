/**
 * The API returns { message, errors: [{ field, message }] } for validation
 * failures. This copies each error onto the matching react-hook-form field so
 * the message appears under the right input.
 *
 * Returns true when at least one field-level error was applied.
 */
export function applyServerErrors(error, setError) {
  if (!Array.isArray(error?.errors) || error.errors.length === 0) return false;

  let applied = false;
  for (const item of error.errors) {
    if (!item?.field) continue;
    setError(item.field, { type: 'server', message: item.message });
    applied = true;
  }
  return applied;
}

/** Safe message for a form-level alert. */
export function errorMessage(error, fallback) {
  return error?.message || fallback;
}
