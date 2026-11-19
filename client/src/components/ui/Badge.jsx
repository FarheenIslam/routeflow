const TONES = {
  neutral: 'border-line bg-canvas text-ink-muted',
  brand: 'border-brand-100 bg-brand-50 text-brand-700',
  success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-100 bg-amber-50 text-amber-800',
  danger: 'border-red-100 bg-red-50 text-red-700',
};

const DOT_TONES = {
  neutral: 'bg-ink-muted',
  brand: 'bg-brand-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
};

/**
 * Status badge with an optional dot. Colour alone never carries the meaning —
 * the label text always says it too, which keeps it accessible.
 */
export default function Badge({ tone = 'neutral', dot = false, children, className = '' }) {
  const safeTone = TONES[tone] ? tone : 'neutral';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TONES[safeTone]} ${className}`}
    >
      {dot && <span className={`size-1.5 rounded-full ${DOT_TONES[safeTone]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}
