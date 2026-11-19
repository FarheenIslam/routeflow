/**
 * Labelled input with inline validation message.
 * `error` is a string; aria-invalid plus aria-describedby make screen readers
 * announce the problem instead of just colouring the border red.
 */
export default function FormField({ id, label, error, hint, className = '', ...inputProps }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`mt-1.5 h-11 w-full rounded-lg border bg-surface px-3 text-sm text-ink transition-colors placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${
          error
            ? 'border-red-300 focus:border-red-400'
            : 'border-line focus:border-brand-500'
        }`}
        {...inputProps}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
